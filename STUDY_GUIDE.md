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
> run in CI on every push. Alongside the simulated telemetry, a second section
> queries a bundled SQLite database of real NASA lab-measured battery
> degradation data — the one part of the dashboard that isn't generated.

If they want one sentence more, add the honest framing: *"The live telemetry
comes from a simulator rather than a real vehicle, so the engineering interest
there is in the streaming and resilience layer, not the data source — but the
degradation chart is real measured data, served with an actual SQL schema, on
purpose, to show the same rigor applied to real data as to the simulated
feed."* Saying this before they ask it is a strength, not a weakness.

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

## 5. The real dataset (Stage 2)

### Why add real data at all, when §1 already frames the simulator as fine?

To show the same rigor applied to real data as to a simulated feed, without
pretending the two are the same thing. Anyone can generate plausible-looking
numbers with `random.uniform()`; sourcing, cleaning, modelling and serving a
real external dataset is a different (and more relevant) skill. The dashboard
keeps them explicitly separate — different route prefix, different UI section,
a source citation — rather than quietly blending real and fake data into one
feed that looks uniformly trustworthy.

### What exactly is the dataset?

The [NASA Ames Prognostics Center of Excellence Li-ion Battery Data
Set](https://c3.nasa.gov/dashlink/resources/133/) (Saha, B., & Goebel, K.
(2007). *Battery Data Set*, NASA Ames Prognostics Data Repository). Four 18650
cells (B0005, B0006, B0007, B0018) were run through repeated charge/discharge
cycles at room temperature until end of life, with capacity measured on every
discharge. It is a standard reference dataset in published battery
state-of-health and remaining-useful-life research, so the numbers are
independently checkable.

### Why not query the raw NASA files directly at request time?

The raw export is ~21 MB of per-second voltage/current/temperature samples
(169k+ rows) — far more resolution than a cycle-level degradation chart needs,
and not something worth committing to a portfolio repo's clone size.
`scripts/build_battery_history_db.py` is run once, offline, to aggregate that
down to one row per (cell, cycle) — 636 rows — and only the aggregated result
is committed. The FastAPI app never parses the raw CSV; it only ever reads the
small pre-built SQLite file.

**Honest trade-off:** committing the aggregate instead of the raw source means
the aggregation step isn't independently re-runnable from the repo alone. The
build script documents the exact source and the column contract it expects,
so the pipeline is reproducible by anyone who fetches the same NASA data —
just not literally re-runnable in CI.

### Why SQLite instead of Postgres?

This data is static — NASA stopped collecting it in 2008, so nothing about it
changes at runtime, and the app never writes to it. A managed database buys
you concurrent writes, durability guarantees, and scaling — none of which
apply to read-only reference data ninety cells' worth of size. It would also
add real operational cost: provisioning, a connection string as another
secret to manage, and, concretely, Render's free-tier Postgres is deleted
after 30 days of inactivity — a constraint hit while planning this feature,
not a hypothetical one. A file committed alongside the code needs none of
that, while still being genuinely queried with SQL — two related tables, a
foreign key, `ORDER BY` — rather than loaded as a JSON fixture that happens to
have "database" in the filename.

**When would this choice flip?** The moment the data needs concurrent writes
from multiple processes — e.g. if the dashboard let users log their own real
readings — SQLite's single-writer model stops being adequate and Postgres
becomes the right call.

### Why two tables instead of one flat table?

`batteries` holds the once-per-cell summary (initial/final capacity, fade %,
cycle count, the source citation); `degradation_cycles` holds the
once-per-cycle fact (capacity, derived SOH %), referencing `batteries` by a
foreign key. Flattening them would repeat the citation string across 636 rows
for no benefit. It is a small schema, but it is a real one-to-many
relationship, normalized the way any larger one would be.

### How is `soh_percent` derived, since NASA doesn't publish an official rating?

Each cell's own first measured cycle is used as its 100% reference
(`soh_percent = capacity_ah / initial_capacity_ah × 100`). This is a
deliberate modelling choice, not an official NASA-rated nominal capacity —
the four cells' actual initial capacities range from 1.86 Ah to 2.04 Ah, so a
single fixed "2 Ah nominal" baseline would misrepresent some of them. Flag
this as an approximation if asked, the same way §7 flags other modelling
choices — it is exactly the kind of question this project should invite.

