'use client'
import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  label?: string  // e.g. "AI suggestions" — used in the default error message
}

interface State { hasError: boolean; message: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Something went wrong',
    }
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    if (this.props.fallback) return this.props.fallback

    const label = this.props.label ?? 'this section'
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p className="font-medium">Could not load {label}</p>
        <p className="mt-1 text-xs text-red-500">{this.state.message}</p>
        <button
          className="mt-2 text-xs underline"
          onClick={() => this.setState({ hasError: false, message: '' })}
        >
          Try again
        </button>
      </div>
    )
  }
}
