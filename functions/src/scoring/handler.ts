import type { CallableRequest } from 'firebase-functions/v2/https';
import { parseRequest, requireAuth } from '../callable.js';
import { denied, requireActiveMembership } from '../challenges/access.js';
import { hasPermission } from '../challenges/permissions.js';
import type { ChallengeRepository } from '../challenges/postgresStore.js';
import type { ReadingRepository } from '../readings/postgresStore.js';
import { toScoringInputs, type ScoreDTO } from './present.js';
import { GetScoreRequestSchema } from './schema.js';
import type { Scorer } from './scorer.js';

export function scoringHandlers(
  readingsRepo: ReadingRepository,
  challengesRepo: ChallengeRepository,
  scorer: Scorer,
) {
  return {
    /**
     * One member's score, from the same readings `listReadings` would return.
     *
     * Its own callable rather than a field on the readings response: a
     * breakdown is worth rendering without a book list, and the model behind
     * it changes without touching that response's shape.
     *
     * The target's membership is checked as well as the caller's, for the
     * reason `listReadings` checks it — a `left` member's history stays out of
     * sight until they rejoin (rule 25).
     */
    async get(request: CallableRequest<unknown>): Promise<ScoreDTO> {
      const { uid } = requireAuth(request, 'load a score');
      const { challengeId, userId } = parseRequest(
        GetScoreRequestSchema,
        request.data,
      );

      const membership = await requireActiveMembership(
        challengesRepo,
        challengeId,
        uid,
      );
      if (!hasPermission(membership.role, 'challenge.read')) {
        throw denied(membership, 'challenge.read');
      }
      if (userId !== uid) {
        await requireActiveMembership(challengesRepo, challengeId, userId);
      }

      const [readings, scoreOf] = await Promise.all([
        readingsRepo.list(challengeId, userId),
        scorer.forChallenge(challengeId),
      ]);

      return scoreOf(toScoringInputs(readings));
    },
  };
}
