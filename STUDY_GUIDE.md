# Study Guide — EV Battery Intelligence Dashboard

Design decisions, trade-offs, and the questions this project invites.
Written to be defended line by line.

---

## 1. The 30-second pitch

> A real-time dashboard for an EV high-voltage battery pack. A FastAPI backend
> models the pack and pushes telemetry over a WebSocket every two seconds; a
> typed React frontend renders live metrics, a 24-hour trend chart, and a
> per-cell health grid. The streaming layer is isolated in a custom hook that
> reconnects with exponential backoff, and both sides are covered by tests that
> run in CI on every push.

If they want one sentence more, add the honest framing: *"The data comes from a
simulator rather than a real vehicle, so the engineering interest is in the
streaming and resilience layer, not in the data source."* Saying this before
they ask it is a strength, not a weakness.

---

## 2. Architecture decisions

### Why WebSocket instead of polling?

Polling every 2 seconds means ~1,800 HTTP requests per hour per client, each with
connection setup, headers and a response envelope, and each arriving up to 2
seconds late. A WebSocket is one handshake followed by frames of a few hundred
bytes. For continuously-changing telemetry, that is the right shape.

**Trade-off:** WebSockets are stateful. They complicate horizontal scaling, they
need reconnect handling that HTTP gets for free, and some corporate proxies
interfere with them. Polling would have been simpler and more robust — it is the
correct choice if updates are infrequent or the client tolerates staleness.

### Why not Server-Sent Events?

**Be honest here — this is the sharpest question the project invites.** SSE is
one-directional server-to-client, which is exactly this traffic pattern, and it
reconnects automatically in the browser, which is the very feature I had to
implement by hand.

The defensible answer: I chose WebSocket to keep a bidirectional channel open for
client-to-server commands — sending a charge-rate setpoint or acknowledging an
alarm, which is what a real BMS console does. **If the dashboard were to stay
read-only, SSE would be the better engineering choice.** Say that out loud.

### Why is the simulator a module-level global?

One process models one vehicle, so every connected client should observe the
same pack state. A per-connection simulator would show two browsers two different
batteries, which is wrong for a monitoring tool.

**Trade-off — and know this before they find it:** it makes the service
stateful. Running two Uvicorn workers gives each worker its own independent pack,
so clients would see different data depending on which worker they land on. The
fix is to move pack state out of the process — into Redis or a database — which
is exactly the direction the next stage of this project goes.

### Why two transports for one data source?

History and cell layout are effectively static per session, so REST is the right
fit: cacheable, easy to debug in a browser, no connection to maintain. Telemetry
changes continuously, so it is pushed. Matching the transport to the change
frequency of the data — rather than forcing everything through one — is the
underlying principle.

---

## 3. Frontend

### Why extract `useBatteryStream` instead of leaving the socket in the component?

Three reasons: the component becomes purely declarative and easy to read; the
transport logic becomes testable in isolation without rendering any UI; and the
hook is reusable if a second view ever needs the same stream. The refactor was
driven by the tests — reconnect logic that is buried inside a component's
`useEffect` cannot be asserted on directly.

### Explain the reconnect strategy.

The browser's `WebSocket` does not reconnect on its own — once closed it stays
closed. The hook listens for `onclose` and schedules a retry with exponential
backoff: 1s, 2s, 4s, 8s, 16s, then capped at 30s.

**Why backoff rather than a fixed 1-second retry?** If the backend is down, every
open dashboard retrying once per second turns a small outage into a load problem
at the exact moment the service is least able to handle it. Backing off is both
polite and self-preserving.

**Why a 30-second ceiling instead of giving up?** A monitoring dashboard is often
left open unattended. It should recover whenever the backend returns, without a
human refreshing the page.

**What is missing:** jitter. With many simultaneous clients, deterministic
backoff synchronises all of them into retry waves. Production systems add a
random offset to spread the load. This was left out deliberately to keep the
backoff deterministically testable — a real deployment should add it.

### Why `onclose` and not `onerror` for recovery?

`onerror` is always followed by `onclose`. Handling both would risk two
overlapping reconnect timers for a single failure. Recovery lives in exactly one
place.

### Why `useRef` for the socket rather than `useState`?

A socket is not render state — nothing on screen derives from the object itself.
Putting it in state would trigger a re-render on every assignment and reset the
value on each render cycle. Refs are the correct tool for values that must
survive renders without causing them. The same applies to the retry timer and
the attempt counter, which is why the attempt count exists as *both* a ref (read
inside callbacks, always current) and state (drives the badge).

