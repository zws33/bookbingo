import type { ScoreBreakdown, ScoringInput } from '@bookbingo/lib-types';
import { coverageDecay } from './decay.js';
import { getScoreBreakdown } from './scoring.js';

/**
 * Parameters are bound when the engine is built, so scoring itself is only ever
 * readings in and a breakdown out. That is what lets a caller resolve a
 * challenge's parameters once and score every member with the result.
 */
export type ScoringEngine = (inputs: ScoringInput[]) => ScoreBreakdown;

export interface ScoringKnobs {
  yMin: number;
  yMax: number;
}

export interface ScoringParams extends ScoringKnobs {
  /** N — the challenge's tag vocabulary size. Never read from `TILES`. */
  vocabularySize: number;
}

export const ENGINE_NAMES = [
  'coverage-decay',
  'balanced-harmonic',
  'harmonic',
] as const;

export type EngineName = (typeof ENGINE_NAMES)[number];

/** The two pre-decay models take no parameters and ignore the ones they get. */
const ENGINES: Record<EngineName, (params: ScoringParams) => ScoringEngine> = {
  'coverage-decay': coverageDecay,
  'balanced-harmonic': () => (inputs) =>
    getScoreBreakdown(inputs, 'balanced-harmonic'),
  harmonic: () => (inputs) => getScoreBreakdown(inputs, 'harmonic'),
};

/**
 * The model every challenge-scoped score comes from. A server constant rather
 * than a request field: two callers must never get different scores for the
 * same readings. Flipping it back is the rollback for the decay model.
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
