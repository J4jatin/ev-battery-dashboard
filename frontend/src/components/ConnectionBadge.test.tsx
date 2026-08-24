import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ConnectionBadge } from './ConnectionBadge'

describe('ConnectionBadge', () => {
  it('reports a live connection', () => {
    render(<ConnectionBadge status="live" reconnectAttempt={0} />)

    expect(screen.getByRole('status')).toHaveTextContent('LIVE')
    expect(screen.getByRole('status')).toHaveClass('status-live')
  })

  it('reports the initial connection attempt', () => {
    render(<ConnectionBadge status="connecting" reconnectAttempt={0} />)

    expect(screen.getByRole('status')).toHaveTextContent('CONNECTING')
  })

  it('shows the retry count while reconnecting', () => {
    render(<ConnectionBadge status="reconnecting" reconnectAttempt={3} />)

    expect(screen.getByRole('status')).toHaveTextContent('RECONNECTING (3)')
    expect(screen.getByRole('status')).toHaveClass('status-reconnecting')
  })

  it('never claims to be live while reconnecting', () => {
    render(<ConnectionBadge status="reconnecting" reconnectAttempt={1} />)

    expect(screen.getByRole('status').textContent).not.toContain('● LIVE')
  })
})
