# Phase 1: Enriched Book Model — Implementation Guide

You're wiring the app layer to the enriched book model. When you're done, creating a reading will create (or reuse) a shared `/books/` document, and the display layer will join readings with books instead of reading denormalized fields.

This guide is structured as a series of focused steps. Each step tells you what to change, why it matters, and what to verify before moving on. The steps build on each other — do them in order.

**Branch setup:** Stack on `refactor/replace-userbook-with-scoring-input`.

```bash
git checkout refactor/replace-userbook-with-scoring-input
git checkout -b feat/enriched-book-model
```

---

## Step 1: Firestore Rules

**Goal:** Allow authenticated users to read and create books, but only the creator can update their own book documents.

**File:** `firestore.rules` (repo root)

Open the file. Currently it has rules for `/users/{userId}` and `/users/{userId}/readings/{readingId}`. You need to add a new top-level `match /books/{bookId}` block as a sibling of the `/users/{userId}` block — inside the `match /databases/{database}/documents` block but not nested under `/users`.

**Rules to add:**

- **Read:** Any authenticated user (`request.auth != null`)
- **Create:** Any authenticated user
- **Update:** Only the user who created the book (`request.auth.uid == resource.data.createdBy`)
- **Delete:** Not allowed (books are shared resources — omit the rule, which defaults to deny)

**Why this design:** Books are shared entities. Anyone can add a book to the system, and anyone can read it. But only the original creator can fix a typo in the title. Delete is denied because other users' readings may reference the book.

**Think about:** What happens if you allow any authenticated user to update? What if two users added the same book with slightly different titles — who gets to fix it? There's no perfect answer here, but creator-only-update is a reasonable starting point.

**Verify:**

```bash
# No automated test for rules, but check the file parses correctly:
cat firestore.rules
# Eyeball it — the structure should be clean and the new block properly nested.
```

---

## Step 2: Update the App-Local Types

**Goal:** Align the app's `Reading` type with reality and add a `Book` type for the display layer.

**File:** `app/web/src/types/index.ts`

Currently this file defines `UserProfile` and `Reading`. The `Reading` type has both `bookId` (never populated) AND `bookTitle`/`bookAuthor` (what Firestore actually stores today). You need to:

1. **Remove `bookTitle` and `bookAuthor` from `Reading`.** After this change, `Reading` has `bookId` as the only reference to a book. This matches the target data model in `lib/types/src/index.ts`.

2. **Add a `Book` type.** You could import it from `@bookbingo/lib-types`, but the app layer may want a slightly different shape (e.g., with Firestore Timestamps instead of Dates). For now, define a local `Book` type that matches what you'll store in Firestore:

   ```ts
   export interface Book {
     id: string;
     title: string;
     author: string;
     createdBy: string;
     createdAt: Date;
   }
   ```

   Notice this is intentionally simpler than the `Book` in `lib/types/` — no `metadata` or `externalId` yet. You'll enrich it in Phase 3 when you add Google Books search. For now, only store what you actually use.

**Think about:** Why define a local type instead of importing from `lib/types`? Consider the trade-off: importing keeps types in sync, but the lib type includes `metadata` and `externalId` fields you won't populate yet. If you import the full type, Firestore documents won't have those fields, and TypeScript will lie to you about what's actually there. A local type that matches reality is more honest. You can align them later.

**After this change:** Your code won't compile. That's expected — `BookList`, `BookCard`, `BookRow`, and others still reference `bookTitle`/`bookAuthor` on `Reading`. You'll fix those in later steps. For now, just get the types right and move on.

---

## Step 3: Book CRUD Functions

**Goal:** Add functions to create, find, and get-or-create books in Firestore.

**File:** `app/web/src/lib/books.ts`

This is currently where `createReading`, `updateReading`, and `deleteReading` live. You'll add book functions here and then update the reading functions.

### 3a: Add Firestore imports you'll need

You'll need `query`, `where`, `getDocs`, and `collection` from `firebase/firestore` in addition to what's already imported. Take a look at the current imports and add what's missing.

