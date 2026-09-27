create table tags (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges (id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 100),
  created_at timestamptz not null default now(),
  -- Redundant with the primary key, but `reading_tags` needs it as the target
  -- of a composite foreign key.
  unique (id, challenge_id)
);

-- Case-insensitive: two tags differing only in case are the same vocabulary
-- entry to a player, and scoring would count them as two.
create unique index tags_challenge_label_idx on tags (challenge_id, lower(label));
