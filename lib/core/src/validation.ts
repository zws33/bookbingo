import type { ScoringInput } from '@bookbingo/lib-types';
import { TILES } from './constants.js';

export const MAX_TILES_PER_BOOK = 3;

/**
 * Checks if a tile assignment is valid for a book.
 */
export function canAssignTile(input: ScoringInput, tileId: string): boolean {
  if (input.isFreebie) {
    return true;
  }
  if (input.tiles.length >= MAX_TILES_PER_BOOK) {
    return false;
  }
  if (input.tiles.includes(tileId)) {
    return false;
  }
  const tile = TILES.find((t) => t.id === tileId);
  if (!tile) {
    return false;
  }
  return true;
}

/**
 * Validates the tiles assigned to a single book.
 */
export function validateBookTiles(input: ScoringInput): void {
  if (!input.isFreebie && input.tiles.length > MAX_TILES_PER_BOOK) {
    throw new Error(
      `Book exceeds the maximum of ${MAX_TILES_PER_BOOK} tiles.`,
    );
  }
  const uniqueTiles = new Set(input.tiles);
  if (uniqueTiles.size !== input.tiles.length) {
    throw new Error('Book has duplicate tile assignments.');
  }
}

/**
 * Validates the freebie book rule across a user's entire book list.
 */
export function validateFreebie(inputs: ScoringInput[]): void {
  const freebieCount = inputs.filter((input) => input.isFreebie).length;
  if (freebieCount > 1) {
    throw new Error('User has more than one "freebie" book designated.');
  }
}
