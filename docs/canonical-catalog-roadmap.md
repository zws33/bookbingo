# Roadmap — a locally owned canonical book catalog and Postgres search

Status: planning. Nothing here is implemented. Written 2026-11-12.

A prior investigation (measured 2026-11-11, write-up since removed from the repo)
proposed replacing Open Library with Wikidata as the search provider and keying
`books.id` on QIDs. That direction and this one compete for one decision — which key
space anchors `books.id` — and cannot both be executed as written. See **Blocking
questions**.

## 1. Repository findings

Verified by reading the files named. Assumptions and proposals are marked.

### Schema and migrations

- Seven migrations, `db/migrations/0001_users.sql` … `0007_tbr.sql`. No eighth.
- `books` is `db/migrations/0002_books.sql`. The schema quoted in the request is accurate
  and complete for that table.
- **`book_external_refs` already exists** in the same migration — the source-mapping table
  the request asks whether to add. It carries `(book_id, source, external_id)` as the
  primary key, `unique (source, external_id)`, and `details jsonb`. It has no refresh or
  provenance columns.
- No `tsvector`, no `pg_trgm`, no `create extension`, no `ilike` anywhere in the repo
  (grep across `*.sql`, `*.ts`, `*.md`). Search over Postgres does not exist in any form.
- `scripts/migrate.ts` applies `db/migrations/*.sql` in filename order, once each, tracked
  in `schema_migrations`.
- `scripts/lib/migrations.ts:59` rejects an applied migration whose file checksum changed;
  `:73` rejects a pending migration that sorts below the highest applied version.
  **Migrations are append-only and totally ordered.** Next file is `0008_`.
- **`scripts/migrate.ts:119-126` wraps every migration in `begin`/`commit`.**
  `create index concurrently` cannot run inside a transaction block (SQLSTATE 25001), so
  a concurrent index build is impossible through the current runner. There is no escape
  hatch. This constrains §6.
- `scripts/lib/db.ts:16-42` — scripts default to `TEST_DATABASE_URL` and reach a remote
  database only via an explicit `--database-url`. `DATABASE_URL` is never a migration target.

### Database access

- `functions/src/db/pool.ts` owns the pool. `MAX_CONNECTIONS_PER_INSTANCE = 2`.
- `functions/src/index.ts:27` — `setGlobalOptions({ maxInstances: 10 })`. Ceiling is
  therefore **20 Postgres connections**. A catalog-search endpoint shares that budget with
  every other callable.
- `functions/src/db/transaction.ts` — `inTransaction` joins a caller's transaction.
- Repositories are `xRepository(db)` factories; `functions/src/index.ts:43-67` (`buildApi`)
  is the only module naming a concrete repository.

### `deriveBookId`

`functions/src/books/bookIdentity.ts:20-30`. Two branches:

| Branch                   | Input hashed                           | Stable when title/author change?        |
| ------------------------ | -------------------------------------- | --------------------------------------- |
| `openLibraryKey` present | `openLibrary:/works/OL166894W`         | **Yes** — title and author are ignored  |
| otherwise                | `manual:<norm(title)>\|<norm(author)>` | **No** — any edit yields a different id |

- `normalizeForKey` (`:41-47`): lowercase → NFKD → strip combining marks → strip everything
  that is not a letter or digit. Deliberately does not strip articles or fold initials.
- `hashKey` (`:54`): first 128 bits of sha256, 32 hex chars, matching `books_id_check`.
  Comment marks it frozen.
- **Consequence for ETL: the provider branch is already deterministic and rerun-safe.**
  An Open Library work key maps to exactly one id forever, so re-importing the same work
  cannot create a second row. This is the single most important existing property.
- **Consequence for merges: the manual branch is not stable.** A manual book's title typo
  fix is a new id, and nothing rewrites `readings.book_id`.

### Book creation and selection flows

- `functions/src/books/handler.ts` — `bookHandlers(booksRepo, provider = new OpenLibraryProvider())`.
  - `fetchDetails` (`:32`): provider lookup → derive id → `createIfAbsent` with one
    `openLibrary` external ref → return the whole `Book`.
  - `createManual` (`:103`): rejects input whose normalized key is empty, derives the
    manual id, `createIfAbsent` with `createdBy: uid` and no refs.
- `functions/src/books/store.ts:115-145` — `createIfAbsent` inserts
  `on conflict (id) do nothing` and each ref `on conflict (book_id, source, external_id) do nothing`.
  **There is no update path.** Nothing in the repository can refresh a title, an author or
  a cover. A metadata refresh needs a new method.
- `store.ts:68-71` maps a `book_external_refs_source_external_id_key` violation to `corrupt`.
  That violation fires exactly when two different ids claim one external id — i.e. when the
  derivation changed between writes.
- `functions/src/books/join.ts` — `attachBooks` batches the book read for readings and TBR.
- `app/web/src/components/BookForm.tsx` — manual entry, `identityLocked` hides title/author
  when the book came from search; `collectCover` only when identity is editable.
- `app/web/src/lib/createManualBook.ts` → `createManualBookV2`.

### External book API integration

- `functions/src/books/providers/open-library.ts` is the only provider.
  `BookProvider` (`types.ts:42`) is `search(query)` + `getDetails(externalId)`.
