# Open Library Read-Through — Implementation Plan

**Status:** Proposed. Implements the **near-term + mid-term** horizons of
`docs/OPEN_LIBRARY_DEPENDENCY_ROADMAP.md`, in the shape required by
`docs/decisions/guarded-writes.md` Decision 3.

**Scope decisions taken up front:**

- The `/books` enrichment write fires **eagerly, at lookup time** (roadmap
  mid-term deliverable 2), not at reading-save. The store warms from real
  traffic; the read-through starts hitting immediately.
- Long-term horizon (refresh job, multi-provider merge) is **out of scope** —
  roadmap §4 requires ≥2 triggers and none have fired.

---

## 0. Grounding — verified in code

| Fact | Location |
|---|---|
| Client already has the OL work key at selection time | `app/web/src/components/BookSearch.tsx:50` |
| `deriveBookId` is pure, in `lib/core`, callable from browser and Node | `lib/core/src/bookIdentity.ts:36` |
| A direct `/books` read already exists | `app/web/src/lib/books.ts:75` (`getBook`) |
| `lookup` is 3 **sequential** fetches | `functions/src/books/providers/open-library.ts:66-92` |
| `enrichBook` is stateless — no Firestore access at all today | `functions/src/books/{handler,service}.ts` |
| `/books` is written **only** client-side | `app/web/src/lib/books.ts:30` (`getOrCreateBook`) |
| `functions/` does **not** depend on `@bookbingo/lib-core` | `functions/package.json` |
| No Firestore rules test harness exists | repo-wide |

**Two constraints the roadmap does not call out:**

1. **`getOrCreateBook` also serves manual books.** When there is no OL key,
   `deriveBookId` takes the `manual:` branch. Manual books never pass through
   `enrichBook`, so this phase **cannot** remove the client write path — only
   narrow it to manual entries. Full removal is guarded-writes scope (b), later.
2. **Shape mismatch on the cache-hit path.** `getBook` returns `Book`
   (`{id, title, author, metadata?, externalIds?, createdBy, createdAt}`);
   `onBookSelected` consumes `BookEnrichmentResult`
   (`{externalId, title, author, metadata}`). `Book` has no top-level
   `externalId` — it lives at `externalIds.openLibrary.key`. An adapter is
   required, and it is the one place the two representations meet.

---

## 1. Target flow

```
handleSelect(result):
  bookId = deriveBookId({ openLibraryKey: result.externalId, title, author })
  cached = await getBook(bookId)                  # direct SDK read (query side)
  if (cached && isMetadataFresh(cached))
      return adapt(cached)                        # 0 function calls, 0 OL calls
  return await lookupBook(result.externalId)      # command: fetch OL + write /books
```

Cache hits cost **zero** Cloud Function invocations, per guarded-writes
Decision 3. On a miss, `enrichBook` performs the guarded server-side write.

---

## 2. Schema additions

Three fields on `/books/{bookId}`, per roadmap §7 Q3 — and **no more**:

```ts
/** When provider metadata was last fetched. Absent ⇒ unknown ⇒ needs refresh. */
metadataFetchedAt?: Date;
/** Which provider produced `metadata`. Server-written only. */
metadataSource?: BookProvider;      // currently the union 'openLibrary'
/** Shape version of the enrichment fields. Absent ⇒ pre-versioned. */
schemaVersion?: number;
```

Added to `Book` in `lib/types/src/index.ts`. All three are **optional**, and
missing fields mean *"unknown / needs refresh"* — never a big-bang migration
(roadmap mid-term risk note). Existing docs stay valid and lazily upgrade the
first time anyone selects that book.

Explicitly **not** added: multi-provider merge, editions/ISBN entities, a
normalized author entity, a precedence policy.

---

## 3. Work breakdown — 4 PRs

Each PR is independently deployable and leaves `main` working.

### PR 1 — `feat: add book metadata staleness policy and provenance fields`

Pure `lib/` change. **No behavior change** — nothing reads the policy yet.

- `lib/types/src/index.ts`: add the three fields to `Book`.
- `lib/core/src/bookMetadata.ts` (new): the staleness policy, shared by client
  and function per guarded-writes Decision 3.
  ```ts
  export const BOOK_METADATA_SCHEMA_VERSION = 1;
  export const BOOK_METADATA_TTL_MS = /* see §5 */;
  export function isMetadataFresh(book: Book, now?: Date): boolean;
  ```
- Export from `lib/core/src/index.ts`.

**Tests** — `lib/core/src/bookMetadata.test.ts` (`node:test`):
fresh within TTL → true; past TTL → false; missing `metadataFetchedAt` → false;
missing `metadata` entirely → false; `schemaVersion` older than current → false;
`schemaVersion` absent → false; boundary exactly at TTL.

### PR 2 — `feat: read /books before Open Library lookup and write enrichment server-side`

The core movement. Read-through and guarded write land together — building one
without the other creates the dead-end path the ADR warns about.

**Functions side:**
- Add `@bookbingo/lib-core` to `functions/package.json` (workspace dep) and to
  the `functions/tsconfig*.json` references.
- `functions/src/books/store.ts` (new): a `BookStore` port —
  `get(bookId)` / `upsertEnrichment(bookId, {...})` — with a `firebase-admin`
  implementation. **A port, not a direct Firestore call**, so
  `BookEnrichmentService` stays unit-testable with an in-memory fake, matching
  the existing `handler.test.ts` style.
- `BookEnrichmentService.getBookDetails` takes the store: on miss it fetches OL
  then writes through.
