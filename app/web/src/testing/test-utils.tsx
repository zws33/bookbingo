import {
  render,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../lib/ToastContext';
import type { ReactNode } from 'react';

/**
 * A fresh cache per render. A shared client would carry one test's data into
 * the next, and retries would turn an expected rejection into a timeout.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
}

function AllProviders({ children }: { children: ReactNode }) {
  return (
    <BrowserRouter>
      <QueryClientProvider client={makeQueryClient()}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

function customRender(ui: ReactNode, options?: RenderOptions): RenderResult {
  return render(ui, { wrapper: AllProviders, ...options });
}

export * from '@testing-library/react';
export { customRender as render };
/** For renderHook: a query hook needs the same providers a component gets. */
export { AllProviders as Providers };
