import { coverageDecay } from './decay.js';
import type { ScoringEngine } from './engine.js';

export interface ScoringKnobs {
  yMin: number;
  yMax: number;
}

export interface ScoringParams extends ScoringKnobs {
  /** N — the challenge's tag vocabulary size. Never read from `TILES`. */
  vocabularySize: number;
}

export type EngineName = 'coverage-decay';

const ENGINES: Record<EngineName, (params: ScoringParams) => ScoringEngine> = {
  'coverage-decay': coverageDecay,
};

/**
 * The model every challenge-scoped score comes from. A server constant rather
 * than a request field: two callers must never get different scores for the
 * same readings.
 */
export const ACTIVE_ENGINE: EngineName = 'coverage-decay';

/**
 * Provisional: no reading data or stated group expectation has validated them
 * (docs/scoring-model.md). This is the seam a per-challenge column replaces.
 */
export const DEFAULT_KNOBS: ScoringKnobs = { yMin: 0.2, yMax: 0.5 };

export function scoringEngine(
  name: EngineName,
  params: ScoringParams,
): ScoringEngine {
  return ENGINES[name](params);
}
