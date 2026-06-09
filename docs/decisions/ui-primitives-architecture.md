# UI Primitives Architecture

**Status:** Active
**Date:** 2026-06-08

## Context

BookBingo's web app needs reusable UI building blocks of two kinds:

1. **Interactive widgets** with non-trivial accessibility requirements — dialogs, alert dialogs, toasts, toggle groups. The original hand-rolled `Modal.tsx`, `ConfirmDialog.tsx`, and `Toast.tsx` shared the same a11y gaps (no focus trap, no focus restoration, no scroll lock, no portal, manual Escape handling, a hardcoded `id="modal-title"` that collided across instances).
2. **Presentational fragments** that were copy-pasted across call sites — the tile badge pill (`BookCard` vs. `LibraryPage`), user avatar/initials, and page loading/error status.

Two planning efforts addressed these on the `refactor/ui-components` branch: the Radix migration audit (interactive widgets) and the UI component refactor (presentational dedup). Both are now complete and archived under `docs/archive/`. This record captures the durable decisions so they are not re-litigated.

## Decision

**One primitive layer, `app/web/src/components/ui/`, for both kinds of component**, re-exported through `components/ui/index.ts`.

- **Interactive widgets are thin wrappers over Radix headless primitives.** We depend on the unified `radix-ui` package (tree-shakeable) rather than individual `@radix-ui/react-*` packages. Current wrappers: `Dialog`, `AlertDialog`, `Toast` (`ToastItem`/`ToastViewport`), `ToggleGroup`, `Tooltip`, `Accordion`. Radix owns focus management, portalling, scroll lock, and ARIA; we own styling via `className` + `cn()` and `data-[state=…]` Tailwind variants.
- **Presentational fragments are plain React primitives in the same folder** — `TileBadge`, `Avatar`, `Spinner`, `Textarea`, alongside the pre-existing `Button`/`Input`/`Label`. They are not Radix-backed; they exist purely to give duplicated markup a single source of truth.
- **A two-layer split (`primitives/*` for Radix wrappers vs. `ui/*` for branded components) was explicitly rejected** as unnecessary indirection at this app's size. Revisit only if the layer grows past ~20 components or gains multiple external consumers.

`Button` accepts `ref` as a regular prop (React 19), not via `forwardRef`, so it composes with Radix `asChild`. The legacy `Input` `forwardRef` was intentionally left as-is — working code, no churn.

## Deviations From the Original Plans

Both archived plans were overridden during implementation. These were deliberate and are the current standard:

- **View toggle:** shipped as Radix `ToggleGroup` in `BookList`, **not** the minimal `aria-pressed` fix the audit recommended as "Option 1." Rationale: the toggle is the only multi-option control in the app and `ToggleGroup` gives roving-tabindex keyboard semantics for free.
- **Tile pill:** shipped as the `ui/TileBadge` primitive taking **Option A** (prop-based `variant` + `className`, so `BookCard` keeps `truncate` and `LibraryPage` opts into a `secondary` variant), **not** the `TilePill` component with truncation removed (Option B) that the refactor doc recommended. Rationale: the two call sites genuinely differ, and a `className` passthrough is cheaper than discovering at runtime that wrapping alone wasn't enough.
- **Scope grew** beyond the audit's "no additional primitives anticipated": `Accordion`, `Avatar`, `Tooltip`, `Spinner`, `Textarea`, `TileBadge` were all added (#32, #39).

## Tradeoffs

- Putting Radix-backed and plain primitives in one folder keeps imports uniform (`from '../components/ui'`) but blurs the "is this headless/accessible by construction?" distinction. Acceptable at current size; a `primitives/` split is the escape hatch if it stops being obvious.
- Depending on the unified `radix-ui` package means a single version to bump, but couples all primitives to one release cadence. Fine for a hobby project; tree-shaking keeps the bundle honest.
- Plain presentational primitives (`TileBadge`, `Avatar`) carry no a11y guarantees — that is intentional, but means a reviewer must not assume "it's in `ui/`" implies "it's accessible."

## When to Revisit

- **Split into `primitives/` + `ui/`** when the layer exceeds ~20 components or a second app/package consumes it.
- **Reconsider the unified `radix-ui` dependency** if bundle analysis shows the single-package version cadence forcing unwanted upgrades.
- See also [`animation-duration-ownership.md`](animation-duration-ownership.md), which records the narrower CSS/JS duration-coupling decision that came out of the Toast wrapper.
