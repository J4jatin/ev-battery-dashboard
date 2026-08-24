import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BatterySummary, DegradationCycle } from '../types'
import { DegradationChart } from './DegradationChart'

const { fetchDegradationSummary, fetchDegradationCycles } = vi.hoisted(() => ({
  fetchDegradationSummary: vi.fn(),
  fetchDegradationCycles: vi.fn(),
}))

vi.mock('../api', () => ({
  fetchDegradationSummary,
  fetchDegradationCycles,
}))

const batteries: BatterySummary[] = [
  {
    battery_id: 'B0005',
    initial_capacity_ah: 1.8565,
    final_capacity_ah: 1.3251,
    capacity_fade_percent: 28.62,
    cycle_count: 168,
    ambient_temperature_c: 24,
    source: 'NASA Ames PCoE Battery Data Set',
  },
  {
    battery_id: 'B0006',
    initial_capacity_ah: 2.0353,
    final_capacity_ah: 1.1857,
    capacity_fade_percent: 41.7,
    cycle_count: 168,
    ambient_temperature_c: 24,
    source: 'NASA Ames PCoE Battery Data Set',
  },
]

const cyclesFor = (batteryId: string): DegradationCycle[] =>
  batteryId === 'B0006'
    ? [{ cycle_index: 1, capacity_ah: 2.04, soh_percent: 100 }]
    : [
        { cycle_index: 1, capacity_ah: 1.86, soh_percent: 100 },
        { cycle_index: 2, capacity_ah: 1.7, soh_percent: 91.5 },
      ]

beforeEach(() => {
  fetchDegradationSummary.mockReset().mockResolvedValue(batteries)
  fetchDegradationCycles.mockReset().mockImplementation((batteryId: string) =>
    Promise.resolve(cyclesFor(batteryId)),
  )
})

describe('DegradationChart', () => {
  it('shows a loading message before the first battery list arrives', () => {
    fetchDegradationSummary.mockReturnValue(new Promise(() => {}))
    render(<DegradationChart />)

    expect(screen.getByText(/loading degradation data/i)).toBeInTheDocument()
  })

  it('defaults to the first battery and shows its real-data stats', async () => {
    render(<DegradationChart />)

    expect(await screen.findByText(/168 cycles at 24°C/i)).toBeInTheDocument()
    expect(screen.getByText(/71\.4% of original capacity/i)).toBeInTheDocument()
  })

  it('loads a different battery when the selector changes', async () => {
    const user = userEvent.setup()
    render(<DegradationChart />)
    await screen.findByText(/168 cycles at 24°C/i)

    await user.selectOptions(screen.getByLabelText(/select battery cell/i), 'B0006')

    expect(await screen.findByText(/58\.3% of original capacity/i)).toBeInTheDocument()
    expect(fetchDegradationCycles).toHaveBeenCalledWith('B0006', expect.anything())
  })
})