### What does `StrictMode` do to this hook in development?

React 19 in development mounts a component, immediately unmounts it, then mounts
it again — deliberately, to surface effects that are not cleanup-safe. Without a
correct cleanup, that leaks a socket on every mount. The hook handles it by
closing the socket, clearing any pending timer, and setting an `unmountedRef`
flag so a socket opened by the discarded effect run cannot schedule a reconnect
for the live one.

The `AbortController` in `App.tsx` serves the same purpose for the two REST
fetches: aborting on unmount prevents a slow response from resolving into a
component that is gone.

### How is `any` avoided?

`types.ts` holds the shared contracts — `BatteryData`, `HistoryPoint`,
`CellData` — mirroring the backend response shapes. `CellStatus` is a union
(`'normal' | 'warning'`) rather than `string`, so an invalid status is a compile
error and the exhaustiveness is checked at the point of use.

**Honest caveat:** these types are a *hand-written mirror* of the backend. They
are asserted at the boundary with a cast, not validated at runtime. If the
backend renamed a field, TypeScript would not catch it. The rigorous fix is a
runtime schema validator such as Zod at the parse boundary, or generating the
types from the FastAPI OpenAPI schema so there is one source of truth.

### Why does the malformed-frame handler swallow the error?

One corrupt frame should not tear down a healthy connection and trigger a
reconnect cycle. The frame is discarded, a warning is logged, and the stream
continues. A production system would also count these — a rising rate of parse
failures is a signal worth alerting on.

### The bundle is 546 kB (164 kB gzipped). Is that a problem?

Most of it is Recharts. For a dashboard opened once and left running, initial
bundle size matters less than it would for a landing page. If it needed fixing,
the direct route is `React.lazy` around the chart components so the charting
library loads after the metrics grid paints, or switching to a lighter charting
library. This is a measured trade-off, not an oversight.

---

## 4. Backend

### What was wrong with `except: pass`?

A bare `except` catches *everything*, including `KeyboardInterrupt` and
`asyncio.CancelledError`. Swallowing `CancelledError` breaks graceful shutdown —
the event loop asks the task to stop and the task silently refuses. It also hides
real bugs: a JSON serialisation failure would look identical to a client
disconnecting.

The replacement catches `WebSocketDisconnect` by name (expected — the tab
closed), re-raises `CancelledError` (expected — the server is shutting down), and
logs anything else with a full stack trace before re-raising. Ruff enforces this
as rule `E722`.

### Why did CORS change from `["*"]` to an allowlist?

`allow_origins=["*"]` lets any site on the internet call the API from a user's
browser. For a public read-only API the practical risk is low, but the habit is
what matters: name the origins you actually serve. It is also required if
credentialed requests are ever added, since browsers reject the wildcard with
`allow_credentials=True`.

### Why pin dependency versions?

Unpinned dependencies mean the deployed artifact is a function of *when* it was
built. A breaking release upstream can break production with no change on your
side, and a bug becomes unreproducible because your machine and the server
resolved different versions. Pinning makes builds deterministic.

### Why is the stream interval an environment variable?

Tests would otherwise spend two real seconds per frame. Setting
`STREAM_INTERVAL_SECONDS=0` lets the WebSocket tests run instantly. Making
timing configurable rather than hard-coded is a small change that makes the
system testable — the same reasoning as dependency injection.

### What happens if a client stops reading but the server keeps pushing?

Backpressure. Frames accumulate in the OS send buffer; once it fills, the write
blocks or raises. At two frames of a few hundred bytes per second this will not
occur in practice, but a real system would either bound the queue and drop stale
frames — for live telemetry the *newest* reading is the only one that matters —
or apply the interval per-client.

---

## 5. Testing

### What do the backend tests actually assert?

Invariants, not fixed values, because the model is stochastic. SOC stays within
its physical bounds across 2,000 steps; temperature never exceeds the thermal
ceiling; voltage stays inside the empty-to-full envelope allowing for sensor
noise; discharge current is negative by BMS convention; and `power` equals
`V × |I| / 1000` computed from unrounded state.

The simulator takes an optional `seed`, so a test can assert that two seeded
instances produce identical sequences — determinism on demand, randomness by
default.

### How do you test reconnect logic without a network?

A `MockWebSocket` class replaces the global `WebSocket` and exposes
`serverOpen()`, `serverSend()` and `serverClose()`, so the test drives the
connection from the server side. Combined with Vitest's fake timers, the test
advances the clock instead of waiting on it — the full backoff sequence is
verified in milliseconds.