- `searchFields` is `key,title,author_name,first_publish_year,cover_i`, `limit=10` (`:232`).
- In-process search cache: 10 min TTL, 30 s for empty results, 200 entries, insertion-order
  eviction, settlement tracking (`:85-138`). Per function instance, so up to 10 copies.
- One instrumented exit point, `fetchJson` (`:146`), emitting `ol.fetch` with status and duration.
- `User-Agent` is set (`:65-67`) — this satisfies Open Library's identified-requests policy.
- Author and page count degrade to `''`/`null` on failure and log `ol.enrichment_degraded`.

### Search endpoint, frontend query state, selection

- `functions/src/index.ts:87-90` — `searchBooks` is declared `{ invoker: 'public' }` **without**
  `secrets: [databaseUrl]`, unlike every other callable which uses the `dbBacked` options object
  (`:32-35`). The comment at `:86` says so explicitly: it touches no store.
  **A catalog-backed search must move this export to `dbBacked` or it will have no database URL.**
- `functions/src/books/searchHandler.ts:9` constructs `new OpenLibraryProvider()` at module
  scope, outside the composition root. `handler.ts:22` defaults the same dependency.
  Both violate the `index.ts`-is-the-only-place rule in `CLAUDE.md`.
- `functions/src/books/schema.ts:6-18` — `BookSearchQuerySchema` normalizes NFKC, collapses
  whitespace, trims, requires 1–200 chars. Message text promises "a title, author, or ISBN."
- `app/web/src/components/BookSearch.tsx`:
  - `:22` minimum query length 2, `:38` 300 ms debounce.
  - `:40` cleanup clears **only the timer**. An in-flight `searchBooks` call is not aborted
    and carries no generation guard. **Two overlapping requests resolve in completion order,
    so a slow early query can overwrite a fast later one's results, and `isSearching` is
    cleared by whichever finishes last.** This is a live stale-response bug.
  - `:48` selection calls `resolveBook(result.externalId)` → `fetchBookDetailsV2` → a second
    upstream round trip before the book exists locally.
  - `@tanstack/react-query` is already a dependency and `app/web/src/lib/queryClient.ts`
    centralizes query keys, but `BookSearch` uses raw `useEffect` + `setTimeout` instead.
- `app/web/src/types/schemas.ts:8-17` — `BookSearchResultSchema` is
  `{ externalId, title, author, thumbnailUrl, publishedDate }`. `BookResponseSchema` (`:39`)
  is `{ id, title, author, thumbnailUrl }`.
- Mounted from `app/web/src/pages/MyBooksPage.tsx:149` and `pages/ReadingListPage.tsx:243`.

### Books ↔ user-owned data

- `readings.book_id` and `tbr_entries.book_id` are both
  `references books (id) on delete restrict` (`0006_readings.sql`, `0007_tbr.sql`).
- Indexes `readings_book_idx` and `tbr_entries_book_idx` exist, so a reverse lookup by book
  is already cheap.
- `functions/src/library/handler.ts:85-119` aggregates readers and tags **by `reading.bookId`**.
  Two rows for one work split the library view and the "who else read this" list.
- A merge of two book rows therefore means: rewrite `readings.book_id`, rewrite
  `tbr_entries.book_id`, then delete the loser. `restrict` makes that ordering mandatory.
  Per `CLAUDE.md`, that is an explicit ordered script and never a repository method.

### Import scripts, jobs, deployment, tests

- `scripts/` holds one entry point, `migrate.ts`, with `scripts/lib/{db,migrations}.ts`.
  Its logging shape (`log('applied', …)`, `elapsed()`, `describeError()`) is the house style
  for a long-running script.
- **No scheduled function, no Pub/Sub, no Cloud Storage, no `onRequest`** anywhere in
  `functions/src` (grep). An ETL job has nowhere to run inside Firebase today. The existing
  precedent for a batch database job is a `scripts/` entry point run by hand or by CI.
- Tests: `functions/src/**/!(*.db).test.ts` under `pnpm test`; `*.db.test.ts` only under
  `pnpm run test:db` with `--test-concurrency=1`. `verify` runs no tests.
- CI (`.github/workflows/ci.yml`) has a `test_db` job with a Postgres 18 service container
  that runs `pnpm run db:migrate` then `test:db:ci`.
- `functions/src/testing/db.ts` refuses any database whose name does not end in `_test`
  and truncates every table from `pg_tables` between tests — **so a large seeded corpus
  cannot survive across tests in a `*.db.test.ts` file; it must be re-seeded per file.**
- `functions/src/testing/factories.ts:26` — `seedBook` inserts raw, with a random 16-byte id.
- Local Postgres is `postgres:18-alpine` on port 5433 (`docker-compose.yaml`).

### Provider / extension constraints

- Neon hosts staging and prod (`README.md:45`), Docker hosts local and tests.
- Neon's extension table (last updated 2026-11-04) lists `pg_trgm` 1.6 on PG14–PG18,
  `btree_gin` 1.3, `btree_gist` 1.6–1.8, and `unaccent` 1.1 — installed with plain
  `CREATE EXTENSION`. No special plan or support ticket for any of these.
  _(`unaccent`'s row came from a summarized tail of the page, not verbatim text — confirm
  before depending on it.)_
- Neon's Postgres major version for this project is **not established from the repo**. The
  local container is 18; nothing records what the Neon branch runs.
- Nothing in the repo records the row count of `books` in staging or prod.

