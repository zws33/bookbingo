# Guarded Writes / Direct Reads (CQRS-lite)

**Status:** Accepted (direction) — implementation staged, gated on public-launch intent
**Date:** 2026-07-06

## Context

BookBingo started as a fat client: `app/web` uses the Firebase client SDK to
write Firestore directly, and integrity is enforced declaratively in
`firestore.rules`. This was the right call for an MVP among friends. A secondary
long-term goal — a possible **public launch** with additional clients (e.g.
mobile) — stresses that model at exactly one seam: **untrusted writes.**

What the current trust boundary actually looks like (verified in code):

- **Scores are derived, not stored.** `getScoreBreakdown(readings)` runs
  client-side on read (`LeaderboardPage`, `MyBooksPage`, `UserBooksPage`); there
  is no `score` field. This is a genuinely good property — there is no score to
  forge. **The only way to inflate a score is to write fake/invalid `readings`.**
- **`readings` writes are ownership-checked but unvalidated.** The rule is
  `allow write: if request.auth.uid == userId`. Nothing enforces the invariants
  in `lib/core/src/validation.ts` (valid tile IDs, ≤3 tiles unless freebie, a
  real `bookId`). `validation.ts` runs *client-side only*, so it is advisory — a
  bad actor bypasses it by writing to Firestore directly with the SDK.
- **The freebie invariant is not expressible in rules.** Per
  `tbr-reading-payload-unification.md`, a freebie is valid iff freebies across
  `union(readings, tbr) ≤ 1`. Firestore rules can do single-document `get()`
  lookups but cannot practically evaluate a constraint across a whole collection.
  This invariant is *only* enforceable in server code.
- **`/books` is world-writable.** `allow create: if request.auth != null` lets
  any authenticated user create or pollute a **shared, cross-user** collection.
  For a friends' club that's noise; at public scale it is catalog spam and
  forged provenance affecting everyone.
- **Business logic is already framework-agnostic.** `validation.ts`,
  `scoring.ts`, `bookIdentity.ts` live in `lib/core` with no React/Firebase
  imports (a boundary CLAUDE.md defends). They are portable to a Cloud Function
  as-is.

The existing `enrichBook` and `submitFeedback` callables already establish the
server-mediated-write pattern in this codebase. This is not a new capability —
it is extending one we already use.

**Non-goal:** a rewrite. This is incremental hardening at one seam, staged and
reversible, adopted only as far as it earns its keep.

## Decision

Adopt **guarded writes, direct reads** — a deliberately minimal slice of CQRS
("CQRS-lite"): segregate the *command* (write) path from the *query* (read)
path, and nothing else. No separate read store, no event sourcing, no eventual
consistency. One Firestore, strong consistency.

1. **Integrity-critical writes become server-mediated commands.** Writes to
   collections whose contents feed scoring or are shared across users move behind
   callable Cloud Functions that run `lib/core` validation server-side and reject
   invalid intent. Firestore rules for those collections tighten to "the function
   is the writer" (deny direct client writes, or constrain them to fields the
   client is allowed to own).

