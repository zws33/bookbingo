# Data Migration Plan — Firestore to Neon

Copies all live Firestore data into an **empty** Neon database satisfying `db/migrations/0001`–`0007`. Steps 2 (staging) and 7 (prod) of `docs/challenge-implementation-plan.md`.

Firestore is left intact: the script never writes to it or deletes from it.

## Objective

`scripts/migrate-firestore-to-postgres.ts`, **single-run** — it requires an empty destination and refuses a populated one. Running it twice is not supported; the way to run it again is to clear the destination first. The migration happens once per database, so idempotent upserts and a stored id remap buy nothing and cost a derivation that has to be right.

```
pnpm exec tsx scripts/migrate-firestore-to-postgres.ts \
  --project <firebase-project> [--check-only] [--force-skip-invalid]
```

`DATABASE_URL` names the destination. The script refuses to write if any of the eleven target tables is non-empty, checked before the first write. That is also the guard against pointing a run at the wrong database: a populated destination is a stop, not a merge.

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

`--check-only` runs these and writes nothing. Each is a constraint the destination enforces anyway; checking here turns a half-applied migration into a report. Run it against **prod** Firestore before step 2, not just before step 7 — prod is the data that has to land.

1. **Book id shape** — `books.id check (id ~ '^[0-9a-f]{32}$')`. A book still on a Firestore auto-id is rejected. `scripts/migrate-book-identity.ts` should have removed these; confirm.
2. **Book title and author non-blank** — both are `check (length(btrim(…)) > 0)`.
3. **External ref uniqueness** — `unique (source, external_id)`. Two books claiming one Open Library work key collide.
4. **Unknown tile ids** — any `tiles[]` or `plannedTiles[]` entry not in `TILE_IDS` has no tag row and fails the composite foreign key.
5. **One freebie per user** — `readings_one_freebie_idx` is unique on `(challenge_id, user_id) where is_freebie`.
6. **Orphan book references** — every reading and TBR `bookId` must exist in `/books`. `MissingBookError` exists because this happens.
7. **Notes length** — `tbr_entries.notes check (length(notes) <= 2000)`.
8. **Duplicate tile ids within one reading** — `reading_tags` is keyed `(reading_id, tag_id)`.

Each failure reports its document path and the offending value. A failed check exits non-zero and writes nothing, unless `--force-skip-invalid` skips the offending documents and lists them.

## Run sequence

1. `--check-only` against prod Firestore. Fix or triage what it reports.
2. Full run against the local container, seeded from a Firestore export. The rehearsal that costs nothing.
3. Full run against Neon staging, then the verifier.
4. Full run against Neon prod (step 7), then the verifier.
5. **Clear prod.** The statement above. The rehearsal's rows are not the rows that go live.
6. At cutover (step 8): freeze, full run against prod, verify, unfreeze. The freeze covers the whole migration, not a delta.

## Validation

`scripts/verify-pg-migration.ts` reads both sides and compares. It gates steps 2 and 7.

- Reading count and TBR entry count per user, Firestore vs Postgres.
- **Score parity per user.** Run `domain/scoring.ts` over the Firestore readings and over the Postgres readings mapped back to tile ids; totals must match exactly. Scores are the product, so this is the check that matters.
- Book count, and every reading's book resolvable by join.
- Tag count 49, every `t`/`m` id resolving to exactly one tag.
- Membership count equal to user count, with exactly one `owner`.
- `read_at` and `added_at` round-trip to the same instant in UTC.
- A second run against a populated destination exits non-zero and writes nothing.

## Risks

- **Pre-flight check 4 is the likely blocker.** `TILES` has been edited over the project's life, and a reading tagged with a since-removed tile has nowhere to go. Add the retired tile back as a tag, or drop it from the reading — per tile, not a blanket rule, because dropping one changes that user's score.
- **Reading ids change.** Fresh uuids, not Firestore auto-ids, and they differ between the rehearsal and the live run. Nothing persists a reading id outside Firestore and the client refetches, but a bookmarked deep link breaks.
- **Firestore records no book creator**, so every migrated book gets `created_by` null — attribution starts empty rather than wrong.
- **A partial run cannot be resumed.** Each table is its own transaction, so a mid-run failure leaves earlier tables written, and the empty-destination precondition then refuses the retry. Recovery is clear-and-rerun; the verifier is what tells you the run was incomplete.
- **Forgetting to clear prod after the rehearsal** stops the cutover run at its precondition. That is the intended failure — loud, before the freeze, rather than a silent merge of rehearsal rows into live data.

## Open decisions

1. **Retired tile ids** (blocks step 2, pending check 4's output). See the first risk.
2. **Challenge name.** `m01` is "from someone else's 2025 list" and `m05` is "from 2026 awards list", so the live competition spans both years and the name should not say one.
