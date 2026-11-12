import { coverageDecay } from './decay.js';
import type { ScoringEngine } from './engine.js';

export const Engines = ['COVERAGE_DECAY'] as const;
export type Engine = (typeof Engines)[number];

export function scoringEngine(
  vocabularySize: number,
  engine: Engine = 'COVERAGE_DECAY',
): ScoringEngine {
  switch (engine) {
    case 'COVERAGE_DECAY':
      return coverageDecay(vocabularySize);
    default:
      throw new Error('Invalid Engine');
  }
}
