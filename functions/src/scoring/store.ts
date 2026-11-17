import { DomainError } from '../common/errors.js';
import type { ConstraintMessages } from '../common/pgErrors.js';
import { dbErrors } from '../db/errors.js';
import { getPool } from '../db/pool.js';
import type { Db } from '../db/transaction.js';
import {
  DEFAULT_ENGINE,
  parseEngine,
  type Engine,
} from '../domain/scoringEngines.js';

export interface ScoringConfigRepository {
  /**
   * Never `undefined`: a challenge with no row is scored with
   * `DEFAULT_ENGINE`, so no layer above this one can observe "unconfigured".
   */
  getEngine(challengeId: string): Promise<Engine>;
}

const SCORING_CONFIG_ERRORS: ConstraintMessages = {
  challenge_scoring_config_challenge_id_fkey: [
    'not-found',
    'That challenge no longer exists.',
  ],
};

export function scoringConfigRepository(
  db: Db = getPool(),
): ScoringConfigRepository {
  const mapError = dbErrors('scoringConfig', {
    constraints: SCORING_CONFIG_ERRORS,
    malformedId: 'That challenge no longer exists.',
  });

  return {
    async getEngine(challengeId) {
      let engine: string | undefined;
      try {
        const { rows } = await db.query<{ engine: string }>(
          'select engine from challenge_scoring_config where challenge_id = $1',
          [challengeId],
        );
        engine = rows[0]?.engine;
      } catch (error) {
        // A malformed id names no challenge, which has no configuration.
        const mapped = mapError('getEngine', error);
        if (mapped instanceof DomainError && mapped.kind === 'not-found') {
          return DEFAULT_ENGINE;
        }
        throw mapped;
      }

      if (engine === undefined) return DEFAULT_ENGINE;

      const parsed = parseEngine(engine);
      if (!parsed) {
        // The check constraint admits only registered names, so a value this
        // deployment does not know is a row written against a later schema.
        throw new DomainError(
          'corrupt',
          `challenge_scoring_config.engine is ${engine}, which this deployment does not implement.`,
        );
      }
      return parsed;
    },
  };
}
