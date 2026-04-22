# Radix UI Migration Audit

**Date:** 2026-04-22
**Branch:** `refactor/ui-components`
**Status:** Planning — no code changes made

---

## A. Executive Summary

BookBingo is a small React 19/Vite/Tailwind app with clean component architecture and a nascent `components/ui/` primitives layer. No Radix packages are currently installed. The codebase is well-positioned for incremental Radix adoption:

- `cn()` (clsx + tailwind-merge) is already the standard Radix + shadcn helper
- `components/ui/` is the right home for thin wrappers — the layer exists and is used consistently
- Components are not tightly coupled to DOM structure — migration is low-risk
- All interactive complexity is concentrated in three components: `Modal`, `ConfirmDialog`, and `Toast`

**Radix is a good fit.** The three active custom implementations share the same accessibility gaps (no portal, no focus trap, no focus restoration, no scroll lock), and Radix addresses all of them without requiring visual changes. The rest of the app uses native HTML elements that are already accessible and don't need replacement.

---

## B. UI Inventory

| Pattern | Current Implementation | Location | Pain Points | Recommended Primitive | Complexity | Priority |
|---|---|---|---|---|---|---|
| **Dialog** | Custom `Modal.tsx` | `BingoBoard`, `MyBooksPage`, `BookList` | No portal, no focus trap, no scroll lock, no focus restoration. Escape via `document.addEventListener` (not trapped in modal tree). `id="modal-title"` hardcoded — would collide if two modals mounted. | `@radix-ui/react-dialog` | Low | **P1** |
| **Alert Dialog** | Custom `ConfirmDialog.tsx` | `BookList` | Same gaps as `Modal.tsx`. Duplicates the entire pattern (Escape, backdrop, overlay) with no code sharing. | `@radix-ui/react-alert-dialog` | Low | **P1** |
| **Toast** | Custom `Toast.tsx` + `ToastContext.tsx` | Provider in `main.tsx`, consumed via `useToast()` | No portal (renders in React tree, not document body), single-item (no queue), no animation, no ARIA live region. Imperative API (`showSuccess(msg)`) is a mismatch for Radix's declarative model. | `@radix-ui/react-toast` | **Medium** | P2 |
| View toggle (cards/list) | Custom `<button>` elements | `BookList` | Missing `aria-pressed` state on toggle buttons. | `@radix-ui/react-toggle-group` | Low | P3 |
| Tile multi-select | Custom `<button>` elements | `TileSelector` | Missing `aria-pressed`. Multi-select pattern with search — not a natural Toggle Group target. | None recommended | — | **Skip** |
| Checkbox | Native `<input type="checkbox">` | `FreebieToggle` | None — native is accessible. | None needed | — | Skip |
| Form inputs | Custom wrappers | `ui/Input`, `ui/Label` | Already solid. `Input` has `forwardRef`. | None needed | — | Skip |
| Button | Custom `ui/Button` | Used widely | Missing `ref` forwarding and `asChild` support. Pattern improvement only — not a primitive replacement. | Ref/`asChild` upgrade | Low | P1 (prerequisite) |

**Pages with no new interactive patterns:** `LibraryPage` (read-only list), `LeaderboardPage` (static table), `UserBooksPage` (read-only `BookList`). All interactive work flows through `BookList`.

---

## C. Accessibility Audit

### Current gaps and Radix's remediation

**`Modal.tsx` and `ConfirmDialog.tsx`** share the same set of gaps:

| Gap | Current behavior | Radix fix |
|---|---|---|
| Focus trap | None — Tab can leave modal | `Dialog.Content` traps focus automatically |
| Focus restoration | None — focus stays wherever it lands on close | Radix restores focus to the trigger element |
| Body scroll lock | None — background scrolls while modal is open | `Dialog.Overlay` adds scroll lock |
| Portal | Renders in React tree | `Dialog.Portal` renders into `document.body` |
| Escape key | `document.addEventListener` at module level | Radix handles this natively |
| `id="modal-title"` collision | Hardcoded — breaks if two instances exist | `Dialog.Title` uses internal id management |

