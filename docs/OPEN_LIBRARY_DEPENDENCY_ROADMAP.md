# Open Library Dependency Roadmap

**Status:** Planning memo (opinionated). Nothing here is committed. When a phase
is approved, promote its decisions into `docs/decisions/` per the ADR convention.

**Audience:** Solo engineer / very small team. Optimize for reversible,
incremental moves. Avoid generic future-proofing.

---

## 0. Grounding: what the code actually does today

Two API touchpoints, both behind a single callable (`enrichBook`):

| Path | Frontend trigger | Backend behavior | OL requests |
|------|------------------|------------------|-------------|
| `search` | `BookSearch.tsx`, 300ms debounce, min 2 chars, `limit=10` | `OpenLibraryProvider.search()` → `/search.json` | **1** per query |
| `lookup` | On result selection | `OpenLibraryProvider.lookup()` → work + author + editions | **3** sequential |

Flow: `app/web` → `httpsCallable('enrichBook')` → `handler.ts` →
`BookEnrichmentService` → `OpenLibraryProvider` → `openlibrary.org`.
There is **no caching anywhere** — not in the function, not at a CDN, not in
Firestore. Every keystroke-batch and every selection hits OL live.

**What already exists that matters enormously:** `/books/{bookId}`.

- `bookId` is a **deterministic opaque hash** — `hash("openLibrary:"+workKey)`
  for catalog books, `hash("manual:"+normTitle+"|"+normAuthor)` for manual.
  (`lib/core/src/bookIdentity.ts`, a frozen contract.)
- Readings reference `bookId`, **never** the Open Library key.
- `externalIds` is a provider-keyed provenance map:
  `Partial<Record<BookProvider, ExternalRef>>`, where `ExternalRef` is
  `{ key, enrichedAt }`. `BookProvider` is currently the union `'openLibrary'`.
- A `BookMetadata` snapshot is persisted on the doc.

The catch: `/books` is written **only** by `getOrCreateBook` at reading-create
time, is **never consulted before** the 3-request `lookup` fan-out, is **never
refreshed**, and has no `fetchedAt` / `source` / `schemaVersion`. It is a
*byproduct*, not a *store*.

This is the load-bearing fact of the whole memo: **you are not building a
canonical store from scratch. You are promoting a byproduct you already have,
and reading from it before you hit the network.**

---

## 1. Open Library guidance → architectural implications

OL's stated guidance, and what each clause implies *for this specific codebase*:

**"Cache API-backed data where possible."**
→ Your `lookup` path violates this most sharply: 3 network round-trips per book,
recomputed every time, even for books already sitting in `/books` with full
metadata. Caching `lookup` is not just polite to OL — it's a latency and
Cloud-Functions-cost win for you.

**"Web APIs suit low-volume, real-time lookups."**
→ Your **`search`** path is exactly this use case and should *stay on the API
indefinitely*. Interactive title search over the long tail of all books is
precisely what a real-time API is for. Do not try to own search.

**"Use monthly bulk dumps for bulk import / large-scale access."**
→ You have **no bulk access pattern today**, and for a friends' book club you
likely never will at "full dataset" scale. The addressable set of books is
"whatever this group reads" — hundreds, maybe low thousands, ever. This clause
is a signal about *when ingestion is justified* (see §4/§7), and the honest
answer for now is: **not yet, possibly not ever at full scale.**

