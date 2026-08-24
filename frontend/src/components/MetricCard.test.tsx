import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MetricCard } from './MetricCard'

describe('MetricCard', () => {
  it('renders its title and value', () => {
    render(<MetricCard title="State of Charge" value="73%" color="#00d4ff" />)

    expect(screen.getByText('State of Charge')).toBeInTheDocument()
    expect(screen.getByText('73%')).toBeInTheDocument()
  })

  it('applies the supplied accent colour to the value', () => {
    render(<MetricCard title="Voltage" value="396V" color="rgb(255, 170, 0)" />)

    expect(screen.getByText('396V')).toHaveStyle({ color: 'rgb(255, 170, 0)' })
  })
})
