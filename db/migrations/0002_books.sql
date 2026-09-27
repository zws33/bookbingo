-- Global and challenge-agnostic: a book knows nothing about how it is used.
create table books (
  -- Derived by `deriveBookId`: the first 128 bits of sha256 as 32 hex chars.
  -- The constraint rejects a backfill that carries a Firestore auto-id across.
  id text primary key check (id ~ '^[0-9a-f]{32}$'),
  title text not null check (length(btrim(title)) > 0),
  author text not null check (length(btrim(author)) > 0),
  -- The nested `metadata` object is flattened
  page_count integer check (page_count >= 0),
  published_date text,
  categories text[] not null default '{}',
  language text,
  isbn text,
  thumbnail_url text,
  -- Null for a book sourced from Open Library rather than entered by hand.
  created_by text references users (id) on delete restrict,
  created_at timestamptz not null default now()
);
