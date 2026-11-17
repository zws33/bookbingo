# Plan — select the scoring engine per challenge

Delete this file when the work ships.

## Objective

Choose a challenge's scoring engine without a redeploy. A `challenge_scoring_config` row read on each scoring call; set by SQL in the Neon console. The repository is read-only — no callable, no permission check, no UI.

Rejected: Firebase Remote Config. Server-side is Preview, unemulated locally, eventually consistent, and cannot target a single challenge.

## Decisions

| Decision       | Value                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Granularity    | per challenge — lets `SHIFTED_HARMONIC` run on a test challenge while a live competition stays put           |
| Values         | the `Engines` union verbatim, `COVERAGE_DECAY` and `SHIFTED_HARMONIC`                                        |
| Absent row     | resolved to `COVERAGE_DECAY` in the repository, so `getEngine` returns `Engine`, never `Engine \| undefined` |
| Column default | none — the repository owns the default, so it is not stated twice                                            |
| Writes         | SQL in the Neon console                                                                                      |
| Knobs          | stay in code; `requireParamsInBounds` guards them at import                                                  |

## Schema

```sql
-- db/migrations/0008_scoring_engine.sql
create table challenge_scoring_config (
  challenge_id uuid primary key references challenges (id) on delete cascade,
  engine text not null
    check (engine in ('COVERAGE_DECAY', 'SHIFTED_HARMONIC')),
  updated_at timestamptz not null default now()
);
```

- `challenge_id` as primary key: one engine per challenge is a schema guarantee.
- `cascade`, not `restrict`: derived configuration, per the delete rule in `CLAUDE.md`. The cascade is the only place this deletion is expressed, so a db test pins it.
- `text` + `check`, not an enum: `migrate.ts` wraps each migration in `begin`/`commit`, and a new enum value cannot be used in the transaction that adds it.
- Named for the concept: `docs/scoring-model.md` anticipates the curve parameters moving per-challenge, and they become columns here.

## Files to change

| File                                                  | Change                                                                                                                                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db/migrations/0008_scoring_engine.sql`               | new                                                                                                                                                                     |
| `domain/scoringEngines.ts`                            | register `SHIFTED_HARMONIC` — it exists at `domain/shiftedHarmonic.ts:48`, tested, imported by nothing. Add `parseEngine(v): Engine \| undefined`; drop the default arg |
| `scoring/scoreCalculator.ts`                          | `scoreCalculator(engine, tagsCount)`                                                                                                                                    |
| `scoring/store.ts`                                    | new — `ScoringConfigRepository`, `getEngine`, `scoringConfigRepository()` with its own `dbErrors('scoringConfig', …)`                                                   |
| `scoring/store.db.test.ts`                            | new                                                                                                                                                                     |
| `scoring/handler.ts`                                  | take `scoringConfigRepo`; add `getEngine` to the existing `Promise.all`                                                                                                 |
| `readings/handler.ts`                                 | same, for `list` (:140) and `leaderboard` (:187) — resolve before the member loop                                                                                       |
| `index.ts`                                            | build the repo in `buildApi()`, pass to both factories                                                                                                                  |
| `scoring/handler.test.ts`, `readings/handler.test.ts` | fake repo gains `getEngine`                                                                                                                                             |
| `testing/factories.ts`                                | `seedScoringConfig`                                                                                                                                                     |
| `docs/scoring-model.md`                               | its Verification section claims one engine and names `ACTIVE_ENGINE`; both stale. Add the shifted-harmonic curve                                                        |
| `docs/shifted-harmonic-plan.md`                       | delete — its engine shipped                                                                                                                                             |

Untouched: `challenges/store.ts`, `Challenge`, `ChallengeDTO`, `challenges/present.ts`, `lib/types`, all of `app/web`. The engine is server-side; the client has no use for it.

A new read is needed because the three scoring paths call `requireActiveMembership` → `getMembership` and never read the `challenges` row.

## Ordered steps

Each leaves the tree green.

1. Register `SHIFTED_HARMONIC`; add `parseEngine`.
2. Thread `engine` through `scoreCalculator`; pin call sites to `COVERAGE_DECAY`.
3. Migration `0008`; `scoring/store.ts`; `scoring/store.db.test.ts`.
4. Handlers take `scoringConfigRepo`; `index.ts` wires it.
5. Handler tests gain `getEngine`.
6. Migrate staging, deploy, verify; then prod.
7. Docs.

## Validation

- `pnpm run format`, `pnpm run verify` at root. `pnpm --filter @bookbingo/functions test` while iterating.
- `pnpm run test:db` for step 3 — it chains `db:migrate`, so the local Docker Postgres picks up `0008`. CI's `test_db` job already does the same; no workflow change.
- Existing `COVERAGE_DECAY` assertions pass with **unchanged expected values** — the proof the default moved no score.
- `store.db.test.ts`: absent row → `COVERAGE_DECAY`; round-trip; the check constraint rejects an unknown engine; deleting the challenge removes the row.
- Handler tests: one `getEngine` call per `getScore`, `list`, `leaderboard`; the leaderboard does not re-resolve per member.

## Operations

Migrations are forward-only and checksummed — never edit `0008` once applied; add `0009`. A remote database is reached only by naming it:

```bash
pnpm run db:migrate -- --dry-run --database-url '<neon-staging>'
pnpm run db:migrate -- --database-url '<neon-staging>'
```

Migrate before deploying functions that read the table. The migration is additive, so old code ignores it and new code resolves the absent row to the default — zero downtime in both directions.

Switching an engine, in the Neon SQL editor:

```sql
insert into challenge_scoring_config (challenge_id, engine)
values ('<uuid>', 'SHIFTED_HARMONIC')
on conflict (challenge_id) do update
  set engine = excluded.engine, updated_at = now();
```

Takes effect on the next request. The client's 30s `staleTime` is the only delay.

## Risks

1. **Switching rescores retroactively.** No score is persisted — no column in `db/migrations/`, no write path scores — so every historical reading is re-scored under the new engine on the next read. Rollback is the same `insert … on conflict` with the old value, and restores every score exactly. Per-challenge granularity is what keeps this off a live competition.
2. **If a score is ever persisted, the read-time resolution becomes wrong.** The write path must then record the engine beside the value, because a row stamped `SHIFTED_HARMONIC` holding a `COVERAGE_DECAY` number is unrecoverable without recomputation.
3. **No audit trail.** `updated_at` records when, not who or what it was before. Acceptable with one operator.
4. **No UI.** Setting an engine needs Neon console access. A `setEngine` callable with an owner permission check is the extension if that becomes a constraint.
5. **A completed challenge is not frozen.** It is re-scored under whatever engine its row names. Already true today; the switch makes it visible.
