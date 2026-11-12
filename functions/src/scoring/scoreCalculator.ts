import type { ScoringInput } from '@bookbingo/lib-types';
import { ACTIVE_ENGINE, scoringEngine } from '../domain/scoringEngines.js';
import { toScoreDTO, type ScoreDTO } from './present.js';

export type ScoreCalculator = (inputs: ScoringInput[]) => ScoreDTO;

/**
 * The one place a score's model is decided. Callers pass the challenge's
 * vocabulary size and name no model, so swapping the model is a change in
 * `ACTIVE_ENGINE` rather than at every call site.
 */
export function scoreCalculator(tagsCount: number): ScoreCalculator {
  const engine = scoringEngine(ACTIVE_ENGINE, tagsCount);
  return (inputs) => toScoreDTO(engine(inputs));
}