## 2. Recommended implementation order

**Vertical slice**, with the identity decisions pulled to the front as a paper milestone.

Reasoning specific to this repository:

- _Search-first is wrong here_ because the production corpus is a few hundred hand-resolved
  books at most. Every query plan on that table is a sequential scan; an index you add is
  never chosen and teaches you nothing. Worse, you would write normalization and ranking
  rules against data whose shape you have not seen — the earlier Wikidata investigation
  measured Open Library returning `Ὀδύσσεια` as a title and two distinct work keys for one
  work.
- _Data-first is wrong here_ because `on delete restrict` on `readings.book_id` and
  `tbr_entries.book_id` means an imported row that acquires a reading can no longer be
  deleted without an ordered script. A bulk import under an untested identity scheme is the
  expensive-to-redo move the request warns against.
- _Vertical slice is right_ because the existing `deriveBookId` provider branch already makes
  Open Library ingestion idempotent, and `createIfAbsent` already converges the ETL path and
  the live `fetchDetails` path onto the same row. A pilot import is close to free and close
  to reversible.

**The pilot is reversible exactly until catalog search ships.** Imported rows start
unreferenced; `delete from books where id in (…) and not exists (readings|tbr_entries)` undoes
them. Once the UI selects from the catalog, readings attach and the window closes. Sequence
the import so measurement happens inside that window.

### What must precede ingestion

Durable identity / correctness — changing these after an import means rewriting rows that
user data points at:

1. Work vs. edition as the unit of `books`.
2. The key space hashed into `books.id` (`openLibrary:` vs. `wikidata:` vs. a surrogate).
3. Whether `books` keeps one `author text not null` or normalizes authors.
4. The provenance columns on `book_external_refs` — additive, but cheap now and a full table
   rewrite after a bulk load.

Derived and rebuildable — safe to defer, drop, and rebuild with one migration:

- `search_vector` / `search_text` columns, the text-search configuration, GIN index,
  `pg_trgm`, ranking weights, popularity scores, alternate-title rows.

Needed to validate the UX, not the data:

- A `searchCatalog` callable, a result shape the client can render, and the stale-response
  fix in `BookSearch.tsx`.

Justified by measurement, not implemented speculatively:

- Prefix / typeahead matching, trigram fallback, `english` vs `simple` configuration,
  any result cap above 20, any popularity ranking term, any separate search service.

## 3. Minimum data-model decisions

### What a canonical book represents

**Recommendation: a work.** Grounds:

- `books` has no edition-bearing column. Page count, ISBN, language and categories were
  deliberately removed (`store.ts:7-11`, `ea69c19 refactor: replace book metadata columns with
external refs`). Reintroducing editions reintroduces those fields.
- `library/handler.ts:85` aggregates by `bookId`. Edition-level identity splits "who else read
  this" across printings and silently changes the library view.
- Scoring counts books, not editions. Two readers of two printings must land on one row.
- `book_external_refs` can still hold an edition key alongside the work key — its comment
  already anticipates exactly that ("such as an Open Library work and an edition").

Cost: no "which edition did you read" ever, and no ISBN lookup from catalog data. The current
`BookSearchQuerySchema` message promises ISBN search; a work-only catalog cannot honor it from
local data. That promise is already only kept by the external provider.

### Is the current derivation stable under metadata change?

Provider branch yes, manual branch no (table in §1). Two consequences:

- An Open Library ETL needs **no change to `deriveBookId`** to be rerun-safe.
- A manual book cannot be corrected without a new id. Today nothing offers that correction,
  so the instability is latent rather than active. **Proposal: never re-derive a manual id.**
  If manual-book correction is ever wanted, it edits the row in place and leaves the id —
  which means the id stops being derivable from its content, which is fine, because the id's
  job is to be stable, not to be re-computable.

### Source identifiers → canonical ids

Keep the existing mapping: `books.id = sha256("openLibrary:" + workKey)[0:32]`, with the work
key recorded in `book_external_refs (source='openLibrary', external_id=workKey)`.

- Pro: zero migration; the ETL and the live `fetchDetails` path converge automatically;
  reruns are no-ops by construction.
- Con: the id is derived from one source's key. Dropping Open Library later (as the Wikidata
  plan proposes) orphans the key space — every pre-cutover book keeps an id derived from a
  source no longer consulted.

The alternative — a **random surrogate id** assigned on first ingest, with every source key in
`book_external_refs` — satisfies `books_id_check` today (any 32 hex chars) and is the only
option that survives changing or adding sources. It costs a lookup: `createIfAbsent` becomes
"find by external ref, else mint". That is a real behavior change to `store.ts` and the
`findByExternalRef` method already exists to support it.

**Recommendation: keep the derived id for the pilot, and decide surrogate-vs-derived before the
bulk import, not before the pilot.** A pilot of ~1,000 unreferenced rows is deletable; the
decision does not have to block it. State the decision explicitly in the milestone exit
criterion so it cannot be reached by drift.

### How reruns identify existing records

By derived id, via `on conflict (id) do nothing` — already implemented. Rerun evidence is
`created: false` on every row and an unchanged `count(*)`.

### Manual and imported books coexisting

They are different key spaces by construction (`manual:` vs `openLibrary:` prefixes) and cannot
collide. **Proposal: they also never merge automatically.** An import that duplicates a manual
book produces two rows, both visible in search.

