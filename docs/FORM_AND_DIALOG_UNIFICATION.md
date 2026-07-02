# Engineering Design: Form & Dialog Unification

**Status:** Proposed — under review
**Author:** Zach Smith
**Date:** 2026-07-01
**Depends on:** [`decisions/tbr-reading-payload-unification.md`](decisions/tbr-reading-payload-unification.md)

---

## 1. Overview

Unify the book-entry experience across `MyBooksPage` and `ReadingListPage` behind (a) one dialog that hosts a multi-step flow, and (b) one form driven by two orthogonal axes. Implements the payload unification ADR on the UI/data-layer side.

**Goals:**
- One persistent `Dialog` hosts the search → details flow — no close/reopen, no animation-timed `setTimeout`.
- One `BookEntryForm` replaces `BookForm` + `TBRForm`, parameterized by identity mode × variant.
- TBR and Reading share the `ScoringInput` payload; promotion is a payload copy.
- Freebie validated at plan time (union scope).
- `notes` removed.

**Non-goals (this effort):**
- Projected-score preview on the TBR page (enabled by this work; built separately).
- Per-`(user, work)` durable notes.
- Merging TBR + readings into one collection (Model Y — explicitly rejected in the ADR).

---

## 2. Dialog as a multi-step container

**Problem.** Both pages go search → form via `setIsSearchOpen(false); setTimeout(() => setDialog(...), 200)`. The `200` matches `Dialog`'s `duration-200` exit fade — page logic is coupled to a CSS constant, and two Radix roots race on a timer to model one flow.

**Approach.** `Dialog` is already a dumb container. Give it a single **static, flow-level `title`** and drive its `children` from a step union so the dialog stays mounted across steps:

```ts
type DialogState =
  | { kind: 'search' }
  | { kind: 'details'; identity: Identity }   // from catalog OR manual
  | null;
```

`BookSearchModal` stops being a `Dialog` and becomes `BookSearch` (plain content). `<Dialog isOpen={dialog !== null}>` renders `BookSearch` or the form by `kind`. The `setTimeout` is deleted.

**Union naming & static title (implemented — do not "fix").** The pages use `DialogState` / `kind` (the existing convention already in `ReadingListPage`), **not** `EntryFlow` / `step` — this is a deliberate choice, revisit only if a generic wizard lands. Per-page unions also still carry the other open dialogs (`add`, `manual`, `edit`, `promote`, `delete`) rather than a single collapsed `details` step; collapsing those into `details` is deferred to the `BookEntryForm` phase (§7 step 2). The `title` is intentionally **one static string per page naming the whole flow** (e.g. "Add a Book", "Add to Reading List") — it is *not* derived per step, so it reads correctly over both the search step and the form step.

**Relation to `decisions/animation-duration-ownership.md`.** That ADR says: when a *second* component pairs a CSS transition with a lifecycle `setTimeout`, consolidate on `transitionend`/`animationend` rather than exporting another constant. This refactor does the better thing — it **removes** the second instance entirely by not unmounting between steps, so no timer/CSS coupling is introduced at all. No change to the Toast pattern; we just don't add to it.

**Scope of container decision.** A generic `<Wizard>` is rejected as premature for 2-step flows (YAGNI); the explicit `EntryFlow` union keeps a later promotion to a generic component mechanical. `AlertDialog` (delete confirmation) stays a separate primitive — confirmations are not flow steps.

---

## 3. Unified form — two axes

Replace `BookForm` + `TBRForm` with `BookEntryForm`:

- **Identity axis:** `identity: { mode: 'locked'; book } | { mode: 'editable'; initial }`. `locked` → read-only card; `editable` → title/author inputs. Editable only at manual creation (ADR decision 6).
- **Variant axis:** `variant: 'reading' | 'tbr'`. Both render `TileSelector`. `reading` and `tbr` **both** render `FreebieToggle` now (freebie is planned on TBR). `notes` is removed, so the variants differ only in labels/submit text and the data-layer call they feed — not in fields.

Payload emitted is `ScoringInput` (`{ tiles, isFreebie }`) plus, in `editable` mode, `{ title, author }`.

| Call site | identity | variant |
|---|---|---|
| MyBooks add (catalog) | locked | reading |
| MyBooks add (manual) | editable | reading |
| MyBooks/BookList edit | locked | reading |
| ReadingList add (catalog) | locked | tbr |
| ReadingList add (manual) | editable | tbr |
| ReadingList edit | locked | tbr |
| ReadingList promote | — (no form; payload copy) | — |

