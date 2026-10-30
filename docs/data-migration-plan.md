# Data Migration Plan — Firestore to Neon

Copies all live Firestore data into a Neon database satisfying `db/migrations/0001`–`0007`. Steps 2 (staging) and 3 (prod) of `docs/challenge-implementation-plan.md`; run again at the step 7 cutover.

Firestore is left intact: the script never writes to it or deletes from it.

## Objective

`scripts/firestore_pg_migration/`, **rerunnable**. Every table upserts on a key derived from the Firestore source, so a second run updates the rows the first one wrote rather than duplicating or colliding. The destination does not have to be empty, and a failed run is recovered by running it again.

```
pnpm run db:import:firestore -- \
  [--database-url <url>] \
  --project <firebase-project> [--owner-uid <uid>] [--challenge-name <name>] \
  [--no-prune]
```

Run it through the package script, not `tsx` directly: the script loads `functions/.env.local` with `--env-file-if-exists`, which is where `TEST_DATABASE_URL` comes from. A raw `tsx` invocation has no destination to default to.

`--database-url` names the destination and defaults to `TEST_DATABASE_URL`, so an unqualified run writes to the local Docker Postgres. Neon is reached only by passing the flag. `DATABASE_URL` is not read — it is the application's connection, and a staging or prod secret. `--project` defaults to staging; `--owner` defaults to the operator's email and is resolved to a uid through Auth. The resolved destination is logged before the first write.

The pre-flight checks below were not built: every one of them is a constraint the destination already enforces, so a violation surfaces as the failing insert.

**Pruning is on by default and deletes.** A run makes the destination mirror Firestore: readings, TBR entries and their tag rows that exist in Postgres but not in the source are removed, as are `openLibrary` external refs whose work key changed. That is correct while Firestore is the source of truth, and wrong the moment it is not — after cutover, a prune-on run would delete every reading logged through the v2 client. `--no-prune` skips the deletes and upserts only. A run whose source collection comes back empty logs `source is empty, skipping prune` rather than emptying the table.

Two things are never rewritten, because they are live application data by the time any rerun happens:

- The challenge row, its join code and every membership (`on conflict do nothing`). A rerun will not revert a rename, a rotated code, a role change or a member who left.
- Tags. They are matched by `lower(label)`, not by the ids the script generates, so a rerun reuses the rows readings are already attached to. A label dropped from `TILES` keeps its tag row, because `reading_tags` restricts the delete and the row still carries scoring history.

Each step is a module exporting one function, composed in order by `index.ts`. A step takes a Firestore handle and a pg client and returns whatever the next step needs; `challenges.ts` takes no Firestore handle, since it synthesizes its rows and reads its member set from the `users` table.

## Ids

`readings.id` and `tbr_entries.id` are a **uuid v5 of the Firestore document path** (`ids.ts`, namespace `IMPORT_NAMESPACE`). Postgres stores no Firestore id, so the path is the only stable identity available, and deriving the key from it is what makes a rerun upsert its own earlier row. Changing `IMPORT_NAMESPACE` re-keys every reading and TBR entry, so a rerun would delete and reinsert the whole subtree.

`tags.id` is a fresh `randomUUID()`, but the tile-to-tag map is resolved from the labels already stored rather than from the ids just generated, so a rerun reuses the existing rows. `tags` is written before `reading_tags` and `tbr_entry_tags`, and the map lives in memory for the length of the run.

`users.id` and `books.id` carry over unchanged — Firebase uids and the 32-hex derived book ids are already the Postgres keys.

The default challenge id is a fixed literal, identical in staging and prod so config, logs and support queries match across environments:

```
CHALLENGE_ID = '2c91359f-260f-4372-a379-6a2c45488e84'
```

## Clearing a destination

**Not part of the cutover.** The script upserts, so the step-3 rehearsal leaving prod populated is fine — the cutover run updates those rows in place.

For a genuine reset (a corrupted database, or re-testing from nothing):

```sql
truncate table reading_tags, readings, tbr_entry_tags, tbr_entries,
               memberships, join_codes, tags, challenges,
               book_external_refs, books, users;
```

One statement naming every table, so the `on delete restrict` foreign keys never apply and no `cascade` is needed. Deliberately not a flag on the migration script: a `--wipe` option is one mistyped invocation away from clearing prod after cutover.

## Mapping

Foreign-key order. Each table is one transaction; the run is not, so a failure leaves earlier tables written — clear the destination and run again.

Each table is one transaction; the run is not. A failure leaves earlier tables written, which a rerun then reconciles.

