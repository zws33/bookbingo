-- Global and challenge-agnostic: a book knows nothing about how it is used.
create table books (
  -- Derived by `deriveBookId`: the first 128 bits of sha256 as 32 hex chars.
  -- The constraint rejects a backfill that carries a Firestore auto-id across.
  id text primary key check (id ~ '^[0-9a-f]{32}$'),
  title text not null check (length(btrim(title)) > 0),
  author text not null check (length(btrim(author)) > 0),
  thumbnail_url text,
  -- Null for a book sourced from Open Library rather than entered by hand.
  created_by text references users (id) on delete restrict,
  created_at timestamptz not null default now()
);

-- A book's identity in an external catalog. One row per identity; a source may
-- hold more than one for a book, such as an Open Library work and an edition.
create table book_external_refs (
  book_id text not null references books (id) on delete cascade,
  source text not null,
  external_id text not null,
  -- Provider-specific fields carried back to that provider, such as an Open
  -- Library cover id. Unindexed and never filtered on.
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (book_id, source, external_id),
  unique (source, external_id)
);
