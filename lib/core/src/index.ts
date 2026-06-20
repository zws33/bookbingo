import * as constants from './constants.js';
import * as statistics from './statistics.js';
import * as scoring from './scoring.js';
import * as validation from './validation.js';
import * as tiles from './tiles.js';
import * as bookIdentity from './bookIdentity.js';

/**
 * The core BookBingo module, providing all necessary functions
 * for scoring, validation, and statistical analysis.
 */
const core = {
  ...constants,
  ...statistics,
  ...scoring,
  ...validation,
  ...tiles,
  ...bookIdentity,
};

export default core;

// Also export individual modules for direct imports
export { TILES } from './constants.js';
export {
  calculateMean,
  calculateStdDev,
  calculateCV,
  calculateTileCounts,
  harmonicSum,
} from './statistics.js';
export {
  calculateVarietyPoints,
  calculateVolumePoints,
  calculateBalanceFactor,
  calculateScore,
  getScoreBreakdown,
} from './scoring.js';
export {
  MAX_TILES_PER_BOOK,
  canAssignTile,
  validateBookTiles,
  validateFreebie,
} from './validation.js';
export { getTileById } from './tiles.js';
export { deriveBookId, normalizeForKey } from './bookIdentity.js';
export type { BookIdentity } from './bookIdentity.js';
