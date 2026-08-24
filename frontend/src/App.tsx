import { useEffect, useState } from 'react'

import './App.css'
import { WS_URL, fetchCells, fetchHistory } from './api'
import { CellHealthGrid } from './components/CellHealthGrid'
import { ChargeHistoryChart } from './components/ChargeHistoryChart'
import { ConnectionBadge } from './components/ConnectionBadge'
import { DegradationChart } from './components/DegradationChart'
import { MetricCard } from './components/MetricCard'
import { useBatteryStream } from './hooks/useBatteryStream'
import type { CellData, HistoryPoint } from './types'

export default function App() {
  const { data, status, reconnectAttempt } = useBatteryStream(WS_URL)
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [cells, setCells] = useState<CellData[]>([])

  useEffect(() => {
    // Aborted on unmount so a slow response cannot set state on a gone
    // component, and so StrictMode's double mount does not race itself.
    const controller = new AbortController()

    fetchHistory(controller.signal)
      .then(setHistory)
      .catch(() => undefined)
    fetchCells(controller.signal)
      .then(setCells)
      .catch(() => undefined)

    return () => controller.abort()
  }, [])

  if (!data) {
    return (
      <div className="loading">
        {status === 'reconnecting'
          ? `Reconnecting to Battery System… (attempt ${reconnectAttempt})`
          : 'Connecting to Battery System…'}
      </div>
    )
  }

  return (
    <div className="dashboard">
      <header className="header">
        <h1>⚡ EV Battery Intelligence Dashboard</h1>
        <ConnectionBadge status={status} reconnectAttempt={reconnectAttempt} />
      </header>

      <div className="metrics-grid">
        <MetricCard title="State of Charge" value={`${data.soc}%`} color="#00d4ff" />
        <MetricCard title="State of Health" value={`${data.soh}%`} color="#00ff88" />
        <MetricCard title="Voltage" value={`${data.voltage}V`} color="#ffaa00" />
        <MetricCard title="Current" value={`${data.current}A`} color="#ff6b6b" />
        <MetricCard title="Temperature" value={`${data.temperature}°C`} color="#ff9f43" />
        <MetricCard title="Power" value={`${data.power}kW`} color="#a29bfe" />
        <MetricCard title="Cycle Count" value={`${data.cycle_count}`} color="#fd79a8" />
        <MetricCard title="Est. Range" value={`${data.estimated_range}km`} color="#55efc4" />
      </div>

      <div className="charts-row">
        <ChargeHistoryChart history={history} />
        <CellHealthGrid cells={cells} />
      </div>

      <div className="section-divider">
        <span>Reference Data</span>
        <span className="section-divider-note">Real lab measurements, not simulated</span>
      </div>

      <div className="charts-row charts-row-single">
        <DegradationChart />
      </div>
    </div>
  )
}
