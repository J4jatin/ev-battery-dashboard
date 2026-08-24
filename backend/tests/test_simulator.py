"""Physical-plausibility tests for the battery simulator.

These assert the *invariants* of the model rather than exact values, so they
stay meaningful while the underlying random walk keeps changing.
"""

from itertools import pairwise

import pytest

from battery_simulator import (
    CELL_COUNT,
    HISTORY_HOURS,
    SOC_FLOOR,
    TEMPERATURE_CEILING,
    VOLTAGE_EMPTY,
    VOLTAGE_SPAN,
    BatterySimulator,
)

READING_KEYS = {
    "soc",
    "soh",
    "voltage",
    "current",
    "temperature",
    "power",
    "cycle_count",
    "estimated_range",
    "timestamp",
}


@pytest.fixture
def sim() -> BatterySimulator:
    """A deterministically seeded simulator."""
    return BatterySimulator(seed=42)


def test_reading_has_the_full_contract(sim: BatterySimulator) -> None:
    assert set(sim.get_data()) == READING_KEYS


def test_seeded_simulators_are_reproducible() -> None:
    a, b = BatterySimulator(seed=7), BatterySimulator(seed=7)
    for _ in range(50):
        assert a.update()["soc"] == b.update()["soc"]


def test_soc_stays_within_physical_bounds(sim: BatterySimulator) -> None:
    for _ in range(2000):
        soc = sim.update()["soc"]
        assert SOC_FLOOR - 0.05 <= soc <= 100.0


def test_temperature_never_exceeds_the_thermal_ceiling(sim: BatterySimulator) -> None:
    for _ in range(2000):
        assert sim.update()["temperature"] <= TEMPERATURE_CEILING


def test_voltage_tracks_state_of_charge(sim: BatterySimulator) -> None:
    """Pack voltage must stay inside the empty..full envelope, plus sensor noise."""
    for _ in range(500):
        reading = sim.update()
        expected = VOLTAGE_EMPTY + (reading["soc"] / 100) * VOLTAGE_SPAN
        assert expected - 2.5 <= reading["voltage"] <= expected + 2.5


def test_discharge_current_is_negative_by_convention(sim: BatterySimulator) -> None:
    for _ in range(100):
        assert sim.update()["current"] < 0


def test_power_equals_voltage_times_current(sim: BatterySimulator) -> None:
    """power (kW) must equal V x |I| / 1000 computed from unrounded state."""
    for _ in range(100):
        reading = sim.update()
        expected = (sim.voltage * abs(sim.current)) / 1000
        assert reading["power"] == pytest.approx(expected, abs=0.005)


def test_estimated_range_scales_with_state_of_charge(sim: BatterySimulator) -> None:
    first = sim.get_data()
    for _ in range(500):
        sim.update()
    later = sim.get_data()
    assert later["soc"] < first["soc"]
    assert later["estimated_range"] < first["estimated_range"]


def test_history_covers_a_full_day(sim: BatterySimulator) -> None:
    history = sim.get_history()
    assert len(history) == HISTORY_HOURS
    assert [point["hour"] for point in history][:3] == ["00:00", "01:00", "02:00"]
    assert all(point["soc"] >= SOC_FLOOR for point in history)


def test_history_is_monotonically_discharging(sim: BatterySimulator) -> None:
    socs = [point["soc"] for point in sim.get_history()]
    assert all(later <= earlier for earlier, later in pairwise(socs))


def test_pack_reports_every_cell(sim: BatterySimulator) -> None:
    cells = sim.get_cell_data()
    assert len(cells) == CELL_COUNT
    assert [cell["id"] for cell in cells] == list(range(1, CELL_COUNT + 1))


def test_cell_voltages_are_plausible_for_lithium_ion(sim: BatterySimulator) -> None:
    for cell in sim.get_cell_data():
        assert 3.4 <= cell["voltage"] <= 3.8
        assert cell["status"] in {"normal", "warning"}
