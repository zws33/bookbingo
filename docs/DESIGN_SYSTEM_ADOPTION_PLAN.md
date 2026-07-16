# Design System Adoption Plan

Status: **Proposed** · Created 2026-07-15

Evaluates the agent-generated design reference at
`app/web/src/components/design-system/index.html` and plans how (and how much) of
it to adopt into the live `app/web` codebase.

## TL;DR

The reference contributes one thing of real value: a **semantic, role-based design
token architecture** (Material Design 3 flavored) — `primary` / `on-primary` /
`surface` / `surface-container-*`, a named type scale, and tonal elevation. Our
project currently has **no token layer** and hardcodes raw Tailwind palette
utilities (`bg-blue-600`, `text-gray-800`) throughout. Adopting the *architecture*
is worthwhile.

The reference's specific *values* and *mechanism* should **not** be copied verbatim:
it targets Tailwind v3 via the Play CDN with a JS `tailwind.config`; we run
Tailwind v4 with CSS-first `@theme`. Its token dump has internal contradictions,
dead tokens, a destructive `borderRadius.full` override, fallback-less font stacks,
and an icon-font dependency. We translate the good ideas into v4 `@theme` and fix
the mistakes on the way in.

## Mechanism mismatch (read this first)

| | Reference (`index.html`) | Our project |
|---|---|---|
| Tailwind version | v3 (Play CDN) | v4 (`@tailwindcss/vite`) |
| Config location | `tailwind.config = {…}` JS object | `@theme { … }` in `src/index.css` |
| Token form | JS `theme.extend.colors` etc. | CSS custom properties `--color-*`, `--text-*`, `--font-*` |
| Utility generation | v3 config → utilities | v4 auto-generates utilities from `@theme` vars |

**Consequence:** the reference config cannot be dropped in. Every token is
*translated* from the JS object into `@theme` CSS variables. Example:

```css
/* reference (v3 JS):  colors: { primary: '#094cb2', 'on-primary': '#ffffff' } */
/* becomes (v4 CSS) in src/index.css: */
@theme {
  --color-primary: #094cb2;
  --color-on-primary: #ffffff;
}
/* Tailwind then generates bg-primary, text-primary, text-on-primary, etc. */
```

## Evaluation vs. 2026 best practice

### Strengths (adopt the idea)
- Semantic role-based color tokens with paired `on-*` foregrounds.
- A named type scale (`display-lg`, `headline-md`, `body-md`, `label-caps`) with
  explicit size / line-height / tracking / weight.
- Tonal elevation via `surface-container-*` shades rather than shadows alone —
  modern and a prerequisite for dark mode.
- A deliberate aesthetic ("Alexandria / editorial") rather than framework defaults.

### Weaknesses (do not copy)
- **Play CDN + v3 config** — not production tooling; confirms this is a mockup.
- **Contradictory color tokens** — `primary #094CB2` vs `primary-container #3366CC`
  vs `surface-tint #2259BF` vs a hardcoded `.sidebar-active #3366CC`: three+
  unreconciled blues. `outline-variant #C3C6D5` (bluish) clashes with warm-grey
  surfaces (`#EFEDED`). ~50% of tokens (`inverse-*`, `*-fixed-dim`, most
  `tertiary-*`) are defined but unused.
- **Destructive radius override** — `full: 0.75rem` breaks pill/circle semantics of
  `rounded-full`. Do not carry over.
- **Font tokens** — no fallback stacks (`['Noto Serif']` should end in `serif`);
  `data-mono` maps to Inter, not a mono face; conflates family with type role.
- **Light mode only** — `darkMode: 'class'` declared but no dark palette.
- **Mockup hacks** — `document.write` grid, global button click handler, hardcoded
  hex in `<style>` bypassing tokens.
- **Icon font via CDN** (Material Symbols) — prefer tree-shakeable SVG icons
  (e.g. `lucide-react`) in 2026.

## Alignment with our codebase

Where we are **ahead** of the reference:
- Accessible primitives via **Radix UI** (`Dialog`, `Tooltip`, `Accordion`, …).
  The reference has no accessibility layer. **Keep Radix.**
- Centralized primitives in `components/ui/` with `cn()` (clsx + tailwind-merge)
  and `Record<variant, string>` variant maps. This is the reason adoption is
  low-risk: refactor the primitives once, most of the app inherits the tokens.

