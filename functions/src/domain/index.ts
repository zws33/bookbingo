/**
 * Domain logic: tile vocabulary, tile validation, and scoring.
 *
 * Lives in `functions/` rather than a shared `lib/` package because
 * `firebase deploy` uploads this directory alone and installs it with npm,
 * which cannot resolve a `workspace:` dependency (see deploy-manifest.test.ts).
 * A runtime import of a workspace package compiles and tests clean, then fails
 * at cold start with ERR_MODULE_NOT_FOUND. Type-only imports from
 * `@bookbingo/lib-types` are safe because the compiler erases them.
 *
 * The client renders tiles from `getBoardConfig` and scores from the reading
 * responses, so nothing here is duplicated on the other side.
 */
export { TILES } from './constants.js';
export { getTileById } from './tiles.js';
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
