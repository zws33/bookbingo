# Open Library Read-Through — Implementation Plan

**Status:** Approved for implementation (decisions in §5 settled 2026-07-25).
Implements the **near-term + mid-term** horizons of
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
| Client already has the OL work key at selection time | `app/web/src/components/BookSearch.tsx:46-50` |
| `deriveBookId` is pure, in `lib/core`, callable from browser and Node | `lib/core/src/bookIdentity.ts:36` |
| A direct `/books` read already exists | `app/web/src/lib/books.ts:75` (`getBook`) |
| `lookup` is 3 **sequential** fetches | `functions/src/books/providers/open-library.ts:67,73,74` |
| `enrichBook` is stateless — no Firestore access at all today | `functions/src/books/{handler,service}.ts` |
| `/books` is written **only** client-side | `app/web/src/lib/books.ts:30` (`getOrCreateBook`) |
| `functions/` does **not** depend on `@bookbingo/lib-core` | `functions/package.json` |
| No Firestore rules test harness exists | repo-wide |

**Four constraints the roadmap does not call out:**

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

3. **`Book`'s `Date`-typed fields are `Timestamp` at runtime.** `getBook` does
   `{ id, ...snap.data() } as Book` (`books.ts:80-83`). Firestore returns
   `Timestamp`, not `Date`. Nothing has noticed because **no code has ever read a
   `Date`-typed field as a time value** — there is not one `.toDate()` call in
   `app/web/src`. `isMetadataFresh` would be the first consumer, and `lib/core`
   cannot import either Firebase SDK to normalize it. **Resolved in §5.1.**

4. **`functions/` build config differs from what CLAUDE.md claims.** There is no
   `functions/tsconfig.build.json` — only `functions/tsconfig.json`, which is
   itself `composite` and carries the project `references`. It uses
   `"moduleResolution": "Bundler"`, **not** `NodeNext`. CLAUDE.md is stale on
   this and is corrected as part of PR 3. Separately, `../lib/util` is listed in
   those references but is neither a `functions/package.json` dependency nor
   imported anywhere in `functions/src` — a dangling reference to clean up when
   `lib-core` is added.

---

## 1. Target flow

