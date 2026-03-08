import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from '../lib/ToastContext';
import type { ReactNode } from 'react';

function AllProviders({ children }: { children: ReactNode }) {
  return (
    <BrowserRouter>
      <ToastProvider>{children}</ToastProvider>
    </BrowserRouter>
  );
}

function customRender(ui: ReactNode, options?: RenderOptions): RenderResult {
  return render(ui, { wrapper: AllProviders, ...options });
}

export * from '@testing-library/react';
export { customRender as render };
