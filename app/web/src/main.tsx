import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './lib/ToastContext';
import { queryClient } from './lib/queryClient';
import { log } from '@bookbingo/lib-util';
// Self-hosted fonts (bundled by Vite, no CDN). Variable flavors: one file per
// family, all weights. Registered families: "Inter Variable", "Noto Serif Variable".
import '@fontsource-variable/inter';
import '@fontsource-variable/noto-serif';
import './index.css';

window.onerror = (_message, _source, _line, _col, error) => {
  log.error('global', error ?? new Error(String(_message)));
  return false;
};

window.addEventListener(
  'unhandledrejection',
  (event: PromiseRejectionEvent) => {
    const reason =
      event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason));
    log.error('global', reason);
  },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </ToastProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
