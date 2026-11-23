# Remove the COVERAGE_DECAY Scoring Engine

Status: in progress. Written 2026-11-23. Delete this file when the work ships.

## Objective

`SHIFTED_HARMONIC` becomes the only registered scoring engine and the default. `COVERAGE_DECAY` — its implementation, its tests, and every reference — is removed.

The per-challenge selection mechanism stays: `Engines`, `parseEngine`, `challenge_scoring_config`, `ScoringConfigRepository` and `scoreCalculator`'s engine parameter keep their shape with one registered member. Dropping the table is a one-way door, and [create-challenge.md](create-challenge.md) plans a write path against that column.

## Decisions

1. **A new migration, not an edit to `0008`.** `scripts/lib/migrations.ts` rejects a checksum change on an applied migration, and 0008 is applied to staging and prod.
2. **Existing `COVERAGE_DECAY` rows are updated, not deleted.** The row stays the owner's explicit configuration and `updated_at` records when it moved. Deleting would score the same — an absent row resolves to the default — but silently.
3. **`check (engine in ('SHIFTED_HARMONIC'))` keeps 0008's shape**, so registering the next engine is a one-word diff.
4. **The differential tests are deleted, not rewritten.** Three asserted that two engines disagree. `shiftedHarmonic.test.ts` already carries I1, I2, I3 and the calibration targets, so nothing is lost.
5. **`scoring-model.md` is rewritten, not trimmed.** Its calibration tables are decay's, and its invariants and parameter bounds are phrased in terms of decay's exponent `p`.

## Files to change

| File                                            | Change                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| `functions/src/domain/decay.ts`                 | Delete                                                                    |
| `functions/src/domain/decay.test.ts`            | Delete                                                                    |
| `functions/src/domain/scoringEngines.ts`        | One-member `Engines`; `DEFAULT_ENGINE = 'SHIFTED_HARMONIC'`               |
| `functions/src/domain/shiftedHarmonic.ts`       | Comment names the rejected power-law curve, not a shipped engine          |
| `functions/src/domain/statistics.ts`            | `harmonicSum` docblock names its real caller                              |
| `functions/src/testing/factories.ts`            | `seedScoringConfig` default engine                                        |
| `db/migrations/0009_drop_coverage_decay.sql`    | New: update rows, narrow the check constraint                             |
| `functions/src/domain/scoringEngines.test.ts`   | Drop the two-engine comparison; rejection samples re-spelled              |
| `functions/src/scoring/handler.test.ts`         | Drop `scores with the configured engine`                                  |
| `functions/src/readings/handler.test.ts`        | Drop `scores the whole board with the configured engine`                  |
| `functions/src/scoring/scoreCalculator.test.ts` | Swap literals; drop two tests the `Engines` loops already cover           |
| `functions/src/scoring/store.test.ts`           | Default-case expectation                                                  |
| `functions/src/scoring/store.db.test.ts`        | Default expectations; `COVERAGE_DECAY` added to the schema-rejection test |
| `docs/scoring-model.md`                         | Delete the engine and calibration sections; rewrite invariants and bounds |
| `README.md`                                     | One engine in the scoring section                                         |

`create-challenge.md` is unaffected: it names `challenge_scoring_config.engine` and `EngineSchema`, never `COVERAGE_DECAY`. Its decision 3 now offers one engine to choose from.

## Validation

1. `pnpm run verify`
2. `pnpm -r test`
3. `docker compose down -v && docker compose up -d --wait`, then `pnpm run test:db`. The `-v` is required: `schema_migrations` survives both the suite's reset and a plain `down`, and 0009 must apply to a database built from 0001.
4. `pnpm run db:migrate -- --dry-run --database-url '<staging>'` — 0009 is the only pending migration and 0008's checksum still matches.

## Risks

- **Scores change for every challenge previously on `COVERAGE_DECAY`**, including every unconfigured one, because the default moves. No score is persisted, so the new numbers appear on the next read with no backfill.
- **Either deploy order is safe.** 0009 narrows a constraint nothing writes to (`ScoringConfigRepository` is read-only), and a deployment still holding both names parses the migrated rows fine.
- **The model doc loses its calibration tables.** `SHIFTED_HARMONIC`'s parameters stay unvalidated against reading data; producing its own tables is separate work.
