create type member_role as enum ('member', 'admin', 'owner');

create type membership_status as enum ('active', 'left', 'removed');

-- Leaving and removal change `status`; a departed member's readings stay
-- joinable. The only delete is `challenges.remove` clearing the challenge, and
-- `restrict` on both keys makes that the one path: readings and TBR entries
-- hold the membership row down until history is cleared by script.
create table memberships (
  challenge_id uuid not null references challenges (id) on delete restrict,
  user_id text not null references users (id) on delete restrict,
  role member_role not null default 'member',
  status membership_status not null default 'active',
  joined_at timestamptz not null default now(),
  updated_at timestamptz,
  primary key (challenge_id, user_id)
);

-- `listMyChallenges` selects one user's active memberships.
create index memberships_user_status_idx on memberships (user_id, status);