---

## 4. Data model & migration

**Type change (`lib/types`):**

```ts
export interface TBREntry {
  id: string;
  bookId: string;
  tiles: string[];        // was: plannedTiles
  isFreebie: boolean;     // new
  addedAt: Date;
  updatedAt?: Date;
  // notes removed
}
```

Optionally introduce a shared alias so the embedding is explicit: `Reading` and `TBREntry` both contain a `ScoringInput`.

**Firestore migration (`/users/*/tbr/*`):** rename `plannedTiles → tiles`, add `isFreebie: false` default, delete `notes`. Low volume. Two viable paths:

- **Backfill script** (follows the `scripts/migrate-*.ts` pattern; dry-run → staging → prod). Simplest given the small dataset. **Adopted.**
- **Parallel-change read shim** (read `tiles ?? plannedTiles`) to avoid a migration, backfill lazily. More code; only worth it if we want zero migration ops.

**Security rules:** unchanged (TBR stays private, readings stay world-readable).

---

## 5. Validation changes (`lib/core`)

- Freebie planned on TBR is validated with **union scope**: at TBR create/edit, validate `[...readings, ...tbrEntries]` through `validateFreebie`. This requires the TBR write path to see current readings + TBR (available via the page hooks).
- **Promotion re-validates**: plan-time validity can go stale, so `promoteTBREntry` checks freebie against current readings before committing.
- New `lib/core` tests: union-scope freebie (planned + read), stale-plan promotion rejection, tile-cap parity for freebie TBR entries.

---

## 6. Service layer (`app/web/src/lib`)

- `createTBREntry(userId, bookId, tiles, isFreebie)` — `notes` param removed, `isFreebie` added.
- `updateTBREntry(userId, tbrId, tiles, isFreebie)` — same.
- `promoteTBREntry(userId, tbrId, bookId)` — reads `tiles`/`isFreebie` from the entry rather than taking them as args; keeps the atomic batch.

---

## 7. Sequencing

The container and the model changes are separable. Recommended order (lowest-risk first):

1. **Container refactor** — persistent dialog + `BookSearch`, no behavior change to forms/data. Pure UI, reversible, deletes the `setTimeout`.
2. **`BookEntryForm`** — introduce the unified form, migrate call sites, retire `BookForm`/`TBRForm`.
3. **Model + migration** — type change, backfill script, service + validation changes, promotion simplification.

Each phase ships independently green (`pnpm run verify`).

---

## 8. Testing

- `lib/core`: freebie union scope, stale-plan promote rejection (node:test).
- `app/web`: `BookEntryForm` per axis combination; the search→details flow renders without unmount (Vitest) — closes the gap that the manual-add path currently has no automated coverage.
- Integration (emulator): `promoteTBREntry` payload copy; migration script idempotency.

---

## 9. File inventory

| File | Action |
|---|---|
| `lib/types/src/index.ts` | `TBREntry`: `plannedTiles→tiles`, `+isFreebie`, `−notes` |
| `lib/core/src/validation.ts` | union-scope freebie helper + tests |
| `app/web/src/lib/tbr.ts` | signature changes; promote reads payload |
| `app/web/src/components/BookEntryForm.tsx` | new — unified two-axis form |
| `app/web/src/components/BookSearch.tsx` | `BookSearchModal` → step content (renamed file + component) |
| `app/web/src/pages/ReadingListPage.tsx` | `DialogState` union; drop `kind:'manual'` |
| `app/web/src/pages/MyBooksPage.tsx` | adopt `DialogState` union (retire the dialog booleans) |
| `app/web/src/components/BookList.tsx` | edit uses `BookEntryForm` locked identity |
| `app/web/src/components/{BookForm,TBRForm}.tsx` | removed |
| `scripts/migrate-tbr-payload.ts` | new — backfill |
| `firestore.rules` | unchanged |

---

## 10. Out of scope / future

- **Projected score on TBR** — `getScoreBreakdown([...readings, ...tbr])`; the data now supports it.
- **Per-`(user, work)` notes** — durable annotation surviving promotion.
- **Model Y** (single collection + `status`) — revisit if lifecycle features multiply.
