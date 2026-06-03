# Engineering Design: "To Be Read" (TBR) List

**Status:** Approved  
**Author:** Zach Smith  
**Date:** 2026-06-03

---

## 1. Overview

Users want to maintain a planning queue of books they intend to read as part of the competition. Each TBR entry captures the enriched book metadata (via the existing search/enrich pipeline) and the tiles they plan to assign — so when they finish the book, the "log it" flow is pre-populated and friction-free.

**Goals:**
- Add, edit, and remove books from a personal TBR list
- Attach planned tile assignments to each TBR entry
- Surface enriched book metadata (cover, page count, etc.) on TBR entries
- Promote a TBR entry to a completed Reading with a single action
- Zero impact on scoring (TBR entries are never counted)

**Non-goals:**
- Social/shared TBR lists — this is personal planning only
- Priority ordering or custom sort
- Reading progress tracking (% read, current page)
- Competition-awareness (e.g., "this tile has no coverage yet" hints)

---

## 2. Data Model

### New Type: `TBREntry` (in `lib/types/src/index.ts`)

```typescript
export interface TBREntry {
  id: string;
  bookId: string;
  /** Tiles the user plans to assign when they log this as read */
  plannedTiles: string[];
  /** Optional personal note */
  notes?: string;
  addedAt: Date;
  updatedAt?: Date;
}
```

**Why a separate type, not a flag on `Reading`?**

`Reading` is a completed, scored record. It has a `readAt` timestamp and feeds the scoring engine directly. Adding a `status: 'tbr' | 'read'` field would require:
- Making `readAt` nullable (currently assumed present throughout)
- Filtering TBR entries out of every scoring call
- Branching logic in `BookList`, `BingoBoard`, and future leaderboard queries

A separate `TBREntry` type keeps the invariant clean: if it's a `Reading`, it happened; if it's a `TBREntry`, it hasn't.

**Why no `isFreebie` field?**

The freebie designation is a high-stakes, one-per-user decision. Committing it during the planning phase creates a false sense of finality. Users can designate freebie when they actually log the book as read (the standard flow already handles this). If this proves to be a friction point in practice, it can be added later.

---

## 3. Firestore Schema

### New subcollection: `/users/{userId}/tbr/{tbrId}`

```
/users/{userId}/tbr/{tbrId}
  bookId:        string
  plannedTiles:  string[]
  notes?:        string
  addedAt:       Timestamp
  updatedAt?:    Timestamp
```

This mirrors the `/users/{userId}/readings/{readingId}` pattern — user-scoped, private, same auth boundary. The `Book` document (`/books/{bookId}`) is reused as-is: the existing `getOrCreateBook()` function handles deduplication and enrichment storage.

**Updated `firestore.rules`:**

```
match /users/{userId}/tbr/{tbrId} {
  allow read, list: if request.auth != null && request.auth.uid == userId;
  allow write:      if request.auth != null && request.auth.uid == userId;
}
```

TBR entries are intentionally private (only the owner can read them), unlike readings which are readable by all authenticated users for leaderboard/social purposes.

---

## 4. Service Layer (`app/web/src/lib/tbr.ts`)

New file — mirrors the structure of `books.ts`:

```typescript
createTBREntry(userId, bookId, plannedTiles, notes?): Promise<string>
updateTBREntry(userId, tbrId, plannedTiles, notes?): Promise<void>
deleteTBREntry(userId, tbrId): Promise<void>
```

No new functions needed in `lib/core` or `lib/types` beyond the type definition — TBR has no business logic, validation, or scoring surface.

**Promote to Read flow** (`promoteTBREntry`):

This is a compound operation — create a Reading and delete the TBR entry atomically. Use a Firestore batch write:

```typescript
promoteTBREntry(userId, tbrId, bookId, tiles, isFreebie): Promise<string>
// Returns new readingId
// Batch: writeBatch → set(readings/new) + delete(tbr/tbrId)
```

The atomic batch prevents a state where the TBR entry still shows after the reading was created (or vice versa if the delete fails).

---

## 5. Hooks

### `useTBR(userId: string)`

```typescript
// app/web/src/hooks/useTBR.ts
// Returns: { entries: TBREntry[], loading, error }
// Subscribes to /users/{userId}/tbr via useCollection (same pattern as useReadings)
```

No derived state needed in the hook itself — the page component will join with `booksById` (already available from `useBooks()`).

---

## 6. UI

### 6a. Navigation

Add a **"Reading List"** tab in `App.tsx` between "My Books" and "Bingo Board":

```
My Books | Reading List | Bingo Board | Leaderboard | Library
```

Route: `/reading-list`  
Component: `ReadingListPage`

Separate tab over a section within My Books — the workflows are distinct enough (planning vs. reviewing what you've read) that combining them creates confusion, even though it adds a fifth tab to the nav.

### 6b. `ReadingListPage` (`app/web/src/pages/ReadingListPage.tsx`)

- Renders a list of TBR entries using book metadata (cover thumbnail, title, author, page count)
- Each entry shows planned tile badges (`TileBadge` from the existing UI primitives)
- FAB (same pattern as My Books) → opens `BookSearchModal` → then `TBRForm`
- Each entry: Edit button (reopen `TBRForm` with existing data), Delete (with `AlertDialog` confirm), and **"Mark as Read"** CTA

### 6c. `TBRForm` (`app/web/src/components/TBRForm.tsx`)

Structurally similar to `BookForm`, but:
- Fields: `plannedTiles` (via `TileSelector`), optional `notes` (via `Textarea`)
- No `isFreebie` toggle — deferred to when the book is logged
- Pre-populated title/author shown as read-only display (not editable — book identity is fixed at search time)
- Submit label: "Add to Reading List" (create) / "Save Changes" (edit)

### 6d. "Mark as Read" Flow

When user taps "Mark as Read" on a TBR entry:

1. Open `BookForm` (the existing add-reading form) pre-populated with:
   - `title` + `author` from the book
   - `tiles` pre-filled from `plannedTiles`
   - `isFreebie: false` (default)
2. User confirms/adjusts tiles and freebie, submits
3. `promoteTBREntry()` runs as a batch write
4. Toast: "Book logged — removed from reading list"

This reuses the existing `BookForm` and `Dialog` without modification.

---

## 7. Component & File Inventory

| File | Action |
|---|---|
| `lib/types/src/index.ts` | Add `TBREntry` interface |
| `app/web/src/lib/tbr.ts` | New — CRUD + `promoteTBREntry` |
| `app/web/src/hooks/useTBR.ts` | New — Firestore subscription |
| `app/web/src/pages/ReadingListPage.tsx` | New — page component |
| `app/web/src/components/TBRForm.tsx` | New — add/edit form |
| `app/web/src/App.tsx` | Add nav tab + route |
| `firestore.rules` | Add TBR subcollection rule |

No changes to `lib/core`, scoring, validation, or existing Reading/Book flows.

---

## 8. Testing

- `useTBR` hook: covered by Vitest component tests
- `tbr.ts` service: covered by integration tests (emulator) following the `books.int.test.ts` pattern
- `promoteTBREntry`: requires integration test specifically — the atomic batch is the only non-trivial logic in this feature

---

## 9. Out of Scope / Future

- **Bingo Board preview**: show how planned tiles would affect the board if all TBR books were read
- **"Claim tile" conflict warnings**: warn if a planned tile is already maxed out in completed readings
- **Sorting/priority**: drag-to-reorder or manual priority field
- **Import from Goodreads**: stretch goal for a later phase