**`ConfirmDialog.tsx`** uses `role="alertdialog"` correctly. `@radix-ui/react-alert-dialog` preserves this semantics.

**`Toast.tsx`**:

| Gap | Current behavior | Radix fix |
|---|---|---|
| ARIA live region | `role="alert"` without controlled presentation | `Toast.Root` uses `role="status"` with correct live region |
| Portal | Renders inside React tree (may be clipped by stacking contexts) | `Toast.Viewport` renders in document root |
| Queue management | Single item, new toast replaces old silently | Radix supports multiple concurrent toasts |

**`BookList` view toggle**:
- The card/list toggle buttons have `aria-label` but no `aria-pressed`. Keyboard users cannot tell which view is active. This is a minor a11y gap; Toggle Group fixes it.

**`TileSelector`**:
- Toggle buttons lack `aria-pressed`. However, since this is a custom multi-select inside a scroll container, replacing it with Toggle Group would add complexity without net benefit. Adding `aria-pressed={isSelected}` to the existing buttons resolves the a11y gap directly.

**`FreebieToggle`**:
- Native `<input type="checkbox">` wrapped in `<label>` — no gaps.

**`BookRow`**:
- Uses `role="button"` with `tabIndex={0}` and `onKeyDown` Enter handler. Missing Space key handling (`keydown` Space on `role="button"` should also trigger). Low severity for this app.

---

## D. Styling and Composition Audit

### Compatibility assessment

The app uses Tailwind CSS v4. Radix primitives are headless — they ship zero CSS. The styling integration is done entirely through the `className` prop on each Radix subcomponent. **No conflicts with Tailwind v4.**

Radix uses `data-state` attributes for component state (e.g., `data-state="open"`, `data-state="closed"`) which enables CSS transitions via Tailwind v4's `data-[state=open]:` selectors. This is the idiomatic approach for animations.

### `className` forwarding

All Radix subcomponents accept `className` directly. The `cn()` utility already in place is the standard way to merge user-passed `className` with defaults.

### `ref` forwarding

- `Input` uses `forwardRef` — Radix's `asChild` pattern requires refs to work, and this is compatible. Note: `forwardRef` is deprecated in React 19 — `ref` is now a regular prop. Existing `Input` usage is stable (no churn needed), but new components including an upgraded `Button` should accept `ref` as a prop directly.
- `Button` lacks `ref` forwarding entirely. This must be fixed before using `asChild` composition with `Button`.
- `Label` is a simple wrapper with no ref concerns.

### `asChild` pattern

Radix's `asChild` prop merges behavior onto a child component instead of rendering its own DOM element. For example: `<Dialog.Close asChild><Button variant="ghost">Cancel</Button></Dialog.Close>`. This pattern requires the child to forward its `ref`. It's optional but preferred for semantic HTML and design-system consistency.

---

## E. Dependency Strategy

### Package strategy: unified `radix-ui` vs. individual `@radix-ui/react-*`

The Radix team's current recommendation (as of 2024+) is the unified `radix-ui` package, which is fully tree-shakeable — bundle size is determined by what you import, not what is installed. For a small project like BookBingo, the unified package is simpler to manage (single version, single install).

Either approach works. The audit recommends `radix-ui` for simplicity.

### Install sequence

**Phase 1 (now):**
```sh
pnpm --filter @bookbingo/web add radix-ui
```

This single package covers Dialog, AlertDialog, Toast, and ToggleGroup.

**Defer:** No additional Radix packages are anticipated. Don't install primitives you haven't committed to using. If Popover, Tooltip, or Select are needed in the future, they're all in the same `radix-ui` package.

---

## F. Target Architecture

### `primitives/*` vs. `ui/*`

