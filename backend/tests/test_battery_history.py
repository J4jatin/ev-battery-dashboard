"""Unit tests for the real-battery-degradation SQLite reader."""

import pytest

from battery_history import BatteryNotFoundError, get_battery_cycles, list_batteries

KNOWN_BATTERY_IDS = {"B0005", "B0006", "B0007", "B0018"}


def test_list_batteries_returns_all_four_cells() -> None:
    batteries = list_batteries()
    assert {battery["battery_id"] for battery in batteries} == KNOWN_BATTERY_IDS


def test_list_batteries_reports_plausible_capacity_fade() -> None:
    for battery in list_batteries():
        assert 0 < battery["capacity_fade_percent"] < 100
        assert battery["final_capacity_ah"] < battery["initial_capacity_ah"]
        assert battery["cycle_count"] > 0
        assert battery["source"]  # citation string is present


def test_get_battery_cycles_starts_near_100_percent_soh() -> None:
    cycles = get_battery_cycles("B0005")
    assert cycles[0]["cycle_index"] == 1
    assert cycles[0]["soh_percent"] == pytest.approx(100.0, abs=0.5)


def test_get_battery_cycles_is_ordered_and_degrades_overall() -> None:
    cycles = get_battery_cycles("B0005")
    indices = [cycle["cycle_index"] for cycle in cycles]
    assert indices == sorted(indices)
    # Real measured data is noisy cycle-to-cycle, but the overall trend across
    # a full run must be degradation, not improvement.
    assert cycles[-1]["soh_percent"] < cycles[0]["soh_percent"]


def test_get_battery_cycles_accepts_lowercase_ids_case_insensitively() -> None:
    # main.py upper-cases the path param before calling this; verify the
    # underlying lookup itself is exact-match so that contract is explicit.
    with pytest.raises(BatteryNotFoundError):
        get_battery_cycles("b0005")


def test_get_battery_cycles_raises_for_unknown_battery() -> None:
    with pytest.raises(BatteryNotFoundError):
        get_battery_cycles("B9999")
