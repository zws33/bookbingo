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

- **Main List**: A table displaying book Title and Author, sorted alphabetically.
- **Read count badge**: "N readers" per book row (iteration 2+).
- **Tile pills**: Aggregated unique tiles across all readers (iteration 2+).
- **Reader Expansion**: Clicking a book row reveals who read it with their specific tiles (iteration 3).
- **Search & Filtering**: Text input to filter by title or author (iteration 4).
- **Sort toggle**: Switch between alphabetical, read count, and date added (iteration 5).

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