The user prompt asked about a `primitives/*` layer for thin Radix wrappers and `ui/*` for branded app-level components. For BookBingo's size, **a two-layer architecture is unnecessary overhead**. The app has ~3 Radix-backed components. A separate `primitives/` folder would be correct for a design system with 20+ components and multiple consumers; here it's just indirection.

**Recommendation: keep everything in `components/ui/`.**

```
components/ui/
  Button.tsx       ← existing, add ref prop
  Input.tsx        ← existing, no changes
  Label.tsx        ← existing, no changes
  Dialog.tsx       ← new Radix Dialog wrapper
  AlertDialog.tsx  ← new Radix AlertDialog wrapper
  Toast.tsx        ← new Radix Toast wrapper (replaces root Toast.tsx)
  index.ts         ← re-exports all primitives
```

The existing `components/Modal.tsx` and `components/ConfirmDialog.tsx` will be deleted (or deprecated) once the `ui/Dialog` and `ui/AlertDialog` wrappers exist and all consumers are updated.

### Animation conventions

Radix state attributes drive CSS transitions. The pattern for Tailwind v4:

```tsx
// data-state="open" → fade in; data-state="closed" → fade out
<Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out ..." />
```

Use `tailwindcss-animate` if you want prebuilt keyframes, or define keyframes in your Tailwind config. For a hobby project, a simple `opacity` transition is sufficient.

### ARIA conventions

- `Dialog.Title` and `Dialog.Description` handle ARIA labeling — no manual `id` coordination needed.
- `AlertDialog` uses `role="alertdialog"` and requires a `Description` subcomponent (this is enforced by Radix for accessibility).

---

## G. Phased Migration Roadmap

### Phase 0 — Audit ✓
This document. No code changes.

---

### Phase 1 — Foundation: Dialog

**Goal:** Replace `Modal.tsx` with a Radix Dialog wrapper. Fix `Button` ref forwarding as a prerequisite.

**Prerequisites:**
- `radix-ui` installed
- `Button` accepts `ref` as a prop (React 19 pattern)

**Components to create/modify:**
- `components/ui/Dialog.tsx` — new Radix Dialog wrapper with `Root`, `Portal`, `Overlay`, `Content`, `Title`, `Close` exported as a compound component or as named sub-exports
- `components/Modal.tsx` — update to use `ui/Dialog`, or delete and update all 3 consumers directly
- `components/BingoBoard.tsx` — update Modal import
- `pages/MyBooksPage.tsx` — update Modal import
- `components/BookList.tsx` — update Modal import
- `components/Modal.test.tsx` — rewrite: assert behavior (Escape closes, focus returns to trigger) not DOM identity (`document.activeElement === modalElement` will change since Radix autofocuses first focusable child, not the dialog wrapper)

**Risks:**
- `Modal.test.tsx` test `document.activeElement` assertion will fail — it tests DOM identity not behavior. This is expected and the tests should be rewritten.
- `FeedbackModal` uses `Modal` — it will need updating too.

---

### Phase 2 — Alert Dialog

**Goal:** Replace `ConfirmDialog.tsx` with a Radix AlertDialog wrapper.

**Prerequisites:** Phase 1 complete (establishes the wrapper pattern to follow)

**Components to create/modify:**
- `components/ui/AlertDialog.tsx` — new Radix AlertDialog wrapper
- `components/ConfirmDialog.tsx` — delete once consumer updated
- `components/BookList.tsx` — update ConfirmDialog import

**Risks:** Low. `AlertDialog` from Radix matches `alertdialog` semantics exactly.

---

### Phase 3 — Toast

**Goal:** Replace the custom `Toast.tsx` + `ToastContext.tsx` with a Radix Toast wrapper that preserves the existing imperative `useToast()` API.

**Complexity: Medium.** This requires a pattern change:

The current `ToastContext` imperatively calls `setToast({...})` and `setTimeout`. Radix Toast is declarative — `<Toast.Root open={open}>`. To preserve `showSuccess(msg)` for all existing callers, the new `ToastContext` must:

