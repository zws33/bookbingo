-- Ascending rank, unlike the display order in `MEMBER_ROLES`, so `role > 'member'`
-- matches `outranks`. Comparisons in code still go through `permissions.ts`.
create type member_role as enum ('member', 'admin', 'owner');

create type membership_status as enum ('active', 'left', 'removed');

-- Rows are never deleted: leaving and removal change `status`, and the readings
-- of a departed member stay joinable.
create table memberships (
  challenge_id uuid not null references challenges (id) on delete cascade,
  user_id text not null references users (id) on delete restrict,
  role member_role not null default 'member',
  status membership_status not null default 'active',
  joined_at timestamptz not null default now(),
  updated_at timestamptz,
  primary key (challenge_id, user_id)
);

-- `listMyChallenges` selects one user's active memberships.
create index memberships_user_status_idx on memberships (user_id, status);

-- The last-active-owner invariant is a cross-row aggregate and is not expressed
-- here. It stays inside the transaction that performs the leave or demotion.
