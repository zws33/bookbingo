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

---

## Open — Medium

### B3 — `useReadings` + `useAllReadings`: spread overwrites `id`
**Files:** `app/web/src/hooks/useReadings.ts:29`, `app/web/src/hooks/useAllReadings.ts:26`

The `id: doc.id` assignment is placed **before** `...data` in the spread. If the Firestore document has a stored `id` field, it silently overwrites `doc.id`.

Currently benign: seeded data uses `doc(readingsRef, reading.bookId)` so `doc.id === data.id`; `addDoc`-created readings have no stored `id`. But the invariant is fragile.

**Fix:** move `id: doc.id` after the spread so it always wins:
```ts
return {
  ...data,
  bookId: data.bookId || '',
  id: doc.id,
} as Reading;
```
Apply the same fix to `useAllReadings`.

---

### B4 — Firestore rules: migration books are permanently un-updatable
**File:** `firestore.rules:9`

```
allow update: if request.auth != null && request.auth.uid == resource.data.createdBy;
```

The migration script creates books with `createdBy: 'system-migration'`. No real user has that UID, so any book the script creates can never be updated through the app — including during Phase 3 cleanup or if a user needs to correct a title/author.

**Options (pick one):**
- Set `createdBy` to the resolving user's UID in the migration script (requires passing a sentinel user ID)
- Relax the rule to allow any authenticated user to update any book: `allow update: if request.auth != null`
- Add an escape hatch: also allow update when `resource.data.createdBy == 'system-migration'`

---

### B5 — `migrate-readings.ts`: dry-run fake IDs aren't cached
**File:** `scripts/migrate-readings.ts:70-73`

`findOrCreateBookId` returns a fake ID in dry-run mode without caching it. If 10 readings reference the same book that doesn't exist yet, the dry-run logs "Would create book: X" 10 times instead of once — inflating the apparent creation count and making the output misleading.

**Fix:** cache the fake ID before returning:
```ts
if (DRY_RUN) {
  const fakeId = `dry-run-${titleLower}`;
  bookCache.set(key, fakeId);
  console.log(`  [DRY-RUN] Would create book: "${title}" by ${author}`);
  return fakeId;
}
```

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