1. Maintain a queue of `{ id, message, type, open }` objects in state
2. Render a `Toast.Root` for each item in the queue
3. Use `Toast.Viewport` (portaled) for the container
4. Remove items from the queue on `onOpenChange(false)`

The `useToast()` hook interface stays identical — this is an implementation change behind the API boundary.

**Components to create/modify:**
- `components/ui/Toast.tsx` — new Radix Toast wrapper (`Root`, `Viewport`, `Title`, `Close`)
- `lib/ToastContext.tsx` — rewrite internals to use Radix Toast
- `components/Toast.tsx` (root-level) — delete once replaced

**Risks:**
- Largest surface area of the three phases
- Queue logic needs to handle `setTimeout`-based auto-dismiss vs. Radix's `duration` prop
- Two toast items now have correct simultaneous display — test the edge case where multiple toasts queue (e.g., fast success + error)

---

### Phase 4 — View Toggle (deferred)

**Goal:** Add `aria-pressed` semantics to the card/list view toggle in `BookList`.

**Options:**
1. Simple: add `aria-pressed={viewMode === 'cards'}` / `aria-pressed={viewMode === 'list'}` to existing buttons — 2-line fix, no new dependency.
2. Radix `ToggleGroup`: replaces the two buttons with a proper toggle group component.

**Recommendation:** Do option 1 first (it's the right minimal fix). Defer Toggle Group unless you're adding more toggle patterns.

---

## H. Concrete First 10 Steps

1. Install `radix-ui`: `pnpm --filter @bookbingo/web add radix-ui`
2. Update `ui/Button.tsx` to accept `ref` as a prop (React 19 pattern — no `forwardRef`)
3. Create `components/ui/Dialog.tsx` wrapping Radix Dialog with the same prop API as current `Modal` (`isOpen`, `onClose`, `title`, `children`)
4. Update `FeedbackModal.tsx` to use `ui/Dialog` instead of `Modal`
5. Update `components/BingoBoard.tsx` to use `ui/Dialog`
6. Update `pages/MyBooksPage.tsx` to use `ui/Dialog`
7. Update `components/BookList.tsx` (edit modal) to use `ui/Dialog`
8. Rewrite `Modal.test.tsx` to assert behavior: Escape triggers `onClose`, focus returns to the trigger after close
9. Delete `components/Modal.tsx`
10. Create `components/ui/AlertDialog.tsx`, update `BookList.tsx` confirm dialog, delete `ConfirmDialog.tsx`

---

## I. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| `Modal.test.tsx` DOM identity assertions break | Medium | Expected — rewrite tests to assert behavior (Escape, focus restoration, open/close state). Radix autofocuses first focusable child, not the dialog wrapper. |
| `aria-labelledby` pattern changes | Low | Radix `Dialog.Title` handles ARIA labeling automatically. No manual `id` coordination needed. |
| Toast imperative API mismatch | Medium | Design `ToastContext` rewrite to preserve `showSuccess(msg)` / `showError(msg)` hook interface. Callers should not need to change. |
| Tailwind v4 + Radix compatibility | None | Radix is headless — no styling assumptions. `data-state` attributes work with Tailwind v4 variant selectors. |
| Over-migration | Low | Explicitly: do NOT replace `TileSelector` buttons with Toggle Group, do NOT add Radix Checkbox to `FreebieToggle`, do NOT add Radix primitives to read-only pages. |
| `Button.forwardRef` churn | Low | React 19 pattern: accept `ref` as a regular prop, not `forwardRef`. Don't update `Input` (leave legacy pattern, it's working). |
| Stacking context / portal order | Low | Radix portals into `document.body`. The `z-50` on `Toast`, `z-40` on `Modal`, `z-50` on `ConfirmDialog` will be managed by Radix's portal order — verify that toasts remain above dialogs visually. |
| FeedbackModal `SubmitEvent` type | None | This is a native DOM type and is unaffected by the modal migration. |
