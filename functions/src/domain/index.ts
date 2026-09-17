/**
 * Domain logic: tile vocabulary, tile validation, and scoring.
 *
 * Copied from `lib/core` rather than imported from it. `firebase deploy`
 * uploads `functions/` alone and installs it with npm, which cannot resolve a
 * `workspace:` dependency (see deploy-manifest.test.ts). A runtime import of
 * `@bookbingo/lib-core` therefore compiles and tests clean but fails at cold
 * start with ERR_MODULE_NOT_FOUND. Type-only imports from `@bookbingo/lib-types`
 * are safe because the compiler erases them.
 *
 * `lib/core` still serves the web app until it stops scoring and rendering the
 * tile list client-side, at which point it is deleted (step 9 of
 * docs/functions-data-migration-plan.md). Until then this copy is frozen: a
 * change to either side has to be made in both, so make none.
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
