# Design Token System

**Status:** Active
**Date:** 2026-07-16

## Context

The web app hardcoded raw Tailwind palette utilities (`bg-blue-600`, `text-gray-800`,
`border-gray-200`) directly in components. That coupled every component to specific
palette values, made a consistent look hard to enforce, blocked theming/dark mode,
and left contrast decisions implicit. An agent-generated design reference
(`app/web/src/components/design-system/index.html`) proposed a semantic,
role-based token system (Material Design 3 flavored). See
[`DESIGN_SYSTEM_ADOPTION_PLAN.md`](../DESIGN_SYSTEM_ADOPTION_PLAN.md) for the full
evaluation of that reference and the phased adoption.

## Decision

**Adopt a semantic, role-based color token layer, expressed as Tailwind v4 `@theme`
CSS custom properties in `app/web/src/index.css`.** Components reference tokens by
*role* (`bg-primary`, `text-on-surface`, `border-outline-variant`), never raw
palette hues.

**Naming convention (MD3-derived):**

- **Color roles** come in pairs: a container/surface color and its `on-` foreground
  (`primary`/`on-primary`, `surface`/`on-surface`, `error`/`on-error`,
  `success`/`on-success`, `inverse-surface`/`inverse-on-surface`). The `on-` color is
  the accessible text/icon color to use *on top of* its base.
- **Surfaces use a tonal ramp** for elevation instead of relying on shadows:
  `surface`, `surface-container-{lowest,low,,high,highest}`. Higher = more elevated.
- **Neutrals share a warm undertone** to match the vellum (`#FBF9F8`) base — including
  `outline`/`outline-variant`, which were deliberately warm-shifted off the
  reference's cool/bluish values.
- **Type scale** uses named roles (`text-display-lg`, `text-headline-md`,
  `text-body-md`, `text-label-caps`) with size + paired line-height / tracking /
  weight. **Font family is a separate axis** (`font-display` serif, `font-body` sans)
  composed at the call site (`font-display text-headline-md`), not baked into the
  type role.

**Contrast is a token-selection constraint:** every `on-*`/base pair used for text
must clear WCAG AA. The primary ramp anchors on deep `#094CB2` (AAA on vellum).

## Reconciliation from the reference

The reference was a machine dump with contradictions; tokens were fixed on adoption,
not copied verbatim:

- Collapsed three conflicting blues into one ramp anchored on `#094CB2`.
- Warm-shifted `outline`/`outline-variant`/`on-surface-variant` off cool values.
- Pruned ~30 reference tokens to ~20 actually used; `borderRadius.full` override
  rejected (would break pill/circle semantics — `rounded-full` is a v4 built-in and
  is left untouched).
- Font families given real fallback stacks; `data-mono` (misnamed, mapped to Inter)
  dropped.

Two tokens were added **beyond** the reference during primitive refactoring:
`success`/`on-success` (the reference defined no success role; `Toast` needs one, and
the old `bg-green-500`+white was ~2:1 contrast) and `inverse-surface`/
`inverse-on-surface` (a Phase 1 over-prune — `Tooltip` genuinely uses a dark-on-light
chip).

## Tradeoffs

- **Token names become a de-facto contract** across components; renaming a role is a
  wide refactor. Accepted — the names are stable MD3 roles.
- **v4 CSS-first `@theme`** (not a JS `tailwind.config`) means tokens live in CSS and
  generate utilities automatically. This is the v4 idiom and matches the project's
  build; it does mean the reference's v3 JS config could not be reused directly.
- **State layers are approximated, not modeled.** Filled buttons hover via `/90`
  alpha on their own color; light/neutral controls hover by stepping the surface
  tonal ramp (`surface-container-high` → `-highest`). We did not implement MD3's
  formal 8%/12% state-layer overlays — unnecessary complexity at this size.
- **Dark mode is unlocked but not built.** Tokens make it a values-only change later;
  no component rework required.

## When to Revisit

- **Model state layers explicitly** if hover/press treatments start to look
  inconsistent across variants.
- **Add a `secondary`-brand usage** if a genuine secondary brand color emerges; today
  the "secondary" button is neutral and maps to the surface ramp, not
  `secondary-container`.
- See also [`ui-primitives-architecture.md`](ui-primitives-architecture.md) — the
  `components/ui/` layer these tokens were first applied to.
