import type { CallableRequest } from 'firebase-functions/v2/https';
import type { BoardConfig } from '@bookbingo/lib-types';
import { parseRequest, requireAuth } from '../callable.js';
import { denied, requireActiveMembership } from '../challenges/access.js';
import { hasPermission } from '../challenges/permissions.js';
import type { ChallengeRepository } from '../challenges/postgresStore.js';
import { MAX_TILES_PER_BOOK, TILES } from '../domain/constants.js';
import type { TagRepository } from '../tags/postgresStore.js';
import { GetBoardConfigRequestSchema } from './schema.js';

/**
 * The tile vocabulary and the per-reading tile cap.
 *
 * The client renders the board from this and uses the cap to stop offering a
 * fourth tile; the reading handlers enforce both regardless, so a stale client
 * cannot write a tile that is not in the catalog.
 */
export function getBoardConfigHandler(
  request: CallableRequest<unknown>,
): BoardConfig {
  requireAuth(request, 'load the board');
  return { tiles: TILES, maxTilesPerBook: MAX_TILES_PER_BOOK };
}

/**
 * The same payload, read from the challenge instead of `domain/constants.ts`:
 * the vocabulary is per-challenge (rule 12) and the cap is a column (rule 10).
 *
 * `tile` is the client's noun for a tag (rule 13), so a `tags` row crosses the
 * wire as `{ id, name }` — the id is the `tags.id` uuid the scoring and the
 * reading writes already use, not a `t01`-style literal.
 */
export function boardConfigHandlers(
  tagsRepo: TagRepository,
  challengesRepo: ChallengeRepository,
) {
  return {
    async get(request: CallableRequest<unknown>): Promise<BoardConfig> {
      const { uid } = requireAuth(request, 'load the board');
      const { challengeId } = parseRequest(
        GetBoardConfigRequestSchema,
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

      const [challenge, tags] = await Promise.all([
        challengesRepo.get(challengeId),
        tagsRepo.listByChallenge(challengeId),
      ]);

      return {
        tiles: tags.map((tag) => ({ id: tag.id, name: tag.label })),
        maxTilesPerBook: challenge.tagCap,
      };
    },
  };
}