Cost, stated plainly: a user who hand-entered "Dune / Frank Herbert" before the import has a
reading on the manual row; a user who picks "Dune" from the catalog after the import gets the
imported row; `library` shows them as two books. This is the same defect as risk 2 in the
Wikidata plan.

Options, in increasing cost:

1. Accept it. Cheapest; the defect is visible to users in a small book club.
2. One-shot reconciliation script, run once after the import: for each manual book, look for an
   imported book whose `normalizeForKey(title)|normalizeForKey(author)` matches exactly;
   rewrite `readings.book_id` and `tbr_entries.book_id`; delete the manual row. Exact-key match
   only, never similarity. Reviewed as a dry-run report before it writes.
3. Merge as an ongoing product feature. Out of scope.

**Recommendation: (2), once, as a reviewed dry-run, after the bulk import — not before.**
A reconciliation run against a pilot corpus would match almost nothing.

### Relationships that must stay stable under a merge or correction

`readings.book_id`, `tbr_entries.book_id`. Both `restrict`. `reading_tags` and `tbr_entry_tags`
hang off the reading/entry id, not the book, so they are untouched by a book merge.

### Fields needing provenance or refresh metadata

On `book_external_refs`, additive:

| Column                                             | Why                                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `source_revision integer`                          | Open Library dumps carry a per-record `revision` (column 3). The cheapest "has this changed" check. |
| `source_modified_at timestamptz`                   | Dump column 4. Orders refreshes without re-reading JSON.                                            |
| `fetched_at timestamptz not null default now()`    | Distinguishes "never refreshed" from "refreshed and unchanged".                                     |
| `import_run_id text` or a `book_imports` run table | Attributes a row to a run, so a bad run is findable.                                                |

`books` itself needs no provenance column: `created_by is null` already means "not hand-entered",
and the source is in the refs table.

### Multiple authors, alternate titles, popularity

| Item             | Verdict                                                                                                                                                 | Reasoning                                                                                                                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multiple authors | **Defer.** Keep `books.author` as the denormalized display string; store the full list in `book_external_refs.details`.                                 | The client reads `book.author` directly (`schemas.ts:42`) and the server-owns-joins rule keeps responses denormalized. A separate `authors` table is a durable change, but it is not required for search — "Gaiman Pratchett" as one text field matches both. Normalizing later is additive, provided `books.author` is retained. |
| Alternate titles | **Defer.**                                                                                                                                              | Rebuildable from source. When wanted, a `book_search_aliases (book_id, alias)` table folded into the search vector — never into id derivation.                                                                                                                                                                                    |
| Popularity       | **Defer, but note it is nearly free.** `ol_dump_ratings_latest.txt.gz` is ~5 MB and `ol_dump_reading-log_latest.txt.gz` ~65 MB, both keyed by work key. | A ranking signal, therefore rebuildable. Do not add it before a measurement shows ranking is the failure.                                                                                                                                                                                                                         |

**Search similarity is never an identity or dedup input.** Trigram similarity and `ts_rank`
inform ordering only. Dedup, where it happens at all, is exact-key equality on
`normalizeForKey` output, in a reviewed one-shot script. This is the rule that keeps a ranking
tweak from silently merging two books.

## 4. PostgreSQL-first search

No concrete requirement in this repository justifies a separate search service. The corpus
ceiling is Open Library's work count; the query rate is a handful of book-club members typing
into one box behind a 300 ms debounce. Revisit only on the triggers in §6.

### Responsibility split

Keep three concerns in three places; they change at different rates and cost different amounts
to change.

1. **Query construction** — user text → a tsquery expression. A pure module,
   `functions/src/books/searchQuery.ts` (proposed), unit-tested with no database, like
   `challenges/joinCode.ts` is today. Changing it changes recall.
2. **Candidate retrieval** — `search_vector @@ <query>` with a GIN index and a hard `limit`.
   The index's job. Changing it costs an index rebuild.
3. **Ranking** — ordering the retrieved candidates. Changing it is free: no reindex, no
   migration. Iterate here first, always.

A catalog search result is a `Book` that already exists, so there is no `getDetails` round trip
and no `externalId` to resolve. That is the actual UX win, and it means catalog search does not
fit the `BookProvider` interface. **Proposal: a new callable `searchCatalog` returning `Book[]`,
alongside the existing `searchBooks`,** rather than changing `BookSearchResultSchema`. Additive,
reversible, and A/B-able from the client.

### Derived column

```sql
-- proposed, not applied
alter table books add column search_text text
  generated always as (btrim(title) || ' ' || btrim(author)) stored;
alter table books add column search_vector tsvector
  generated always as (to_tsvector('simple', btrim(title) || ' ' || btrim(author))) stored;
```

A generated column, not a trigger: no write path to forget, and `createIfAbsent` needs no change.

Two traps:

- **The one-argument `to_tsvector(text)` is not `immutable`** — it reads
  `default_text_search_config` — and a generated column rejects it. The two-argument form with
  a literal configuration is immutable and is accepted.