### Why is the battery lookup case-insensitive at the API but not in `battery_history.py`?

`main.py` upper-cases the path parameter before calling `get_battery_cycles`,
so a client requesting `/api/battery/degradation/b0005` still gets a result.
`battery_history.py`'s own function does an exact match — no normalization —
so the data-layer contract stays unambiguous and is tested separately from the
HTTP-layer convenience. Input normalization belongs at the boundary that
receives messy client input, not inside the function that owns the query.

### What happens on an unknown battery ID?

`get_battery_cycles` raises a domain-specific `BatteryNotFoundError`, which
`main.py` catches and translates into an HTTP 404 with a clear message. This
is the same pattern established in Stage 1 for the WebSocket
(`WebSocketDisconnect` → clean log line, not a crash): let the layer that
understands the domain raise a meaningful exception, and let the transport
layer decide what protocol-level response that becomes.

### Is this the "Applied AI" part of your CV?

No, deliberately not — no model is trained anywhere in this project. It is a
real dataset served through a normal SQL-backed REST API and rendered as a
chart, which demonstrates data handling and full-stack skill, not machine
learning. The RAG/LLM project on the same CV already covers Applied AI; this
project's distinct value is real-time systems and full-stack engineering, and
keeping that focus explicit (rather than bolting on a model here too) was a
deliberate scoping decision, not an oversight.

---

## 6. Testing

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

## 7. Battery domain knowledge

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

## 8. Known limitations — say these before they ask

Volunteering the weak points is what separates a candidate who *built* something
from one who merely *finished* it.

1. **The live telemetry is simulated.** No real vehicle, no sensors — the
   engineering value there is in the streaming and resilience layer. (The
   degradation chart is the exception: that data is real. See §5.)
2. **The live side still has nothing persisted.** No database backs the
   simulated pack. Restart the backend and all its state is gone;
   `/api/battery/history` generates a fresh random profile on each call, so
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
8. **The real dataset is small and single-condition.** Four cells, one ambient
   temperature (24°C), discharge-cycle capacity only — enough to demonstrate a
   real SQL-backed feature end to end, not a research-grade sample.
9. **`soh_percent` for the real cells is derived, not NASA-published** — each
   cell's own first cycle stands in for 100% (see §5). A different, equally
   defensible baseline (a fixed nominal capacity) would shift the numbers.

### What I would build next, in order

1. **Persistence for the live side** — write simulated readings to a real
   database so history is real history and reconciles with the live stream,
   and pack state survives a restart.
2. **More of the real dataset** — the raw NASA export also has charge-cycle
   and impedance measurements that are not loaded yet; extending the schema
   to include them would let the degradation chart show more than capacity.
3. **Runtime schema validation** at the client boundary, or types generated from
   the FastAPI OpenAPI schema.
4. **Alerting rules** — threshold breaches on cell voltage spread and temperature,
   which is what makes a monitoring tool actionable rather than decorative.

---

## 9. Rapid-fire answers

| Question | Answer |
| --- | --- |
| Why FastAPI? | Native async — required for a WebSocket push loop — plus type hints and automatic OpenAPI docs. |
| Why TypeScript? | The data contract has nine numeric fields; without types, a renamed field fails silently at runtime. |
| Why Vite? | Fast dev server, first-class TS, and Vitest shares its config and transform pipeline. |
| Why Recharts? | Declarative React components rather than imperative canvas work; fine for standard chart types. |
| Why is the frontend separate from the backend? | Independent deploys and scaling; the frontend is static files on a CDN, the backend a stateful process. |
| Why SQLite for the real dataset instead of Postgres? | Static, read-only reference data with no runtime writes; a committed file needs no provisioning and sidesteps Render free-tier Postgres expiring after 30 days. See §5. |
| Is the degradation chart also simulated? | No — it's the one part of this dashboard that's real. Everything else is generated. |
| Biggest weakness? | The live telemetry is simulated with no persistence; the real dataset is small and single-condition. |
| What did you learn? | That "real-time" is mostly about failure handling — streaming data is easy, keeping the stream alive is the actual work — and that "real data" mostly means deciding what *not* to ship (the raw 21 MB) as much as what to. |