```
handleSelect(result):
  bookId = deriveBookId({ openLibraryKey: result.externalId, title, author })
  cached = await getBook(bookId)                  # direct SDK read (query side)
  if (cached && isMetadataFresh(toFreshnessInput(cached)))
      return toEnrichmentResult(cached)           # 0 function calls, 0 OL calls
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

`metadataFetchedAt` is typed `Date` for consistency with `createdAt`, but per
§0 constraint 3 it is a `Timestamp` on read. **No consumer may touch it
directly** — conversion happens in the adapters named in §5.1.

Explicitly **not** added: multi-provider merge, editions/ISBN entities, a
normalized author entity, a precedence policy.

---

## 3. Work breakdown — 4 PRs

Each PR is independently deployable and leaves `main` working. Ordering
rationale in §4.

### PR 1 — `perf: parallelize OL lookup fan-out and cache search responses`

Isolated to `OpenLibraryProvider`. Touches nothing else, couples to nothing
else, and benefits every lookup happening today — which is why it leads.

- **Parallelize the fan-out.** `fetchAuthorName` and `fetchPageCount`
  (`open-library.ts:73-74`) are independent and currently sequential →
  `Promise.all`. Turns 3 sequential round-trips into 1 + 2-in-parallel. This is
  roadmap near-term deliverable 3 and is a pure latency win on the miss path.
- **Ephemeral search cache.** Module-level `Map` in `OpenLibraryProvider`, keyed
  by normalized query, TTL 5–15 min. Must be **size-capped** with eviction — a
  v2 function instance is long-lived, so an unbounded Map is a slow memory leak.
  Roadmap §5 layer 1: disposable by design, no invalidation logic.
- **Cache the in-flight promise, not just the result.** Caching results alone
  leaves N concurrent identical queries all missing before any resolves, so they
  each fetch. Storing the pending `Promise` dedupes them for free. A rejected
  promise must be evicted so a transient OL failure isn't cached for the TTL.

**Tests** — `functions/src/books/providers/open-library.test.ts`: hit within TTL
issues 1 fetch for N identical queries; N *concurrent* identical queries issue 1
fetch; miss after TTL refetches; a rejected lookup is not cached; distinct
queries don't collide; cap evicts; fan-out issues its two calls concurrently.

### PR 2 — `feat: add book metadata staleness policy and provenance fields`

Pure `lib/` change. **No behavior change** — nothing reads the policy yet.

- `lib/types/src/index.ts`: add the three fields to `Book`.
- `lib/core/src/bookMetadata.ts` (new): the staleness policy, shared by client
  and function per guarded-writes Decision 3. Takes **primitives only** so
  `lib/core` stays free of Firebase types (§5.1):
  ```ts
  export const BOOK_METADATA_SCHEMA_VERSION = 1;
  export const BOOK_METADATA_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

  export interface BookMetadataFreshness {
    /** Epoch ms of last provider fetch; null ⇒ absent/unknown. */
    fetchedAtMs: number | null;
    /** Shape version of the enrichment fields; undefined ⇒ pre-versioned. */
    schemaVersion?: number;
    /** Whether the doc actually carries a metadata payload. */
    hasMetadata: boolean;
  }

  export function isMetadataFresh(
    input: BookMetadataFreshness,
    nowMs?: number,
  ): boolean;
  ```
- Export from `lib/core/src/index.ts`.

**Tests** — `lib/core/src/bookMetadata.test.ts` (`node:test`):
fresh within TTL → true; past TTL → false; `fetchedAtMs` null → false;
`hasMetadata` false → false; `schemaVersion` older than current → false;
`schemaVersion` absent → false; boundary exactly at TTL.

### PR 3 — `feat: read /books before Open Library lookup and write enrichment server-side`

The core movement. Read-through and guarded write land together — building one
without the other creates the dead-end path the ADR warns about.

**Functions side:**
- Add `@bookbingo/lib-core` to `functions/package.json` and to the `references`
  in `functions/tsconfig.json` (**one file** — there is no
  `functions/tsconfig.build.json`; see §0 constraint 4). Drop the dangling
  `../lib/util` reference in the same change.
- `functions/src/books/store.ts` (new): a `BookStore` port —
  `get(bookId)` / `upsertEnrichment(bookId, {...})` — with a `firebase-admin`
  implementation. **A port, not a direct Firestore call**, so
  `BookEnrichmentService` stays unit-testable with an in-memory fake, matching
  the existing `handler.test.ts` style. The admin implementation owns the
  `Timestamp → epoch ms` conversion; the port's `get` returns a
  `BookMetadataFreshness`-shaped value, never a raw snapshot.
- `BookEnrichmentService.getBookDetails` takes the store: on miss it fetches OL
  then writes through.
- The write uses `set(..., { merge: true })` with **only** enrichment fields
  (`title`, `author`, `metadata`, `externalIds.openLibrary`,
  `metadataFetchedAt`, `metadataSource`, `schemaVersion`). It must **never**
  touch `createdBy` / `createdAt` on an existing doc — that provenance is what
  today's `getOrCreateBook` bails out to protect (`books.ts:43-48`). On a fresh
  create it sets `createdBy = 'system-enrichment'` (§5.2).
- Server re-checks freshness before fetching OL, so two clients racing the same
  cold book cost at most one OL fan-out each and converge on one doc.

**Web side:**
- `app/web/src/lib/books.ts`: add `toFreshnessInput(book: Book)` — the client's
  `Timestamp → epoch ms` adapter. This file already imports Firebase, so the
  conversion stays where Firebase types already live.
- `app/web/src/lib/bookSearch.ts`: add `toEnrichmentResult(book: Book)` adapter
  (resolves the `Book` → `BookEnrichmentResult` mismatch from §0 constraint 2).
- `BookSearch.tsx handleSelect`: derive id → `getBook` → freshness check →
  return adapted doc on hit, else `lookupBook`.
- A failed cache read must **fall through to `lookupBook`**, never surface an
  error. The cache is an optimization; its failure mode is a slow path, not a
  broken one.
- `getOrCreateBook` keeps working unchanged for manual entry. For OL books the
  doc will already exist, so its existing early-return makes it a cheap no-op.

**Also in this PR:** update CLAUDE.md — the stale `NodeNext` claim (§0
constraint 4), the new `lib/core/src/bookMetadata.ts` module, and `functions/`'s
new dependency on `lib-core`.

**Tests:**
- `functions/src/books/service.test.ts` (new): fresh store doc → provider never
  called; stale doc → provider called + store written; cold miss → provider
  called + create with `createdBy: 'system-enrichment'`; existing doc →
  `createdBy`/`createdAt` preserved.
- `app/web/src/components/BookSearch.test.tsx` (new, per
  `app/web/src/testing/CONVENTIONS.md`): mock only at the I/O boundary
  (`bookSearch.ts`, `books.ts`); userEvent-only; role-first queries. Cases:
  cache hit → `lookupBook` **not** called and `onBookSelected` receives adapted
  data; stale cached doc → `lookupBook` called; cache miss → `lookupBook`
  called; cache read throws → falls through to `lookupBook` and still succeeds.

### PR 4 — `chore: tighten /books rules against forged enrichment provenance`

Highest-risk PR (no rules test harness), kept last and separate so it can be
reverted alone.

Current rule is `allow create: if request.auth != null` — world-writable
(guarded-writes §Context). Tighten so clients may still create manual books but
**cannot write** `metadataSource`, `metadataFetchedAt`, or `schemaVersion`;
those become function-only (the Admin SDK bypasses rules). Reads stay open —
the query-side read-through depends on direct client reads of `/books`.

Note the existing `update` rule already tolerates a `'system-migration'`
sentinel in `createdBy`; `'system-enrichment'` docs are server-owned and should
**not** be client-updatable at all.

**Verification is manual against the emulator** (documented in the PR): a client
write carrying `metadataSource` must be rejected; a manual-book create must
succeed; a client read of `/books/{id}` must succeed. Standing up
`@firebase/rules-unit-testing` is worth doing but is its own task — noted, not
bundled.

---

## 4. Sequencing rationale

**PR 1 (perf) leads.** It has zero coupling, and the value argument is
directional, not neutral: once PR 3 lands, the miss path becomes rare, so
parallelizing the fan-out benefits progressively fewer requests. Shipping it
first delivers the latency win to every lookup happening today.

**PR 2 before PR 3** because PR 3 imports the policy.

**PR 4 last, deliberately.** Tightening rules before the server write exists
would break the current client write path.

This plan covers guarded-writes scope **(b)** only, partially. Scope (a)
(`readings` writes — the actual abuse vector, and the ADR's stated highest
priority) is **not** addressed here and remains the more security-relevant
follow-up. This phase is justified by latency, cost, and OL-guidance alignment,
**not** by security.

---

## 5. Resolved decisions

**5.1 — Timestamp representation: primitive at the boundary.**
`isMetadataFresh` takes epoch ms, never a `Date` or `Timestamp`. Two adapters
convert: `toFreshnessInput` in `app/web/src/lib/books.ts` (client SDK) and the
admin `BookStore` implementation in `functions/src/books/store.ts`. This keeps
`lib/core` pure — the `lib/` ↔ Firebase boundary CLAUDE.md defends — and
confines Firebase's `Timestamp` to the two files that already import Firebase.

*Rejected:* normalizing `getBook` to convert every `Timestamp` to a real `Date`.
Cleaner long-term and it would retire the dishonest `as Book` cast, but it
widens PR 3 into a data-layer refactor touching `useBooks`, `useReadings`, and
their tests. Worth doing on its own later.

**5.2 — `createdBy` on server-created docs: `'system-enrichment'`.**
The eager write means a `/books` doc now exists for every book anyone *clicks in
search results*, whether or not they ever log it. Writing the caller's uid would
make "first person to glance at this book" its permanent owner under
`allow update: if request.auth.uid == resource.data.createdBy` — incidental
write authority over a shared catalog entry they never used. The
`'system-enrichment'` sentinel mirrors the `'system-migration'` sentinel the
rules already recognize and makes the field honestly mean *doc provenance*.

**5.3 — TTL: 30 days**, as `BOOK_METADATA_TTL_MS` in
`lib/core/src/bookMetadata.ts`. Roadmap §5 says "weeks–months is fine; works are
stable." One edit to retune, and bumping `BOOK_METADATA_SCHEMA_VERSION` forces a
global refresh independently of the TTL.

---

## 6. Exit criteria

- A repeat lookup of a previously-seen fresh book makes **0** OL requests **and
  0** Cloud Function invocations.
- Every book selected from search has a `/books` doc with `metadataFetchedAt`,
  `metadataSource`, and `schemaVersion`.
- Identical `search` queries within TTL make 1 OL request, not N — including
  concurrent ones.
- Pre-existing `/books` docs without the new fields continue to work and
  self-upgrade on next selection.
- Clients cannot write enrichment provenance fields.
- `pnpm run verify` passes; no behavior regression in manual-entry book creation.

---

## 7. Known adjacent bug — out of scope, tracked

`BookList.tsx:53` (the reading **edit** path) calls
`getOrCreateBook(data.title, data.author, userId)` with **no enrichment**. For a
book originally added from Open Library that derives a `manual:`-prefixed id — a
*different* `bookId* — then repoints the reading at a freshly created duplicate
doc, silently orphaning the enriched one.

This exists today and is independent of this plan, but it gets more visible once
`/books` is a real store rather than a byproduct. Fix separately; do not bundle.

---

## 8. Promotion to ADR

On completion, promote the settled decisions into `docs/decisions/` and add an
index entry per the ADR convention: the eager-write-at-lookup choice, the
staleness policy's home in `lib/core` (including the primitives-at-the-boundary
rule from §5.1), the `'system-enrichment'` provenance sentinel, and the
`BookStore` port. Update roadmap §2 near/mid-term status.
