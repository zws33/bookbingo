# Community Library Implementation Plan

## Objective

Implement Phase 2 of the Book Enrichment Plan: a "Community Library" page (`/library`). This page will provide a shared, deduplicated view of all books read by the club, displaying read counts, the specific users who read each book, and the aggregated bingo tiles they assigned.

## 1. Data Strategy

The feature will use an **eager join** on the client side, relying on existing React hooks.

- **Data Sources**:
  - `useBooks()`: Fetches the deduplicated `/books/` collection.
  - `useAllReadings()`: Fetches all readings across all users.
  - `useUsers()`: Fetches all user profiles.
- **Transformation Logic** (inside a `useMemo`):
  1. Iterate over all users and their associated readings.
  2. For each user, get their readings from `readingsByUser`.
  3. For each reading, look up the book using `booksById`.
  4. Group these readings by `bookId`.
  5. For each book, calculate the total `readCount` and an array of `uniqueTiles` (all distinct bingo tags assigned by the club).
  6. Build a list of specific readers (user profile + their specific reading/tiles) for each book.

## 2. UI / UX Design

The library will live at `/library` and follow the clean aesthetic of the existing Leaderboard.

- **Main List**: A responsive flex list (not a table) displaying book Title, Author, Readers, and Tile pills, sorted alphabetically.
- **Read count badge**: "N readers" per book row (iteration 2+).
- **Tile pills**: Aggregated unique tiles across all readers (iteration 2+).
- **Reader Expansion**: Clicking a book row reveals who read it with their specific tiles (iteration 3).
- **Search & Filtering**: Text input to filter by title or author (iteration 4).
- **Sort toggle**: Switch between alphabetical, read count, and date added (iteration 5).

### Responsive layout

The list uses a flex column-to-row layout, not a `<table>`. On mobile (default), each row stacks vertically. On `sm:` and wider, all elements appear on a single line.

```
Mobile:
  The Great Gatsby
  F. Scott Fitzgerald
  2 readers
  [Novel] [Classic] [Historical]

Desktop (sm:+):
  The Great Gatsby  F. Scott Fitzgerald       2 readers   [Novel] [Classic]
```

## 3. Implementation Phases

Each phase ships as a self-contained iteration, building on the previous one.

| Iteration | Scope |
| --------- | ----- |
| 1 | **Scaffold + flat book list** — create `LibraryPage.tsx`, add `/library` route and nav tab in `App.tsx`, render a flat alphabetical list of all books from `useBooks()` |
| 2 | **Data join** — wire in `useAllReadings()` + `useUsers()`; add "N readers" badge and aggregated tile pills per book row |
| 3 | **Detail expansion** — click a book row to reveal per-reader breakdown (avatar, name, their specific tiles) |
| 4 | **Search / filter** — title + author text filter using the existing `SearchFilter` component |
| 5 | **Sort toggle** — UI to switch between alphabetical, read count, and date added |

---

## UI Primitives

A shared UI primitives library was introduced in PR #72. Use these components instead of raw Tailwind where applicable:

| Primitive | Location | Use for |
|-----------|----------|---------|
| `Button` | `app/web/src/components/ui/Button.tsx` | Row expand toggle (iteration 3), any interactive buttons |
| `Input` | `app/web/src/components/ui/Input.tsx` | Already used inside `SearchFilter` (iteration 4) |
| `Label` | `app/web/src/components/ui/Label.tsx` | Form labels if needed |
| `cn()` | `app/web/src/lib/cn.ts` | Composing conditional Tailwind classes |

**Iteration 1** uses none of these — the table rows are not interactive yet. **Iteration 3** (row expansion) should use `Button` with `variant="ghost"` for the expand toggle rather than a raw `<button>`.

---

## Iteration 1 — Detailed Implementation

### Files changed

| File | Action |
|------|--------|
| `app/web/src/pages/LibraryPage.tsx` | Create |
| `app/web/src/App.tsx` | Edit — import, nav tab, route |

### `LibraryPage.tsx`

**Imports**

```ts
import { useMemo } from 'react';
import { useBooks } from '../hooks/useBooks';
```

