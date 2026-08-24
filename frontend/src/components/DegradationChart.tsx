import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { useDegradationHistory } from '../hooks/useDegradationHistory'

/**
 * Real lab-measured capacity fade for four physical 18650 Li-ion cells (NASA
 * Ames PCoE Battery Data Set), shown separately from the simulated live
 * telemetry elsewhere on this dashboard. Everything above this section is
 * generated with `random.uniform()`; everything in this section is genuine
 * measured data with a citation — that distinction is deliberate.
 */
export function DegradationChart() {
  const { batteries, selectedBatteryId, cycles, isLoading, selectBattery } =
    useDegradationHistory()
  const selected = batteries.find((battery) => battery.battery_id === selectedBatteryId)

  return (
    <div className="chart-card degradation-card">
      <div className="degradation-header">
        <h3>Real Battery Degradation (NASA Lab Data)</h3>
        {batteries.length > 0 && (
          <select
            className="degradation-select"
            value={selectedBatteryId ?? ''}
            onChange={(event) => selectBattery(event.target.value)}
            aria-label="Select battery cell"
          >
            {batteries.map((battery) => (
              <option key={battery.battery_id} value={battery.battery_id}>
                Cell {battery.battery_id}
              </option>
            ))}
          </select>
        )}
      </div>

      {cycles.length === 0 ? (
        <p className="chart-empty">
          {isLoading ? 'Loading degradation data…' : 'No degradation data available.'}
        </p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={cycles}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="cycle_index"
                stroke="#888"
                tick={{ fontSize: 10 }}
                label={{
                  value: 'Discharge cycle',
                  position: 'insideBottom',
                  offset: -5,
                  fontSize: 10,
                  fill: '#888',
                }}
              />
              <YAxis
                stroke="#888"
                tick={{ fontSize: 10 }}
                domain={['dataMin - 2', 100]}
                label={{
                  value: 'SOH %',
                  angle: -90,
                  position: 'insideLeft',
                  fontSize: 10,
                  fill: '#888',
                }}
              />
              <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333' }} />
              <Line
                type="monotone"
                dataKey="soh_percent"
                stroke="#00ff88"
                strokeWidth={2}
                dot={false}
                name="SOH %"
              />
            </LineChart>
          </ResponsiveContainer>
          {selected && (
            <p className="degradation-footnote">
              {selected.cycle_count} cycles at {selected.ambient_temperature_c}°C · faded to{' '}
              {(100 - selected.capacity_fade_percent).toFixed(1)}% of original capacity
            </p>
          )}
        </>
      )}
    </div>
  )
}
