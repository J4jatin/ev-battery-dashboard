import random
import time

class BatterySimulator:
    def __init__(self):
        self.soc = 73.0          # State of Charge %
        self.soh = 91.0          # State of Health %
        self.voltage = 396.0     # Volts
        self.current = -12.5     # Amps
        self.temperature = 28.0  # Celsius
        self.cycle_count = 247
        self.tick = 0

    def update(self):
        self.tick += 1
        self.soc = max(5.0, self.soc - random.uniform(0.02, 0.08))
        self.voltage = 350 + (self.soc / 100) * 70 + random.uniform(-2, 2)
        self.current = -random.uniform(8, 25)
        self.temperature = 28 + (self.tick * 0.01) + random.uniform(-0.5, 0.5)
        self.temperature = min(self.temperature, 42.0)
        return self.get_data()

    def get_data(self):
        return {
            "soc": round(self.soc, 1),
            "soh": round(self.soh, 1),
            "voltage": round(self.voltage, 1),
            "current": round(self.current, 1),
            "temperature": round(self.temperature, 1),
            "power": round((self.voltage * abs(self.current)) / 1000, 2),
            "cycle_count": self.cycle_count,
            "estimated_range": round(self.soc * 3.2, 1),
            "timestamp": time.time()
        }

    def get_history(self):
        history = []
        soc = 98.0
        for i in range(24):
            soc = max(5.0, soc - random.uniform(2, 5))
            history.append({
                "hour": f"{i:02d}:00",
                "soc": round(soc, 1),
                "temperature": round(25 + random.uniform(0, 10), 1),
                "energy": round(random.uniform(2, 8), 2)
            })
        return history

    def get_cell_data(self):
        cells = []
        for i in range(12):
            cells.append({
                "id": i + 1,
                "voltage": round(3.6 + random.uniform(-0.15, 0.15), 3),
                "temperature": round(28 + random.uniform(-3, 8), 1),
                "status": "normal" if random.random() > 0.1 else "warning"
            })
        return cells