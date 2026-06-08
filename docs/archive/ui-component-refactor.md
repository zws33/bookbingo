# UI Component Refactor — Task Reference

> **ARCHIVED — completed.** Every task below shipped, so the "🔲 Pending/Next/Blocked" statuses are stale. Note two deviations from this plan: (1) the `TilePill` extraction shipped as the `ui/TileBadge` primitive (Option **A**, prop-based `variant` + `className`), not the `TilePill` component / Option B recommended here; (2) `UserAvatar` (Task #3, "TBD") shipped as `ui/Avatar`. For the durable rationale see [`docs/decisions/ui-primitives-architecture.md`](../decisions/ui-primitives-architecture.md).

Tracking the extraction of repeated UI patterns into reusable components.
Branch: `refactor/ui-components`

---

## Task List

| # | Component | Issue | Status |
|---|-----------|-------|--------|
| 1 | `PageStatus` | #75 | ✅ Done |
| 2 | `TilePill` | #76 | 🔲 Next |
| 3 | `UserAvatar` | #77 | 🔲 Pending |
| 4 | Refactor `LeaderboardPage` | #78 | 🔲 Blocked on #75, #77 |
| 5 | Refactor `LibraryPage` | #79 | 🔲 Blocked on #75, #76 |

---

## Task #2 — Extract `TilePill` component (issue #76)

### Definition of Done

- `TilePill.tsx` exists and renders the pill (name resolution + styling)
- Both `BookCard` and `LibraryPage` import and use `<TilePill>` — no duplicated inline pill JSX remains
- `pnpm run verify` passes

### Background

Two components render tile ID badge pills with identical markup but minor differences:

**`BookCard.tsx`** — with truncation:
```tsx
{tiles.map((tile) => {
  const name = getTileById(tile)?.name ?? tile;
  return (
    <span
      key={tile}
      title={name}
      className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded min-w-0 max-w-full truncate"
    >
      {truncate(name, 25)}
    </span>
  );
})}
```

**`LibraryPage.tsx`** — without truncation:
```tsx
{uniqueTiles.map((tileId) => {
  const name = getTileById(tileId)?.name ?? tileId;
  return (
    <span
      key={tileId}
      title={name}
      className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded"
    >
      {name}
    </span>
  );
})}
```

**`BookRow.tsx`** — uses dots, not pills. Leave it alone.

### Design Decision: Truncation

The two call sites differ: `BookCard` truncates to 25 chars; `LibraryPage` does not.

**Option A** — Prop-based truncation: `<TilePill tileId={id} truncate />`

**Option B** — No truncation support. Remove it from `BookCard` and see if wrapping handles it naturally.

**Recommendation:** Start with Option B. The pill container already has `flex-wrap` — truncation may be unnecessary. Add it back only if text visibly overflows at runtime.

### Implementation Steps

1. Create `app/web/src/components/TilePill.tsx`
   - Accept `tileId: string`
   - Resolve name internally: `getTileById(tileId)?.name ?? tileId`
   - Render with `title={name}` and pill classes: `inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded`

2. Update `BookCard.tsx`
   - Import `TilePill`
   - Replace the inline `<span>` pill with `<TilePill key={tile} tileId={tile} />`
   - Remove the local `truncate` helper if it's no longer used

3. Update `LibraryPage.tsx`
   - Import `TilePill`
   - Replace the inline `<span>` pill with `<TilePill key={tileId} tileId={tileId} />`
   - Remove the `getTileById` import if no longer used directly

4. Run `pnpm run verify` — fix anything that breaks

5. Commit: `refactor: extract TilePill component`

---

## Task #3 — Extract `UserAvatar` component (issue #77)

> Details TBD — audit `LeaderboardPage.tsx` for the avatar/initials pattern before planning.

---

## Pair Programming Notes

- **User drives, assistant guides** — assistant does not implement unless asked
- Loading/error states (`PageStatus`) are infrastructure concerns — keep them generic
- Empty states are domain concerns — keep them inline in the page
- `BookRow.tsx` dot tiles are intentionally different from `BookCard.tsx` pills — do not unify them