The tests assert both directions: that a retry *does* happen once the backoff
elapses, and that it does *not* happen a millisecond earlier, that the attempt
counter resets on a successful reopen, and that unmounting cancels a pending
retry so no timer leaks.

### What is *not* tested?

Chart rendering internals. Recharts' `ResponsiveContainer` measures its parent,
and jsdom reports zero dimensions, so asserting on rendered SVG paths would test
the mock rather than the code. The tests verify that the chart component receives
its data and renders its container and empty state; visual correctness would
need a browser-based tool such as Playwright.

---

## 6. Battery domain knowledge

**State of Charge (SOC)** — how full the pack is right now, as a percentage.
Cannot be measured directly. Estimated by coulomb counting (integrating current
over time, which drifts) corrected against the open-circuit-voltage curve, often
fused in a Kalman filter.

**State of Health (SOH)** — usable capacity relative to a new pack. Degrades over
cycles and with calendar age. ~80% is the conventional end-of-life threshold for
automotive use, after which packs often move to stationary storage.

**Why does pack voltage rise with charge level?** A lithium-ion cell's
open-circuit voltage is a function of its lithium intercalation state — roughly
3.0 V empty to 4.2 V full. Many cells in series scale that to pack level. This is
why the simulator derives voltage from SOC rather than generating it separately,
and it is also the basis of voltage-based SOC estimation.

**Why does cell-level monitoring matter?** A series string carries the same
current through every cell, so the *weakest* cell limits the whole pack — it hits
the voltage cut-off first on discharge and the ceiling first on charge. A
persistent voltage spread indicates imbalance or a degrading cell, which is why a
BMS performs cell balancing. A single bad cell can strand the capacity of the
entire pack.

**Sign convention.** Discharge current is negative, charge current positive, so
the sign of power tells you which direction energy is flowing. This is why the
simulator emits negative current.

**Why does temperature matter?** Lithium-ion has a narrow happy band. Cold
increases internal resistance and limits charge acceptance; sustained heat
accelerates degradation, and severe heat risks thermal runaway. Thermal
management is a first-class function of a real BMS.

---

## 7. Known limitations — say these before they ask

Volunteering the weak points is what separates a candidate who *built* something
from one who merely *finished* it.

1. **The data is simulated.** No real vehicle, no sensors. The engineering value
   is in the streaming and resilience layer.
2. **Nothing is persisted.** No database. Restart the backend and all state is
   gone; `/api/battery/history` generates a fresh random profile on each call, so
   it does not reconcile with the live reading on screen.
3. **The pack only discharges.** SOC decreases monotonically toward a 5% floor
   and temperature rises toward a 42°C ceiling, so a long-running instance
   settles at both limits. `soh` and `cycle_count` are fixed constants. Modelling
   a real charge/discharge cycle would make those variables meaningful.
4. **Single process only.** Module-level pack state does not survive horizontal
   scaling.
5. **No authentication.** The API is public and read-only.
6. **Types are a hand-written mirror** of the backend rather than generated or
   runtime-validated.
7. **No jitter on reconnect backoff** (see §3).

### What I would build next, in order

1. **Persistence** — write readings to Postgres so history is real history and
   reconciles with the live stream, and pack state survives a restart.
2. **Real data** — replace the simulator with a public battery-cycling dataset,
   so the dashboard visualises measured degradation rather than generated noise.
3. **Runtime schema validation** at the client boundary, or types generated from
   the FastAPI OpenAPI schema.
4. **Alerting rules** — threshold breaches on cell voltage spread and temperature,
   which is what makes a monitoring tool actionable rather than decorative.

---

## 8. Rapid-fire answers

| Question | Answer |
| --- | --- |
| Why FastAPI? | Native async — required for a WebSocket push loop — plus type hints and automatic OpenAPI docs. |
| Why TypeScript? | The data contract has nine numeric fields; without types, a renamed field fails silently at runtime. |
| Why Vite? | Fast dev server, first-class TS, and Vitest shares its config and transform pipeline. |
| Why Recharts? | Declarative React components rather than imperative canvas work; fine for standard chart types. |
| Why is the frontend separate from the backend? | Independent deploys and scaling; the frontend is static files on a CDN, the backend a stateful process. |
| Biggest weakness? | Simulated data with no persistence. |
| What did you learn? | That "real-time" is mostly about failure handling. Streaming data is easy; keeping the stream alive is the actual work. |
