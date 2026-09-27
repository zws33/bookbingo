-- TBR stays user-scoped: the challenge is chosen at promote time, so an entry
-- has no challenge to belong to.
create table tbr_entries (
  -- Promotion inserts the reading under this id, which makes a retry after a
  -- lost response resolve to the reading instead of a missing entry.
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users (id) on delete restrict,
  book_id text not null references books (id) on delete restrict,
  -- Labels, not tag ids, and no foreign key: tags are challenge-scoped and the
  -- entry has no challenge yet. Promotion resolves them against the chosen
  -- challenge's vocabulary and drops what does not match.
  planned_tags text[] not null default '{}',
  notes text check (length(notes) <= 2000),
  added_at timestamptz not null default now(),
  updated_at timestamptz
);

create index tbr_entries_user_added_at_idx on tbr_entries (user_id, added_at desc);