- **`unaccent()` is `stable`, not `immutable`,** so it cannot appear in a generated column
  either. The usual workaround is an `immutable` wrapper function, which lies to the planner and
  breaks if the dictionary changes under an existing index.
  **Recommendation: do accent folding in TypeScript instead.** `normalizeForKey`
  (`bookIdentity.ts:41`) already does NFKD + combining-mark stripping. Apply the same folding to
  a stored `search_text` column at write time and generate the vector from that. One testable
  normalization, no `unaccent` dependency, and the fold is identical on the query side because
  it is the same function. Cost: a write-time column instead of a pure generated one, so the
  repository gains a responsibility it does not have today.

### Text search configuration

| Config    | Keeps                                           | Loses                                                                                 |
| --------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| `simple`  | Every token, including `it`, `the`, `of`, `and` | Stemming: "hobbits" will not match "Hobbit"                                           |
| `english` | Stemming                                        | Stopwords. `It`, `The Road`, `Of Mice and Men` lose tokens that are most of the title |

**Recommendation: `simple` for the first milestone.** For a title/author matcher, losing "It"
entirely is a worse failure than missing a plural. Revisit with the evaluation set, not by
argument. Switching is one migration and one reindex — it is in the rebuildable category.

### Indexes

```sql
-- proposed, not applied
create index books_search_vector_idx on books using gin (search_vector);
```

`gin` over `gist`: GIN is slower to build and bigger, faster to query, and this table is read far
more than written. Build it **after** the bulk load, not before — a GIN index built on a loaded
table is smaller and faster to produce than one maintained through millions of inserts.

### Milestone 1: complete-token search

```sql
select id, title, author, thumbnail_url
  from books
 where search_vector @@ websearch_to_tsquery('simple', $1)
 order by ts_rank_cd(search_vector, websearch_to_tsquery('simple', $1)) desc,
          title asc, id asc
 limit 20;
```

`websearch_to_tsquery` is injection-safe by construction — never interpolate user text into
`to_tsquery`. The `id` tiebreak makes the order total, so an identical query never reshuffles.

**This milestone is not shippable to users on its own.** The client sends at 2 characters
(`BookSearch.tsx:22`); complete-token search returns nothing for "du" and nothing for "dun".
Compared to the current Open Library behavior that is a regression, so prefix matching is a
milestone-2 requirement, not an optional extra. Ship complete-token behind the fallback to the
external provider, or do not ship it.

### Milestone 2: final-token prefix

Tokenize in TypeScript, bind each token, and build
`token1 & token2 & … & lastToken:*` as a `to_tsquery` argument — only the tokens are
interpolated, after validation against `[\p{L}\p{N}]+`.

GIN supports prefix search, but a short prefix matches a large share of the dictionary and
degrades toward an index scan. The existing 2-character client minimum bounds this; whether 2 is
enough is a measurement, not an assumption.

### Optional: `pg_trgm` fallback

Available on Neon at 1.6 (verified). Use it as a **second query when full-text returns zero
rows**, never OR'd into the first — an OR'd trigram predicate prevents the planner from using
the FTS GIN index and scans twice. A miss-only fallback is bounded: it costs nothing on the
common path.

### Bounds and validation

- Hard `limit 20`, no pagination. The UI list is `max-h-72` and scrollable
  (`BookSearch.tsx:80`); nobody pages a typeahead.
- Reuse `BookSearchQuerySchema` — NFKC, whitespace collapse, 1–200 chars, already written.
- Reject a query whose tokens all normalize away before it reaches the database.

### Frontend

- **Fix the stale-response bug.** Move `BookSearch` to `useQuery` with the debounced query
  string in the key. `@tanstack/react-query` is already a dependency, `queryClient.ts` already
  centralizes keys, and request-ordering plus `isPending` come for free. An `AbortController`
  and a generation counter would also work; the hook is consistent with the rest of the app.
- Keep the 300 ms debounce and the 2-character floor.
- Catalog-first, external-fallback: query `searchCatalog`; if it returns zero rows, query
  `searchBooks`. Render both result kinds in one list; a catalog hit selects instantly, an
  external hit still goes through `resolveBook`.

## 5. Dependency-ordered roadmap

### M0 — `refactor: inject the book provider from the composition root`

| Field          |                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objective      | `index.ts` is the only module naming a concrete provider, so a second search source is a composition change rather than a multi-file edit.                                                          |
| Scope          | `searchHandler.ts` becomes `searchBookHandlers(provider)` returning a closure; drop the default parameter at `handler.ts:22`; construct the provider in `buildApi()`. No schema, no infrastructure. |
| Dependencies   | None. Independent of every identity decision.                                                                                                                                                       |
| Validation     | Existing `searchHandler.test.ts` and `handler.test.ts` pass unchanged. `pnpm run verify`.                                                                                                           |
| Exit criterion | No `new OpenLibraryProvider()` outside `index.ts`.                                                                                                                                                  |
| Deferred       | Any new provider. Any schema change.                                                                                                                                                                |

### M1 — `feat: record catalog provenance on book external refs`

| Field          |                                                                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objective      | The durable identity questions are decided in writing, and the source-mapping table can answer "where did this come from and when was it last refreshed".                                 |
| Scope          | `db/migrations/0008_book_ref_provenance.sql` adding `source_revision`, `source_modified_at`, `fetched_at` to `book_external_refs`. A short decision record in `docs/`. No ETL, no search. |
| Dependencies   | Answers to the four blocking questions in §7.                                                                                                                                             |
| Validation     | `pnpm run db:migrate --dry-run` lists it; `test:db` green; a `*.db.test.ts` asserting the new columns default correctly and existing `createIfAbsent` behavior is unchanged.              |
| Exit criterion | Work-vs-edition, key space, author normalization and the manual/imported coexistence policy are each written down with their cost. The migration is applied to the local database.        |
| Deferred       | A refresh method on `BookRepository`. Author normalization. Alias tables.                                                                                                                 |