### 3b: Write `getOrCreateBook`

This is the key function. It takes a title, author, and the ID of the user creating it. It:

1. **Normalizes** the title and author for comparison (lowercase, trimmed)
2. **Queries** `/books/` for a document where the normalized title and author match
3. **If found**, returns the existing book's ID
4. **If not found**, creates a new book document and returns its ID

Here's the design to implement:

```
getOrCreateBook(title: string, author: string, createdBy: string): Promise<string>
```

**The query:** You need a Firestore compound query on two fields. But wait — Firestore queries are case-sensitive. If one user types "The Hobbit" and another types "the hobbit", you'll get duplicates. The standard approach is to store **normalized fields** alongside the display fields:

- `title` — original casing (for display)
- `author` — original casing (for display)
- `titleLower` — `title.trim().toLowerCase()` (for queries)
- `authorLower` — `author.trim().toLowerCase()` (for queries)

Your query matches on `titleLower` and `authorLower`. Your create writes all four fields plus `createdBy` and `createdAt`.

**Think about:** Why not just store everything lowercase? Because users want to see "J.R.R. Tolkien" on screen, not "j.r.r. tolkien". Separating display from query fields is a common Firestore pattern.

**Firestore index:** A compound query on `titleLower` + `authorLower` requires an index. You'll need to add it to `firestore.indexes.json` at the repo root, or let the emulator/console auto-create it on first query. The index entry looks like:

```json
{
  "collectionGroup": "books",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "titleLower", "order": "ASCENDING" },
    { "fieldPath": "authorLower", "order": "ASCENDING" }
  ]
}
```

Add it to the `indexes` array in `firestore.indexes.json`. If the file has an empty `indexes: []` array, put it there. This index gets deployed automatically with `firebase deploy`.

### 3c: Update `createReading`

Change the signature from:

```ts
createReading(userId, title, author, tiles, isFreebie)
```

to:

```ts
createReading(userId, bookId, tiles, isFreebie)
```

The function now writes `bookId` to Firestore instead of `bookTitle` and `bookAuthor`. The document shape becomes:

```ts
{
  bookId,
  tiles,
  isFreebie,
  readAt: serverTimestamp(),
  createdAt: serverTimestamp(),
}
```

### 3d: Update `updateReading`

Same pattern. Change the signature to accept `bookId` instead of `title`/`author`:

```ts
updateReading(userId, readingId, bookId, tiles, isFreebie)
```

The update writes:

```ts
{
  bookId,
  tiles,
  isFreebie,
  updatedAt: serverTimestamp(),
}
```

### 3e: `deleteReading` stays the same

No changes needed — it just deletes by document ID.

**Think about:** There's a subtle race condition in `getOrCreateBook`. If two users add "The Hobbit" at the exact same instant, both could run the query, both find nothing, and both create a new book doc — resulting in duplicates. For a friends-only book club this is effectively impossible. If it ever matters, you'd solve it with a Firestore transaction or a Cloud Function. For now, don't over-engineer it.

**Verify:** This is a good point to run `pnpm run typecheck` and see what's broken. You've changed function signatures, so every call site will be a compile error. That's your to-do list for the next steps.

---

## Step 4: The `useBooks` Hook

**Goal:** Fetch the `/books/` collection and provide a lookup map for joining with readings.

**File:** `app/web/src/hooks/useBooks.ts` (new file)

Look at `useReadings.ts` as your template. The pattern is:

1. Create a Firestore collection reference to `'books'`
2. Pass it to `useCollection` from `react-firebase-hooks/firestore`
3. Map the snapshot to `Book[]` in a `useMemo`
4. Build a `Map<string, Book>` keyed by book ID for O(1) lookups
5. Return `{ booksById, loading, error }`

**Why a Map?** Every `BookCard` needs to look up the book for a given `reading.bookId`. An array would require `.find()` on every render — O(n) per card. A Map gives you O(1). With 50 books this doesn't matter for performance, but it's the right data structure for a lookup table, and building that habit serves you well.

