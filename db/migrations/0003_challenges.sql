-- Declared in lifecycle order, so `status < 'complete'` orders correctly
create type challenge_status as enum ('draft', 'active', 'complete');

create table challenges (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  tag_cap integer not null check (tag_cap > 0),
  status challenge_status not null default 'draft',
  created_by text not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- The alphabet and length duplicate `JOIN_CODE_PATTERN` in `joinCode.ts` and
-- must move together. The alphabet omits I, L, O and U for ease of being read
-- aloud; `normalizeJoinCode` folds O to 0 and I/L to 1 before matching, but U
-- is simply absent from the alphabet, so a code containing it is rejected,
-- not corrected.
create table join_codes (
  code text primary key check (code ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$'),
  -- Unique: a challenge has exactly one live code. Rotation deletes the old
  -- row before inserting the new one, in one transaction
  challenge_id uuid not null unique references challenges (id) on delete cascade,
  created_by text not null references users (id) on delete restrict,
  created_at timestamptz not null default now()
);
