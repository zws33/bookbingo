# Book ID sha256 Migration Plan

## Objective

Replace the hand-written cyrb53 `hashKey` in `functions/src/books/bookIdentity.ts` with `node:crypto` sha256 (first 32 hex chars, 128 bits), then re-key `/books` and every `bookId` reference.

- `deriveBookId`, `normalizeForKey`, and the `openLibrary:` / `manual:` prefixes are unchanged.
- `node:crypto` is usable because ids are derived only in `functions/` and `scripts/` since `f7bb94d`.
- Normalization collisions (distinct books with equal `normalizeForKey` output) are intended and unaffected.

## Files to change

- `functions/src/books/bookIdentity.ts`: sha256 `hashKey`.
- `functions/src/books/bookIdentity.test.ts`: id shape `/^[0-9a-f]{32}$/`; golden vectors pin the algorithm (property tests pass for any deterministic hash).
- `scripts/migrate-book-identity.ts`: reused as the migration.
  - Writes only `title`, `author`, `metadata`, `externalIds`. `createdBy`/`createdAt` are legacy and dropped by the no-merge `set()`.
  - Canonical title/author: OL-bearing doc, else first doc.
  - Metadata: first non-empty (`EMPTY_METADATA` is truthy and previously could win).
- `scripts/_verify-migration.ts`: stop printing `createdBy`.
- `docs/firestore-schema.md`: sha256 id definition; remove `createdBy`/`createdAt` rows.

## Ordered steps

1. Land the code change; `pnpm run verify`.
2. Emulator (`firebase emulators:exec --only firestore`): seed legacy-shaped books (random ids, `createdBy`/`createdAt`, `EMPTY_METADATA` duplicate, OL doc, bare manual doc) with readings and TBR; run migration, `--cleanup`, re-run. `seed-emulator.ts` writes no books, so it does not exercise the re-key.
3. Staging, on a copy of prod:
   1. `pnpm run mirror:staging --wipe`
   2. `pnpm run deploy:functions:staging`
   3. `tsx scripts/migrate-book-identity.ts --project bookbingo-staging --dry-run`, then without `--dry-run`
   4. `tsx scripts/_verify-migration.ts --project bookbingo-staging`
   5. `--cleanup --dry-run`, then `--cleanup`
   6. In the app: library, MyBooks, leaderboard render; add a catalog and a manual book, confirm no duplicate doc.
4. Prod, with no active users: `deploy:functions:prod`, then step 3.3–3.5 with `--project bookbingo-3fdb1`.
5. Run the metadata backfill (`docs/book-metadata-backfill-plan.md`).

Deploy precedes migration: a book added in the gap lands at its new id and the migration collapses it. Migrating first leaves old functions minting old-id docs.

## Validation

- Every doc id matches `/^[0-9a-f]{32}$/` after `--cleanup`.
- `_verify-migration.ts` reports all readings resolve.
- Re-running the migration reports 0 re-keyed ids.
- No book doc has `createdBy` or `createdAt`.

## Risks

- **Interrupted run:** re-run; the remap rebuilds from the still-stale old docs.
- **Non-atomic re-point:** old docs stay readable until `--cleanup`, so references never dangle mid-run.
- **`--cleanup` deleting a live doc:** skips any doc a reading or TBR entry references.
- **TBR not verified:** `_verify-migration.ts` checks only readings; cleanup's reference check covers TBR.
- **Open clients during migration:** books and readings are live subscriptions and converge; run when idle anyway.
- **Legacy fields elsewhere:** `scripts/seed-staging.ts` still writes `createdBy`/`createdAt` on books; `app/web/src/data/schemas.ts` still reads them as optional.
