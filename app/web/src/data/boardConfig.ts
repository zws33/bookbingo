import type { BoardConfig } from '@bookbingo/lib-types';
import { createCallable } from '../lib/callable';
import { BoardConfigResponseSchema } from '../types/schemas';

/**
 * The challenge's tag vocabulary and its per-reading cap.
 *
 * `tiles[].id` is a stored tag id, not a catalog constant: the reading
 * endpoints reject a tag outside this challenge's vocabulary, and a client
 * constant could drift from what they accept.
 */
export const getBoardConfig = createCallable<
  { challengeId: string },
  BoardConfig
>('getBoardConfigV2', BoardConfigResponseSchema);
