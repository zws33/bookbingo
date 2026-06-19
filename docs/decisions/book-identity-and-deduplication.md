# Book Identity & Deduplication

**Status:** Resolved — canonical model decided 2026-06-19; implementation (types, migration, app wiring) pending
**Date:** 2026-06-18 (investigated) · 2026-06-19 (resolved)

## Context

Books live in a shared `/books/{bookId}` collection; user readings (and TBR entries) reference them by `bookId`. `getOrCreateBook` (`app/web/src/lib/books.ts`) deduplicates before creating, in this precedence:

1. Match on `externalId` (Open Library Work OLID) when the caller passes enrichment.
2. Fall back to a case-insensitive `titleLower` + `authorLower` match.
3. Otherwise create a new doc with a **random** ID.

The documented intent (`docs/BOOK_DATA_MODEL.md`) was *query-based* deduplication: random doc IDs plus a `where('externalIds.openLibrary','==',olid)` lookup. This record supersedes that mechanism. It captures the canonical identity model decided while investigating issues #7 (create race) and #27 ("fixed typo still showing").

## Findings

The original query-based design left two defects unaddressed:

- **#7 (race):** `getOrCreateBook` is check-then-act (read-then-write) with no atomicity. Two concurrent creates of the same book both see an empty query and both write. The issue's proposed "use a transaction" fix does not work as written — the Firestore client SDK cannot run queries inside a transaction, and an empty query result locks nothing. The pattern that fixes it is a **deterministic document ID** derived from the book's identity.
- **#27 (typo):** a manual author was autocorrected → string-keyed book A; the user corrected it → a different string → book B; A is orphaned (zero readings) but still rendered. This is cross-variant duplication in the free-text key space.

The common root cause of the duplication class is **free-text string identity** combined with **non-deterministic doc IDs**. #7 and #27 are two faces of the same problem.

