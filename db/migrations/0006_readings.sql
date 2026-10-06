-- The same book read for two challenges is two rows. A reading counts toward
-- exactly one challenge and is never shared.
create table readings (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null,
  user_id text not null,
  book_id text not null references books (id) on delete restrict,
  is_freebie boolean not null default false,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  -- Composite, so a reading cannot exist for someone who was never a member of
  -- its challenge. Restrict: this is what stops a challenge delete from
  -- reaching history, by blocking the membership delete that precedes it.
  foreign key (challenge_id, user_id) references memberships (challenge_id, user_id) on delete restrict,
  -- For the composite foreign key in `reading_tags`.
  unique (id, challenge_id)
);

-- Leaderboard, library and the per-user listing all read one challenge.
create index readings_challenge_user_read_at_idx on readings (challenge_id, user_id, read_at desc);

create index readings_book_idx on readings (book_id);

-- A freebie is the tag cap's one exemption. A member gets one per challenge.
create unique index readings_one_freebie_idx on readings (challenge_id, user_id) where is_freebie;

-- A tag on one specific reading. The aggregate book-to-tag relationship is
-- derived from these rows, never stored.
create table reading_tags (
  reading_id uuid not null,
  tag_id uuid not null,
  -- Carried so both foreign keys terminate on the same challenge: a tag from
  -- another challenge's vocabulary cannot be attached.
  challenge_id uuid not null,
  primary key (reading_id, tag_id),
  -- Restrict on both: a reading's tag rows are dropped by name before the
  -- reading, and deleting a tag must not silently drop reading history and
  -- change scores. `tag.delete` is superadmin-only
  foreign key (reading_id, challenge_id) references readings (id, challenge_id) on delete restrict,
  foreign key (tag_id, challenge_id) references tags (id, challenge_id) on delete restrict
);

create index reading_tags_tag_idx on reading_tags (tag_id);
