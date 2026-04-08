import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info.componentStack)
    }
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="error-boundary">
            <p>Что-то пошло не так.</p>
            <button onClick={() => this.setState({ error: null })}>Попробовать снова</button>
          </div>
        )
      )
    }
    return this.props.children
  }
}
