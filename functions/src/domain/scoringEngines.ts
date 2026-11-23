import type { ScoringEngine } from './engine.js';
import { shiftedHarmonic } from './shiftedHarmonic.js';

export const Engines = ['SHIFTED_HARMONIC'] as const;
export type Engine = (typeof Engines)[number];

/** Applies when a challenge has no `challenge_scoring_config` row. */
export const DEFAULT_ENGINE: Engine = 'SHIFTED_HARMONIC';

export function parseEngine(value: unknown): Engine | undefined {
  return Engines.includes(value as Engine) ? (value as Engine) : undefined;
}

/**
 * No `default` branch: the switch is exhaustive over `Engines`, so adding a
 * name without an implementation fails to compile rather than at runtime.
 */
export function scoringEngine(
  tagsCount: number,
  engine: Engine,
): ScoringEngine {
  switch (engine) {
    case 'SHIFTED_HARMONIC':
      return shiftedHarmonic(tagsCount);
  }
}