**How strongly does this push us toward owning the data?**
Moderately, and asymmetrically:
- For **detail/enrichment** (`lookup`): strongly. The data is stable
  (a work's title/author/subjects rarely change), you re-request it constantly,
  and you already have the store to hold it. Owning this is squarely aligned
  with OL's caching guidance.
- For **search**: barely at all. Owning search means owning ingestion, indexing,
  and relevance — a different and much larger project that OL explicitly tells
  you the API already solves.

**The dividing line:** cache/own the *stable, repeatedly-requested, small*
(works you've touched). Keep renting the *volatile, long-tail, discovery* path
(search).

---

## 2. Roadmap by horizon

### Near term — caching + low-risk mitigations

**Objective:** Stop re-hitting OL for data you already have or just fetched,
without introducing new infrastructure.

**Deliverables:**
1. **Read-through `/books` on `lookup` (highest leverage).** Before the
   3-request fan-out, derive the same `bookId` and check `/books`. If the doc
   exists with metadata newer than a staleness threshold, return it and skip OL
   entirely. On miss, fetch OL and **write-through** to `/books`.
2. **Short-TTL response cache for `search`.** In-memory (per-function-instance)
   Map keyed by normalized query, TTL ~5–15 min. Cheap, throwaway, absorbs the
   debounce-tail and repeated identical queries. Optionally add a
   `Cache-Control` header if the callable ever moves behind a CDN.
3. **Collapse `lookup`'s internal fan-out where trivial** — e.g. the editions
   page-count call is the weakest data anyway; consider making it best-effort /
   parallel rather than a third sequential hop.

**Why this phase:** It is nearly free — the store and the ID derivation already
exist — and it delivers the largest correctness/cost/latency win of any phase.
It is also a *down payment on the future*, not a throwaway: the `lookup`
read-through writes into the exact store the mid-term canonical catalog will
formalize. Only the ephemeral `search` cache is genuinely disposable, and it's
disposable *by design*.

**Risks:**
- Serving stale metadata from `/books`. Mitigated by a `fetchedAt` timestamp +
  generous TTL (works are stable; staleness is low-stakes here).
- In-memory search cache doesn't share across function instances / cold starts.
  Acceptable — it's an optimization, not a correctness mechanism.
- Writing to `/books` from the function (currently written from the client)
  crosses a trust boundary — see migration note in §6.

**Exit criteria:** A repeat `lookup` of a previously-seen book makes **0** OL
requests. Identical `search` queries within TTL make **1** OL request, not N.

---

### Mid term — durable canonical works store (coexists with API)

**Objective:** Promote `/books` from an add-time byproduct into a first-class,
read-through canonical works store, still populated *from real traffic* (not
bulk).

**Deliverables:**
1. **First-class enrichment fields on `/books`:** `metadataFetchedAt`,
   `metadataSource` (`'openLibrary'`), `schemaVersion`. These make staleness and
   provenance explicit instead of implicit.
2. **`lookup` becomes the canonical write path,** not just reading-create.
   Selecting a search result populates/refreshes the canonical doc even before a
   reading is saved.
3. **Optional lazy backfill:** when an old `/books` doc without metadata is
   read, opportunistically enrich it. No batch job.

**Why this phase:** This is "read-through persistence of works encountered in
real traffic" — the natural successor to caching and a strict superset of it.
It's mid-term rather than near-term only because it involves a schema addition
and moving the write authority for `/books` into the function (a boundary change
worth doing deliberately, not in a hurry).

**Risks:**
- Schema drift between docs written pre- and post-`schemaVersion`. Handle by
  treating missing fields as "unknown / needs refresh," never by a big-bang
  migration.
- Firestore rules: if the function becomes the writer of enrichment fields,
  tighten `firestore.rules` so clients can't forge `metadataSource`.

**Exit criteria:** Every book a user interacts with has a canonical `/books` doc
with explicit provenance and fetch time, refreshable on demand, with the OL API
consulted only on cache miss or staleness.

---

### Long term — ingestion pipeline + provider-agnostic catalog

**Objective:** Reduce OL from a *runtime dependency* to a *data source among
sources*, refreshed offline.

**Deliverables (only if triggered — see §4):**
1. A refresh job that re-fetches or dump-sources metadata for the *specific
   works you already hold* (targeted, not full-dataset ingestion).
2. A provider-agnostic seam: `metadataSource` becomes a real union, `externalIds`
   holds multiple providers, and a small resolution policy decides precedence.
3. Only if scale/coverage demands it: partial ingestion from OL monthly dumps
   for the subset you care about.

**Why this phase / why last:** For a book-club hobby app, full bulk ingestion of
OL's multi-GB works dump is almost certainly over-engineering — you'd ingest
millions of records to serve hundreds. The realistic long-term is a *targeted
refresh* of the small set you actually hold, and that only earns its keep once a
concrete trigger appears.

**Risks:** Operational weight (a scheduled pipeline, dump parsing, storage) that
a solo maintainer must own forever. This is the phase most likely to be
premature — resist it until §4's triggers fire.

**Exit criteria (to *start*, not finish):** At least two triggers from §4 are
true simultaneously.

---

## 3. Tradeoff: "cache the API" vs "own the canonical catalog"

Four concrete options, ordered by increasing ownership:

| | Time-to-value | Ops complexity | Data correctness | Long-term maint. | Migration difficulty |
|---|---|---|---|---|---|
| **A. Request/response cache only** (search + lookup) | Hours–days | Very low (in-memory) | Neutral; risks light staleness | Low; disposable | Trivial — delete it |
| **B. Read-through persistence** (write fetched works to `/books`) | Days | Low — reuses `/books` + IDs | Improves (stable snapshot, explicit `fetchedAt`) | Low–medium | None — it *is* the forward path |
| **C. Dump ingestion** (full/partial OL dumps) | Weeks | High (pipeline, parsing, storage, schedule) | High coverage, but staleness between dumps | High — a system to babysit | Medium — coexists via same `/books` |
| **D. Provider-agnostic store** (multi-source, precedence) | Weeks–months | High + design cost | Highest ceiling; merge-conflict risk | Medium if seams are clean; high if speculative | Medium |

**Reading of the table for *this* project:**
- **A is worth doing immediately** but recognize part of it (search cache) is
  throwaway and part of it (lookup read-through) is really B in disguise.
- **B is the destination for the foreseeable future.** It's the cheapest option
  that is *also* strategically forward-compatible. Time-to-value is days because
  the store exists.
- **C and D are latent, not scheduled.** They are prudent to *not foreclose*
  (keep IDs opaque, keep `externalIds` provider-keyed — both already true), but
  building them now is over-engineering.

**Over-engineering right now:** dump ingestion, multi-provider merge/precedence
logic, editions/ISBN modeling, a search index you own.
**Prudent foundation (already in place or cheap):** opaque internal IDs,
provider-keyed provenance, a read-through write into `/books`, an explicit
`fetchedAt`/`source`. Note the foundation is mostly *already built* — the prudent
move is to *use it*, not to add to it.

---

## 4. When does provider-agnostic ingestion become justified?

Not on a date — on **triggers**. Require **≥2 simultaneously** before starting:

1. **Coverage/quality gaps hurt real users** — books your group reads that OL
   lacks or mis-describes, frequently enough to complain about.
2. **A second provider must be *merged*, not just fallen back to** — i.e. you
   need field-level precedence (Google Books pageCount, OL subjects), not "try B
   if A is empty."
3. **OL availability/rate-limits actually cause user-visible failures** — not
   hypothetically; in your logs.
4. **Scale exceeds "low-volume real-time"** — sustained request rates where the
   API guidance stops applying.

For a friends' book club, realistically only (1) or (2) ever fire, and even then
the answer is likely a *second provider behind the existing `BookProvider`
seam* — not a dump pipeline. **Full ingestion is the least likely branch and
should be treated as such.**

---

## 5. Where caching lives + invalidation

Distinguish three layers explicitly (the user asked for this):

1. **Short-term API request caching** — *search*. Lives **in-function memory**
   (per-instance `Map`), keyed by normalized query. **TTL 5–15 min.** No
   invalidation logic; entries expire. Disposable by design.
2. **Longer-lived persistence of fetched metadata** — *lookup*. Lives in
   **`/books/{bookId}` in Firestore** (the store you already have). Keyed by the
   deterministic `bookId`. **"TTL" is a staleness threshold** on
   `metadataFetchedAt` (weeks–months is fine; works are stable), checked on read,
   refreshed lazily on miss. This is a cache that is *also* the canonical store —
   which is exactly why it isn't a dead-end.
3. **Eventual replacement of runtime API dependence** — the long-term refresh
   job updates `metadataFetchedAt` in the same store. No new cache tier.

**How to avoid a dead-end cache:** the rule is *"the durable cache and the future
canonical store must be the same Firestore collection with the same key."* They
already are (`/books`, deterministic `bookId`). The only genuinely throwaway
cache is the ephemeral in-memory search cache — and that's fine precisely because
search is the path you'll never own.

---

## 6. Implementation sequence

**Top 3 next engineering steps, in order:**

1. **Read-through + write-through `/books` in the `lookup` path.**
   In `service.getBookDetails` (or the provider caller), derive `bookId`, check
   `/books` for fresh metadata, return on hit; on miss, fetch OL and write the
   doc. *This is the whole near-term win and the mid-term foundation in one move.*
2. **Add explicit provenance fields** (`metadataFetchedAt`, `metadataSource`,
   `schemaVersion`) to the `/books` write and the `Book` type. Small, and it
   turns step 1's cache into a real store.
3. **Ephemeral in-memory `search` cache** in `OpenLibraryProvider.search`. Tiny,
   isolated, high-frequency win. Do it last because it's the least strategic.

**Deliberately defer:** dump ingestion, multi-provider code, editions/ISBN
modeling, any scheduled job, a `provider` abstraction *beyond* the
`BookProvider` interface that already exists. Do **not** generalize
`metadataSource` into a resolution engine until §4 triggers.

**Migration path (keeps current behavior working throughout):**
- Steps 1–2 are additive: read-through falls back to the exact current code path
  on cache miss, so behavior is identical when the store is cold and strictly
  better as it warms.
- **The `/books` write authority is now decided** — see
  `docs/decisions/guarded-writes.md`. The earlier "defer the server write, let
  the client keep persisting" hedge is **withdrawn**: because writes are moving
  server-side (guarded writes / direct reads), keeping the client write would
  build a path that decision commits to removing. Concretely:
  - **Read-through moves to the query side.** The client reads `/books/{bookId}`
    directly via the Firestore SDK (it has the id via `deriveBookId`); on a hit
    the `enrichBook` callable is **not** invoked. Only a miss/stale read calls the
    command. Cache hits cost zero function invocations and keep realtime/offline.
  - **The enrichment write is the command.** On a miss, `enrichBook` fetches OL
    and performs the guarded write to `/books` server-side; `firestore.rules`
    tightens so clients cannot forge enrichment fields (`metadataSource`, etc.).
  - This makes step 1's read-through and the guarded-writes migration the **same
    movement** — do them together rather than building then removing a client
    write path.

---

## 7. Direct answers to the four framing questions

**Q1. Is request caching valuable enough to do immediately even if we later
replace the API dependency?**
Yes — but be precise about *which* cache. The **lookup read-through is not
throwaway**: it writes into `/books`, the very store that becomes the canonical
catalog, so it's a down payment, not sunk cost. The **search cache is
throwaway** — and that's correct, because search is the path you should keep
renting from OL forever. So: do both immediately, knowing one is foundation and
one is disposable.

**Q2. Should the next step after caching be a read-through local works store
rather than immediate bulk ingestion?**
Yes, unambiguously. And note it's ~70% built already (opaque IDs, provider-keyed
`externalIds`, persisted metadata). Read-through is *days* of work reusing
existing infrastructure; bulk ingestion is *weeks* of new infrastructure to
serve a set of books small enough to fit in real-traffic caching. Ingestion
before read-through would be inverting the cost/value order.

**Q3. What is the minimum internal canonical-work model worth introducing now?**
Almost none *new* — the model largely exists. The minimum *additions* are three
fields on `/books`: `metadataFetchedAt` (staleness), `metadataSource`
(provenance), `schemaVersion` (safe evolution). That's it. Explicitly **do not**
add: multi-provider merge, editions/ISBN entities, a normalized author entity, or
a precedence policy. The five requirements you listed map to today's code as:
durable records → `/books` ✅ (needs the 3 fields), internal→canonical mapping →
`bookId` on readings ✅, OL traceability → `externalIds.openLibrary.key` ✅,
decoupled IDs → opaque hash ✅, room for more sources →
`Partial<Record<BookProvider, …>>` ✅.

**Q4. At what point does provider-agnostic ingestion become justified?**
When ≥2 of the §4 triggers are simultaneously true — realistically coverage gaps
*plus* a genuine need to field-merge a second provider. Until then it's
speculative. And even when justified, the first response should be *a second
provider behind the existing `BookProvider` seam*, not a dump pipeline. Full
bulk ingestion is the least likely and most deferrable branch for a book-club
app; be candid that it may never be warranted.

---

## Bottom line

You are not choosing between "cache the API" and "own the catalog." Because
`/books` already exists with opaque IDs and provider-keyed provenance, the
**lookup read-through cache and the canonical store are the same artifact.**
Build that one thing (steps 1–2), add a disposable search cache (step 3), and
defer everything else behind concrete triggers. That's the maximum strategic
alignment with Open Library's own guidance for the minimum solo-maintainer cost.
