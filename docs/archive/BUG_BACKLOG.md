# Bug Backlog: Book Data Model Enrichment

Identified during code review of the Parallel Change (Expand-Migrate-Contract) implementation.
Bugs are grouped by severity. Resolved items should be moved to the archive.

---

## Fixed

| # | File | Description |
|---|------|-------------|
| B1 | `app/web/src/components/BingoBoard.tsx` | Per-tile book count collapsed to 0/1 by using `readings.find()` instead of counting. |
| B2 | `app/web/src/components/BingoBoard.tsx` | `isOpen={selectedTile !== undefined}` was always `true` — `null !== undefined` evaluates truthy, causing the modal to render permanently open. |
| B6 | `scripts/migrate-readings.ts` | "Shared Books Created" counter corrected to distinguish between unique books processed and new creations. |
| B7 | `app/web/src/lib/books.ts` | Redundant `id` field removed from Firestore documents; hydration fixed in `getBook`. |
| S1 | `lib/types/src/index.ts` | `metadata` and `externalId` marked optional in `Book` type to reflect current data state. |
| B3 | `app/web/src/hooks/useReadings.ts` | Reading hooks fixed to prevent internal `id` field from overwriting document ID. |
| B4 | `firestore.rules` | Migrated books allowed to be updated by any authenticated user (escape hatch). |
| B5 | `scripts/migrate-readings.ts` | Dry-run mode now caches fake IDs to provide accurate log output and statistics. |

---

## Open — Medium

(None)

---

## Open — Low

(None)

---

## Structural / Future Risk

### S2 — `getOrCreateBook`: unprotected race condition on concurrent creates
**File:** `app/web/src/lib/books.ts:18-52`

Two users simultaneously adding the same book can independently find no match and both create a document, resulting in duplicates in `/books/`. No transaction or uniqueness constraint prevents this.

Acceptable for the current scale (small friend group). If deduplication becomes a concern, the fix is a Firestore transaction wrapping the query + conditional create. Alternatively, Cloud Functions triggered on create could merge duplicates after the fact.

---

### S3 — `useBooks`: unfiltered collection subscription grows unboundedly
**File:** `app/web/src/hooks/useBooks.ts:13`

`useCollection(collection(db, 'books'))` fetches every book ever added by any user with no filter. Works now. As the platform grows, this listener transfers and holds an increasingly large dataset in every client's memory.

Future mitigation: filter to only books referenced by the current user's readings (requires switching from one collection subscription to multiple point reads or a server-side join).
