# Postgres Repositories Plan

Expands step 4 of `docs/challenge-implementation-plan.md` into a red-green loop with integration tests against the local Docker Postgres. Rules are numbered in `docs/challenge-model.md`.

Step 3 (the transaction helper) is folded in here — `create`, `rotateJoinCode` and `promote` each span tables and cannot be written without it.

## Status

All eight steps are implemented. They ship as one PR per step, because a single branch carrying all of them was 5,100 lines and unreviewable:

| PR  | Steps | Contents                                                                                                              |
| --- | ----- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | 1–2   | `db/transaction.ts`, `common/pgErrors.ts`, `testing/`, `books/errors.ts`, the scripts, the disposable-database marker |
| 2–7 | 3–8   | one domain each — `users`, `books`, `challenges`, `tags`, `readings`, `tbr`                                           |

PR 1 is a prerequisite for the rest. `readings` precedes `tbr`, whose suite drives `promote` through `readingRepository`; the other four are independent and can land in any order.

Nothing calls these repositories at any point in the series — every handler still uses the Firestore `store.ts`, so deployed behaviour is unchanged until parent plan step 5.

Where the implementation departed from the plan below:

1. **The Postgres stores are `postgresStore.ts`; the Firestore `store.ts` files are untouched.** The first attempt renamed Firestore to `firestoreStore.ts` and put Postgres at `store.ts`, which git recorded as a 215-line rewrite of `books/store.ts` and a 473-line rewrite of `challenges/store.ts` — Firestore and Postgres interleaved in one hunk — plus import edits in 11 dependents. Adding a second file instead leaves 6 pre-existing files touched, none by more than two lines. The six rename to `store.ts` when Firestore is retired, as a pure-rename change.
2. `lib/types.Book` is **unchanged**. `books/postgresStore.ts` declares its own `Book` entity without metadata, which is what CLAUDE.md already says a store owns. Shrinking the shared type would have changed the live Firestore-backed wire in the same commit as a repository nothing calls. The wire shrink belongs with `present.ts` and the client.
3. `inTransaction(db, work)` joins a caller's transaction and opens one only off a pool, so a multi-statement method is atomic standalone and composed. The pool is detected by the absence of `release`, not the presence of `connect` — a `PoolClient` has both. The planned `withTransaction(work)` was dropped: every repository factory already defaults its `Db` to `getPool()`, so nothing ever called it.
4. Join codes are generated **inside** the repository behind a bounded retry (5 attempts, one savepoint each), because a collision is only observable as a unique violation. The generator is a second factory argument so the retry is covered. `rotateJoinCode(challengeId, createdBy)` returns the new code.
5. `countActiveOwners` became `listActiveOwners`: `count(*)` cannot carry `for update`, and rule 21 needs the row lock.
6. `test:db` passes `--test-concurrency=1`. node:test runs files in parallel processes, and against one database the truncates deadlock and seeds vanish mid-test.
7. A blocked delete is SQLSTATE **23001** (`restrict_violation`), not the 23503 a foreign key normally reports, so `toDomainError` maps both. A unit test's fake passes either way; only the database suite tells them apart, and before it did, every tag-delete-with-history would have surfaced as a 500.
8. `tags.update`/`remove` and every `readings`/`tbr` write take `challengeId` and scope the `where` clause on it, so a cross-challenge id resolves to no row rather than being written.
9. `MissingBookError` moved to `books/errors.ts` and its four importers moved with it. The planned re-export from `books/store.ts` was dropped — a shim with nothing left to shim is a second place to look for one class.
10. Added beyond the planned surface: `challenges.listMembers`, `challenges.getJoinCode`, `tbr.get`.
11. **No cascade anywhere in a challenge's subtree.** `memberships`, `tags` and `join_codes` referenced `challenges` with `on delete cascade`, and `reading_tags` / `tbr_entry_tags` referenced their own parent row the same way. All five are now `restrict`, so no row is ever deleted implicitly: `challenges.remove` clears the scaffolding by name, and a reading or TBR entry blocks it. The cost is that `readings.remove`, `tbr.remove` and `tbr.promote` must clear their tag rows before the parent row.
12. The test-database guard was hardened after review: it moved from an exported `resetDatabase()` that never called it to a precondition of `connectTestDatabase()`, the harness took its own pool from `TEST_DATABASE_URL`, and a database-level marker replaced the name heuristic.

