import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { connectTestDatabase, type TestDatabase } from '../testing/db.js';
import {
  seedChallenge,
  seedScoringConfig,
  seedUser,
} from '../testing/factories.js';
import { scoringConfigRepository } from './store.js';

const ABSENT_ID = '00000000-0000-0000-0000-000000000000';

describe('scoringConfigRepository', () => {
  let testDb: TestDatabase;

  before(async () => {
    testDb = await connectTestDatabase();
  });
  beforeEach(() => testDb.reset());
  after(() => testDb.close());

  const repository = () => scoringConfigRepository(testDb.db);

  async function challenge() {
    const userId = await seedUser(testDb.db);
    return seedChallenge(testDb.db, { createdBy: userId });
  }

  describe('getEngine', () => {
    test('defaults an unconfigured challenge to coverage-decay', async () => {
      const challengeId = await challenge();
      assert.equal(await repository().getEngine(challengeId), 'COVERAGE_DECAY');
    });

    test('returns the configured engine', async () => {
      const challengeId = await challenge();
      await seedScoringConfig(testDb.db, {
        challengeId,
        engine: 'SHIFTED_HARMONIC',
      });
      assert.equal(
        await repository().getEngine(challengeId),
        'SHIFTED_HARMONIC',
      );
    });

    test('defaults a challenge that does not exist', async () => {
      // Scoring already refused a non-member before reaching here, so an
      // absent id is not this repository's rejection to make.
      assert.equal(await repository().getEngine(ABSENT_ID), 'COVERAGE_DECAY');
    });

    test('defaults a malformed id rather than raising', async () => {
      assert.equal(
        await repository().getEngine('not-a-uuid'),
        'COVERAGE_DECAY',
      );
    });
  });

  describe('the schema', () => {
    test('refuses an engine the deployment does not implement', async () => {
      const challengeId = await challenge();
      await assert.rejects(
        seedScoringConfig(testDb.db, { challengeId, engine: 'HARMONIC' }),
        /challenge_scoring_config_engine_check/,
      );
    });

    test('holds one engine per challenge', async () => {
      const challengeId = await challenge();
      await seedScoringConfig(testDb.db, { challengeId });
      await assert.rejects(
        seedScoringConfig(testDb.db, {
          challengeId,
          engine: 'SHIFTED_HARMONIC',
        }),
        /challenge_scoring_config_pkey/,
      );
    });

    /**
     * The cascade is the only place this deletion is expressed — unlike the
     * rest of the subtree, no repository method names this table.
     */
    test('drops the row with the challenge', async () => {
      const challengeId = await challenge();
      await seedScoringConfig(testDb.db, { challengeId });

      await testDb.db.query('delete from challenges where id = $1', [
        challengeId,
      ]);

      const { rowCount } = await testDb.db.query(
        'select 1 from challenge_scoring_config where challenge_id = $1',
        [challengeId],
      );
      assert.equal(rowCount, 0);
    });
  });
});
