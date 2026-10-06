create table tbr_entries (
  -- Promotion reuses this id as the reading's, so a retry after a lost response
  -- resolves to the reading instead of a missing entry.
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null,
  user_id text not null,
  book_id text not null references books (id) on delete restrict,
  notes text check (length(notes) <= 2000),
  added_at timestamptz not null default now(),
  updated_at timestamptz,
  -- Restrict for the same reason as `readings`: it blocks a challenge delete
  -- while any entry remains.
  foreign key (challenge_id, user_id) references memberships (challenge_id, user_id) on delete restrict,
  -- Redundant with the primary key, but `tbr_entry_tags` needs it as the target
  -- of a composite foreign key.
  unique (id, challenge_id)
);

create index tbr_entries_challenge_user_added_at_idx on tbr_entries (challenge_id, user_id, added_at desc);

create index tbr_entries_book_idx on tbr_entries (book_id);

create table tbr_entry_tags (
  tbr_entry_id uuid not null,
  tag_id uuid not null,
  -- Carried so both foreign keys terminate on the same challenge: a tag from
  -- another challenge's vocabulary cannot be attached.
  challenge_id uuid not null,
  primary key (tbr_entry_id, tag_id),
  foreign key (tbr_entry_id, challenge_id) references tbr_entries (id, challenge_id) on delete cascade,
  foreign key (tag_id, challenge_id) references tags (id, challenge_id) on delete restrict
);

create index tbr_entry_tags_tag_idx on tbr_entry_tags (tag_id);