## Settled

1. Books lose `metadata`. The five fields (`pageCount`, `publishedDate`, `categories`, `language`, `isbn`) are unread by the app and absent from `0002_books.sql`. The Postgres entity is `{ id, title, author, thumbnailUrl }` — `thumbnailUrl` stays, `BookList` and `ReadingListPage` render it as the cover.
2. The DB suite runs locally only. No CI service container.
3. Firestore data is migrated later (parent plan step 7). Nothing here dual-writes.
4. PG repositories cannot keep today's interfaces. `readings.challenge_id` is `not null` with a composite foreign key to `memberships`, and `reading_tags.tag_id` is a uuid, so `create(uid, { bookId, tiles, isFreebie })` has no implementation. Every interface becomes challenge-scoped and `tiles` becomes `tagIds`.
5. Handlers keep importing the Firestore `store.ts` until parent plan step 5. Parent plan step 9 becomes `rm store.ts` plus the rename in deviation 1.
6. No shared repository interface. Only `UserProfileRepository` is identical across the two implementations: every `readings` and `tbr` signature gains `challengeId`, `tiles` becomes `tagIds`, `challenges.create` changes its return type and gains six methods, and the entities differ (`Book.metadata` against `thumbnailUrl`, `Reading` gaining `userId`). Extracting one would also mean editing the five Firestore stores, which is the churn deviation 1 removes. Nothing swaps implementations at runtime, so no interface needs two implementors.

## Files to change

New:

- `functions/src/db/transaction.ts` — `inTransaction(db, work)` and the `Db` query interface both a pool and a client satisfy. Repository factories take `Db`, defaulting to `getPool()`, so a cross-aggregate write composes by passing one client to each repository.
- `functions/src/common/pgErrors.ts` — SQLSTATE to `DomainError`, keyed by constraint name for `23505`, `23503`, `23001`, `23514` and `23502`. `22P02` is the exception, mapped by position: Firestore accepted any string id, Postgres raises on a non-uuid `challengeId`, and an unmapped raise is a 500 on client input.
- `functions/src/testing/db.ts` — `connectTestDatabase()`, returning a handle that carries `db`, `reset()` and `close()`.
- `db/testing/mark-test-database.sql` — bind-mounted into the container's `/docker-entrypoint-initdb.d/`, marking the database disposable.
- `functions/src/books/errors.ts` — `MissingBookError`, which both stores throw.
- `functions/src/testing/factories.ts` — `seedUser`, `seedBook`, `seedChallenge`, `seedMembership`, `seedTag`, `seedReading`, `seedReadingTag`, `seedTbrEntry`, `seedTbrEntryTag`. Raw `insert`, never the repository under test, so a repository bug cannot hide behind its own fixture.
- `<domain>/postgresStore.ts` and `<domain>/postgresStore.db.test.ts` for `users`, `books`, `challenges`, `tags`, `readings`, `tbr`.

Not rewritten: the Firestore `store.ts` files, which keep working untouched apart from `books/store.ts` importing `MissingBookError` instead of declaring it.

No Postgres equivalent of `requireBookExists` — `readings.book_id references books (id)` is the same check, and `pgErrors` turns its violation into the same `not-found`.

## Interfaces

As built, in `<domain>/postgresStore.ts`. Entity types live beside them in the same file.

