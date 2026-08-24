import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { HistoryPoint } from '../types'

interface ChargeHistoryChartProps {
  history: HistoryPoint[]
}

/** SOC and temperature trend across the last 24 hours. */
export function ChargeHistoryChart({ history }: ChargeHistoryChartProps) {
  return (
    <div className="chart-card">
      <h3>24-Hour Charge History</h3>
      {history.length === 0 ? (
        <p className="chart-empty">Waiting for history data…</p>
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={history}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="hour" stroke="#888" tick={{ fontSize: 10 }} />
            <YAxis stroke="#888" />
            <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="soc"
              stroke="#00d4ff"
              strokeWidth={2}
              dot={false}
              name="SOC %"
            />
            <Line
              type="monotone"
              dataKey="temperature"
              stroke="#ff9f43"
              strokeWidth={2}
              dot={false}
              name="Temp °C"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