### M2 — `feat: add the Open Library pilot importer`

| Field          |                                                                                                                                                                                                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objective      | ~500–1,000 real works are in the local catalog, imported by a script that is provably a no-op on rerun.                                                                                                                                                                                                                                       |
| Scope          | `scripts/import-books.ts` + `scripts/lib/openLibraryDump.ts` (stream, gunzip, split 5 tab-separated columns, parse column 5 as JSON, Zod-validate). A checked-in seed list of work keys. Reuses `resolveDatabaseTarget` so it cannot reach Neon without `--database-url`. Rejects go to a JSONL file; progress uses `migrate.ts`'s log shape. |
| Dependencies   | M1.                                                                                                                                                                                                                                                                                                                                           |
| Validation     | Second run reports `created: false` for every row and an unchanged `count(*)`. Rejected-record count is reported and reviewed. A spot check that an imported work's id equals `deriveBookId({ openLibraryKey })`.                                                                                                                             |
| Exit criterion | Two consecutive runs against the local database produce byte-identical `books` and `book_external_refs` contents.                                                                                                                                                                                                                             |
| Deferred       | Any import to staging or prod. Refresh. Bulk. Scheduling.                                                                                                                                                                                                                                                                                     |

### M3 — `feat: add catalog search over postgres`

| Field          |                                                                                                                                                                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objective      | A `searchCatalog` callable returns ranked `Book[]` from Postgres for complete-token queries.                                                                                                                                                                                                         |
| Scope          | `db/migrations/0009_books_search.sql` (`search_text`, `search_vector`, GIN index); `BookRepository.search(query, limit)`; `searchQuery.ts` as a pure module; `searchCatalogHandler`; a new `searchCatalog` export using `dbBacked` — note `searchBooks` at `index.ts:87` currently has no `secrets`. |
| Dependencies   | M2 (a corpus to search).                                                                                                                                                                                                                                                                             |
| Validation     | `search.db.test.ts` over the pilot corpus covering every query class in §7-validation. `explain (analyze, buffers)` captured by hand showing a bitmap index scan on `books_search_vector_idx`.                                                                                                       |
| Exit criterion | A callable invocation against the local database returns correct, stably ordered results for the evaluation set. No frontend change yet.                                                                                                                                                             |
| Deferred       | Prefix matching. Trigram. Popularity ranking. The `english` configuration.                                                                                                                                                                                                                           |

### M4 — `feat: search the local catalog before the external provider`

| Field          |                                                                                                                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Objective      | Selecting a catalog hit creates a reading with no external round trip, and overlapping searches can no longer render stale results.                                                                                                                                                        |
| Scope          | `BookSearch.tsx` moved to `useQuery` with a debounced key; a catalog query first, `searchBooks` on zero rows; `lib/bookSearch.ts` gains `searchCatalog`; `queryKeys` gains a `catalogSearch` key; a result shape that distinguishes a resolved `Book` from an external `BookSearchResult`. |
| Dependencies   | M3.                                                                                                                                                                                                                                                                                        |
| Validation     | A Vitest case that resolves a slow first request after a fast second and asserts the second query's results render. Existing `BookSearch` tests extended for the fallback path.                                                                                                            |
| Exit criterion | On staging, a query matching a pilot book returns from the catalog and selection issues no `fetchBookDetailsV2`.                                                                                                                                                                           |
| Deferred       | Removing `searchBooks`. Removing `fetchBookDetailsV2`.                                                                                                                                                                                                                                     |

### M5 — Seed staging and prod with the pilot corpus, then measure

| Field          |                                                                                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Objective      | Real numbers replace estimates, taken while the import is still reversible.                                                                                                                                                                                              |
| Scope          | Run M2's importer against staging, then prod, with `--database-url`. No code. Record: query plans, `pg_relation_size` for the table and index, handler `durationMs` vs. SQL duration (a second timer inside the repository method), broad-query cost, import throughput. |
| Dependencies   | M4 shipped to staging.                                                                                                                                                                                                                                                   |
| Validation     | Every imported row is still unreferenced by `readings` and `tbr_entries` at import time, so the undo path exists. The evaluation set runs against the staging corpus.                                                                                                    |
| Exit criterion | A measurements table in `docs/` covering the five items in §7-measure. Decisions on prefix matching and trigram fallback are taken from it.                                                                                                                              |
| Deferred       | Bulk import. Reconciliation.                                                                                                                                                                                                                                             |

### M6 — `feat: match an incomplete final token` _(gated by M5)_

| Field          |                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Objective      | A two- or three-character prefix returns the expected book, which is what the 300 ms/2-character client already implies.           |
| Scope          | `searchQuery.ts` gains tokenization and `:*` on the final token. Optional `pg_trgm` zero-result fallback behind its own migration. |
| Dependencies   | M5's plan and latency numbers.                                                                                                     |
| Validation     | Evaluation set extended with incomplete-token and misspelling cases. Plan re-captured for a 2-character prefix specifically.       |
| Exit criterion | Prefix queries return the expected book in the top 5 at a latency M5's budget allows.                                              |
| Deferred       | Nothing — this is the last milestone before scale.                                                                                 |