```ts
// users
list(): Promise<UserProfile[]>;
get(userId: string): Promise<UserProfile | null>;
upsert(profile: UserProfile): Promise<void>;

// books
getByIds(ids: string[]): Promise<Map<string, Book>>;
findByExternalRef(source: string, externalId: string): Promise<Book | undefined>;
createIfAbsent(book: NewBook, refs?: BookExternalRef[]): Promise<{ bookId: string; created: boolean }>;

// challenges
get(challengeId: string): Promise<Challenge>;
create(userId: string, fields: ChallengeFields): Promise<{ challengeId: string; joinCode: string }>;
update(challengeId: string, fields: ChallengeUpdate): Promise<void>;
setStatus(challengeId: string, status: ChallengeStatus): Promise<void>;
remove(challengeId: string): Promise<void>;
getMembership(challengeId: string, userId: string): Promise<Membership | undefined>;
listMembers(challengeId: string): Promise<Membership[]>;
listActiveMemberships(userId: string): Promise<Map<string, Membership>>;
upsertMembership(challengeId: string, userId: string, fields: MembershipFields): Promise<void>;
listActiveOwners(challengeId: string): Promise<string[]>;
findByJoinCode(code: string): Promise<{ challengeId: string } | undefined>;
getJoinCode(challengeId: string): Promise<string | undefined>;
rotateJoinCode(challengeId: string, createdBy: string): Promise<string>;

// tags
listByChallenge(challengeId: string): Promise<Tag[]>;
create(challengeId: string, label: string): Promise<string>;
update(challengeId: string, tagId: string, label: string): Promise<void>;
remove(challengeId: string, tagId: string): Promise<void>;

// readings — ReadingFields is { bookId, tagIds, isFreebie }
list(challengeId: string, userId: string): Promise<Reading[]>;
listByChallenge(challengeId: string): Promise<Map<string, Reading[]>>;
get(challengeId: string, readingId: string): Promise<Reading | undefined>;
create(challengeId: string, userId: string, fields: ReadingFields): Promise<string>;
update(challengeId: string, readingId: string, fields: ReadingFields): Promise<void>;
remove(challengeId: string, readingId: string): Promise<void>;

// tbr — TBREntryFields is { bookId, plannedTagIds, notes? }
list(challengeId: string, userId: string): Promise<TBREntry[]>;
get(challengeId: string, tbrId: string): Promise<TBREntry | undefined>;
create(challengeId: string, userId: string, fields: TBREntryFields): Promise<string>;
update(challengeId: string, tbrId: string, fields: Omit<TBREntryFields, 'bookId'>): Promise<void>;
remove(challengeId: string, tbrId: string): Promise<void>;
promote(challengeId: string, tbrId: string, tagIds: string[], isFreebie: boolean): Promise<PromotionOutcome>;
```

Every factory is `xRepository(db: Db = getPool())`; `challengeRepository` takes a second argument, the join-code generator, defaulting to `generateJoinCode`.

`readings.update` and `remove` drop the `userId` argument. The Firestore path encoded authorization; an admin editing another player's reading does not fit that, so `get` exists for the guard to read the row's owner before the write. `Reading` carries `userId`.

`listByChallenge` filters to `memberships.status = 'active'` in SQL (rule 24), rather than returning everything for the handler to drop.

## Scripts

```json
"test":    "node --import tsx --test \"src/**/!(*.db).test.ts\"",
"test:db": "node --env-file=.env.local --test-concurrency=1 --import tsx --test \"src/**/*.db.test.ts\""
```

Root: `"test:db": "pnpm run db:migrate && pnpm --filter @bookbingo/functions run test:db"`. Migrations run once per invocation, not per file. `--test-concurrency=1` because node:test runs the files in parallel processes against the one database, where the truncates deadlock and a seed from one file vanishes under another's reset.

Isolation is `truncate` in a `beforeEach`, over the table list read from `pg_tables` minus `schema_migrations` and memoized per process. Derived, so a new migration needs no edit here. Transaction-rollback isolation is rejected: `create` and `promote` open their own transactions, and savepoint nesting would test a code path that never runs in production.

Three things stand between this suite and a real database, since `reset()` truncates every table it finds:

1. The harness reads `TEST_DATABASE_URL`, never the `DATABASE_URL` the application reads, and never calls `getPool()`. The whole suite passes with `DATABASE_URL` unset.
2. `reset()` is reachable only through the handle `connectTestDatabase()` returns, and that function performs the checks. A test cannot skip them by forgetting a hook — the earlier design exported a free `resetDatabase()` that checked nothing.
3. The database must report `current_setting('bookbingo.test_database') = 'on'`, set by an init script only the docker-compose container runs. A name or host check passes for a production database proxied to localhost by `cloud-sql-proxy`; this does not.

`truncate` runs without `cascade`: every table is named already, so cascade could only reach one the catalog query missed.

