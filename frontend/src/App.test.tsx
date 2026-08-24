import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { MockWebSocket } from './test/mockWebSocket'
import type { BatteryData, CellData, HistoryPoint } from './types'

const reading: BatteryData = {
  soc: 73,
  soh: 91,
  voltage: 396,
  current: -12.5,
  temperature: 28,
  power: 4.95,
  cycle_count: 247,
  estimated_range: 233.6,
  timestamp: 1_700_000_000,
}

const history: HistoryPoint[] = [{ hour: '00:00', soc: 95, temperature: 27, energy: 4.2 }]
const cells: CellData[] = [{ id: 1, voltage: 3.61, temperature: 29.4, status: 'normal' }]

beforeEach(() => {
  MockWebSocket.reset()
  vi.stubGlobal('WebSocket', MockWebSocket)
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const body = url.includes('/history') ? history : cells
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('App', () => {
  it('shows a connecting screen before the first reading arrives', () => {
    render(<App />)

    expect(screen.getByText(/connecting to battery system/i)).toBeInTheDocument()
  })

  it('renders the metrics grid once a reading arrives', async () => {
    render(<App />)

    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0))
    MockWebSocket.last.serverOpen()
    MockWebSocket.last.serverSend(reading)

    expect(await screen.findByText('73%')).toBeInTheDocument()
    expect(screen.getByText('396V')).toBeInTheDocument()
    expect(screen.getByText('247')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('LIVE')
  })

  it('loads history and cell data from the REST endpoints', async () => {
    render(<App />)

    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0))
    MockWebSocket.last.serverOpen()
    MockWebSocket.last.serverSend(reading)

    expect(await screen.findByText('Cell 1')).toBeInTheDocument()
    expect(screen.getByText('24-Hour Charge History')).toBeInTheDocument()
  })
})
