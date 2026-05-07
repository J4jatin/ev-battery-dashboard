import { useState, useEffect, useRef } from 'react'
import './App.css'

interface BatteryData {
  soc: number
  soh: number
  voltage: number
  current: number
  temperature: number
  power: number
  cycle_count: number
  estimated_range: number
  timestamp: number
}

function App() {
  const [batteryData, setBatteryData] = useState<BatteryData | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [cells, setCells] = useState<any[]>([])
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    // Fetch history and cells once
    fetch('http://127.0.0.1:8000/api/battery/history')
      .then(r => r.json())
      .then(setHistory)

    fetch('http://127.0.0.1:8000/api/battery/cells')
      .then(r => r.json())
      .then(setCells)

    // Connect WebSocket for live data
    const ws = new WebSocket('ws://127.0.0.1:8000/ws/battery')
    ws.onmessage = (event) => {
      setBatteryData(JSON.parse(event.data))
    }
    wsRef.current = ws

    return () => ws.close()
  }, [])

  if (!batteryData) return (
    <div style={{
      display: 'flex', justifyContent: 'center',
      alignItems: 'center', height: '100vh',
      background: '#0a0a0a', color: '#00d4ff',
      fontSize: '1.5rem'
    }}>
      Connecting to Battery System...
    </div>
  )

  return (
    <div className="dashboard">
      <header className="header">
        <h1>⚡ EV Battery Intelligence Dashboard</h1>
        <span className="live-badge">● LIVE</span>
      </header>

      {/* TOP METRICS */}
      <div className="metrics-grid">
        <MetricCard title="State of Charge" value={`${batteryData.soc}%`} color="#00d4ff" />
        <MetricCard title="State of Health" value={`${batteryData.soh}%`} color="#00ff88" />
        <MetricCard title="Voltage" value={`${batteryData.voltage}V`} color="#ffaa00" />
        <MetricCard title="Current" value={`${batteryData.current}A`} color="#ff6b6b" />
        <MetricCard title="Temperature" value={`${batteryData.temperature}°C`} color="#ff9f43" />
        <MetricCard title="Power" value={`${batteryData.power}kW`} color="#a29bfe" />
        <MetricCard title="Cycle Count" value={`${batteryData.cycle_count}`} color="#fd79a8" />
        <MetricCard title="Est. Range" value={`${batteryData.estimated_range}km`} color="#55efc4" />
      </div>

      {/* CHARTS ROW */}
      <div className="charts-row">
        <ChargeHistoryChart history={history} />
        <CellHealthGrid cells={cells} />
      </div>
    </div>
  )
}

// METRIC CARD COMPONENT
function MetricCard({ title, value, color }: { title: string, value: string, color: string }) {
  return (
    <div className="metric-card">
      <div className="metric-title">{title}</div>
      <div className="metric-value" style={{ color }}>{value}</div>
    </div>
  )
}

// CHARGE HISTORY CHART
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function ChargeHistoryChart({ history }: { history: any[] }) {
  return (
    <div className="chart-card">
      <h3>24-Hour Charge History</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={history}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="hour" stroke="#888" tick={{ fontSize: 10 }} />
          <YAxis stroke="#888" />
          <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333' }} />
          <Line type="monotone" dataKey="soc" stroke="#00d4ff" strokeWidth={2} dot={false} name="SOC %" />
          <Line type="monotone" dataKey="temperature" stroke="#ff9f43" strokeWidth={2} dot={false} name="Temp °C" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// CELL HEALTH GRID
function CellHealthGrid({ cells }: { cells: any[] }) {
  return (
    <div className="chart-card">
      <h3>Battery Cell Health Monitor</h3>
      <div className="cell-grid">
        {cells.map(cell => (
          <div
            key={cell.id}
            className="cell"
            style={{ background: cell.status === 'warning' ? '#ff6b6b33' : '#00ff8833' }}
          >
            <div className="cell-id">Cell {cell.id}</div>
            <div className="cell-voltage" style={{ color: cell.status === 'warning' ? '#ff6b6b' : '#00ff88' }}>
              {cell.voltage}V
            </div>
            <div className="cell-temp">{cell.temperature}°C</div>
            {cell.status === 'warning' && <div className="cell-warning">⚠</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

export default App