# Book Identity & Deduplication

**Status:** Open — mitigation shipped, canonical-identifier decision deferred
**Date:** 2026-06-18

## Context

Books live in a shared `/books/{bookId}` collection; user readings reference them by `bookId`. `getOrCreateBook` (`app/web/src/lib/books.ts`) deduplicates before creating, in this precedence:

1. Match on `externalId` (Open Library OLID) when the caller passes enrichment.
2. Fall back to a case-insensitive `titleLower` + `authorLower` match.
3. Otherwise create a new doc with a **random** ID.

The documented intent (`docs/BOOK_ENRICHMENT.md`) was that `externalId` would *eventually become the sole identifier*, with the title/author key removed once all books were enriched. This record corrects that assumption and captures what we found while investigating issues #7 (create race) and #27 ("fixed typo still showing").

## Findings

The externalId-only end state is **currently unreachable**, blocked on two pieces of work that were never scheduled:

- **No enrichment backfill exists.** The original migration (`scripts/migrate-readings.ts`) created the legacy `/books/` docs from denormalized title/author strings, so they all have `externalId: null`. The only code path that assigns an `externalId` is the Phase 3 search flow, going forward — nothing backfills existing books.
- **Manual free-text entry is still live.** `BookList.tsx` calls `getOrCreateBook(title, author, userId)` with no enrichment, and `BookForm.tsx` is plain free-text. Every book created this way is born with `externalId: null`. New string-keyed books are still being minted.

While the title/author fallback exists, the dedup key is a normalized free-text string. Two consequences:

- **#7 (race):** `getOrCreateBook` is a check-then-act read-then-write with no atomicity. Two concurrent creates of the same book both see an empty query and both write. *Note:* the issue's proposed "use a transaction" fix does not work as written — the Firestore client SDK cannot run queries inside a transaction, and an empty query result locks nothing. The pattern that would fix it is a **deterministic document ID** derived from the dedup key.
- **#27 (typo):** a manual author was autocorrected → string-keyed book A; the user corrected it → a *different* string → book B; A is now orphaned (zero readings) but still rendered. This is cross-variant duplication in the string key space — a deterministic-ID fix would **not** have prevented it, because A and B have different keys.

The common root cause of the duplication class is **free-text string identity**. #7 and #27 are two faces of the same unfinished migration, not independent bugs.

## Decision

**Mitigation shipped now:** `LibraryPage` filters out book docs with `readCount === 0`, so orphaned books (the visible symptom of #27) no longer appear. One line, zero risk, no change to identity or the data model.

**Deferred:** the deterministic-ID fix for #7 and the broader move to an `externalId`-only model. Rationale: at friend-group scale the create race is low-frequency, and in the intended end state the `externalId` *is* the deterministic doc ID — so building transitional deterministic-ID machinery now is partly throwaway. We are not committing to it until the identifier question below is settled.

## Open Question (to resolve before further work)

The migration as originally written is not feasible until we answer: **must every book have an Open Library match, or do we need a permanent identity for manual / un-findable books?** Obscure, self-published, and foreign titles may have no OLID. If manual books must be supported, `externalId` can never be *truly* sole, and we need a stable synthetic identifier for the manual case. This is a product/UX decision, not just a technical one, and it gates both the backfill and the contraction of the title/author path.

## Tradeoffs

- The orphan filter hides empty book docs but does not remove them or prevent new duplicates — it treats the symptom, by design.
- Deferring #7 accepts that rare duplicate book docs may continue to accrue during the transition. Acceptable at current scale; revisit if duplicates become common or the user base grows.
- Leaving the title/author fallback in place keeps manual entry working today at the cost of an identity model that cannot yet be simplified.

## When to Revisit

- **Resolve the open question** before scheduling the backfill or removing the title/author key.
- **Build the deterministic-ID fix for #7** if duplicate book docs become frequent, or as the natural first step once `externalId` is confirmed as the canonical key.
- **Add an enrichment backfill** (legacy + manual books) when committing to the `externalId`-only model.
- Supersedes the "externalId will be the sole identifier" claim in `docs/BOOK_ENRICHMENT.md` §6 until the above is settled.
