import type { ScoringInput } from '@bookbingo/lib-types';
import {
  ACTIVE_ENGINE,
  DEFAULT_KNOBS,
  scoringEngine,
} from '../domain/scoringEngines.js';
import type { TagRepository } from '../tags/postgresStore.js';
import { toScoreDTO, type ScoreDTO } from './present.js';

export type ScoreOf = (inputs: ScoringInput[]) => ScoreDTO;

export interface Scorer {
  /**
   * The challenge's engine with its parameters already bound. Resolved once and
   * reused, so a leaderboard reads the tag vocabulary once rather than once per
   * member.
   */
  forChallenge(challengeId: string): Promise<ScoreOf>;
}

/**
 * The one place a score's model and parameters are decided. Handlers ask for a
 * challenge's engine and name no model, so swapping the model is a change here
 * and in `ACTIVE_ENGINE` rather than at every call site.
 */
export function scorer(tagsRepo: TagRepository): Scorer {
  return {
    async forChallenge(challengeId) {
      const tags = await tagsRepo.listByChallenge(challengeId);
      const engine = scoringEngine(ACTIVE_ENGINE, {
        ...DEFAULT_KNOBS,
        vocabularySize: tags.length,
      });
      return (inputs) => toScoreDTO(engine(inputs));
    },
  };
}