`useBooks()` is the only data dependency in iteration 1. No other hooks needed.

**Data transformation**

`useBooks()` returns `booksById: Map<string, Book>`. Convert to a sorted array:

```ts
const books = useMemo(
  () => [...booksById.values()].sort((a, b) => a.title.localeCompare(b.title)),
  [booksById],
);
```

**Loading / error / empty states** — match `LeaderboardPage.tsx` exactly:

```tsx
if (loading) {
  return <div className="text-center py-8 text-gray-500">Loading...</div>;
}

if (error) {
  return (
    <div className="text-center py-8 text-red-500">Error: {error.message}</div>
  );
}

if (books.length === 0) {
  return (
    <div className="text-center py-8 text-gray-500">
      No books in the library yet.
    </div>
  );
}
```

**Table render** — two columns, same structure as `LeaderboardPage`:

```tsx
return (
  <div className="bg-white rounded-lg shadow overflow-hidden">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-left text-gray-500 text-xs uppercase tracking-wide">
          <th className="px-4 py-3">Title</th>
          <th className="px-4 py-3">Author</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {books.map((book) => (
          <tr key={book.id} className="hover:bg-gray-50 transition-colors">
            <td className="px-4 py-3 font-medium text-gray-900">{book.title}</td>
            <td className="px-4 py-3 text-gray-600">{book.author}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
```

**Component signature**

```ts
export function LibraryPage(): JSX.Element
```

No props — all data comes from hooks.

### `App.tsx` changes

**1. Import** (with other page imports, ~line 11):

```ts
import { LibraryPage } from './pages/LibraryPage';
```

**2. Nav tab** (after the Leaderboard `NavLink`, ~line 126):

