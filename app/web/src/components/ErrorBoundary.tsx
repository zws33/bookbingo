import { Component, ErrorInfo, ReactNode } from 'react';
import { log } from '@bookbingo/lib-util';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    log.error('ErrorBoundary', error, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Something went wrong
            </h2>
            <p className="text-gray-500 mb-6">Reload the page to try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-blue-700"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
