import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { CellData } from '../types'
import { CellHealthGrid } from './CellHealthGrid'

const cells: CellData[] = [
  { id: 1, voltage: 3.61, temperature: 29.4, status: 'normal' },
  { id: 2, voltage: 3.44, temperature: 35.1, status: 'warning' },
]

describe('CellHealthGrid', () => {
  it('renders one tile per cell', () => {
    render(<CellHealthGrid cells={cells} />)

    expect(screen.getByText('Cell 1')).toBeInTheDocument()
    expect(screen.getByText('Cell 2')).toBeInTheDocument()
    expect(screen.getByText('3.61V')).toBeInTheDocument()
  })

  it('flags a faulty cell and leaves a healthy one unflagged', () => {
    render(<CellHealthGrid cells={cells} />)

    expect(screen.getByTestId('cell-2')).toHaveClass('cell-state-warning')
    expect(screen.getByTestId('cell-1')).toHaveClass('cell-state-normal')
    expect(screen.getAllByLabelText('Cell fault')).toHaveLength(1)
  })

  it('shows a placeholder instead of an empty grid before data arrives', () => {
    render(<CellHealthGrid cells={[]} />)

    expect(screen.getByText(/waiting for cell data/i)).toBeInTheDocument()
  })
})
