import type { ScoringInput } from '@bookbingo/lib-types';
import { scoringEngine, type Engine } from '../domain/scoringEngines.js';
import { toScoreDTO, type ScoreDTO } from './present.js';

export type ScoreCalculator = (inputs: ScoringInput[]) => ScoreDTO;

export function scoreCalculator(
  engine: Engine,
  tagsCount: number,
): ScoreCalculator {
  const score = scoringEngine(tagsCount, engine);
  return (inputs) => toScoreDTO(score(inputs));
}
