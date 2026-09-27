-- Ids are Firebase Auth uids, so `users` has no surrogate key and no row is
-- ever deleted: readings and memberships are retained after someone leaves.
-- Every foreign key to this table is `on delete restrict`: an erasure fails
-- loudly rather than nulling attribution or cascading a TBR list away. If it
-- is ever needed it becomes an explicit ordered script.
create table users (
  id text primary key,
  name text not null default 'User',
  photo_url text,
  -- Counts creations, not challenges currently owned. Never decremented, so
  -- create-then-delete cannot free a slot. The cap itself lives in code
  -- because superadmins are exempt.
  challenges_created integer not null default 0 check (challenges_created >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
