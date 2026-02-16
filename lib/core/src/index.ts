import * as constants from './constants.js';
import * as statistics from './statistics.js';
import * as scoring from './scoring.js';
import * as validation from './validation.js';
import * as tiles from './tiles.js';

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
};

export default core;

// Also export individual modules for direct imports
export { TILES } from './constants.js';
export {
  calculateMean,
  calculateStdDev,
  calculateCV,
  calculateTileCounts,
} from './statistics.js';
export {
  calculateBasePoints,
  calculateBalanceMultiplier,
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
