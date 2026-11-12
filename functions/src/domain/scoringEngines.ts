import { coverageDecay } from './decay.js';
import type { ScoringEngine } from './engine.js';

export type EngineName = 'coverage-decay';

const ENGINES: Record<EngineName, (vocabularySize: number) => ScoringEngine> = {
  'coverage-decay': coverageDecay,
};

/**
 * The model every challenge-scoped score comes from. A server constant rather
 * than a request field: two callers must never get different scores for the
 * same readings.
 */
export const ACTIVE_ENGINE: EngineName = 'coverage-decay';

export function scoringEngine(
  name: EngineName,
  vocabularySize: number,
): ScoringEngine {
  return ENGINES[name](vocabularySize);
}
