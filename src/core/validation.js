import { TILES } from './constants.js';

export const MAX_TILES_PER_BOOK = 3;

/**
 * Checks if a tile assignment is valid for a book.
 * @param {import('../data/index.js').UserBook} book - The book to check.
 * @param {string} tileId - The ID of the tile to assign.
 * @returns {boolean} True if the tile can be assigned, false otherwise.
 */
export function canAssignTile(book, tileId) {
  if (book.isFreebie) {
    return true; // Freebie books can have unlimited tiles.
  }
  if (book.tiles.length >= MAX_TILES_PER_BOOK) {
    return false; // Exceeds the maximum number of tiles per book.
  }
  if (book.tiles.includes(tileId)) {
    return false; // Tile is already assigned to this book.
  }
  const tile = TILES.find((t) => t.id === tileId);
  if (!tile || tile.isManual) {
    return false; // Tile does not exist or is a manual tile.
  }
  return true;
}

/**
 * Validates the tiles assigned to a single book.
 * @param {import('../data/index.js').UserBook} book - The book to validate.
 * @throws {Error} If the book violates any tile validation rules.
 */
export function validateBookTiles(book) {
  if (!book.isFreebie && book.tiles.length > MAX_TILES_PER_BOOK) {
    throw new Error(
      `Book "${book.title}" exceeds the maximum of ${MAX_TILES_PER_BOOK} tiles.`
    );
  }
  const uniqueTiles = new Set(book.tiles);
  if (uniqueTiles.size !== book.tiles.length) {
    throw new Error(`Book "${book.title}" has duplicate tile assignments.`);
  }
}

/**
 * Validates the freebie book rule across a user's entire book list.
 * @param {import('../data/index.js').UserBook[]} userBooks - All books for a user.
 * @throws {Error} If there is more than one freebie book.
 */
export function validateFreebie(userBooks) {
  const freebieCount = userBooks.filter((book) => book.isFreebie).length;
  if (freebieCount > 1) {
    throw new Error('User has more than one "freebie" book designated.');
  }
}

