# Plan 1: Human-Readable Tile Chips on BookCard

## Problem

The `BookCard` component (`app/web/src/components/BookCard.tsx`) displays tile IDs (e.g., `t01`, `m02`) as blue chips. These IDs are meaningless to users — they don't know which tile category `t17` refers to without looking it up.

## Goal

Replace raw tile IDs with truncated human-readable tile names in the BookCard chips. A user glancing at a card should immediately understand what categories the book is tagged with.

## Definition of Done

- BookCard chips display truncated tile names instead of IDs.
- Full tile name is visible on hover (via `title` attribute).
- Manual tiles (`m01`–`m06`) are visually distinguished from auto tiles.
- No new components beyond a utility function for tile lookup.
- All existing tests pass; new unit tests cover the lookup utility.
- Verification chain passes: `npm run lint && npm test && npm run typecheck`.

## Current State

- `BookCard` receives a `Reading` object with `tiles: string[]` (array of IDs).
- `TILES` constant in `lib/core/constants.ts` has all 49 tiles with `{ id, name, isManual }`.
- `TileSelector` already imports `TILES` from `@core/constants` — same import path works in web app components.
- Tile names vary in length: short ("smut", 4 chars) to long ("Interactive/nonlinear book (nonlinear reading order not nonlinear storytelling order)", 82 chars).
- The web app already has path alias `@core/*` mapped to `../../lib/core/*` in `tsconfig.json`.

## Design Decisions

- **Truncation length**: 25 characters, with `…` appended when truncated. This balances readability with card space — most names fit or are recognizable when truncated (e.g., "anthropomorphic non-huma…").
- **Tooltip**: Use the native `title` attribute for full name on hover. No custom tooltip component needed — keeps it simple.
- **Manual tile distinction**: Manual tiles get a different color scheme (purple instead of blue) so users can visually distinguish "you verified this externally" tiles from standard ones.
- **Tile lookup utility**: Create a small utility in `lib/core/tiles.ts` that provides lookup-by-ID. This keeps the lookup logic in `lib/` (framework-agnostic) and testable independently.

## Implementation Steps

### Step 1: Create tile lookup utility in `lib/core/tiles.ts`

**Files**: `lib/core/tiles.ts` (new), `lib/core/tiles.test.ts` (new)

Create a utility module that provides:

```typescript
export function getTileById(id: string): Tile | undefined
export function getTileName(id: string): string  // returns name or id as fallback
export function isManualTile(id: string): boolean
```

Internally, build a `Map<string, Tile>` from the `TILES` array for O(1) lookup.

**Tests** (`lib/core/tiles.test.ts`):
- `getTileById` returns correct tile for known ID.
- `getTileById` returns `undefined` for unknown ID.
- `getTileName` returns name for known ID.
- `getTileName` returns the raw ID string as fallback for unknown ID.
- `isManualTile` returns `true` for `m01`–`m06`, `false` for `t01`–`t43`.

**Commit**: `feat: add tile lookup utility`

### Step 2: Update `BookCard` to display tile names

**Files**: `app/web/src/components/BookCard.tsx`

Changes:
- Import `getTileName` and `isManualTile` from `@core/tiles`.
- In the tile chip render, replace `{tile}` with `{truncate(getTileName(tile), 25)}`.
- Add a `title` attribute with the full tile name for hover.
- Apply different chip colors for manual vs. auto tiles:
  - Auto tiles: keep current `bg-blue-100 text-blue-800`.
  - Manual tiles: `bg-purple-100 text-purple-800`.
- Define a local `truncate` helper (inline, not worth extracting):
  ```typescript
  const truncate = (s: string, max: number) =>
    s.length > max ? s.slice(0, max) + '…' : s;
  ```

**Commit**: `feat: display human-readable tile names on book cards`

### Step 3: Run verification and clean up

**Commands**: `npm run lint && npm test && npm run typecheck`

Ensure everything passes. Format with `npm run format` if needed.

## Risks / Open Questions

- **None significant.** This is a low-risk, self-contained UI improvement. The tile data is static and already available.
- The `title` tooltip won't work on mobile (no hover). This is acceptable for now — the truncated name is still far better than a raw ID. A tap-to-expand pattern could be a future enhancement.
