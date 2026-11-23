-- COVERAGE_DECAY is removed from the application, so it stops being a legal
-- value. Supersedes 0008's check constraint, which cannot be edited: the
-- migrate script rejects a checksum change on a migration already applied.
--
-- The rows are updated rather than deleted. Deleting would score the same,
-- since an absent row resolves to the default engine, but the row is the
-- owner's explicit configuration and `updated_at` records when it moved.
update challenge_scoring_config
set engine = 'SHIFTED_HARMONIC', updated_at = now()
where engine = 'COVERAGE_DECAY';

alter table challenge_scoring_config
  drop constraint challenge_scoring_config_engine_check;

alter table challenge_scoring_config
  add constraint challenge_scoring_config_engine_check
  check (engine in ('SHIFTED_HARMONIC'));
