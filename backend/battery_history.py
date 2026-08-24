"""Read-only access to the bundled real-world battery degradation dataset.

The data itself is not simulated: it comes from the NASA Ames PCoE Li-ion
Battery Data Set (see ``scripts/build_battery_history_db.py`` for the full
citation and provenance notes). Four 18650 cells were cycled to end of life
under lab conditions; this module exposes their per-cycle capacity fade from
the small SQLite file that ships in ``data/battery_history.db``.

This is deliberately separate from ``battery_simulator.py``: the simulator
generates fake live telemetry for one virtual pack, while this module serves
real historical degradation data for four physical cells. Keeping them in
different modules (and different API routes, and a differently-labelled
section of the UI) is intentional — conflating simulated and real data would
be misleading.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import TypedDict

DB_PATH = Path(__file__).resolve().parent / "data" / "battery_history.db"


class BatterySummary(TypedDict):
    battery_id: str
    initial_capacity_ah: float
    final_capacity_ah: float
    capacity_fade_percent: float
    cycle_count: int
    ambient_temperature_c: float
    source: str


class DegradationCycle(TypedDict):
    cycle_index: int
    capacity_ah: float
    soh_percent: float


class BatteryNotFoundError(LookupError):
    """Raised when a requested battery_id is not present in the dataset."""


def _connect() -> sqlite3.Connection:
    # Opened read-only (mode=ro): this is static reference data bundled with
    # the app, never written to at request time.
    connection = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def list_batteries() -> list[BatterySummary]:
    """Return summary stats for every battery in the dataset."""
    connection = _connect()
    try:
        rows = connection.execute(
            """
            SELECT battery_id, initial_capacity_ah, final_capacity_ah,
                   capacity_fade_percent, cycle_count, ambient_temperature_c, source
            FROM batteries
            ORDER BY battery_id
            """
        ).fetchall()
        return [dict(row) for row in rows]  # type: ignore[misc]
    finally:
        connection.close()


def get_battery_cycles(battery_id: str) -> list[DegradationCycle]:
    """Return the full per-cycle capacity/SOH history for one battery.

    Raises:
        BatteryNotFoundError: if ``battery_id`` is not present in the dataset.
    """
    connection = _connect()
    try:
        exists = connection.execute(
            "SELECT 1 FROM batteries WHERE battery_id = ?", (battery_id,)
        ).fetchone()
        if exists is None:
            raise BatteryNotFoundError(battery_id)

        rows = connection.execute(
            """
            SELECT cycle_index, capacity_ah, soh_percent
            FROM degradation_cycles
            WHERE battery_id = ?
            ORDER BY cycle_index
            """,
            (battery_id,),
        ).fetchall()
        return [dict(row) for row in rows]  # type: ignore[misc]
    finally:
        connection.close()
