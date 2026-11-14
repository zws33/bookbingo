-- Which scoring engine a challenge is scored with. Derived configuration, so
-- it cascades: losing it on a challenge delete costs nothing, and the absent
-- row is a legal state the repository resolves to the default engine.
--
-- No column default: the default lives in `domain/scoringEngines.ts` and is
-- applied when no row exists, so it is not stated in two places that can drift.
--
-- `text` with a check rather than an enum: `migrate.ts` wraps each migration in
-- begin/commit, and a new enum value cannot be used in the transaction that
-- adds it.
create table challenge_scoring_config (
  challenge_id uuid primary key references challenges (id) on delete cascade,
  engine text not null check (engine in ('COVERAGE_DECAY', 'SHIFTED_HARMONIC')),
  updated_at timestamptz not null default now()
);
