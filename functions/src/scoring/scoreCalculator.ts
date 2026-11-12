import type { ScoringInput } from '@bookbingo/lib-types';
import { scoringEngine } from '../domain/scoringEngines.js';
import { toScoreDTO, type ScoreDTO } from './present.js';

export type ScoreCalculator = (inputs: ScoringInput[]) => ScoreDTO;

export function scoreCalculator(tagsCount: number): ScoreCalculator {
  const engine = scoringEngine(tagsCount);
  return (inputs) => toScoreDTO(engine(inputs));
}
