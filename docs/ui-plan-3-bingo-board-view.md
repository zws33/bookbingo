# Plan 3: Bingo Board Grid View

**Depends on**: [Plan 1 — Human-Readable Tile Chips](./ui-plan-1-readable-tile-chips.md) (uses tile lookup utilities from `lib/core/tiles.ts`)

## Problem

The app is called "Book **Bingo**" but there is no bingo board visualization. Users see a flat list of books with tile tags, but they can't see the big picture: which tiles are covered, which are empty, and where to focus next. The bingo card metaphor — the core identity of the app — is missing from the UI.

## Goal

Add a bingo board view that displays all 49 tiles in a 7x7 grid. Each cell shows the tile name and a visual indicator of how many books are tagged with that tile. Users can tap a cell to see the books associated with that tile. This flips the perspective from book-centric to tile-centric — "which categories have I filled?" instead of "what tags does this book have?"

## Definition of Done

- A 7x7 bingo board grid is rendered showing all 49 tiles.
- Each cell displays a truncated tile name and a book count indicator (number or color intensity).
- Cells with 0 books are visually distinct (muted/gray) from cells with 1+ books (colored).
- Manual tiles (`m01`–`m06`) are visually distinguishable from auto tiles.
- Tapping/clicking a cell shows the list of books tagged with that tile (expandable detail or a popover/modal).
- The board view is accessible as a top-level view alongside the book list (tab or toggle in the app header/navigation).
- Responsive: usable on both desktop and mobile (scrollable grid or adapted layout on small screens).
- All verification checks pass.

## Current State

- No board/grid component exists anywhere in the app.
- `TILES` array in `lib/core/constants.ts` has 49 tiles in a flat array (t01–t43, m01–m06). There is no defined spatial layout (which tile goes in which cell of the 7x7 grid).
- Tile lookup utilities exist (from Plan 1) in `lib/core/tiles.ts`.
- `BookList` fetches readings from Firestore via `useCollection`. The board view will need access to the same readings data.
- The app has no routing or tab navigation — it's a single-page view with `BookList` as the main content area in `App.tsx`.

## Design Decisions

### Board Layout

The 49 tiles map to a 7x7 grid. The `TILES` array order in `constants.ts` defines the layout: tiles are placed left-to-right, top-to-bottom (t01 is top-left, t07 is end of row 1, t08 starts row 2, etc., with m01–m06 filling the last row plus one cell from row 7 alongside t43).

Layout by row:
```
Row 1: t01  t02  t03  t04  t05  t06  t07
Row 2: t08  t09  t10  t11  t12  t13  t14
Row 3: t15  t16  t17  t18  t19  t20  t21
Row 4: t22  t23  t24  t25  t26  t27  t28
Row 5: t29  t30  t31  t32  t33  t34  t35
Row 6: t36  t37  t38  t39  t40  t41  t42
Row 7: t43  m01  m02  m03  m04  m05  m06
```

No custom ordering or spatial arrangement logic is needed — just chunk the `TILES` array into rows of 7.

### Cell Design

Each cell shows:
- **Tile name**: Truncated to fit the cell. The cell is small, so aggressive truncation (~15–20 chars) is needed. Full name shown on hover/tap.
- **Book count badge**: A small number in the corner of the cell (e.g., "3") or omitted if 0.
- **Color intensity**: Cells are colored by coverage:
  - 0 books: `bg-gray-100 text-gray-400` (muted, uncovered).
  - 1 book: `bg-blue-100 text-blue-800` (lightly covered).
  - 2 books: `bg-blue-200 text-blue-900` (moderately covered).
  - 3+ books: `bg-blue-300 text-blue-900` (well covered).
  - Manual tiles use purple variants instead of blue.
- **Aspect ratio**: Cells should be roughly square. Use CSS `aspect-square` from Tailwind.

### Cell Interaction

Tapping a cell opens a small modal/dialog listing the books tagged with that tile. Reuse the existing `Modal` component. The modal shows:
- Tile full name as the title.
- List of books (title + author) tagged with this tile.
- "No books yet" message if empty.
- Each book row is clickable to open the edit modal (stretch goal — may defer to keep scope manageable).

### Navigation

Add a simple tab bar or segmented control to `App.tsx` to switch between "Books" (the book list with view toggle from Plan 2) and "Board" (the bingo grid). This is the app's first real navigation element.

- Two tabs: "My Books" and "Bingo Board".
- Render conditionally based on active tab.
- No client-side router needed — just local state.

### Responsive Strategy

- **Desktop (sm+)**: 7-column grid at natural size. Cells have enough room for truncated text.
- **Mobile (<sm)**: The 7x7 grid is too wide for a phone screen at readable cell sizes. Options:
  - Horizontally scrollable grid with `overflow-x-auto`. The board is a fixed-size artifact, so scrolling is natural.
  - Each cell can be a minimum of ~48px wide, so 7 columns = ~336px + gaps, which fits most phones in portrait. Text will be very small though.
  - Recommended approach: Use a fixed-width grid inside a horizontally scrollable container. On very small screens the user scrolls to see the rightmost columns. Add a visual hint (fade/shadow on the right edge) to indicate scrollability.

