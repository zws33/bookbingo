# Plan 2: Compact Book List View (Toggleable)

**Depends on**: [Plan 1 — Human-Readable Tile Chips](./ui-plan-1-readable-tile-chips.md) (uses `getTileName` and `isManualTile` from `lib/core/tiles.ts`)

## Problem

The current BookList shows full BookCards with tile chips for every entry. When a user has many books, this view is verbose — sometimes they just want to scan titles and authors quickly, with a lightweight indicator of tagging progress rather than specific tile names.

## Goal

Add a toggleable compact list view alongside the existing card grid. The compact view shows each book as a single row: title, author, and a small indicator of how many tiles are assigned (e.g., dot indicators or a count badge). The user can switch between "cards" and "list" views with a toggle control.

## Definition of Done

- A view toggle (icon buttons or segmented control) is visible above the book list.
- "Cards" view shows the existing BookCard grid (with readable tile chips from Plan 1).
- "List" view shows a compact single-column list with: title, author, tile count indicator.
- Clicking a row in list view opens the same edit modal as clicking a card.
- View preference persists during the session (state in `BookList`). No persistence across sessions needed yet.
- Freebie books have a subtle visual indicator in compact view (small star or label).
- All verification checks pass.

## Current State

- `BookList` (`app/web/src/components/BookList.tsx`) renders a `grid gap-4 sm:grid-cols-2` of `BookCard` components.
- `BookList` already manages state for filtering, selection, editing, and deletion.
- `BookCard` is a standalone component that receives `reading` and `onClick`.
- There is no view mode state or toggle UI.

## Design Decisions

- **Toggle location**: Below the `SearchFilter`, above the list content. Two small icon buttons (grid icon for cards, list icon for compact) with the active one highlighted.
- **Compact row component**: New `BookRow` component in `app/web/src/components/BookRow.tsx`. Keeps rendering logic separate from `BookCard`.
- **Tile count indicator**: Show colored dots — one per tile, up to 3. Uses the same blue/purple color scheme from Plan 1 (blue for auto tiles, purple for manual). If 0 tiles, show a subtle "no tags" dash. This gives a quick visual of "how tagged is this book" without text overhead.
- **Freebie indicator**: A small star icon or "(F)" label after the author name in compact view. Keeps it subtle.
- **No persistence**: View toggle is local React state. Persisting to localStorage is a future enhancement if users want it.

## Implementation Steps

### Step 1: Create the `BookRow` component

**Files**: `app/web/src/components/BookRow.tsx` (new)

```typescript
interface BookRowProps {
  reading: Reading;
  onClick: () => void;
}
```

Renders a single horizontal row:
```
[Title]                              [Author]        [● ● ●]
```

- Title: `font-medium text-gray-900 truncate`, takes most of the width.
- Author: `text-sm text-gray-500 truncate`, secondary.
- Tile dots: Small colored circles (6px–8px). One per assigned tile. Blue for auto tiles, purple for manual tiles (using `isManualTile` from `lib/core/tiles.ts`). Max display is practical (a freebie book could theoretically have many tiles — cap dot display at 5, show `+N` if more).
- Freebie: If `reading.isFreebie`, show a small star icon or text indicator.
- Full row is clickable with `hover:bg-gray-50` and same accessibility attributes as BookCard (`role="button"`, `tabIndex`, `onKeyDown`).
- Add `title` attribute on each dot with the tile name (from `getTileName`) for hover discovery.

**Commit**: `feat: add compact BookRow component`

### Step 2: Add view toggle to `BookList`

**Files**: `app/web/src/components/BookList.tsx`

Changes:
- Add state: `const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');`
- Add a `ViewToggle` inline element (two icon buttons) between `SearchFilter` and the list content:
  - Grid icon (2x2 squares) for card view.
  - List icon (horizontal lines) for list view.
  - Active mode gets `bg-blue-100 text-blue-600`, inactive gets `text-gray-400 hover:text-gray-600`.
  - Use simple inline SVGs (no icon library dependency). The icons are small and standard.
- Conditionally render based on `viewMode`:
  - `'cards'`: existing `<div className="grid gap-4 sm:grid-cols-2">` with `BookCard`.
  - `'list'`: `<div className="divide-y divide-gray-200 bg-white rounded-lg shadow">` with `BookRow`.
- Both views pass the same `onClick={() => setSelectedReading(reading)}` handler.

**Commit**: `feat: add toggleable compact list view for books`

### Step 3: Run verification and clean up

**Commands**: `npm run lint && npm test && npm run typecheck && npm run format`

## Risks / Open Questions

- **Freebie with many tiles**: A freebie book could have 10+ tiles. The dot indicator should cap at a reasonable number (5 dots + `+N` text). This prevents layout blowout in the compact row.
- **Mobile responsiveness**: The compact row should work well on narrow screens. Title and author can truncate; dots are small and fixed-width.
- **View toggle discoverability**: Two small icon buttons are standard but could be missed. Acceptable for now — the card view remains the default.
