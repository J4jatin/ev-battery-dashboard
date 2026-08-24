"""HTTP and WebSocket contract tests for the FastAPI service."""

import json

import pytest
from fastapi.testclient import TestClient

from battery_simulator import CELL_COUNT, HISTORY_HOURS
from main import app

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
def client() -> TestClient:
    return TestClient(app)


def test_health_endpoint_reports_ok(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_status_endpoint_returns_a_full_reading(client: TestClient) -> None:
    response = client.get("/api/battery/status")
    assert response.status_code == 200
    assert set(response.json()) == READING_KEYS


def test_history_endpoint_returns_a_full_day(client: TestClient) -> None:
    response = client.get("/api/battery/history")
    assert response.status_code == 200
    history = response.json()
    assert len(history) == HISTORY_HOURS
    assert set(history[0]) == {"hour", "soc", "temperature", "energy"}


def test_cells_endpoint_returns_every_cell(client: TestClient) -> None:
    response = client.get("/api/battery/cells")
    assert response.status_code == 200
    cells = response.json()
    assert len(cells) == CELL_COUNT
    assert set(cells[0]) == {"id", "voltage", "temperature", "status"}


def test_unknown_route_returns_404(client: TestClient) -> None:
    assert client.get("/api/battery/does-not-exist").status_code == 404


def test_cors_allows_the_configured_origin(client: TestClient) -> None:
    response = client.get("/api/battery/status", headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_does_not_echo_an_unknown_origin(client: TestClient) -> None:
    """A wildcard policy would hand this origin back; an allowlist must not."""
    response = client.get(
        "/api/battery/status", headers={"Origin": "https://not-my-frontend.example"}
    )
    assert response.headers.get("access-control-allow-origin") != (
        "https://not-my-frontend.example"
    )


def test_websocket_streams_valid_readings(client: TestClient) -> None:
    with client.websocket_connect("/ws/battery") as websocket:
        first = json.loads(websocket.receive_text())
        assert set(first) == READING_KEYS
        assert isinstance(first["soc"], (int, float))


def test_websocket_pushes_a_continuing_stream(client: TestClient) -> None:
    """The socket must keep emitting without the client asking for more."""
    with client.websocket_connect("/ws/battery") as websocket:
        readings = [json.loads(websocket.receive_text()) for _ in range(5)]
    assert len(readings) == 5
    # State advances between pushes, so the pack drains over the sequence.
    assert readings[-1]["soc"] <= readings[0]["soc"]


def test_websocket_disconnect_is_handled_cleanly(client: TestClient) -> None:
    """Closing from the client side must not raise out of the endpoint."""
    with client.websocket_connect("/ws/battery") as websocket:
        websocket.receive_text()
    # Server still healthy after the disconnect.
    assert client.get("/health").status_code == 200


def test_degradation_summary_lists_all_four_real_batteries(client: TestClient) -> None:
    response = client.get("/api/battery/degradation")
    assert response.status_code == 200
    batteries = response.json()
    assert {battery["battery_id"] for battery in batteries} == {
        "B0005",
        "B0006",
        "B0007",
        "B0018",
    }
    assert set(batteries[0]) == {
        "battery_id",
        "initial_capacity_ah",
        "final_capacity_ah",
        "capacity_fade_percent",
        "cycle_count",
        "ambient_temperature_c",
        "source",
    }


def test_degradation_cycles_returns_full_history_for_a_known_battery(
    client: TestClient,
) -> None:
    response = client.get("/api/battery/degradation/B0005")
    assert response.status_code == 200
    cycles = response.json()
    assert len(cycles) > 100
    assert set(cycles[0]) == {"cycle_index", "capacity_ah", "soh_percent"}


def test_degradation_cycles_accepts_lowercase_battery_id(client: TestClient) -> None:
    response = client.get("/api/battery/degradation/b0005")
    assert response.status_code == 200
    assert len(response.json()) > 0


def test_degradation_cycles_returns_404_for_unknown_battery(client: TestClient) -> None:
    response = client.get("/api/battery/degradation/B9999")
    assert response.status_code == 404