**Template to follow:**

```ts
import { useMemo } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Book } from '../types';

export function useBooks() {
  // 1. Create collection ref
  // 2. useCollection(ref)
  // 3. useMemo to map snapshot → Map<string, Book>
  // 4. Return { booksById, loading, error }
}
```

Fill in the implementation. The snapshot mapping is almost identical to `useReadings` — the difference is you build a `Map` instead of an array.

**Verify:** After creating this hook, try importing it in one of the pages (but don't use it yet). Run `pnpm run typecheck` to confirm it compiles.

---

## Step 5: Update the Page Submit Handlers

**Goal:** When a user adds or edits a book, create/find the Book doc first, then create the Reading with `bookId`.

### 5a: `MyBooksPage.tsx`

The current `handleAddBook` does:

```ts
await createReading(userId, data.title, data.author, data.tiles, data.isFreebie);
```

Change it to a two-step flow:

```ts
const bookId = await getOrCreateBook(data.title, data.author, userId);
await createReading(userId, bookId, data.tiles, data.isFreebie);
```

You'll need to import `getOrCreateBook` from `../lib/books`.

Also add the `useBooks` hook here — you'll need it for the BookList:

```ts
const { booksById, loading: booksLoading } = useBooks();
```

Combine `booksLoading` with the readings `loading` state for the page loading indicator. Pass `booksById` down to `BookList`.

### 5b: `UserBooksPage.tsx`

This page is read-only — no add/edit handlers. But it renders `BookList`, which needs `booksById` for display. Add `useBooks()` here and pass the map to `BookList`.

### 5c: `LeaderboardPage.tsx`

This page only shows scores and names — it never displays book titles or authors. The scoring engine only needs `tiles` and `isFreebie`, which are still on the `Reading`. **No changes needed here.** The readings are passed directly to `getScoreBreakdown()`, which accepts `ScoringInput[]`, and `Reading` satisfies that interface structurally.

**Think about:** Why does the LeaderboardPage work without `useBooks()`? Because of the `ScoringInput` interface from the previous PR. The scoring engine doesn't care about book titles — it only cares about tiles. This is the payoff of the `UserBook → ScoringInput` refactor: decoupling scoring from display concerns.

---

## Step 6: Update BookList

**Goal:** BookList receives the books map and uses it to resolve reading → book for display and editing.

**File:** `app/web/src/components/BookList.tsx`

### 6a: Add `booksById` to the props interface

```ts
interface BookListProps {
  userId: string;
  readings: Reading[];
  booksById: Map<string, Book>;
  loading: boolean;
  error: Error | undefined;
  readOnly?: boolean;
}
```

Import the `Book` type from `../types`.

### 6b: Create a helper to resolve book fields

You need a way to get the title and author for a reading. Write a small helper at the top of the component (or inline it):

```ts
function getBookForReading(reading: Reading, booksById: Map<string, Book>) {
  return booksById.get(reading.bookId);
}
```

For legacy un-migrated readings that don't have a `bookId` (or whose `bookId` doesn't match any book), you'll need a fallback. Define a sentinel:

```ts
const UNKNOWN_BOOK = { title: 'Unknown Book', author: 'Unknown Author' };
```

Then wherever you need title/author:

```ts
const book = booksById.get(reading.bookId) ?? UNKNOWN_BOOK;
```

**Why not `(reading as any).bookTitle`?** You could cast to `any` to read the legacy denormalized fields. But that hides the migration debt behind a type escape hatch. A visible "Unknown Book" label is more honest — it screams "run the migration!" every time you see it.

### 6c: Update the filter

Currently the author filter reads `r.bookAuthor`. Change it to look up the book:

```ts
const filteredReadings = useMemo(() => {
  if (!authorFilter.trim()) return readings;
  const filter = authorFilter.toLowerCase();
  return readings.filter((r) => {
    const book = booksById.get(r.bookId) ?? UNKNOWN_BOOK;
    return book.author.toLowerCase().includes(filter);
  });
}, [readings, authorFilter, booksById]);
```