### Data Flow

The board view needs to compute a map of `tileId -> Reading[]`. This is derived from the same `readings` array that `BookList` uses.

- Extract the Firestore readings fetch into a shared custom hook (`useReadings(userId)`) so both `BookList` and `BingoBoard` can consume the same data without duplicate fetches.
- Compute the tile-to-readings map in the board component via `useMemo`.

## Implementation Steps

### Step 1: Extract readings data into a shared hook

**Files**: `app/web/src/hooks/useReadings.ts` (new), `app/web/src/components/BookList.tsx` (modified)

Create `useReadings(userId: string)` hook that returns `{ readings, loading, error }`. Move the Firestore `useCollection` logic from `BookList` into this hook.

Update `BookList` to consume `useReadings` instead of calling `useCollection` directly.

**Tests**: Verify the app still loads and displays books correctly (manual check — this is a refactor with no behavior change).

**Commit**: `refactor: extract useReadings hook from BookList`

### Step 2: Build the `BoardCell` component

**Files**: `app/web/src/components/BoardCell.tsx` (new)

Props:
```typescript
interface BoardCellProps {
  tile: Tile;
  bookCount: number;
  onClick: () => void;
}
```

Renders a single square cell with:
- Truncated tile name (use `getTileName`, truncate to ~18 chars).
- Book count badge in the top-right corner (hidden if 0).
- Background color based on count and tile type (blue for auto, purple for manual).
- `title` attribute with full tile name.
- Clickable with accessible attributes.

**Commit**: `feat: add BoardCell component for bingo grid`

### Step 3: Build the `BingoBoard` component

**Files**: `app/web/src/components/BingoBoard.tsx` (new)

This is the main board view component. Props:
```typescript
interface BingoBoardProps {
  readings: Reading[];
}
```

Logic:
- Compute `tileCounts: Map<string, Reading[]>` from readings via `useMemo`.
- Chunk `TILES` array into rows of 7.
- Render a 7x7 CSS grid of `BoardCell` components.
- Track `selectedTileId` state. When a cell is clicked, open a `Modal` showing books for that tile.
- The modal lists books by title + author. Shows "No books tagged with this tile yet." if empty.

Grid CSS:
```
grid grid-cols-7 gap-1
```

Wrap in a scrollable container for mobile:
```
overflow-x-auto
```

**Commit**: `feat: add BingoBoard grid component`

### Step 4: Add tab navigation to `App.tsx`

**Files**: `app/web/src/App.tsx`

Changes:
- Add state: `const [activeTab, setActiveTab] = useState<'books' | 'board'>('books');`
- Add a tab bar below the header, inside `<main>`:
  ```
  [My Books]  [Bingo Board]
  ```
  - Simple text buttons with underline/highlight for active tab.
  - Style: `border-b-2 border-blue-600` for active, `text-gray-500` for inactive.
- Conditionally render:
  - `'books'`: existing `BookList` + FAB button + add modal.
  - `'board'`: `BingoBoard` component, receiving readings from `useReadings`.
- Since `BingoBoard` needs readings and `BookList` now uses `useReadings` internally, call `useReadings` in `App.tsx` and pass readings down to both. Alternatively, both components can call `useReadings` independently — Firestore's `useCollection` with the same query reference will share the snapshot listener. Either approach works; passing down from `App` is cleaner.

**Commit**: `feat: add tab navigation with bingo board view`

### Step 5: Run verification and polish

**Commands**: `npm run lint && npm test && npm run typecheck && npm run format`

Polish items:
- Ensure the board looks reasonable at various viewport sizes.
- Verify cell colors and count badges render correctly.
- Verify clicking a cell shows the right books in the modal.

## Risks / Open Questions

- **Tile ordering**: This plan assumes the flat `TILES` array order is the intended board layout. If the book club has a specific board layout (e.g., a physical bingo card with specific tile positions), the ordering in `constants.ts` may need to be adjusted. Confirm with the user whether the current array order is the canonical board layout.
- **Performance**: Computing tile-to-readings map on every render is fine for the expected data size (tens to low hundreds of books). No optimization needed.
- **Mobile cell readability**: 7 columns on a small phone screen means very small cells. The text will be tiny. The horizontally scrollable approach is pragmatic but not ideal. A future enhancement could add a "tap to zoom" or a list-based alternative for mobile.
- **Scope creep**: This plan intentionally omits: clicking a book in the tile detail modal to edit it, drag-and-drop tile reordering, score display on the board, and bingo completion detection (full row/column). These are all natural follow-ups but not part of this plan.
- **Shared hook refactor**: Extracting `useReadings` changes `BookList`, which is already modified in Plan 2. If implementing all three plans sequentially, the refactor in Step 1 should be done carefully to preserve the view toggle and compact list changes from Plan 2.
