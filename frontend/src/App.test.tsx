import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { MockWebSocket } from './test/mockWebSocket'
import type { BatteryData, BatterySummary, CellData, DegradationCycle, HistoryPoint } from './types'

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

const degradationSummary: BatterySummary[] = [
  {
    battery_id: 'B0005',
    initial_capacity_ah: 1.8565,
    final_capacity_ah: 1.3251,
    capacity_fade_percent: 28.62,
    cycle_count: 168,
    ambient_temperature_c: 24,
    source: 'NASA Ames PCoE Battery Data Set',
  },
]
const degradationCycles: DegradationCycle[] = [
  { cycle_index: 1, capacity_ah: 1.8565, soh_percent: 100 },
  { cycle_index: 2, capacity_ah: 1.8353, soh_percent: 98.86 },
]

beforeEach(() => {
  MockWebSocket.reset()
  vi.stubGlobal('WebSocket', MockWebSocket)
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      let body: unknown = cells
      if (url.includes('/history')) {
        body = history
      } else if (url.includes('/degradation/')) {
        body = degradationCycles
      } else if (url.includes('/degradation')) {
        body = degradationSummary
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('App', () => {
  it('shows a connecting screen before the first reading arrives', async () => {
    render(<App />)

    expect(screen.getByText(/connecting to battery system/i)).toBeInTheDocument()

    // App kicks off REST fetches (history, cells, degradation) even while
    // still waiting on the first WebSocket reading. Flush them inside act()
    // so their state updates land before the test — and jsdom — tear down.
    await act(async () => {})
  })

  it('renders the metrics grid once a reading arrives', async () => {
    render(<App />)

    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0))
    act(() => {
      MockWebSocket.last.serverOpen()
      MockWebSocket.last.serverSend(reading)
    })

    expect(await screen.findByText('73%')).toBeInTheDocument()
    expect(screen.getByText('396V')).toBeInTheDocument()
    expect(screen.getByText('247')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('LIVE')

    // Let the degradation section's own fetches settle too.
    expect(await screen.findByText('Real Battery Degradation (NASA Lab Data)')).toBeInTheDocument()
  })

  it('loads history and cell data from the REST endpoints', async () => {
    render(<App />)

    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0))
    act(() => {
      MockWebSocket.last.serverOpen()
      MockWebSocket.last.serverSend(reading)
    })

    expect(await screen.findByText('Cell 1')).toBeInTheDocument()
    expect(screen.getByText('24-Hour Charge History')).toBeInTheDocument()

    // Let the degradation section's own fetches settle too.
    expect(await screen.findByText('Real Battery Degradation (NASA Lab Data)')).toBeInTheDocument()
  })

  it('loads the real NASA degradation dataset as a distinct reference section', async () => {
    render(<App />)

    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0))
    act(() => {
      MockWebSocket.last.serverOpen()
      MockWebSocket.last.serverSend(reading)
    })

    expect(await screen.findByText('Real Battery Degradation (NASA Lab Data)')).toBeInTheDocument()
    expect(screen.getByText('Reference Data')).toBeInTheDocument()
    expect(screen.getByText(/real lab measurements, not simulated/i)).toBeInTheDocument()

    // The cycle fetch (fired after the battery summary resolves) must also
    // settle before the test ends.
    expect(await screen.findByText(/71\.4% of original capacity/i)).toBeInTheDocument()
  })
})
