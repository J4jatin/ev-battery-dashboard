# ⚡ EV Battery Intelligence Dashboard

A production-style real-time battery monitoring dashboard built for
electric vehicle high-voltage storage systems — directly aligned with
BMW Group's frontend development work in electromobility.

## 🚀 Live Demo

[View Live Dashboard](your-vercel-link-here)

## 🎯 What This Project Does

This dashboard simulates the kind of real-time monitoring interface
BMW's battery team builds — displaying live high-voltage battery
pack data with WebSocket streaming, interactive charts, and
cell-level health monitoring.

## ⚙️ Tech Stack

**Frontend:** React 18, TypeScript, Recharts, WebSocket API  
**Backend:** Python, FastAPI, WebSocket, REST API  
**Deployment:** Vercel (frontend), GitHub Actions ready

## 📊 Features

- **Live Metrics** — State of Charge, State of Health, Voltage,
  Current, Temperature, Power, Cycle Count, Estimated Range
  — updating every 2 seconds via WebSocket
- **24-Hour Charge History** — Line chart showing SOC and
  temperature trends over a full day
- **Cell Health Monitor** — 12-cell battery pack visualization
  with real-time anomaly detection and warning indicators
- **Dark Theme HMI** — Industrial-style interface matching
  real EV battery management systems

## 🔧 Run Locally

**Backend:**

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

## 📡 API Endpoints

- `GET /api/battery/status` — Current battery snapshot
- `GET /api/battery/history` — 24-hour historical data
- `GET /api/battery/cells` — Individual cell health data
- `WS /ws/battery` — Real-time WebSocket stream
