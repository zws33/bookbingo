import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './lib/ToastContext';
import { log } from '@bookbingo/lib-util';
import './index.css';

window.onerror = (_message, _source, _line, _col, error) => {
  log.error('global', error ?? new Error(String(_message)));
  return false;
};

window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
  log.error('global', reason);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);