2. **Reads stay direct on the Firestore client SDK.** All queries — leaderboard
   (`collectionGroup('readings')`), a user's books, score computation, and
   `/books` lookups — continue to read Firestore directly. This preserves
   realtime listeners (`onSnapshot`), offline reads, low cost, and low latency.
   **We do not route reads through the command tier.** The split is asymmetric
   and intentional; eroding it (e.g. "route reads through the API too, for
   consistency") would throw away Firebase's strengths for nothing.

3. **The `/books` read-through lives on the query side, not in the command.**
   (Refines `OPEN_LIBRARY_DEPENDENCY_ROADMAP.md` step 1.) The client reads
   `/books/{bookId}` directly via the SDK — it already knows the id
   (`deriveBookId` is in `lib/core`, and `getBook` already reads `/books` this
   way). **On a cache hit the command tier is never invoked.** Only on a
   miss/stale read does the client call the `enrichBook` command, which fetches
   Open Library and performs the guarded write to `/books`. Staleness policy
   lives in `lib/core`, shared by both paths.

4. **Scope, in priority order (staged, not all-at-once):**
   - **(a) `readings` writes** — the actual abuse vector. `createReading` /
     `updateReading` / `deleteReading` become commands that validate tiles,
     freebie budget (union scope), and `bookId` existence server-side. **Highest
     priority; do this first.**
   - **(b) `/books` writes** — lock the create/update rules to the function;
     enrichment (metadata, `externalIds`, provenance fields from the OL roadmap's
     mid-term) is written server-side where the fetch already happens. Removes
     the shared-collection pollution surface.
   - **(c) `tbr` writes** — plan/edit/promote. Freebie validity is union-scoped,
     so plan-time validation belongs server-side; promotion is already a
     cross-collection batch (natural command).
   - **(d) `/users/{userId}` profile** — low integrity stakes, not scored. **Stays
     a direct client write** under an ownership rule unless a concrete reason
     appears. Explicitly out of scope for server mediation.

5. **The command's contract is narrow.** A command validates intent, enforces
   invariants, persists or rejects — it is *not* a general-purpose backend or a
   data-shaping read API. It may return what the client needs for an optimistic
   update (the created doc, a recomputed projection); that pragmatic leak from
   strict CQRS is accepted and bounded.

## Options Considered

- **Full CQRS / backend-owns-everything (rejected).** Route all reads and writes
  through a server that owns a normalized write model and denormalized read
  projections. Rejected as textbook over-engineering for this project: it means
  rebuilding realtime, offline, and read-scaling that Firebase provides for free
  today, and introduces eventual consistency the app doesn't need. Months of
  work to re-earn the status quo's read ergonomics. This is the "rewrite" the
  user explicitly ruled out.

- **Status quo + tighter Firestore rules only (rejected as sufficient, retained
  as backstop).** Keep all writes client-side, express more validation in rules.
  Rejected as *insufficient* because the load-bearing invariant — freebie
  union(readings, tbr) ≤ 1 — is not expressible in rules, and richer field
  validation in rules is awkward and unmaintainable. Rules remain valuable as a
  **defense-in-depth backstop** (ownership, deny-by-default), but cannot be the
  primary enforcement point for scored writes.

- **Guarded writes, direct reads (adopted).** The minimum split that puts every
  integrity-critical state change through one server-side gate running the
  validation logic that already exists in `lib/core`, while leaving the read path
  — where Firebase is strongest — untouched. Incremental (one collection at a
  time), reversible (rules stay as backstop), and it collapses N future clients'
  duplicated write logic into one server contract.

## Tradeoffs

- **Loses Firestore's offline write queue / optimistic sync for guarded writes.**
  A write routed through a callable no longer queues offline automatically.
  Accepted for *scored* writes (integrity outranks offline convenience for an
  occasional "I finished a book" action) and explicitly avoided for profile
  writes (kept client-side). Optimistic UI can be reconstructed in the client
  while the command is in flight if needed.
- **Adds per-write latency and Cloud Functions cost (cold starts).** Tolerable
  precisely because guarded writes are *low-frequency* (logging a reading is a
  deliberate, occasional act). This is the economic mirror of why `search`
  (high-frequency) stays a cached query-path concern, never a command — see the
  OL roadmap §5.
- **Two enforcement points (function + rules) must agree.** Mitigated by treating
  rules as coarse backstop (ownership, deny direct writes to guarded collections)
  and the function as the fine-grained validator — they overlap by design, not by
  duplication of the full ruleset.
- **Migration touches the write paths in `app/web/src/lib/books.ts`.** `getOrCreateBook`,
  `createReading`, etc. move from direct SDK calls to callable invocations. Reads
  in the same file (`getBook`) stay as-is. Staged per collection, so blast radius
  per step is one write path.
- **Multi-client benefit is real but conditional.** Centralizing write logic pays
  off most when future clients are *heterogeneous* (native Swift/Kotlin that
  can't reuse `lib/`). If mobile is Expo/React Native reusing `lib/`, the security
  argument still holds but the code-reuse argument is weaker. Adopt for the
  security/abuse reason, and take the multi-client benefit as a bonus.

## Relationship to the Open Library roadmap

`OPEN_LIBRARY_DEPENDENCY_ROADMAP.md` was written before this decision and left
one question soft (§6, "who writes `/books`"), recommending the client keep
writing as the "reversible" path. **This decision resolves that question and
inverts the recommendation:**

- The server-side `/books` enrichment write is **no longer deferred** — it is
  scope item (b). Deferring it would mean building a client-write path this
  decision commits to removing (a dead-end, not reversible progress).
- The roadmap's near-term "risk" — *"writing to `/books` from the function
  crosses a trust boundary"* — is **reclassified as the objective**, not a hazard.
- The roadmap's read-through (step 1) moves to the **query side** per Decision 3:
  direct client read of `/books`, command invoked only on cache miss. Cache hits
  cost zero function invocations.

## When to Revisit

- **Revisit scope (d)** (profile writes) if profile fields ever gain integrity
  stakes (e.g. a display name that affects a shared leaderboard in a way that
  invites abuse).
- **Reconsider full CQRS** only if read and write load diverge enough that they
  need independent scaling, or if a materialized leaderboard/score projection
  becomes necessary for performance — neither is remotely true today.
- **Revisit "reads stay direct"** if privacy requirements tighten such that raw
  `readings` should no longer be world-readable (currently required for the
  leaderboard `collectionGroup` query); that would push *some* reads behind a
  server projection and is a data-model decision in its own right.
- If public launch is abandoned, most of this can stay unbuilt — the friends'-club
  threat model doesn't require it. The decision records the *direction* so the
  seam is understood, not a mandate to build now.

## Related

- `docs/OPEN_LIBRARY_DEPENDENCY_ROADMAP.md` — the `/books` read-through and
  enrichment-write sequencing; §6 is resolved by this decision.
- `docs/decisions/tbr-reading-payload-unification.md` — defines the
  union(readings, tbr) freebie invariant that is the canonical example of a rule
  Firestore cannot express and a command must enforce.
- `docs/decisions/book-identity-and-deduplication.md` — `deriveBookId` (in
  `lib/core`) is what lets the client compute `/books` ids for direct read-through
  and lets a command validate `bookId` existence.
- `firestore.rules` — the backstop layer; tightened per scope items (a)–(c) as
  each command lands.
