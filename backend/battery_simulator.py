"""In-memory simulation of an EV high-voltage battery pack.

The simulator models a single pack and derives its telemetry from a small set
of coupled state variables. Pack voltage is deliberately tied to state of
charge (a real lithium-ion pack sits near 350 V when empty and ~420 V when
full) so the emitted data behaves like a battery rather than like noise.

Sign convention follows common BMS practice: ``current`` is negative while the
pack is discharging.
"""

from __future__ import annotations

import random
import time
from typing import Any, TypedDict

# Pack characteristics. Named constants rather than magic numbers so the tests
# can assert against the same values the simulator uses.
VOLTAGE_EMPTY = 350.0
VOLTAGE_SPAN = 70.0
SOC_FLOOR = 5.0
TEMPERATURE_BASE = 28.0
TEMPERATURE_CEILING = 42.0
RANGE_PER_SOC_PERCENT = 3.2
CELL_COUNT = 12
HISTORY_HOURS = 24


class BatteryReading(TypedDict):
    soc: float
    soh: float
    voltage: float
    current: float
    temperature: float
    power: float
    cycle_count: int
    estimated_range: float
    timestamp: float


class HistoryPoint(TypedDict):
    hour: str
    soc: float
    temperature: float
    energy: float


class CellReading(TypedDict):
    id: int
    voltage: float
    temperature: float
    status: str


class BatterySimulator:
    """Generates plausible telemetry for one simulated battery pack."""

    def __init__(self, seed: int | None = None) -> None:
        # An explicit Random instance (rather than the module-level functions)
        # lets tests seed the simulator for deterministic assertions without
        # disturbing global random state.
        self._random = random.Random(seed)
        self.soc = 73.0  # State of Charge, %
        self.soh = 91.0  # State of Health, %
        self.voltage = 396.0  # Pack voltage, V
        self.current = -12.5  # Pack current, A (negative = discharging)
        self.temperature = TEMPERATURE_BASE  # degrees Celsius
        self.cycle_count = 247
        self.tick = 0

    def update(self) -> BatteryReading:
        """Advance the simulation by one step and return the new reading."""
        self.tick += 1
        self.soc = max(SOC_FLOOR, self.soc - self._random.uniform(0.02, 0.08))
        self.voltage = VOLTAGE_EMPTY + (self.soc / 100) * VOLTAGE_SPAN + self._random.uniform(-2, 2)
        self.current = -self._random.uniform(8, 25)
        self.temperature = min(
            TEMPERATURE_BASE + (self.tick * 0.01) + self._random.uniform(-0.5, 0.5),
            TEMPERATURE_CEILING,
        )
        return self.get_data()

    def get_data(self) -> BatteryReading:
        """Return the current pack snapshot."""
        return {
            "soc": round(self.soc, 1),
            "soh": round(self.soh, 1),
            "voltage": round(self.voltage, 1),
            "current": round(self.current, 1),
            "temperature": round(self.temperature, 1),
            # P = V x I, expressed in kW.
            "power": round((self.voltage * abs(self.current)) / 1000, 2),
            "cycle_count": self.cycle_count,
            "estimated_range": round(self.soc * RANGE_PER_SOC_PERCENT, 1),
            "timestamp": time.time(),
        }

    def get_history(self) -> list[HistoryPoint]:
        """Return a 24-hour discharge profile."""
        history: list[HistoryPoint] = []
        soc = 98.0
        for hour in range(HISTORY_HOURS):
            soc = max(SOC_FLOOR, soc - self._random.uniform(2, 5))
            history.append(
                {
                    "hour": f"{hour:02d}:00",
                    "soc": round(soc, 1),
                    "temperature": round(25 + self._random.uniform(0, 10), 1),
                    "energy": round(self._random.uniform(2, 8), 2),
                }
            )
        return history

    def get_cell_data(self) -> list[CellReading]:
        """Return per-cell voltage and temperature for the whole pack."""
        return [
            {
                "id": index + 1,
                "voltage": round(3.6 + self._random.uniform(-0.15, 0.15), 3),
                "temperature": round(TEMPERATURE_BASE + self._random.uniform(-3, 8), 1),
                "status": "normal" if self._random.random() > 0.1 else "warning",
            }
            for index in range(CELL_COUNT)
        ]


def summarise(reading: BatteryReading) -> dict[str, Any]:
    """Small helper used by the /health endpoint to expose liveness detail."""
    return {"soc": reading["soc"], "temperature": reading["temperature"]}