Where we are **behind**:
- No semantic tokens — raw `blue-*` / `gray-*` utilities in `Button`, `TileBadge`,
  `BoardCell`, `BookCard`, etc.
- No type scale, no fonts, no dark mode.

### Adopt from the reference (change our project)
- The **token architecture**: role colors + `on-*` pairs in `@theme`.
- The **named type scale** (implemented with proper fallback stacks).
- **Tonal-elevation surfaces** (formalizes what `BoardCell` already approximates).

### Fix in the reference before adopting
- Translate to v4 `@theme`; do not use CDN/JS config.
- Reconcile to **one** coherent blue ramp; fix warm/cool undertone mismatch.
- Prune dead tokens to only what components use.
- Do **not** override `rounded-full`; add a separate small-radius token if wanted.
- Add font fallback stacks; separate "font family" from "type role."
- Verify WCAG contrast on every `surface` / `on-*` pair.
- Keep Radix; skip the Material Symbols icon font.

## Resolved decision (2026-07-15): Full editorial identity

Owner chose **Option A — full editorial identity**: Noto Serif headlines + Inter
body, hairline borders, small radii, warm vellum surfaces. Fonts and visual
treatments are therefore **first-class scope**, not deferred.

Two guardrails on this choice:

- **Self-host the fonts; do NOT use the Google Fonts CDN** the reference uses.
  Self-hosting avoids a render-blocking third-party request, keeps offline
  emulator dev (`dev:local`) working without network, and avoids per-visitor
  Google requests (privacy/GDPR). Commit `.woff2` files under `app/web/public/`
  (or via a font package) and point `--font-display` / `--font-body` at them.
- **"Editorial identity" = the visual language** (type, color, borders, radii,
  surfaces), **not** the reference's sidebar/nav layout ("The Curator"). Any
  navigation/layout restructure is a separate, larger decision — out of scope
  here unless explicitly taken on.

Note: token architecture (Phases 1–3) still lands first; it is the foundation the
editorial treatments sit on top of. The identity is applied via token *values*
(fonts, radii, surface hues), so the sequencing does not change — Phase 4 is now
committed rather than optional.

## Phased plan

### Phase 0 — Decide direction ✅
Resolved: full editorial identity (see above). Fonts + treatments are in scope.

### Phase 1 — Establish the token layer (no component changes)
- In `src/index.css` `@theme`, add reconciled color tokens (light values), the
  type scale (`--text-*` + `--font-*` with fallbacks), spacing, and radius tokens.
- Pruned set only — roughly: `primary`, `on-primary`, `primary-container`,
  `on-primary-container`, `secondary`, `on-secondary`, `surface`,
  `surface-container{,-low,-high,-highest}`, `on-surface`, `on-surface-variant`,
  `outline`, `outline-variant`, `error`, `on-error`.
- Tokens coexist with existing raw utilities; nothing breaks yet.
- Verify with `pnpm run dev:web` + a contrast check on `on-*` pairs.

### Phase 2 — Refactor primitives to tokens (contained blast radius) ✅
Done. All `components/ui/` primitives moved off raw palette utilities onto tokens:
`Button`, `TileBadge`, `ToggleGroup`, `Input`, `Textarea`, `Label`, `Avatar`,
`Tooltip`, `Accordion`, `AlertDialog`, `Dialog`, `Toast`. Only neutral `bg-black/50`
scrims and the white toast-close affordance retained (both intentional).

Two tokens added beyond Phase 1 (recorded in the ADR): `success`/`on-success`
(Toast; old `bg-green-500`+white was ~2:1) and `inverse-surface`/`inverse-on-surface`
(Tooltip; a Phase 1 over-prune). Hover convention: filled buttons darken via `/90`
alpha; neutral controls step the surface ramp (`-high` → `-highest`).

All 64 web tests pass untouched (role-based, not class-based); `pnpm run verify`
green; new token utilities confirmed generating via build. ADR:
[`decisions/design-token-system.md`](decisions/design-token-system.md).

### Phase 3 — Refactor feature components ✅
Done. All 21 feature components + `App.tsx` moved off raw palette utilities onto
tokens (~120 class occurrences). Highlights:
- `BoardCell` count ramp rebuilt as a **primary alpha ramp** (`bg-primary/10→/20→/30`,
  `text-on-primary-container`) since the token set has one `primary-container` tone,
  not three — preserves graded depth-by-count feedback. Empty cell →
  `surface-container-lowest`.