### 6d: Update BookCard / BookRow rendering

Currently BookList passes `reading.bookTitle` and `reading.bookAuthor` as props to `BookCard` and `BookRow`. Change these to look up the book:

```tsx
const book = booksById.get(reading.bookId) ?? UNKNOWN_BOOK;
<BookCard
  bookTitle={book.title}
  bookAuthor={book.author}
  tiles={reading.tiles}
  ...
/>
```

Same for `BookRow`.

### 6e: Update the edit flow

When opening the edit modal, the form needs to be pre-populated with the book's title and author. Currently:

```ts
initialData={{
  title: selectedReading.bookTitle,
  author: selectedReading.bookAuthor,
  tiles: selectedReading.tiles ?? [],
  isFreebie: selectedReading.isFreebie ?? false,
}}
```

Change to:

```ts
const selectedBook = selectedReading
  ? booksById.get(selectedReading.bookId) ?? UNKNOWN_BOOK
  : UNKNOWN_BOOK;

// then in the JSX:
initialData={{
  title: selectedBook.title,
  author: selectedBook.author,
  tiles: selectedReading.tiles ?? [],
  isFreebie: selectedReading.isFreebie ?? false,
}}
```

### 6f: Update the `handleEdit` function

Currently:

```ts
await updateReading(userId, selectedReading.id, data.title, data.author, data.tiles, data.isFreebie);
```

Change to the two-step pattern:

```ts
const bookId = await getOrCreateBook(data.title, data.author, userId);
await updateReading(userId, selectedReading.id, bookId, data.tiles, data.isFreebie);
```

Import `getOrCreateBook` from `../lib/books`.

**Why `getOrCreateBook` on edit?** If the user changes the title from "The Hobbit" to "The Lord of the Rings", that's a different book. The old book doc stays (other users might reference it). The reading now points to a new or existing book doc for "The Lord of the Rings".

### 6g: Update the delete confirmation message

Currently: `"Are you sure you want to delete "${selectedReading?.bookTitle}"?"`

Change to use the book lookup:

```ts
const deleteBookTitle = selectedReading
  ? (booksById.get(selectedReading.bookId) ?? UNKNOWN_BOOK).title
  : '';
```

Then: `"Are you sure you want to delete "${deleteBookTitle}"?"`

**Verify:** At this point, `BookList` should compile. The `BookCard` and `BookRow` components don't need internal changes — they already accept `bookTitle` and `bookAuthor` as props. You've just changed where those values come from.

---

## Step 7: Update the Tests

**Goal:** Make existing tests pass with the new data shape, and add a test for the new `useBooks` hook.

### 7a: Update `useReadings.test.ts`

**File:** `app/web/src/hooks/useReadings.test.ts`

The test creates mock Firestore snapshots with `bookTitle` and `bookAuthor` fields. Since readings no longer have these fields, update the mock data to use `bookId` instead:

```ts
const snapshot = makeSnapshot([
  {
    bookId: 'book-1',
    tiles: ['sci-fi'],
    isFreebie: false,
    readAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
  },
]);
```

Update the assertion that checks `bookTitle`:

```ts
// Old:
expect(result.current.readings[0].bookTitle).toBe('The Left Hand of Darkness');

// New:
expect(result.current.readings[0].bookId).toBe('book-1');
```

### 7b: Add `useBooks.test.ts`

**File:** `app/web/src/hooks/useBooks.test.ts` (new file)

Follow the exact same mock pattern as `useReadings.test.ts`:

1. Mock `firebase`, `firebase/firestore`, `react-firebase-hooks/firestore`, and `@bookbingo/lib-util`
2. Use the same `makeSnapshot` helper
3. Test three scenarios:
   - Returns loading state while Firestore is loading
   - Maps Firestore snapshot to `booksById` Map with correct keys and values
   - Returns error when Firestore listener errors

The snapshot mock data should match the `Book` shape:

