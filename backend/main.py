from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from battery_simulator import BatterySimulator
import asyncio
import json

app = FastAPI(title="EV Battery Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

simulator = BatterySimulator()

@app.get("/api/battery/status")
def get_status():
    return simulator.get_data()

@app.get("/api/battery/history")
def get_history():
    return simulator.get_history()

@app.get("/api/battery/cells")
def get_cells():
    return simulator.get_cell_data()

@app.websocket("/ws/battery")
async def battery_websocket(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = simulator.update()
            await websocket.send_text(json.dumps(data))
            await asyncio.sleep(2)
    except:
        pass