- Nav active/inactive, FABs, links, ScoreDisplay, cards, rows, lists, forms, pages
  all tokenized. Bulk applied via a boundary-aware script (scratch) to avoid
  token-prefix corruption (`bg-blue-50` ⊂ `bg-blue-500`) and state-variant precedence
  bugs; special cases hand-edited.
- **Intentional literals kept** (not brand-system colors): Google sign-in button
  brand hex (`#4285F4`…), freebie gold (`text-yellow-500`), staging banner amber.
- 64 web tests pass unchanged; `verify` green; alpha-ramp + hover utilities confirmed
  generating (`color-mix()` with hex fallback).

### Phase 4 — Editorial treatments (committed) + optional dark mode
- **Fonts (committed):** self-host Noto Serif + Inter; add `--font-display`
  (serif) / `--font-body` (sans) with fallback stacks (`… , serif` /
  `… , system-ui, sans-serif`). Preload the `.woff2`, set `font-display: swap`.
- **Radii (committed):** define small-radius tokens (`--radius-DEFAULT` ~2px,
  `--radius-lg` ~4px, `--radius-xl` ~8px). **Leave `rounded-full` untouched.**
- **Surfaces/borders (committed):** warm vellum surface values + hairline
  `outline-variant`; reconcile undertones (surfaces and outlines share a warm base).
- **Dark mode (optional, now cheap):** add dark values under
  `@media (prefers-color-scheme: dark)` or a `data-theme` selector; components
  already reference tokens.
- **Icons:** adopt `lucide-react` if icons are wanted (not the Material Symbols
  font the reference uses).

### Phase 5 — Retire the mockup + rewrite the catalog
- Delete `app/web/src/components/design-system/index.html`, or convert it into a
  living in-app reference route that renders real primitives (a lightweight
  Storybook substitute).
- **Rewrite `app/web/src/pages/CatalogPage.tsx` (the `/catalog` dev page).** It is
  hand-maintained documentation whose hardcoded swatch labels and
  `desc`/`note`/`MonoNote` strings still describe the pre-token palette
  (`bg-blue-600`, `gray-*`, `green-500`). **Deliberately deferred to a single
  rewrite here** (decision 2026-07-16) rather than patched each phase, because it
  also documents feature components (board-cell fills) and fonts that don't change
  until Phases 3–4 — patching per-phase would churn it three times. Do it once
  against the finished system. Strongly consider **deriving swatches from live CSS
  custom properties** (`getComputedStyle` on `--color-*`) so the page can't drift
  from the tokens again.

## Appendix A — Phase 1 token proposal (DRAFT, pending sign-off)

Reconciliation applied to the reference dump:
- **One blue ramp.** Anchored on deep Alexandria Blue `#094CB2`; container/on-container
  pulled from the dump's `primary-fixed`/`on-primary-fixed-variant`. Fixes the
  three-conflicting-blues problem. Contrast: white-on-primary 7.8:1 (AAA),
  on-container/container 7.3:1 (AAA), primary-as-link on vellum 7.4:1 (AAA).
- **Warm-shifted neutrals.** `outline`, `outline-variant`, `on-surface-variant`
  moved off the reference's cool/bluish values to a warm base matching the vellum
  surfaces (also resolves the token-vs-`.hairline-border` contradiction).
- **Pruned** ~30 tokens → ~20 (dropped `inverse-*`, `*-fixed*`, most `tertiary-*`,
  `surface-tint/dim/bright/variant`).
- **Radii** set editorial-tight; `rounded-full` is a v4 built-in and stays a pill.
- **Families** separated from type roles; real fallback stacks added.

Note: redefining `--radius-lg`→6px retroactively tightens existing `rounded-lg`
usages (Button, BookCard) — intentional, but a global change on landing.

The concrete `@theme` block lives in the working proposal (to be merged into
`app/web/src/index.css` alongside the existing accordion `@theme` vars once the
primary-blue anchor is confirmed).

### Resolved sub-decision (2026-07-15)
- **Primary blue anchor: deep `#094CB2`** (AAA contrast, editorial gravitas). The
  proposed `@theme` block above is final — ready to merge into `index.css` in Phase 1.

## Risks & notes
- **One-way-ish:** token *names* become a de-facto contract across components;
  renaming later is a wide refactor. Get the names right in Phase 1.
- **`rounded-full` trap:** never override it; use a distinct token for small radii.
- **Record this as an ADR** in `docs/decisions/` once Phase 1 lands (token naming
  convention + why MD3-style roles), per project convention.
