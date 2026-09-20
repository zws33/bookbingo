import type { Tile } from '@bookbingo/lib-types';
import { createCallable } from '../lib/callable';
import { BoardConfigResponseSchema } from '../types/schemas';

export interface BoardConfig {
  tiles: Tile[];
  maxTilesPerBook: number;
}

/**
 * The tile vocabulary and the per-reading tile cap.
 *
 * Served rather than bundled so the catalog has one owner: the reading
 * endpoints reject a tile that is not in it, and a client constant could drift
 * from what they accept.
 */
export const getBoardConfig = createCallable<void, BoardConfig>(
  'getBoardConfig',
  BoardConfigResponseSchema,
);