## Ordered steps

Each step is one commit: interface, test file and implementation together. A commit holding a red test leaves `verify` failing.

1. `db/transaction.ts`, `common/pgErrors.ts`, `testing/db.ts`, `testing/factories.ts`, and the two scripts. Ships with `testing/harness.db.test.ts` covering the disposable-database guard, `reset()`, `inTransaction` and the SQLSTATE mapping against real constraints.
2. `MissingBookError` to `books/errors.ts`, with its importers. No behaviour change.
3. `users` — no dependencies.
4. `books` + `book_external_refs`. `Book` is declared in `postgresStore.ts` without metadata; `lib/types.Book` and the Firestore mapper are left alone.
5. `challenges`, `memberships`, `join_codes`. Largest step: `create` writes three tables in one transaction, `rotateJoinCode` deletes then inserts, `listActiveOwners` takes `for update` so two concurrent self-demotions cannot both pass rule 21.
6. `tags`.
7. `readings` + `reading_tags`.
8. `tbr_entries` + `tbr_entry_tags`, including `promote`.

Per step, the loop: declare the interface with every method throwing `not implemented`, write the test, run `pnpm run test:db` and confirm it fails on the assertion rather than a missing table, implement one method at a time, then `pnpm run verify`.

## Validation

Happy path per repository, then the constraints — the reason for moving off Firestore:

- Reading for a user with no membership row → rejected (composite foreign key).
- Reading tagged with another challenge's tag → rejected.
- Second freebie for the same member → `conflict` (`readings_one_freebie_idx`).
- Tag label differing only in case → `conflict` (`tags_challenge_label_idx`).
- Tag delete with reading history → `conflict`, with a message saying history blocks it, not a raw violation.
- `challenges.remove` deletes tags, memberships and the join code by name, in one transaction; `books` and `users` survive. Nothing in the subtree cascades, so a raw `delete from challenges` is refused.
- A challenge holding a reading or TBR entry is refused: `readings` and `tbr_entries` hold the membership row down with `restrict`. Clearing history is an explicit ordered script, never a repository method.
- `users` delete attempt → rejected (`on delete restrict`).
- Non-uuid `challengeId` → `not-found`, not a 500.
- `rotateJoinCode` leaves exactly one row for the challenge.
- `promote` reuses the entry id as the reading id; called twice, the second returns `alreadyLogged` and creates nothing.
- `promote` failing on the freebie rule leaves the TBR entry in place.
- `listByChallenge` omits a `left` member's readings and includes an `active` member's.
- Dates round-trip as `Date`, and `timestamptz` comes back in UTC.

## Risks

- **Interface churn is unavoidable.** Nothing calls these repositories until step 5 of the parent plan, so a signature that turns out wrong is found by a handler, not a test. Keep the test files thin on helpers so a rename is cheap.
- **Two stores per domain until the handlers move.** `store.ts` and `postgresStore.ts` sit side by side, and only the Firestore one runs. A change to a shared rule has to be made twice or the two diverge silently; the window closes at parent plan step 9.
- **`.env.local` is not committed.** `test:db` fails with pg's connection error, not an explanation, on a fresh checkout. `requireTestDatabaseUrl()` throws the instruction instead.
- **The container is `tmpfs`.** `docker compose down` discards the schema, and `test:db` then fails on a missing table rather than re-migrating. The root script runs `db:migrate` first for exactly this.
- **Dropping `metadata` is wire-breaking.** It joins the pending book-flattening change (CLAUDE.md) and needs one coordinated `deploy:all`.

## Open decisions

1. **`createManualBook`'s metadata fields** (blocks parent plan step 5, not step 4). `BookForm` collects page count, ISBN and the rest, and `BookMetadataSchema` validates them. Once a handler writes through the Postgres repository those fields have nowhere to go. Delete the form inputs and the schema, or keep accepting and ignoring them until the client change? Recommend deleting them when the handler moves — an input that silently discards what you type is worse than its absence.
2. **Leaderboard shape** — resolved as the Map. `listByChallenge` returns every active member's readings grouped by user, which keeps the handler change small. Scoring one challenge in Node still reads every row; revisit with a SQL aggregate when a challenge is large enough to notice.
