import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ToastProvider } from '../lib/ToastContext';
import {
  ChallengeProvider,
  type ChallengeContextValue,
} from '../challenge/ChallengeContext';
import type { ChallengeSummary } from '../types/challenges';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
}

interface Options extends Partial<ChallengeContextValue> {
  /** The entry URL. Components under test render links relative to it. */
  route?: string;
  /** Where the component is mounted, when it is not the whole subtree. */
  path?: string;
}

const NO_CHALLENGES: ChallengeSummary[] = [];

/**
 * Renders inside a `ChallengeProvider` holding exactly the memberships the
 * test names. The provider takes its value as a prop, so there is no fetch to
 * stub and no module to mock — the component is the only thing under test.
 */
export function renderInChallenge(
  ui: ReactNode,
  {
    route = '/',
    path,
    challenges = NO_CHALLENGES,
    active,
    loading = false,
    error,
  }: Options = {},
): RenderResult {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider client={makeQueryClient()}>
        <ToastProvider>
          <ChallengeProvider value={{ challenges, active, loading, error }}>
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
