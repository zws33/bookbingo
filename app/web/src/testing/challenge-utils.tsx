import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ToastProvider } from '../lib/ToastContext';
import { ChallengeProvider } from '../challenge/ChallengeContext';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
}

interface Options {
  /** The entry URL. `/c/:challengeId` paths are what resolve an active challenge. */
  route?: string;
  /** Where the component under test is mounted, when it is not the whole app. */
  path?: string;
}

/**
 * Renders inside a `ChallengeProvider` at a chosen URL. The provider reads the
 * membership list through `data/challenges`, so a test mocks that module and
 * the provider resolves the active challenge from the route the same way the
 * app does.
 */
export function renderInChallenge(
  ui: ReactNode,
  { route = '/', path }: Options = {},
): RenderResult {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider client={makeQueryClient()}>
        <ToastProvider>
          <ChallengeProvider enabled>
            {path ? (
              <Routes>
                <Route path={path} element={ui} />
              </Routes>
            ) : (
              ui
            )}
          </ChallengeProvider>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
