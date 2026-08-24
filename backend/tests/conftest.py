"""Shared pytest configuration.

The stream interval is forced to zero before ``main`` is imported so the
WebSocket tests do not wait on the production two-second cadence.
"""

import os

os.environ.setdefault("STREAM_INTERVAL_SECONDS", "0")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:5173")
