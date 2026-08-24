interface MetricCardProps {
  title: string
  value: string
  color: string
}

/** A single labelled telemetry value in the metrics grid. */
export function MetricCard({ title, value, color }: MetricCardProps) {
  return (
    <div className="metric-card">
      <div className="metric-title">{title}</div>
      <div className="metric-value" style={{ color }}>
        {value}
      </div>
    </div>
  )
}