### M7 — Bulk ingestion and refresh

| Field          |                                                                                                                                                                                                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objective      | The catalog is large enough that the external fallback is rare, and a monthly dump keeps it current without changing any id.                                                                                                                                                                                                                  |
| Scope          | Full `ol_dump_works_latest.txt.gz` (~2.9 GB) streamed through M2's reader with a filter; `COPY` into a staging table then an idempotent upsert; a `refresh` method on `BookRepository` (the first update path `books` has ever had); the index built after the load; the one-shot manual/imported reconciliation script if M1 chose option 2. |
| Dependencies   | M5 and M6. The surrogate-vs-derived id decision settled.                                                                                                                                                                                                                                                                                      |
| Validation     | Refresh preserves every `books.id` and every `readings.book_id`. Rerun idempotence at scale. Index build time and size measured before it runs against prod.                                                                                                                                                                                  |
| Exit criterion | A refresh run changes titles and covers and changes no id.                                                                                                                                                                                                                                                                                    |
| Deferred       | Scheduling it. There is no job infrastructure, and a hand-run monthly script is proportionate.                                                                                                                                                                                                                                                |

## 6. Index and import sequencing

The schema change and the index build are **not** the same milestone, and they want opposite
positions relative to the import.

| Step                                                   | Empty dev database | Existing staging/prod database                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Provenance columns (M1)                                | Any time           | `alter table add column` with a `default now()` is metadata-only on PG11+; brief `ACCESS EXCLUSIVE`, negligible at current row counts                                                                                                                                                                                                                                                                        |
| `search_text` / `search_vector` generated columns (M3) | Any time           | **Full table rewrite under `ACCESS EXCLUSIVE`.** Milliseconds on a few hundred rows; unacceptable on a loaded table. **Therefore: before the bulk import, even though the feature using it ships later.**                                                                                                                                                                                                    |
| GIN index (M3)                                         | Any time           | **`create index` holds `ACCESS EXCLUSIVE` for the build.** `create index concurrently` is impossible through `scripts/migrate.ts` (every migration runs inside `begin`/`commit`, `:119-126`). At current row counts the plain build is milliseconds — ship it as a normal migration now. **After** a bulk load, build it once the load is done: cheaper and smaller than maintaining it through the inserts. |
| Pilot ingestion (M2, M5)                               | Any time           | Safe: rows start unreferenced, so a delete-where-unreferenced undo exists until catalog search ships                                                                                                                                                                                                                                                                                                         |
| Bulk ingestion (M7)                                    | Any time           | Needs a plan for whether the GIN index exists during the load. Drop-and-rebuild is the standard answer and requires `migrate.ts` to tolerate a non-transactional step, or a separate script                                                                                                                                                                                                                  |
| Incremental refresh + live writes (M7)                 | —                  | Refresh is `update` on existing rows and never touches `books.id`; live `createIfAbsent` continues to work unchanged                                                                                                                                                                                                                                                                                         |

**If the bulk import ever makes a concurrent index build necessary**, `scripts/migrate.ts` needs
an opt-out — a per-file marker that skips the surrounding transaction. Do not build it before
M5's numbers show it is needed; at a few hundred rows a plain build is imperceptible.

Production commands are not prescribed here: the Neon Postgres major version, branch layout and
current `books` row count are not established from the repository (§7).

## 7. Validation before scaling

### Correctness (`*.db.test.ts`, under `pnpm run test:db`)

- A second import run creates no rows and reports `created: false` for every record.
- An import run after a metadata change updates `title`/`author`/`thumbnail_url` and leaves
  `books.id` identical.
- Every `readings.book_id` and `tbr_entries.book_id` still resolves after a refresh run.
- A manual book and an imported work with the same normalized title/author remain two distinct
  rows (asserts the policy, not that the policy is pleasant).
- Two different derived ids claiming one `(source, external_id)` raises `corrupt`, not a leaked
  constraint name.
- An imported row with a missing author is rejected by `books_author_check` and lands in the
  rejects file rather than aborting the run.

Note the harness truncates every table between tests (`testing/db.ts:120`), so the evaluation
corpus is seeded per file, not once per run.

### Search evaluation set

A checked-in fixture of `(query, expectedBookId, note)`, roughly 30 rows, asserted as
**"expected id appears in the top 5"** — not at an exact rank. Rank assertions fail on every
ranking tweak, which is precisely when you need the suite to still run. Cover:

- Title only; author only; title + author in one box.
- A word from the middle of a title ("Mice" → _Of Mice and Men_).
- An incomplete final token ("dun", "sander") — expected to fail until M6, asserted as failing.
- A misspelling ("Odysey") — only once trigram fallback exists.
- A one-character query (must be rejected before the database) and a two-character one.
- A very broad query ("the") — bounded result count and bounded latency.
- Empty input; whitespace-only; punctuation-only.
- An accented title matched by its unaccented spelling, and vice versa.
- A non-English title.
- Two distinct works sharing a title.
- Several works by one author.
- A multi-author work matched by its second author.

### Measurements (M5, recorded in `docs/`, not asserted in tests)

