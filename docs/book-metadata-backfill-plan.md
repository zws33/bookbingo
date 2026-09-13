# Book Metadata Backfill Plan

## Objective

Backfill `metadata` on `/books` docs whose metadata is absent or empty by matching title/author against Open Library, with a human review between matching and writing.

## Files to change

- `scripts/backfill-book-metadata.ts` (new): `match` and `apply` subcommands.
- `scripts/lib/matching.ts` + `matching.test.ts` (new): pure query cleaning and scoring. Imports `normalizeForKey` from `../../functions/src/books/bookIdentity.js`.
- `scripts/package.json`: add `"test": "node --import tsx --test \"**/*.test.ts\""` (same runner as `functions/`).
- `scripts/find-missing-metadata-books.ts`:
  - Use the shared "metadata is empty" predicate.
  - Name the output file after the project it reads (currently reads staging, names the file with `PROD_PROJECT_ID`).

## Ordered steps

0. **Complete the id migration** (`docs/book-id-sha256-migration-plan.md`). It also re-keys manual books created at random ids before `f7bb94d`. Must precede `match` so report `bookId`s stay valid.
1. **Load targets.** `/books` docs where `metadata` is absent or every field is null/empty (`EMPTY_METADATA`, which `createManualBook` sends by default). Keep doc ids.
2. **Clean query strings** (search only, never written):
   - NFKC, collapse whitespace.
   - Author `"Last, First"` → `"First Last"`.
   - Title variant with subtitle after `:` removed.
3. **Search in tiers**, stop at first accepted candidate. Serial, ~1 req/s, provider User-Agent.
   1. `search.json?title=…&author=…`
   2. `search.json?title=…` (author typos)
   3. `search.json?q=<title> <author>` (title typos)
4. **Score.** Edit-distance ratio on `normalizeForKey`'d titles and on author last names. `auto` (both ≥0.9), `review` (both ≥0.7), `none`. Tune thresholds on the first run.
5. **`match --project <id>`** writes `scripts/out/metadata-matches.<project>.json`: `{ bookId, title, author, olKey, olTitle, olAuthor, score, status }`. No Firestore writes.
6. **Review.** Set `status: "skip"` on wrong matches and test docs; paste a correct `olKey` into `none` entries where known.
7. **`apply --project <id> --report <path> [--dry-run]`.** Per non-skipped entry:
   1. `OpenLibraryProvider.getDetails(olKey)`, imported by relative path from `functions/src`, so metadata mapping matches the app.
   2. Transaction: re-read doc. Missing → record `skipped: not-found`, continue. Metadata no longer empty → `skipped: already-enriched`. Otherwise `update({ metadata })`.
   3. Print counts per outcome.

## Validation

1. Unit tests: `Joe Abercombie` matches Abercrombie; `Rivera, Tomás` flips; `Pheonix` matches Phoenix; `test`/`test` → `none`; `EMPTY_METADATA` counts as empty.
2. Staging: step 0 dry-run → `match` → review → `apply --dry-run` → `apply`.
3. Re-run the finder; only skipped entries remain.
4. Spot-check enriched books in `pnpm dev:web:staging`.

## Risks

- **Identity:** only `metadata` is written. Title, author, and `externalIds` feed `deriveBookId`; writing `externalIds` would also make `migrate-book-identity.ts` move the doc on its next re-key. Misspelled titles/authors stay as stored.
- **False positives** (`One`/`Two`, `new`/`new`): author threshold plus review.
- **Duplicates** ("Martyr" / "Martyr!") both get enriched; merging is out of scope.
- **Provider logger** emits JSON lines to stdout when imported into a script.

## Open decision: prod writes

`guardWriteTarget` blocks script writes to prod; the mirror only copies prod → staging.

- **(a)** `--allow-prod` on `apply` only, with typed confirmation. Recommended: the report is reviewed first, and `migrate-book-identity.ts` already writes to any `--project` without the guard.
- **(b)** One-off callable function.
