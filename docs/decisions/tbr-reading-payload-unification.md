# TBR / Reading Payload Unification

**Status:** Proposed — under review
**Date:** 2026-07-01

## Context

`TBREntry` and `Reading` were designed as structurally different records. `TBR_PLAN.md` (2026-06-03) deliberately gave `TBREntry` a `plannedTiles` field (vs. `Reading.tiles`), added an optional `notes` field, and **omitted `isFreebie`** ("committing it during the planning phase creates a false sense of finality"). In practice the two are the same scoreable unit at two lifecycle points, and the divergence produced accidental complexity that surfaced during the manual-entry bug fix (#47):

- `ReadingListPage` needs a *separate* `kind:'manual'` dialog + handler purely because `TBRForm` was display-only, while `MyBooksPage` handles prefilled + manual in one dialog because `BookForm` is always editable.
- Promotion (`promoteTBREntry`) re-collects `tiles` + `isFreebie` through a `BookForm`, because the TBR entry doesn't carry them — even though the user already planned the tiles.
- `notes` is captured on TBR but **dropped on promotion** and never rendered on a `Reading`, so it can only ever describe the plan, never the book or the reading.

The trigger question — "should `tiles` and `plannedTiles` be one field?" — resolves to a deeper one: the tense ("planned") encodes *completion status*, not a different type. TBR and Reading are the same unit before and after the book is read.

## Decision

**A TBR entry and a Reading embed the same scoring payload — `ScoringInput` (`{ tiles: string[]; isFreebie: boolean }`) — wrapped in collection-specific envelopes.**

1. **Shared payload.** Both records embed `{ tiles, isFreebie }`. `TBREntry.plannedTiles` is renamed to `tiles`; `isFreebie` is added to `TBREntry`. The type these share is exactly `ScoringInput` (already defined in `lib/types`, already consumed by `scoring.ts` and `validation.ts`) — this is not a new abstraction.

2. **Two collections retained (Model X), not merged under a status flag (Model Y).** `/users/*/tbr` and `/users/*/readings` stay separate; each wraps the shared payload with its own envelope (`addedAt` vs `readAt` + `createdAt`). We reject collapsing them into one collection with `status: 'planned' | 'read'` — see Options.

3. **Promotion becomes a payload copy.** Because a TBR entry already *is* a valid `ScoringInput`, "Mark as Read" copies the payload and stamps `readAt`; it no longer requires a re-entry form. `promoteTBREntry` keeps its atomic batch (set reading + delete TBR) but no longer takes `tiles`/`isFreebie` as re-collected arguments — it reads them from the entry.

4. **Freebie validated at plan time, budget scope = union(readings, TBR).** A planned freebie is valid iff total freebies across completed readings *and* all TBR entries ≤ 1 (`validateFreebie` already enforces ≤1 over a `ScoringInput[]`; the shared shape lets us pass `[...readings, ...tbr]` directly). This makes "TBR = a valid strategy" actually true. Because plan-time validity can go stale (a freebie logged elsewhere later), **promotion re-validates**.

5. **`notes` removed entirely.** It is dropped from `TBREntry`. A durable "notes about a book/reading" concept is deferred to a future design as a **per-`(user, work)` annotation** — not a field on either model, and not on the shared `/books` doc (which is multi-user and would leak private notes).

6. **Identity locked on all edit paths.** Title/author are editable only at *manual creation*. Every edit path renders identity read-only, which structurally eliminates the silent re-key bug (editing a title today re-derives `deriveBookId` and repoints the reading to a different `/books` doc). Correcting a manual typo is delete-and-re-enter — which also gives the catalog search a second chance to surface the real book.

## Options Considered

**The core fork — one collection vs. two:**

- **Model X — two collections, shared payload (adopted).** Keeps the existing structure and the `TBR_PLAN.md §2` invariant ("if it's a `Reading`, it happened"). Scoring stays *physically* isolated to `/readings` — a TBR plan cannot accidentally be scored because it lives in a different collection. Projection for a future "see your projected score" feature is `getScoreBreakdown([...readings, ...tbr])` — free, no merge required. Cost: promotion remains a cross-collection batch; "two nearly-identical collections" is a smell requiring explanation (this doc).

- **Model Y — one collection, `status: 'planned' | 'read'` discriminator (rejected).** This is what decisions 1 and 3 *literally describe*, and it's the more honest model: promotion becomes a field flip. Rejected on **reversibility and blast radius** — it requires a collection-merge migration (rewriting `useReadings`/`useTBR`, security rules, every query), immediately after the book-identity re-key migration (#42). Critically, it buys nothing X doesn't: the strategy/preview features work under X by concatenation. Scoring correctness would move from "different collection" to "a `status` filter you must never forget, security rules included" — a weaker guardrail. Revisit only if plan/read-state features proliferate enough to justify the migration.

**Sub-decisions:**

- **Notes: keep / persist-to-reading / remove.** "Store on both, show on one" is the scope-creep pattern already flagged. Persisting to readings without surfacing them there is storing dead data. Removing now is the clean cut; the real feature (per-`(user,work)` annotation surviving promotion) is a separate product design. Chose **remove**.
- **Freebie scope: TBR-only vs union.** TBR-only is local and simple but lets you plan a freebie you've already spent — the strategy view would then lie. **Union** is the only scope under which the plan is genuinely achievable, which is the entire justification for validating at plan time. Chose **union**.

## Tradeoffs

- "Identical shape, two collections" is an unstable middle *only if* described as identical. It is not: the shared part is the **inner payload** (`ScoringInput`); the envelopes differ (`addedAt` vs `readAt`). Naming that boundary precisely is what keeps it stable.
- Union-scope freebie validation makes TBR validation depend on readings state, so a standing plan can become invalid when a freebie is logged elsewhere. Accepted; handled by re-validation at promote and a plan-time conflict message.
- Locking identity on edit trades *silent re-keying* (invisible, corrupting) for *orphan accumulation* (benign typo'd `/books` docs, already hidden by the `readCount === 0` filter). Manual-book correction is deliberately lossy (re-enter tiles/freebie).
- Renaming `plannedTiles → tiles` and adding `isFreebie` to existing TBR docs is a **data migration** (see the plan). Low volume, but it is a schema change on live data.

## Supersedes

- `docs/TBR_PLAN.md §2` — **"Why no `isFreebie` field?"** (now planned + validated) and the `notes` field (removed).
- `docs/TBR_PLAN.md §6c/§6d` — `TBRForm` and the "Mark as Read" flow are replaced by the unified form and payload-copy promotion (see the plan).

## When to Revisit

- If strategy/lifecycle features multiply (progress tracking, multiple plan states, reordering), reconsider **Model Y** — at that point the migration may be worth the honesty.
- Revisit **per-`(user, work)` notes** as its own product design when there's demand for durable book/reading notes.
- If union-scope freebie conflicts prove confusing in practice, reconsider whether planning is aspirational (soft) rather than validated.

## Related

- `docs/FORM_AND_DIALOG_UNIFICATION.md` — the implementation plan (dialog container, unified form, migration, sequencing).
- `docs/decisions/animation-duration-ownership.md` — the persistent-dialog approach removes a use of the `setTimeout`/`duration-200` coupling rather than adding a second one.
- `docs/decisions/book-identity-and-deduplication.md` — `deriveBookId` is the frozen contract that identity-locking on edit protects.
