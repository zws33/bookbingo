import type { CallableRequest } from 'firebase-functions/v2/https';
import type { Tile } from '@bookbingo/lib-types';
import { TILES } from '../domain/constants.js';
import { MAX_TILES_PER_BOOK } from '../domain/validation.js';
import { requireAuth } from '../callable.js';

export interface BoardConfig {
  tiles: Tile[];
  maxTilesPerBook: number;
}

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
