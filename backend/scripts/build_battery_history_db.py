"""Build the bundled real-battery-degradation SQLite database.

Source dataset
--------------
NASA Ames Prognostics Center of Excellence (PCoE) Li-ion Battery Data Set
(Saha, B., & Goebel, K. (2007). "Battery Data Set", NASA Ames Prognostics
Data Repository, NASA Ames Research Center, Moffett Field, CA). Four 18650
cells (B0005, B0006, B0007, B0018) were repeatedly charged and discharged at
room temperature (24C) until end of life, with capacity measured on every
discharge cycle. This is the same dataset used in dozens of published
battery-prognostics papers (e.g. remaining-useful-life / SOH estimation
research).

This script does NOT ship the raw measurement data: the original files are
~21 MB of per-second voltage/current/temperature samples (169k+ rows) for
every discharge cycle, which is far more resolution than a cycle-level
degradation chart needs. Committing that to a full-stack portfolio repo
would bloat clone size for no benefit, so instead:

  1. This script is run ONCE, locally, against a CSV export of the raw NASA
     data (one row per measurement sample, with a per-cycle `Capacity`
     column) to aggregate it down to one row per (battery, cycle).
  2. The aggregated result — a few hundred rows total — is written to
     ``backend/data/battery_history.db`` and committed to the repo.
  3. The FastAPI app only ever reads that small, pre-built SQLite file at
     request time; it never re-parses the raw CSV.

Usage
-----
    python scripts/build_battery_history_db.py path/to/discharge.csv

The input CSV is expected to have (at least) these columns, one row per
measurement sample within a discharge cycle:
    Battery, id_cycle, Capacity, ambient_temperature

Design choice: SQLite over Postgres
------------------------------------
This data is static reference data (NASA stopped collecting it in 2008) that
never changes at runtime, so there is nothing for a managed database to buy
us. A committed SQLite file needs no provisioning, no connection string, no
expiring free-tier instance (Render's free Postgres is deleted after 30
days — a real constraint hit while planning this feature) and no network
round trip. It ships with the code the same way a bundled JSON fixture
would, just queryable with SQL, which is the point: this is a genuine
SQL-backed feature, not a database dependency for its own sake.
"""

from __future__ import annotations

import csv
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "battery_history.db"

SCHEMA = """
CREATE TABLE batteries (
    battery_id             TEXT PRIMARY KEY,
    initial_capacity_ah    REAL NOT NULL,
    final_capacity_ah      REAL NOT NULL,
    capacity_fade_percent  REAL NOT NULL,
    cycle_count             INTEGER NOT NULL,
    ambient_temperature_c  REAL NOT NULL,
    source                 TEXT NOT NULL
);

CREATE TABLE degradation_cycles (
    battery_id    TEXT NOT NULL REFERENCES batteries(battery_id),
    cycle_index   INTEGER NOT NULL,
    capacity_ah   REAL NOT NULL,
    soh_percent   REAL NOT NULL,
    PRIMARY KEY (battery_id, cycle_index)
);
"""

SOURCE_CITATION = (
    "Saha, B., & Goebel, K. (2007). Battery Data Set, "
    "NASA Ames Prognostics Data Repository, NASA Ames Research Center, "
    "Moffett Field, CA."
)


def aggregate_cycles(csv_path: Path) -> dict[str, list[tuple[int, float, float]]]:
    """Collapse per-sample rows into one (cycle_index, capacity_ah, ambient_c) per cycle."""
    per_battery: dict[str, dict[int, tuple[float, float]]] = defaultdict(dict)

    with csv_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            battery = row["Battery"]
            cycle_index = int(row["id_cycle"])
            capacity_ah = float(row["Capacity"])
            ambient_c = float(row["ambient_temperature"])
            # Capacity and ambient temperature are constant across every
            # sample within a cycle; keep the first value seen.
            per_battery[battery].setdefault(cycle_index, (capacity_ah, ambient_c))

    return {
        battery: sorted((cycle, cap, amb) for cycle, (cap, amb) in cycles.items())
        for battery, cycles in per_battery.items()
    }


def build_database(csv_path: Path, db_path: Path) -> None:
    cycles_by_battery = aggregate_cycles(csv_path)

    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()

    connection = sqlite3.connect(db_path)
    try:
        connection.executescript(SCHEMA)

        for battery_id, cycles in sorted(cycles_by_battery.items()):
            initial_capacity = cycles[0][1]
            final_capacity = cycles[-1][1]
            fade_percent = (1 - final_capacity / initial_capacity) * 100
            ambient_c = cycles[0][2]

            connection.execute(
                """
                INSERT INTO batteries (
                    battery_id, initial_capacity_ah, final_capacity_ah,
                    capacity_fade_percent, cycle_count, ambient_temperature_c, source
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    battery_id,
                    round(initial_capacity, 4),
                    round(final_capacity, 4),
                    round(fade_percent, 2),
                    len(cycles),
                    ambient_c,
                    SOURCE_CITATION,
                ),
            )

            connection.executemany(
                """
                INSERT INTO degradation_cycles (
                    battery_id, cycle_index, capacity_ah, soh_percent
                ) VALUES (?, ?, ?, ?)
                """,
                [
                    (
                        battery_id,
                        cycle_index,
                        round(capacity_ah, 4),
                        round((capacity_ah / initial_capacity) * 100, 2),
                    )
                    for cycle_index, capacity_ah, _ in cycles
                ],
            )

        connection.commit()
    finally:
        connection.close()

    print(f"Wrote {db_path} ({db_path.stat().st_size} bytes)")
    for battery_id, cycles in sorted(cycles_by_battery.items()):
        print(f"  {battery_id}: {len(cycles)} cycles")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/build_battery_history_db.py path/to/discharge.csv")
        sys.exit(1)

    build_database(Path(sys.argv[1]), DB_PATH)