A prior mitigation already shipped: `LibraryPage` filters out book docs with `readCount === 0`, hiding orphaned books (the visible symptom of #27). That remains as a display safeguard; the decision below addresses the root cause.

## Decision

Book identity is a **deterministic function of the book's identity**, encoded as the Firestore document ID. Dedup stops being a query and becomes a property of the key.

### Document ID

Uniform opaque hash with a **domain-separated input** so the catalog and manual key spaces can never collide:

```
catalog book:  bookId = hash("openLibrary:" + workKey)
                        // workKey is the raw OL key, e.g. "/works/OL166894W" — slashes included
manual book:   bookId = hash("manual:" + normTitle + "|" + normAuthor)
```

- The output carries **no readable prefix** — provenance is not recoverable from the ID by design (it lives in `externalIds`, see below). This is an accepted, deliberate trade.
- Hashing the raw `workKey` sidesteps slash-sanitization: `/` is illegal in a Firestore doc ID, but legal as hash input, so no parsing rule needs freezing.
- The `"|"` separator between normalized title and author prevents boundary collisions (e.g. `"Go"+"Dog"` vs `"God"+"og"`).

### Manual normalization pipeline (frozen)

Applied to title and author **independently**:

```
lowercase → NFKD normalize → strip combining marks → strip non-alphanumeric
```

Conservative by deliberate choice: it folds case, whitespace, punctuation, and diacritics (`é`→`e`, so "Les Misérables" == "Les Miserables"), but does **not** strip leading articles or fold author initials. Aggressive author initial-folding was considered and rejected — it is irreversible and can collapse two genuinely distinct authors (two different "J. Smith"s) into one identity with no way to split them back apart.

### Hash function (frozen)

`cyrb53`-style, ~53–64-bit, synchronous and dependency-free (runs identically in the browser app and the Node migration script — unlike async `SubtleCrypto`), rendered base36. Wider than 32-bit on purpose: a collision means two distinct books silently share a doc ID (metadata and readings bleed together, no error), and this is a frozen contract. ~53 bits makes that negligible at this catalog's scale.

### External references → provenance, not a key

Because identity now lives in the doc ID, `externalIds` no longer drives dedup. It becomes a **provenance record**, modeled as an embedded **map-of-objects** on the book doc:

```ts
export type BookProvider = 'openLibrary';

export interface ExternalRef {
  key: string;       // provider-native id, e.g. "/works/OL166894W"
  enrichedAt: Date;  // when this reference was attached
}

export type ExternalBookIds = Partial<Record<BookProvider, ExternalRef>>;
```

This is richer than the originally-planned `Partial<Record<BookProvider, string>>` (it carries metadata *about* the reference), and the readable Work key remains queryable via `externalIds.openLibrary.key` even though the doc ID is opaque.

### What this removes

The deterministic-ID model is a net *reduction* of the data model:

- the query-based dedup path (`where('externalIds.openLibrary','==',…)`) — dedup is now `getDoc(deterministicId)`;
- the `externalIds.openLibrary` composite index;
- the `titleLower` / `authorLower` fields.

`getOrCreateBook` collapses from three branches to one: compute the deterministic ID, then an idempotent `setDoc` (or `getDoc`-then-create). Concurrent creates target the *same* doc ID and converge — closing the #7 race by construction.

## Resolved questions

- **Manual-book identity (was the open question).** Manual books get a deterministic `manual:` hash with conservative normalization — so the #7 race is fixed *uniformly*, not just for catalog books, without the over-merge hazard of aggressive normalization. This supersedes `BOOK_DATA_MODEL.md`'s "manual entry skips deduplication" stance: manual books now dedup exact re-entries, cheaply and safely.
- **Collapse-on-migration vs. scoring (verified safe).** Re-keying collapses legacy docs that share a derived key into one ID. This is **score-neutral by construction**: migration re-points `reading.bookId` but never adds, removes, or merges readings. Scoring (`lib/core/scoring.ts`, `statistics.ts`) is a pure function of readings × tiles and never reads `bookId`; the leaderboard's "Books" count is `readings.length`. The only surface that groups by book is `LibraryPage` (community-library display), where collapse *merges* duplicate rows — a fix, not a risk. Migration neither creates nor cures any pre-existing double-count.
- **Born-manual-then-enriched (accepted limit).** A book created manually (`manual:` hash) and later found via search (`openLibrary:` hash) derives two different IDs; the scheme will not merge them. Accepted as a known limitation — no claim/upgrade path is planned. The scheme prevents re-creating *identical* entries; it does not retroactively link a manual entry to its catalog identity.

## Migration approach

A new **re-key** script (distinct from the existing `scripts/migrate-readings.ts`, which backfilled `bookId`, and from any enrichment pass):

1. For each `/books/{oldId}`, compute its deterministic ID (`openLibrary:` if `externalIds.openLibrary` present, else `manual:` from title/author via the frozen pipeline). It **must import the same `deriveBookId` from `lib/core`** the app uses — no hand-duplicated normalization.
2. Group old docs by new ID; within each collapse-set, write `/books/{newId}` merging: prefer the OL-bearing doc's `metadata`, keep the earliest `createdAt`, union `externalIds`.
3. Re-point every reference from any old ID in the set to the new ID — **both** `users/*/readings/*.bookId` **and** `users/*/tbr/*.bookId` (the latter postdates `migrate-readings.ts` and is not covered by it).
4. **Two-pass / reversible:** do *not* delete old docs in the same pass. Re-point, verify, and delete orphaned old docs in a later pass; the `readCount === 0` filter hides them meanwhile.
5. **Migration-first ordering:** run before the `getOrCreateBook` rewrite ships, so legacy data is canonical before any new deterministic write lands (otherwise the gap mints fresh duplicates).
6. Idempotent and resumable (re-running computes the same IDs; skip docs already at their correct ID). Dry-run, staging before prod.

## Tradeoffs

- Opaque IDs cannot be eyeballed for provenance in the Firestore console — accepted; `externalIds.openLibrary.key` covers that need.
- The normalization pipeline and hash are a **frozen contract**: changing them changes every derived ID and silently re-duplicates. `lib/core/bookIdentity.test.ts` is the source of truth; edits there are a data-migration event.
- Manual dedup is conservative, so accent/punctuation/case variants merge but distinct-but-similar titles or author-name variants ("U. K. Le Guin" vs "Ursula K. Le Guin") do not. Deliberate, to avoid irreversible over-merge.

## Supersedes

- `docs/BOOK_DATA_MODEL.md` §"Deduplication Strategy" (query-based) and the `getOrCreateBook` query logic in its Implementation Steps — replaced by the deterministic-ID model above. The `ExternalBookIds` type there is upgraded from `…string` to `…ExternalRef`.
- The "externalId will become the sole identifier" framing in `docs/BOOK_ENRICHMENT.md`.

## When to revisit

- If hash collisions ever surface (they should not at this scale), widen the hash — but only as a coordinated re-key migration.
- If born-manual-then-enriched duplication becomes common, reconsider the accepted limit and add a claim/upgrade path.
- If manual under-merging (the same book entered with materially different strings) becomes a frequent complaint, revisit normalization aggressiveness — again, only via re-key migration.
