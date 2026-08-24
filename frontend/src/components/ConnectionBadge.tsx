import type { ConnectionStatus } from '../types'

interface ConnectionBadgeProps {
  status: ConnectionStatus
  reconnectAttempt: number
}

const LABELS: Record<ConnectionStatus, string> = {
  connecting: 'CONNECTING',
  live: 'LIVE',
  reconnecting: 'RECONNECTING',
}

/**
 * Reports the real state of the telemetry socket. The original dashboard
 * showed a hard-coded "LIVE" badge that kept claiming to be live after the
 * connection had dropped.
 */
export function ConnectionBadge({ status, reconnectAttempt }: ConnectionBadgeProps) {
  const label = LABELS[status]
  const suffix = status === 'reconnecting' && reconnectAttempt > 0 ? ` (${reconnectAttempt})` : ''

  return (
    <span className={`status-badge status-${status}`} role="status" aria-live="polite">
      {`● ${label}${suffix}`}
    </span>
  )
}