- The write uses `set(..., { merge: true })` with **only** enrichment fields
  (`title`, `author`, `metadata`, `externalIds.openLibrary`,
  `metadataFetchedAt`, `metadataSource`, `schemaVersion`). It must **never**
  touch `createdBy` / `createdAt` on an existing doc — that provenance is what
  today's `getOrCreateBook` bails out to protect (`books.ts:43-48`). On a fresh
  create it sets `createdBy = request.auth.uid`.
- Server re-checks freshness before fetching OL, so two clients racing the same
  cold book cost at most one OL fan-out each and converge on one doc.

**Web side:**
- `app/web/src/lib/bookSearch.ts`: add `toEnrichmentResult(book: Book)`
  adapter (resolves the `Book` → `BookEnrichmentResult` mismatch from §0).
- `BookSearch.tsx handleSelect`: derive id → `getBook` → freshness check →
  return adapted doc on hit, else `lookupBook`.
- A failed cache read must **fall through to `lookupBook`**, never surface an
  error. The cache is an optimization; its failure mode is a slow path, not a
  broken one.
- `getOrCreateBook` keeps working unchanged for manual entry. For OL books the
  doc will already exist, so its existing early-return makes it a cheap no-op.

**Tests:**
- `functions/src/books/service.test.ts` (new): fresh store doc → provider never
  called; stale doc → provider called + store written; cold miss → provider
  called + create with `createdBy`; existing doc → `createdBy`/`createdAt`
  preserved.
- `app/web/src/components/BookSearch.test.tsx` (new, per
  `app/web/src/testing/CONVENTIONS.md`): mock only at the I/O boundary
  (`bookSearch.ts`, `books.ts`); userEvent-only; role-first queries. Cases:
  cache hit → `lookupBook` **not** called and `onBookSelected` receives adapted
  data; cache miss → `lookupBook` called; cache read throws → falls through to
  `lookupBook` and still succeeds.

### PR 3 — `chore: tighten /books rules against forged enrichment provenance`

Highest-risk PR (no rules test harness), kept separate so it can be reverted
alone.

Current rule is `allow create: if request.auth != null` — world-writable
(guarded-writes §Context). Tighten so clients may still create manual books but
**cannot write** `metadataSource`, `metadataFetchedAt`, or `schemaVersion`;
those become function-only (the Admin SDK bypasses rules). Reads stay open —
the query-side read-through depends on direct client reads of `/books`.

**Verification is manual against the emulator** (documented in the PR): a client
write carrying `metadataSource` must be rejected; a manual-book create must
succeed; a client read of `/books/{id}` must succeed. Standing up
`@firebase/rules-unit-testing` is worth doing but is its own task — noted, not
bundled.

### PR 4 — `perf: parallelize OL lookup fan-out and cache search responses`

Isolated to `OpenLibraryProvider`. Touches nothing else; could land at any point.

- **Parallelize the fan-out.** `fetchAuthorName` and `fetchPageCount`
  (`open-library.ts:73-74`) are independent and currently sequential →
  `Promise.all`. Turns 3 sequential round-trips into 1 + 2-in-parallel. This is
  roadmap near-term deliverable 3 and is a pure latency win on the miss path.
- **Ephemeral search cache.** Module-level `Map` in `OpenLibraryProvider`, keyed
  by normalized query, TTL 5–15 min. Must be **size-capped** with eviction — a
  v2 function instance is long-lived, so an unbounded Map is a slow memory leak.
  Roadmap §5 layer 1: disposable by design, no invalidation logic.

**Tests** — `functions/src/books/providers/open-library.test.ts`: hit within TTL
issues 1 fetch for N identical queries; miss after TTL refetches; distinct
queries don't collide; cap evicts; fan-out issues its two calls concurrently.

---

## 4. Sequencing rationale

PR 1 → 2 → 3 → 4 follows roadmap §6's value order, with one deviation worth
naming: PR 4 is pure upside with zero coupling and **could be pulled to the
front** if a quick win is wanted first. It is placed last only because it is the
least strategic (roadmap §6 step 3).

PR 3 deliberately follows PR 2 rather than preceding it: tightening rules before
the server write exists would break the current client write path.

This plan covers guarded-writes scope **(b)** only, partially. Scope (a)
(`readings` writes — the actual abuse vector, and the ADR's stated highest
priority) is **not** addressed here and remains the more security-relevant
follow-up. This phase is justified by latency, cost, and OL-guidance alignment,
**not** by security.

---

## 5. Open question for review

**TTL value.** Roadmap §5 says "weeks–months is fine; works are stable." The
tradeoff is concrete: a longer TTL means more zero-request hits but staler
titles/subjects when OL corrects a record; a shorter TTL costs a 3-request
fan-out more often. Recommended starting point: **30 days**, as a named constant
in `lib/core/src/bookMetadata.ts` so it is one edit to retune. Bundling it with
`schemaVersion` means a policy change can also force a global refresh by bumping
the version.

---

## 6. Exit criteria

- A repeat lookup of a previously-seen fresh book makes **0** OL requests **and
  0** Cloud Function invocations.
- Every book selected from search has a `/books` doc with `metadataFetchedAt`,
  `metadataSource`, and `schemaVersion`.
- Identical `search` queries within TTL make 1 OL request, not N.
- Pre-existing `/books` docs without the new fields continue to work and
  self-upgrade on next selection.
- Clients cannot write enrichment provenance fields.
- `pnpm run verify` passes; no behavior regression in manual-entry book creation.

---

## 7. Promotion to ADR

On completion, promote the settled decisions into `docs/decisions/` and add an
index entry per the ADR convention: the eager-write-at-lookup choice, the
staleness policy's home in `lib/core`, and the `BookStore` port. Update roadmap
§2 near/mid-term status and CLAUDE.md's Architecture Guidance (new `lib/core`
module, new `functions/` dependency on `lib-core`).