| What                          | How                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Query plan and index usage    | `explain (analyze, buffers)` per query class, especially the broad query and the 2-character prefix                           |
| Endpoint latency vs. SQL time | `book.search` already logs `durationMs` (`searchHandler.ts:23`); add a second timer inside the repository method and log both |
| Broad-query and ranking cost  | Latency and buffer counts for "the" against the full corpus, with and without `ts_rank_cd`                                    |
| Index and table size          | `pg_relation_size('books_search_vector_idx')`, `pg_total_relation_size('books')`                                              |
| Import throughput             | Rows/second and wall time for the pilot; extrapolate before committing to the full dump                                       |
| Relevance                     | Pass rate of the evaluation set, as a number that moves between milestones                                                    |

No row-count threshold is asserted here. Postgres stops being sufficient when a measured plan
or a measured latency says so, against this corpus and this query mix — not at a number read
from someone else's benchmark.

## 8. Deferred decisions and their triggers

| Deferred                                            | Revisit when                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Surrogate `books.id` instead of a derived one       | A second source becomes canonical, or Open Library is dropped. Must be settled before M7.                                |
| Normalized `authors` table                          | The evaluation set fails on second-author queries that `books.author` cannot represent, or an author page is wanted      |
| `book_search_aliases` for alternate titles          | A measured evaluation failure traceable to a missing alias, not before                                                   |
| Popularity ranking (OL ratings / reading-log dumps) | `ts_rank_cd` puts an obscure same-titled work above a famous one in the evaluation set                                   |
| `english` instead of `simple`                       | A measured recall failure on a stemming case outweighs the stopword losses                                               |
| `pg_trgm` fallback                                  | Misspelling cases in the evaluation set matter enough to pay a second query on misses                                    |
| Prefix matching (M6 itself)                         | M5's plan shows a 2-character prefix is affordable. If it is not, the floor rises rather than the feature being dropped  |
| Scheduled refresh in Firebase                       | A hand-run monthly script becomes a chore. No job infrastructure exists today                                            |
| A separate search service                           | A measured plan that no Postgres index can fix, or a query rate the 20-connection ceiling cannot serve — not a row count |
| Retiring `searchBooks` / `fetchBookDetailsV2`       | Catalog coverage makes the external fallback rare in logs. Both are wire-name changes                                    |

## 9. Blocking questions

Not answerable from the repository.

1. **Wikidata or Open Library as the canonical key space?** The earlier investigation proposed
   keying `books.id` on QIDs, on measured evidence that Open Library work keys are fragmented
   (two work keys for _The Odyssey_, three for _Dune_). This roadmap assumes Open
   Library work keys. **These cannot both proceed.** A third option — a surrogate id with both
   sources as external refs — is compatible with both plans and with the current schema, and is
   the only one that survives a later source change. Open Library's dumps make it the better ETL
   corpus; Wikidata's CirrusSearch makes it the better matcher. Those are separable.
2. **Work or edition?** §3 recommends work and states the cost. Needs confirmation because it is
   a one-way door through `readings.book_id`.
3. **Does the manual/imported duplicate get reconciled?** Option 1 (accept), 2 (one-shot exact-key
   script), or 3 (product feature). Affects whether M7 carries a reconciliation step.
4. **Current `books` row count in staging and prod, and Neon's Postgres major version.** Both
   determine whether the §6 "milliseconds" claim holds and whether `create index concurrently`
   ever becomes necessary. Neither is recorded anywhere in the repository.
5. **Does the ISBN promise in `BookSearchQuerySchema` survive?** A work-level local catalog cannot
   honor it; only the external fallback can. Either keep the fallback for ISBN-shaped input or
   change the message.
6. **Open Library's data licence is not stated.** `openlibrary.org/developers/licensing` (last
   edited June 2021) names no licence — it says only that the Internet Archive "does not assert
   any new copyright or other proprietary rights over any of the material in the Open Library
   database," and notes that "There may be existing rights issues on some contributions."
   For a private hobby project this is almost certainly fine; it is recorded here because a
   bulk local copy is a different posture than per-request API calls, and nothing in the repo
   records a decision about it.

## 10. First implementation PR

**M0 — `refactor: inject the book provider from the composition root`.**

- It is the one piece of work that is correct under every answer to §9. A Wikidata provider, a
  Postgres catalog provider, and a catalog-first-with-fallback composition all need it.
- It has no durable consequences: no schema, no data, no wire change.
- It fixes an existing deviation from `CLAUDE.md` — `searchHandler.ts:9` and `handler.ts:22` both
  name a concrete dependency outside the composition root.
- It is small enough to review in one sitting and its tests already exist.
- The earlier Wikidata investigation reached the same conclusion and specified it as its own
  step 1, so shipping it spends nothing that a change of direction would waste.

## Sources

- https://openlibrary.org/developers/dumps — dump filenames, sizes, 5-column tab-separated format
  (JSON in column 5), monthly cadence, `archive.org/details/ol_exports` archive
- https://openlibrary.org/developers/api — "do not use our APIs to bulk download metadata";
  1 req/s default, 3 req/s for `User-Agent`-identified requests; "For bulk access, please download
  our free monthly data dumps"
- https://openlibrary.org/developers/licensing — no licence named
- https://neon.com/docs/extensions/pg-extensions — `pg_trgm` 1.6, `btree_gin` 1.3, `btree_gist`
  1.6–1.8 on PG14–PG18, installed with plain `CREATE EXTENSION`
