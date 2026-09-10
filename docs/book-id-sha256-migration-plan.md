# Book ID sha256 Migration Plan

## Objective

Replace the hand-rolled cyrb53 `hashKey` with `node:crypto` sha256, move id
derivation to server-only code, and re-key `/books/` (plus every `bookId`
reference) to the new ids.

New derivation, in `functions/src/books/bookId.ts`:

```ts
import { createHash } from 'node:crypto';

/** 128 bits of sha256, hex — collision-negligible and a legal Firestore id. */
function hashKey(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 32);
}
```

`deriveBookId` and `normalizeForKey` keep their current bodies and the
`openLibrary:` / `manual:` domain prefixes. Only `hashKey` changes.

`node:crypto` cannot stay in `lib/core`: `index.ts` spreads `bookIdentity.js`
into its default export and `app/web` resolves `@bookbingo/lib-core` to that
source through `vite-tsconfig-paths`, so a Node builtin there breaks the web
build for every lib-core consumer.

## Files to change

| File                                                                | Change                                                                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `functions/src/books/bookId.ts`                                     | New. `BookIdentity`, `deriveBookId`, `normalizeForKey`, sha256 `hashKey`                                    |
| `functions/src/books/bookId.test.ts`                                | New. Move `lib/core/src/bookIdentity.test.ts` verbatim; assertions are property-based and survive the swap  |
| `lib/core/src/bookIdentity.ts`, `.test.ts`                          | Delete                                                                                                      |
| `lib/core/src/index.ts`                                             | Drop the `bookIdentity` import, spread, and re-exports                                                      |
| `functions/src/books/handler.ts`                                    | Delete the duplicated `hashKey`/`createId`; call `deriveBookId`                                             |
| `functions/src/books/manual.ts`                                     | Replace `.add()` with `deriveBookId({title, author})` + the same get-then-set transaction `createBook` uses |
| `functions/src/books/handler.test.ts`                               | Cover the derived manual id and manual dedupe                                                               |
| `scripts/lib/dataset.ts`                                            | Import from `../../functions/src/books/bookId.js`                                                           |
| `scripts/migrate-book-identity.ts`                                  | Delete — superseded, already run                                                                            |
| `scripts/migrate-book-ids.ts`                                       | New throwaway migration (below)                                                                             |
| `firestore.rules`                                                   | Comment says "lib-core deriveBookId"                                                                        |
| `docs/firestore-schema.md`, `docs/books-data-consolidation-plan.md` | Update the sections naming cyrb53/base36 or lib-core                                                        |

## Migration script

`scripts/migrate-book-ids.ts` — throwaway, deleted after the prod run.

```
tsx scripts/migrate-book-ids.ts --project <id> [--dry-run] [--limit N] [--cleanup]
```

1. Read `/books`; compute `target = deriveBookId(doc.data())`. Docs already at
   their target are skipped, so re-runs are no-ops.
2. `--limit N` migrates only the first N stale docs — the staging subset test.
   Unselected books keep their old ids and still resolve.
3. Collapse stale docs sharing a target (earliest `createdAt` wins provenance,
   the OL-bearing doc wins canonical fields). Data is copied verbatim — ids
   change, schema does not.
4. Write the new doc, then re-point `bookId` on the `readings` and `tbr`
   collection groups in 500-op batches.
5. Old docs stay until `--cleanup`, which skips any still referenced.

## Ordered steps

1. Land the code change (`bookId.ts`, handler, manual, deletions, imports).
2. Re-seed the emulator and dry-run the script against `demo-bookbingo`.
3. Deploy functions to staging, then migrate staging `--limit 5 --dry-run`, the
   same without `--dry-run`, then `_verify-migration.ts`.
4. Full staging run, verify, `--cleanup`, exercise the app.
5. Deploy functions to prod, then dry-run, full run, verify, `--cleanup`.
6. Delete `scripts/migrate-book-ids.ts`.

Deploy precedes migration in each environment. A book added in the gap lands at
a new id beside the old one and step 3 collapses it; migrating first would leave
the old function minting old-id docs indefinitely.

## Validation

- `pnpm run verify` after the code change.
- `scripts/_verify-migration.ts --project <id>` after every run — every
  reading's `bookId` must resolve.
- Staging: library, MyBooks, and leaderboard render; add a catalog book and a
  manual book, confirm no duplicate doc appears.

## Risks

| Risk                                                         | Mitigation                                                            |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| Interrupted run leaves refs half re-pointed                  | Re-run — the remap rebuilds identically from the still-stale old docs |
| Reference re-point is batched, not atomic across collections | Old docs stay readable until `--cleanup`, so nothing dangles mid-run  |
| `--cleanup` deletes a live doc                               | Refuses to delete a doc any reading or tbr entry still references     |
| Client caches an old id in memory during migration           | Hobby-scale; migrate when no one is using the app                     |
