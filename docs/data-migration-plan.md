# Data Migration Plan — Firestore to Neon

Copies all live Firestore data into an **empty** Neon database satisfying `db/migrations/0001`–`0007`. Steps 2 (staging) and 7 (prod) of `docs/challenge-implementation-plan.md`.

Firestore is left intact: the script never writes to it or deletes from it.

## Objective

`scripts/firestore_pg_migration/`, **single-run** — it requires an empty destination. Running it twice is not supported; the way to run it again is to clear the destination first. The migration happens once per database, so idempotent upserts and a stored id remap buy nothing and cost a derivation that has to be right.

```
pnpm run db:import:firestore -- \
  [--database-url <url>] \
  --project <firebase-project> [--owner-uid <uid>] [--challenge-name <name>]
```

Run it through the package script, not `tsx` directly: the script loads `functions/.env.local` with `--env-file-if-exists`, which is where `TEST_DATABASE_URL` comes from. A raw `tsx` invocation has no destination to default to.

`--database-url` names the destination and defaults to `TEST_DATABASE_URL`, so an unqualified run writes to the local Docker Postgres. Neon is reached only by passing the flag. `DATABASE_URL` is not read — it is the application's connection, and a staging or prod secret. `--project` defaults to staging; `--owner` defaults to the operator's email and is resolved to a uid through Auth. The resolved destination is logged before the first write.

No explicit emptiness pre-check was built. A second run conflicts on `users.id` in the first step and aborts before anything else is written, which is the same stop for one fewer moving part. The pre-flight checks below were likewise not built: every one of them is a constraint the destination already enforces, so a violation surfaces as the failing insert.

Each step is a module exporting one function, composed in order by `index.ts`. A step takes a Firestore handle and a pg client and returns whatever the next step needs; `challenges.ts` takes no Firestore handle, since it synthesizes its rows and reads its member set from the `users` table.

## Ids

`readings.id`, `tbr_entries.id` and `tags.id` are uuids and Firestore auto-ids are not, so all three are generated, not derived. `gen_random_uuid()` supplies them; nothing outside this run needs to predict one.

`tags` is inserted before `reading_tags` and `tbr_entry_tags`, so the script holds a `Map<tileId, uuid>` built from that insert's `returning id` and uses it for both tag join tables. In memory for the length of the run, never persisted — the run that writes the tags is the run that writes the rows referencing them.

`users.id` and `books.id` carry over unchanged — Firebase uids and the 32-hex derived book ids are already the Postgres keys.

The default challenge id is a fixed literal, identical in staging and prod so config, logs and support queries match across environments:

```
CHALLENGE_ID = '2c91359f-260f-4372-a379-6a2c45488e84'
```

## Clearing a destination

Required before the real prod run, because the rehearsal at step 7 leaves prod populated and the script refuses a populated destination.

```sql
truncate table reading_tags, readings, tbr_entry_tags, tbr_entries,
               memberships, join_codes, tags, challenges,
               book_external_refs, books, users;
```

One statement naming every table, so the `on delete restrict` foreign keys never apply and no `cascade` is needed. Deliberately not a flag on the migration script: a `--wipe` option is one mistyped invocation away from clearing prod after cutover.

## Mapping

Foreign-key order. Each table is one transaction; the run is not, so a failure leaves earlier tables written — clear the destination and run again.

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
3. Full run against Neon prod (step 7).
4. **Clear prod.** The statement above. The rehearsal's rows are not the rows that go live.
5. At cutover (step 8): freeze, full run against prod, unfreeze. The freeze covers the whole migration, not a delta.

## Risks

- **Reading ids change.** Fresh uuids, not Firestore auto-ids, and they differ between the rehearsal and the live run. Nothing persists a reading id outside Firestore and the client refetches, but a bookmarked deep link breaks.
- **Firestore records no book creator**, so every migrated book gets `created_by` null — attribution starts empty rather than wrong.
- **A partial run cannot be resumed.** Each table is its own transaction, so a mid-run failure leaves earlier tables written, and the empty-destination precondition then refuses the retry. Recovery is clear-and-rerun.
- **Forgetting to clear prod after the rehearsal** stops the cutover run at its precondition. That is the intended failure — loud, before the freeze, rather than a silent merge of rehearsal rows into live data.

## Open decisions

None. Both are settled:

- **Retired tile ids** — none exist. See pre-flight check 4.
- **Challenge name** — `'Book Bingo'`, the `DEFAULT_CHALLENGE_NAME` in `scripts/firestore_pg_migration/constants.ts`, overridable with `--challenge-name`. `m01` names 2025 and `m05` names 2026, so the name claims neither year.
