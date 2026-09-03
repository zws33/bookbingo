# Books Data Consolidation Plan

**Status: complete.** Folded `app/web/src/lib/books.ts` into `app/web/src/data/`, extending the repository seam from `hooks-refactor-plan.md` to cover writes.

Writes keep their positional `userId` first parameter. The `Scope` object from `frontend-decoupling-plan.md` §1 was deliberately deferred: introducing it for writes alone would leave `data/` with two conventions, since the reads still take a bare `userId`. Convert both together or neither.

## Objective

Every Firestore read **and write** for books and readings lives in `data/`, grouped by collection. `lib/books.ts` is deleted.

`lib/books.ts` is misnamed: three of its five exports write `/users/{id}/readings`, not `/books`. Folding it in is a split by collection, not a file move.

| Export in `lib/books.ts` | Collection             | Destination        | Callers                                      |
| ------------------------ | ---------------------- | ------------------ | -------------------------------------------- |
| `getOrCreateBook`        | `/books`               | `data/books.ts`    | `MyBooksPage`, `ReadingListPage`, `BookList` |
| `getBook`                | `/books`               | delete             | none — dead code                             |
| `createReading`          | `/users/{id}/readings` | `data/readings.ts` | `MyBooksPage`                                |
| `updateReading`          | `/users/{id}/readings` | `data/readings.ts` | `BookList`                                   |
| `deleteReading`          | `/users/{id}/readings` | `data/readings.ts` | `BookList`                                   |

## Files to change

- `app/web/src/data/books.ts` — add `getOrCreateBook`, `BookEnrichment`; extend `BookRepository`
- `app/web/src/data/readings.ts` — add `createReading`, `updateReading`, `deleteReading`; extend `ReadingRepository`
- `app/web/src/lib/books.ts` — delete
- `app/web/src/lib/books.int.test.ts` — split into `data/books.int.test.ts` and `data/readings.int.test.ts`
- `app/web/src/components/BookList.tsx`, `pages/MyBooksPage.tsx`, `pages/ReadingListPage.tsx` — import path only
- `app/web/src/components/BookList.test.tsx` — `vi.mock('../lib/books')` → `'../data/readings'` + `'../data/books'` (two mocks now)
- `docs/hooks-refactor-plan.md` — rule 1 covers writes, not just hook reads

## Ordered steps

1. Delete `getBook` and its unused `Book` import.
2. Move `getOrCreateBook` + `BookEnrichment` into `data/books.ts`, above the mappers. Add to `BookRepository`.
3. Move the three reading writes into `data/readings.ts`. Add to `ReadingRepository`. Rename the `log` scope from `'books'` to `'readings'`.
4. Update the three call sites and the `BookList.test.tsx` mocks.
5. Split `lib/books.int.test.ts`: book assertions → `data/books.int.test.ts`, reading writes → append to `data/readings.int.test.ts`. Fix `./firebase` → `../lib/firebase`.
6. Delete `lib/books.ts`.
7. Add unit tests for the writes in `data/books.test.ts` / `data/readings.test.ts`, mocking `firebase/firestore` per rule 7.

## Validation

- `pnpm run verify` (typecheck, lint, format, unit tests)
- `pnpm --filter @bookbingo/web test:integration` with the emulator running
- `grep -rn "lib/books" app/web/src` returns nothing

## Risks

- `getOrCreateBook` is a get-then-set with `{ merge: true }`; the integration test asserts a deterministic id from `deriveBookId`. Move the test body verbatim — do not restate the assertions.
- The `no-restricted-imports` rule blocking `firebase/firestore` outside `data/` stays off until `lib/users.ts` moves too.
- `lib/tbr.ts` followed in a second pass: all four writes moved to `data/tbr.ts`, and `promoteTBREntry` now borrows `readingsCollection` / `newReadingFields` from `data/readings.ts` rather than restating the reading document shape.
