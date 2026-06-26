import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Shown in the error UI to identify which section failed */
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors in child components and displays a recovery UI
 * instead of crashing the entire app. Particularly useful around lazy-loaded
 * routes and heavy components (CodeMirror, xterm, etc.).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ''}]`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-950 p-6">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <h2 className="text-sm font-medium text-zinc-200">
            {this.props.label ? `${this.props.label} failed to load` : 'Something went wrong'}
          </h2>
          <p className="max-w-md text-center text-xs text-zinc-500">
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
