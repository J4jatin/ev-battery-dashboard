"""FastAPI service exposing EV battery telemetry over REST and WebSocket.

Design note: a single module-level ``BatterySimulator`` is shared by every
request and every WebSocket client, so all connected clients observe the same
pack state. That is intentional for a single simulated vehicle, and it is also
the main scaling constraint: running more than one worker process would give
each worker its own independent pack.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from battery_simulator import BatterySimulator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Seconds between pushes on the WebSocket stream. Configurable so tests do not
# have to wait on the production cadence.
STREAM_INTERVAL_SECONDS = float(os.getenv("STREAM_INTERVAL_SECONDS", "2"))

# Comma-separated allowlist. Defaults to local dev origins; production sets
# ALLOWED_ORIGINS to the deployed frontend URL.
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app = FastAPI(title="EV Battery Intelligence API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

simulator = BatterySimulator()


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe for the platform health check."""
    return {"status": "ok"}


@app.get("/api/battery/status")
def get_status():
    """Current pack snapshot."""
    return simulator.get_data()


@app.get("/api/battery/history")
def get_history():
    """24-hour discharge profile."""
    return simulator.get_history()


@app.get("/api/battery/cells")
def get_cells():
    """Per-cell voltage, temperature and status for the whole pack."""
    return simulator.get_cell_data()


@app.websocket("/ws/battery")
async def battery_websocket(websocket: WebSocket) -> None:
    """Push a fresh pack reading to the client on a fixed interval."""
    await websocket.accept()
    logger.info("WebSocket client connected: %s", websocket.client)
    try:
        while True:
            await websocket.send_text(json.dumps(simulator.update()))
            await asyncio.sleep(STREAM_INTERVAL_SECONDS)
    except WebSocketDisconnect:
        # Expected: the browser tab closed or navigated away.
        logger.info("WebSocket client disconnected: %s", websocket.client)
    except asyncio.CancelledError:
        # Expected during server shutdown. Re-raise so the event loop can
        # finish cancelling the task rather than swallowing the signal.
        raise
    except Exception:
        # Unexpected: log with a stack trace instead of failing silently.
        logger.exception("WebSocket stream failed for %s", websocket.client)
        raise