```tsx
<NavLink
  to="/library"
  className={({ isActive }) =>
    `pb-2 text-sm font-medium ${isActive ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`
  }
>
  Library
</NavLink>
```

**3. Route** (inside `<Routes>`, after the leaderboard route, ~line 135):

```tsx
<Route path="/library" element={<LibraryPage />} />
```

### Verification

```bash
pnpm run verify      # lint + typecheck + tests must all pass
pnpm run dev:local   # emulator + dev server
```

Manual checks:
- "Library" tab appears in nav and highlights when active
- Book list renders alphabetically by title
- Loading state shows during initial Firestore fetch
- Empty state shows if `/books/` collection is empty
- No console errors

---

## Iteration 2 — Detailed Implementation

### Objective

Enrich each row in the library table with:
- **N readers** — how many distinct users have a reading for that book
- **Tile pills** — all unique bingo tiles assigned to that book across all readers

### Hooks used

| Hook | Returns | Needed for |
|------|---------|-----------|
| `useBooks()` | `booksById: Map<string, Book>` | Book metadata (title, author) |
| `useAllReadings()` | `readingsByUser: Map<string, Reading[]>` | Read count + tile aggregation |

`useUsers()` is **deferred to Iteration 3** — user profiles are only needed for the per-reader detail expansion. Fetching them in Iteration 2 would be unnecessary Firestore reads.

### New type

Add a local `BookSummary` interface inside `LibraryPage.tsx` (not exported — it's only used here):

```ts
interface BookSummary {
  book: Book;
  readCount: number;
  uniqueTiles: string[];
}
```

### Data join (`useMemo`)

Replace the Iteration 1 `useMemo` (which only sorted books) with a join that also aggregates readings:

```ts
const bookSummaries = useMemo((): BookSummary[] => {
  // Pass 1: group readings by bookId, counting readers and collecting tiles
  const byBook = new Map<string, { readCount: number; tiles: Set<string> }>();

  for (const readings of readingsByUser.values()) {
    for (const reading of readings) {
      if (!reading.bookId) continue; // guard against legacy data with missing bookId
      const entry = byBook.get(reading.bookId);
      if (entry) {
        entry.readCount += 1;
        reading.tiles.forEach((t) => entry.tiles.add(t));
      } else {
        byBook.set(reading.bookId, {
          readCount: 1,
          tiles: new Set(reading.tiles),
        });
      }
    }
  }

  // Pass 2: map booksById into sorted BookSummary array
  return [...booksById.values()]
    .map((book) => {
      const stats = byBook.get(book.id);
      return {
        book,
        readCount: stats?.readCount ?? 0,
        uniqueTiles: stats ? [...stats.tiles] : [],
      };
    })
    .sort((a, b) => a.book.title.localeCompare(b.book.title));
}, [booksById, readingsByUser]);
```

**Why two passes?** The first pass builds an intermediate index keyed by `bookId`. This avoids an O(n²) nested loop when joining books with readings — each reading is visited once regardless of how many books there are.

### Combined loading and error state

Both hooks must resolve before rendering data. Replace the existing `loading`/`error` checks:

```ts
const { booksById, loading: booksLoading, error: booksError } = useBooks();
const { readingsByUser, loading: readingsLoading, error: readingsError } = useAllReadings();

const loading = booksLoading || readingsLoading;
const error = booksError ?? readingsError;
```

The existing `if (loading)` and `if (error)` guards remain unchanged.

### Updated imports

```ts
import { useMemo } from 'react';
import { getTileById } from '@bookbingo/lib-core';
import { useBooks } from '../hooks/useBooks';
import { useAllReadings } from '../hooks/useAllReadings';
import { Book } from '../types';
```

### UI changes

The table gains two new columns. Updated `<thead>`:

```tsx
<tr className="border-b border-gray-200 text-left text-gray-500 text-xs uppercase tracking-wide">
  <th className="px-4 py-3">Title</th>
  <th className="px-4 py-3">Author</th>
  <th className="px-4 py-3">Readers</th>
  <th className="px-4 py-3">Tiles</th>
</tr>
```

Updated `<tbody>` row — iterate `bookSummaries` instead of `books`:

```tsx
{bookSummaries.map(({ book, readCount, uniqueTiles }) => (
  <tr key={book.id} className="hover:bg-gray-50 transition-colors">
    <td className="px-4 py-3 font-medium text-gray-900">{book.title}</td>
    <td className="px-4 py-3 text-gray-600">{book.author}</td>
    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
      {readCount > 0
        ? `${readCount} ${readCount === 1 ? 'reader' : 'readers'}`
        : '—'}
    </td>
    <td className="px-4 py-3">
      <div className="flex flex-wrap gap-1">
        {uniqueTiles.map((tile) => {
          const name = getTileById(tile)?.name ?? tile;
          return (
            <span
              key={tile}
              title={name}
              className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded"
            >
              {name}
            </span>
          );
        })}
      </div>
    </td>
  </tr>
))}
```

Tile pill style matches `BookCard.tsx` exactly: `bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded`. Display name resolved via `getTileById(tile)?.name ?? tile` — same fallback pattern used in `BookCard` and `BookRow`.

### Files changed

| File | Action |
|------|--------|
| `app/web/src/pages/LibraryPage.tsx` | Edit — new hook, useMemo join, two new table columns |

No other files change in this iteration.

### Test scenarios

These are manual verification scenarios (no new unit tests — the join logic is thin transformation code that lives entirely in a `useMemo`, and the existing hook-level tests cover data fetching):

| Scenario | Expected result |
|----------|----------------|
| Book with no readings | Shows `—` in Readers column, empty Tiles column |
| Book with 1 reading, 2 tiles | Shows `1 reader`, 2 tile pills |
| Book with 3 readings, all same tile | Shows `3 readers`, 1 deduplicated tile pill |
| Book with 3 readings, mixed tiles | Shows `3 readers`, union of all unique tiles |
| Reading with empty `tiles` array | No tile pills for that reading's contribution; reader still counted |
| Reading with missing `bookId` | Skipped — does not crash, does not appear in any book's count |
| Readings loading while books done | Loading state held until readings resolve |
| Books error | Error state shown, readings hook not waited on |
| Empty `/books/` collection | "No books in the library yet." (unchanged from Iteration 1) |

### Verification

```bash
pnpm run verify      # lint + typecheck + tests
pnpm run dev:local   # emulator + dev server
```

Manual checks:
- "Readers" and "Tiles" columns appear in the table header
- Books with no readings show `—` and no tile pills
- Read counts match the number of entries in Firestore for that book
- Tile pills use human-readable names, not raw IDs
- Duplicate tiles across readers appear only once
- No console errors

---

## UI Refactor — Responsive List Layout

### Objective

Replace the `<table>` layout with a responsive flex list. On mobile the row stacks vertically (title → author → readers → tile pills). On `sm:` and wider, all elements appear on a single horizontal line.

### Files changed

| File | Action |
|------|--------|
| `app/web/src/pages/LibraryPage.tsx` | Edit — replace `<table>` with `<div>` list rows |

### Row structure

The outer container changes from `<table>` / `<tbody>` to a plain `<div className="divide-y divide-gray-100">`. No `<thead>` — the layout is self-labelling.

Each row:

```tsx
<div
  key={book.id}
  className="px-4 py-3 hover:bg-gray-50 transition-colors"
>
  <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">

    {/* Title + author block — always stacked within */}
    <div className="flex-1 min-w-0">
      <p className="font-medium text-gray-900">{book.title}</p>
      <p className="text-sm text-gray-600 mt-0.5">{book.author}</p>
    </div>

    {/* Readers count */}
    {readCount > 0 && (
      <span className="text-xs text-gray-500 whitespace-nowrap mt-1 sm:mt-0">
        {readCount} {readCount === 1 ? 'reader' : 'readers'}
      </span>
    )}

    {/* Tile pills — wrap freely */}
    {uniqueTiles.length > 0 && (
      <div className="flex flex-wrap gap-1 mt-1.5 sm:mt-0">
        {uniqueTiles.map((tile) => {
          const name = getTileById(tile)?.name ?? tile;
          return (
            <span
              key={tile}
              title={name}
              className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded"
            >
              {name}
            </span>
          );
        })}
      </div>
    )}

  </div>
</div>
```

### Full component return

```tsx
return (
  <div className="bg-white rounded-lg shadow overflow-hidden">
    <div className="divide-y divide-gray-100">
      {bookSummaries.map(({ book, readCount, uniqueTiles }) => (
        <div
          key={book.id}
          className="px-4 py-3 hover:bg-gray-50 transition-colors"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900">{book.title}</p>
              <p className="text-sm text-gray-600 mt-0.5">{book.author}</p>
            </div>
            {readCount > 0 && (
              <span className="text-xs text-gray-500 whitespace-nowrap mt-1 sm:mt-0">
                {readCount} {readCount === 1 ? 'reader' : 'readers'}
              </span>
            )}
            {uniqueTiles.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5 sm:mt-0">
                {uniqueTiles.map((tile) => {
                  const name = getTileById(tile)?.name ?? tile;
                  return (
                    <span
                      key={tile}
                      title={name}
                      className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded"
                    >
                      {name}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
);
```

### Layout rationale

- `flex-col` (default) stacks all children vertically on mobile.
- `sm:flex-row sm:items-center sm:gap-4` switches to a single horizontal line on wider viewports.
- `flex-1 min-w-0` on the title/author block allows text truncation without pushing readers or tile pills off-screen on narrow desktop viewports.
- `mt-1 sm:mt-0` and `mt-1.5 sm:mt-0` add vertical breathing room between stacked items on mobile while collapsing the margin on desktop.
- `whitespace-nowrap` on the readers count prevents it from breaking mid-word on intermediate screen widths.
- `flex-wrap gap-1` on the tiles container lets pills reflow to multiple lines if needed on any screen size.

### Test scenarios

| Scenario | Expected result |
|----------|----------------|
| Mobile viewport (~375px) | Title and author each on their own line; readers on next line; tile pills wrap below |
| Tablet viewport (~768px, `sm:` breakpoint) | Single horizontal row: title · author on left, readers and tiles on right |
| Book with no tiles | No tile pill section rendered; row still displays correctly |
| Book with no readers | Readers count not rendered; row still displays correctly |
| Book with many tiles (6+) | Pills wrap to a second line within the tile section; do not overflow the row |
| Long book title | Title truncates (`min-w-0` / text overflow) rather than pushing readers/tiles off-screen |
