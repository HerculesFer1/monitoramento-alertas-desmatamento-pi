import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from '../StatusBadge'

describe('StatusBadge', () => {
  it('exibe "AO VIVO" por padrão quando live=true', () => {
    render(<StatusBadge live={true} />)
    expect(screen.getByText('AO VIVO')).toBeInTheDocument()
  })

  it('exibe "ESTÁTICO" por padrão quando live=false', () => {
    render(<StatusBadge live={false} />)
    expect(screen.getByText('ESTÁTICO')).toBeInTheDocument()
  })

  it('respeita liveLabel customizado', () => {
    render(<StatusBadge live={true} liveLabel="TEMPO REAL" />)
    expect(screen.getByText('TEMPO REAL')).toBeInTheDocument()
  })

  it('respeita staticLabel customizado', () => {
    render(<StatusBadge live={false} staticLabel="PIPELINE" />)
    expect(screen.getByText('PIPELINE')).toBeInTheDocument()
  })

  it('renderiza como <span>', () => {
    const { container } = render(<StatusBadge live={true} />)
    expect(container.querySelector('span')).toBeTruthy()
  })
})