```ts
makeSnapshot([
  {
    title: 'The Left Hand of Darkness',
    author: 'Ursula K. Le Guin',
    titleLower: 'the left hand of darkness',
    authorLower: 'ursula k. le guin',
    createdBy: 'user-1',
    createdAt: new Date('2026-01-01'),
  },
]);
```

Then verify:

```ts
expect(result.current.booksById.get('doc-0')?.title).toBe('The Left Hand of Darkness');
```

**Verify:**

```bash
pnpm test
```

All tests should pass. If they don't, read the error messages carefully — they'll tell you exactly which field is missing or mistyped.

---

## Step 8: Full Verification and Commit

**Run the complete verification chain:**

```bash
pnpm run lint && pnpm test && pnpm run typecheck
```

**If typecheck fails:** The most common issues will be:

1. **Missing `booksById` prop** — If you forgot to pass it somewhere a page renders `BookList`, you'll get a "property is missing" error. Check `MyBooksPage` and `UserBooksPage`.
2. **Wrong argument count** — If you missed updating a `createReading` or `updateReading` call site, you'll get an argument count mismatch.
3. **Import errors** — If you forgot to export `Book` from `types/index.ts` or `getOrCreateBook` from `books.ts`.

**If lint fails:** Check for any `console.error` or `console.log` that crept in. Use `log.error` from `@bookbingo/lib-util` instead.

**Commit strategy:**

You can structure this as one or two commits:

- **Option A (single commit):** One commit with all the changes. Message:
  ```
  feat: wire app layer to enriched book model
  ```

- **Option B (two commits):** Split the data layer from the display layer:
  ```
  feat: add book CRUD and useBooks hook
  feat: update display layer to join readings with books
  ```

Option B is cleaner for review, but both are fine. What matters is that each commit leaves the codebase in a working state.

**Push and open PR:**

```bash
git push -u origin feat/enriched-book-model
gh pr create --title "feat: wire app layer to enriched book model" --base refactor/replace-userbook-with-scoring-input
```

In the PR description, note that this stacks on PR #54 and that a migration script for existing data is a follow-up.

---

## What You're Not Doing (and Why)

- **No migration script yet.** Existing readings in Firestore still have `bookTitle`/`bookAuthor` and no `bookId`. The "Unknown Book" fallback handles this gracefully. Migration is a separate task that can happen after this code is deployed.

- **No `metadata` or `externalId` on books.** Those fields are for Phase 3 (Google Books search). The local `Book` type is intentionally minimal — it only has fields you actually populate.

- **No Community Library page.** That's Phase 2. But after this PR, the `/books/` collection exists and `useBooks()` is ready for that page to consume.

- **No changes to the scoring engine or LeaderboardPage.** Scoring only cares about `tiles` and `isFreebie`, which still live on `Reading`. The `ScoringInput` refactor from PR #54 pays off here.

---

## Concepts This Step Exercises

If you're using this for learning, here's what you're practicing:

- **Firestore data modeling** — Normalizing from denormalized fields to a shared collection with references. This is the core Firestore design trade-off: reads vs. writes, consistency vs. convenience.

- **Compound queries and indexing** — The `getOrCreateBook` query on two fields requires understanding how Firestore indexes work and why they need to be explicitly declared.

- **React data flow** — Lifting the books lookup to the page level and threading it down via props. You're making a conscious choice to use props over context — understand why that's simpler here.

- **TypeScript structural typing** — The `ScoringInput` interface trick: `Reading` satisfies `ScoringInput` because it has `tiles` and `isFreebie`, even though it's not explicitly declared as implementing it. This is TypeScript's structural type system at work.

- **Backward compatibility** — The "Unknown Book" fallback is a real-world pattern. Production systems almost always need to handle data from before and after a migration. Think about how you'd remove this fallback once migration is complete.

- **Function composition** — The two-step `getOrCreateBook → createReading` pattern. Each function does one thing. The page handler composes them. This is more testable and reusable than a single `createReadingWithBook` function.
