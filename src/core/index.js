import * as constants from './constants.js';
import * as statistics from './statistics.js';
import * as scoring from './scoring.js';
import * as validation from './validation.js';

/**
 * The core BookBingo module, providing all necessary functions
 * for scoring, validation, and statistical analysis.
 */
const core = {
  ...constants,
  ...statistics,
  ...scoring,
  ...validation,
};

export default core;

