import type { CellData } from '../types'

interface CellHealthGridProps {
  cells: CellData[]
}

/** Per-cell voltage and temperature, with faulty cells highlighted. */
export function CellHealthGrid({ cells }: CellHealthGridProps) {
  return (
    <div className="chart-card">
      <h3>Battery Cell Health Monitor</h3>
      {cells.length === 0 ? (
        <p className="chart-empty">Waiting for cell data…</p>
      ) : (
        <div className="cell-grid">
          {cells.map((cell) => {
            const isWarning = cell.status === 'warning'
            return (
              <div
                key={cell.id}
                className={`cell cell-state-${cell.status}`}
                data-testid={`cell-${cell.id}`}
                style={{ background: isWarning ? '#ff6b6b22' : '#00ff8822' }}
              >
                <div className="cell-id">Cell {cell.id}</div>
                <div
                  className="cell-voltage"
                  style={{ color: isWarning ? '#ff6b6b' : '#00ff88' }}
                >
                  {cell.voltage}V
                </div>
                <div className="cell-temp">{cell.temperature}°C</div>
                {isWarning && (
                  <div className="cell-warning" aria-label="Cell fault">
                    ⚠
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