| #   | Target               | Source                          | Notes                                                                                                                                                                                                                                                                         |
| --- | -------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `users`              | `/users/{uid}`                  | `created_at` = `updatedAt` ?? `now()`. The set is the union of `/users` docs and every readings/TBR author, so an author with no profile doc still gets a row.                                                                                                                |
| 2   | `books`              | `/books/{bookId}`               | `thumbnail_url` = `metadata.thumbnailUrl`. `created_by` = null for every row: Firestore records no creator. `metadata`'s other five fields (`pageCount`, `publishedDate`, `categories`, `language`, `isbn`) are dropped — unread by the app and absent from `0002_books.sql`. |
| 3   | `book_external_refs` | `books.externalIds.openLibrary` | `(book_id, 'openLibrary', workKey)`, `details` = `{}`. Absent for manual books.                                                                                                                                                                                               |
| 4   | `challenges`         | synthesized                     | `id` = `CHALLENGE_ID`, `tag_cap` = 3 (`MAX_TILES_PER_BOOK`), `status` = `'active'`, `created_by` = your uid.                                                                                                                                                                  |
| 5   | `join_codes`         | synthesized                     | One row via `generateJoinCode`, so the challenge is joinable.                                                                                                                                                                                                                 |
| 6   | `tags`               | `TILES` (49)                    | `label` = tile `name`. `returning id` builds the tile-to-uuid map. Pre-flighted clean: no case collisions, no length violations.                                                                                                                                              |
| 7   | `memberships`        | the step-1 user set             | `status` = `'active'`, `role` = `'owner'` for your uid and `'member'` otherwise, `joined_at` = `updatedAt` ?? `now()`.                                                                                                                                                        |
| 8   | `readings`           | `/users/{uid}/readings/{id}`    | `challenge_id` = `CHALLENGE_ID`. Legacy `bookTitle`/`bookAuthor` ignored — the join replaces them.                                                                                                                                                                            |
| 9   | `reading_tags`       | `readings.tiles[]`              | `tag_id` from the row-6 map; `challenge_id` carried for the composite key.                                                                                                                                                                                                    |
| 10  | `tbr_entries`        | `/users/{uid}/tbr/{id}`         | `added_at` = `addedAt`.                                                                                                                                                                                                                                                       |
| 11  | `tbr_entry_tags`     | `tbr.plannedTiles[]`            | As row 9.                                                                                                                                                                                                                                                                     |

## Pre-flight

Not implemented — there is no `--check-only`. Each item below is a constraint the destination enforces, listed so a failing insert is recognizable rather than mysterious.

1. **Book id shape** — `books.id check (id ~ '^[0-9a-f]{32}$')`. A book still on a Firestore auto-id is rejected. Verified clean against prod on 2026-10-08: 135 of 135 docs already sit at their derived id. `createBookIfAbsent` is the only write path into `/books` and both callers pass `deriveBookId`, so no new offender can appear.
2. **Book title and author non-blank** — both are `check (length(btrim(…)) > 0)`.
3. **External ref uniqueness** — `unique (source, external_id)`. Two books claiming one Open Library work key collide.
4. **Unknown tile ids** — any `tiles[]` or `plannedTiles[]` entry not in `TILE_IDS` has no tag row and fails the composite foreign key. No tile id has ever been retired: every edit to `TILES` in git history renames a tile or drops the old `isManual` field, and the id set has been `t01`–`t43` plus `m01`–`m06` since it was introduced. Verified 2026-10-09 against `git log --follow functions/src/domain/constants.ts`. Do not plan retired-tile triage.
5. **One freebie per user** — `readings_one_freebie_idx` is unique on `(challenge_id, user_id) where is_freebie`.
6. **Orphan book references** — every reading and TBR `bookId` must exist in `/books`. `MissingBookError` exists because this happens.
7. **Notes length** — `tbr_entries.notes check (length(notes) <= 2000)`.
8. **Duplicate tile ids within one reading** — `reading_tags` is keyed `(reading_id, tag_id)`.

A violation aborts its step's transaction, leaving earlier steps written. Recovery is clear-and-rerun.

## Run sequence

1. Full run against the local container, pointed at prod Firestore. The rehearsal that costs nothing.
2. Full run against Neon staging.
3. Full run against Neon prod (step 3). Nothing reads it yet; this proves the script against real volume before it matters. The rows it writes stay — the cutover run updates them.
4. At cutover (step 7): announce the window, run against prod, verify, reopen. The run covers everything, not a delta, so it is timed at step 6 rather than guessed.
5. **Never again with pruning on.** After cutover Firestore is no longer the source of truth, and a prune-on run deletes every reading written through the v2 client.

## Risks

- **Reading ids are not Firestore auto-ids.** They are stable across runs, but a deep link bookmarked against a Firestore id breaks. Nothing persists a reading id client-side and the client refetches.
- **Firestore records no book creator**, so every migrated book gets `created_by` null — attribution starts empty rather than wrong.
- **Pruning is destructive after cutover.** The default deletes Postgres readings and TBR entries absent from Firestore. One prune-on run after the client is live erases everything logged since. Nothing in the script guards this; the operator does.
- **A changed `IMPORT_NAMESPACE`** re-keys every reading and TBR entry, so a rerun deletes the whole subtree and reinserts it under new ids.

## Open decisions

None. Both are settled:

- **Retired tile ids** — none exist. See pre-flight check 4.
- **Challenge name** — `'Book Bingo'`, the `DEFAULT_CHALLENGE_NAME` in `scripts/firestore_pg_migration/constants.ts`, overridable with `--challenge-name`. `m01` names 2025 and `m05` names 2026, so the name claims neither year.
