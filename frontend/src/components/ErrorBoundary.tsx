import { Component } from 'react'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  label?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{
          padding: '16px 20px', margin: 12,
          background: 'var(--irr-bg)', border: '1px solid rgba(239,68,68,.3)',
          borderRadius: 8,
        }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--irr)' }}>
            Erro ao carregar{this.props.label ? ` — ${this.props.label}` : ''}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 6, fontFamily: 'monospace' }}>
            {this.state.error?.message}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
