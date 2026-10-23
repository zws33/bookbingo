import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ToastProvider } from '../lib/ToastContext';
import {
  ChallengeContext,
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
 * Renders inside a challenge context holding exactly the memberships the test
 * names. The value is supplied here rather than fetched, so there is no fetch
 * to stub and no module to mock — the component is the only thing under test.
 * `ChallengeProvider` itself resolves `active` from the route; a test that
 * needs that behavior renders the provider.
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
          <ChallengeContext value={{ challenges, active, loading, error }}>
            {path ? (
              <Routes>
                <Route path={path} element={ui} />
              </Routes>
            ) : (
              ui
            )}
          </ChallengeContext>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
