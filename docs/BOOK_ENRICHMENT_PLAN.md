# Book Enrichment & Tile Optimization

## Problem

The current book entry experience is entirely manual: users type a title and author, then hand-pick up to 3 bingo tiles. This has several costs:

1. **Tile selection is a guessing game.** Users must mentally map their book to 49 categories and pick the best 3. The scoring system is sophisticated enough that optimal assignment isn't obvious — users leave points on the table.
2. **No shared book identity.** Readings denormalize `bookTitle`/`bookAuthor` as strings. The same book read by two users has no shared reference — aggregation relies on fragile string matching.
3. **Tile eligibility is implicit.** A book may qualify for 8 tiles, but the user only records 3. The other 5 are lost — there's no data to optimize against later.
4. **Entry is tedious.** Users manually type title and author for every book, even popular titles that could be looked up.

## Vision

Transform book entry from a manual, per-user process into a **search-driven, metadata-enriched experience** where:

- Users find books by searching an external catalog (Google Books API)
- Book metadata is stored once and shared across users
- Tile eligibility is partially automated based on metadata and partially user-curated
- An optimization engine assigns tiles to maximize score across all of a user's readings

## Scope

This plan covers four interconnected capabilities, ordered by dependency and user value:

1. **Enriched Book Model** — shared book entity with structured metadata (foundation)
2. **Community Library** — browsable, book-centric view across all users (issue #36)
3. **Book Search & Prefill** — external API integration for book entry
4. **Tile Optimization Engine** — automatic tile assignment from eligible tiles

The community library is prioritized ahead of search and optimization because it delivers immediate user value, validates the enriched book model in a read-heavy context, and is the lighter lift given the existing `useAllReadings()` infrastructure.

### Out of scope (future work)

- Advanced tile inference services (e.g., banned book detection, content analysis)
- Tile eligibility suggestions powered by LLMs or classification models

---

## 1. Enriched Book Model

### Current state

The `Book` type existed in `lib/types/` but was not persisted to Firestore. Readings were created directly at `/users/{userId}/readings/{readingId}` with denormalized `bookTitle` and `bookAuthor` fields. There was no `/books/` collection.

Additionally, three redundant "book-like" types existed: `Book`, `UserBook` (scoring engine input), and `Reading`. The `UserBook` type was a translation layer that only renamed fields. The `Tile` type carried an `isManual` flag from a previous experiment that is no longer relevant.

### Design decisions

**No denormalization.** Readings do not store `bookTitle` or `bookAuthor`. Title and author live exclusively on the `Book` entity. The app fetches the `/books/` collection once via a shared `useBooks()` hook and joins client-side. At the current scale (<100 users, <1000 readings), this join is trivially fast and avoids the consistency cost of denormalized copies.

**`UserBook` eliminated.** The scoring engine now accepts `ScoringInput` — a minimal interface of `{ tiles: string[]; isFreebie: boolean }`. Since `Reading` satisfies this interface structurally, readings can be passed directly to scoring functions with no mapping layer.

**`isManual` removed from `Tile`.** The manual/non-manual distinction was premature optimization for a tile inference feature that hasn't been built. All 49 tiles are now equal. The `canAssignTile()` validation no longer rejects tiles based on this flag.

**Book deduplication.** When a user adds a book, match against existing `/books/` docs by `externalId` (if sourced from API) or `title + author` (if manual). If a match exists, create a new reading pointing to the existing book.

**Migration.** Existing readings have denormalized `bookTitle`/`bookAuthor` but no usable `bookId`. Migration script must: create `/books/` docs for each unique title+author pair, backfill `bookId` on every reading, and remove the denormalized fields. This is a breaking change — migration must complete before deploying the new code.

### Target data model

```
/books/{bookId}
├── title: string
├── author: string
├── metadata
│   ├── pageCount: number | null
│   ├── publishedDate: string | null        # ISO date or year
│   ├── categories: string[]                # genre tags from API
│   ├── language: string | null             # e.g. "en", "es"
│   ├── isbn: string | null
│   └── thumbnailUrl: string | null
├── externalId: string | null               # Google Books volume ID
├── createdBy: string                       # userId of first adder
└── createdAt: timestamp

/users/{userId}/readings/{readingId}
├── bookId: string                          # reference to /books/{bookId}
├── tiles: string[]                         # active tile assignment
├── isFreebie: boolean
├── readAt: timestamp
├── createdAt: timestamp
└── updatedAt: timestamp
```

### Type definitions (`lib/types/`)

```ts
interface Tile {
  id: string;
  name: string;
}

interface BookMetadata {
  pageCount: number | null;
  publishedDate: string | null;
  categories: string[];
  language: string | null;
  isbn: string | null;
  thumbnailUrl: string | null;
}

interface Book {
  id: string;
  title: string;
  author: string;
  metadata: BookMetadata;
  externalId: string | null;
  createdBy: string;
  createdAt: Date;
}

interface Reading {
  id: string;
  bookId: string;
  tiles: string[];
  isFreebie: boolean;
  readAt: Date;
  createdAt: Date;
  updatedAt?: Date;
}

interface ScoringInput {
  tiles: string[];
  isFreebie: boolean;
}
```

### Progress

- [x] `lib/types/` — `BookMetadata` added, `Book` enriched, `Reading` slimmed (no `bookTitle`/`bookAuthor`), `UserBook` removed, `ScoringInput` added, `isManual` removed from `Tile`
- [x] `lib/core/src/constants.ts` — `isManual` stripped from all 49 tile definitions
- [x] `lib/core/src/scoring.ts` — accepts `ScoringInput[]` instead of `UserBook[]`
- [x] `lib/core/src/statistics.ts` — `calculateTileCounts` accepts `ScoringInput[]`
- [ ] `lib/core/src/validation.ts` — remove `isManual` check, update to use `ScoringInput`
- [ ] `lib/core/src/index.ts` — update exports (remove `UserBook` re-exports if any)
- [ ] `lib/core/` tests — update all test files for new types
- [ ] `firestore.rules` — add `/books/{bookId}` collection rules
- [ ] `app/web/src/lib/books.ts` — update CRUD to create Book docs, use `bookId`
- [ ] `app/web/src/lib/mappings.ts` — remove `mapReadingsToUserBooks` (no longer needed)
- [ ] `app/web/src/hooks/` — update `useReadings`, add `useBooks` hook
- [ ] `app/web/src/pages/` and components — join readings with books for display
- [ ] `app/web/` tests and fixtures — update for new model
- [ ] Migration script — backfill `/books/` docs and `bookId` on readings

---

## 2. Community Library (issue #36)

### User experience

A new `/library` tab in the main navigation. Users see a deduplicated, book-centric view of everything the club has read:

- **Book list**: All books, deduplicated via the shared `/books/` collection, sorted alphabetically or by read count
- **Read count badge**: How many club members have read each book
- **Reader list per book**: Expand/click a book to see which users read it (with links to their profiles)
- **Tag aggregation**: All bingo tiles assigned to a book across all readers — surfaces interesting cases where different readers categorized the same book differently
- **Search/filter**: Filter by title, author, or tile category

### Data approach

With the enriched book model (phase 1), deduplication is solved at the data layer — each book has a single `/books/{bookId}` document. The library page queries `/books/` for the list and uses `collectionGroup('readings')` (already indexed) to aggregate reader and tile data.

Two query strategies:

1. **Eager (simpler):** Fetch all books + all readings client-side, join in memory. Works fine at the current scale (<100 users, <1000 readings). This is consistent with the existing `useAllReadings()` pattern used by the leaderboard.
2. **Lazy (future):** Denormalize `readCount` and `readerIds` onto the book document, updated by a Cloud Function trigger on reading writes. Only needed if the collection grows large enough to make eager loading slow.

*Recommendation:* Start with eager. The leaderboard already does this pattern. Migrate to lazy if performance becomes an issue.

### Implementation scope

- New `useBooks()` hook to fetch `/books/` collection
- New `/library` route and `LibraryPage` component
- Book detail view (expandable row or modal) showing readers and their tile assignments
- Navigation tab added to `App.tsx`
- Mobile-responsive layout consistent with existing pages

### Why this comes before search and optimization

- **Immediate user value.** Users have been requesting a way to discover what others are reading. This is the most visible feature for the club.
- **Validates the book model.** The library page exercises the Book → Reading relationship in a read-heavy context. Any data model issues surface here before the more complex write-heavy flows (search, optimization) depend on it.
- **Lower risk.** Primarily a frontend feature on top of the phase 1 data model. No external API dependencies, no algorithmic complexity.

---

## 3. Book Search & Prefill

### User experience

The current "Add Book" flow (type title, type author, pick tiles) is replaced with:

1. **Search**: User types a book title into a search field
2. **Select**: App queries Google Books API, shows matching results with cover, title, author, year
3. **Prefill**: Selecting a result populates title, author, and book metadata
4. **Eligible tiles**: Metadata-derivable tiles are pre-checked (see below); user reviews and adds subjective tiles
5. **Save**: Creates or links to a `/books/` doc, creates the reading with eligible tiles

Manual entry remains available as a fallback (user types title + author directly, skipping search).

### External API: Google Books

Google Books API is the best fit:
- Free, no API key required for basic search (though keyed requests get higher quota)
- Returns title, author, page count, published date, categories, language, ISBN, thumbnail
- No authentication required for public volume search
- Rate limits are generous for a small user base

Endpoint: `GET https://www.googleapis.com/books/v1/volumes?q={query}`

### Automatic tile inference

Book metadata can automatically suggest eligibility for concrete tiles:

| Tile | Inference source | Confidence |
|---|---|---|
| 1000+ pages (`t03`) | `metadata.pageCount >= 1000` | High |
| Under 100 pages (`t04`) | `metadata.pageCount < 100` | High |
| Translated to English (`t11`) | `metadata.language !== 'en'` | Medium |
| Published in birth year (`t37`) | `metadata.publishedDate` + user birth year | High (if birth year known) |
| Part of a series (`t02`) | Series info in API response or title heuristics | Low-medium |
| Graphic novel or cookbook (`t05`) | `metadata.categories` contains genre match | Medium |

All inferred tiles are presented as **pre-checked suggestions** that the user can accept or reject. The user always has final say — inference just reduces manual work.

### Architecture

- **Book search service**: A thin client-side wrapper around Google Books API. Lives in `app/web/src/lib/bookSearch.ts`. No Cloud Function needed — the API is public.
- **Tile inference logic**: Pure function in `lib/core/src/inference.ts`. Takes `BookMetadata` → returns `string[]` of suggested tile IDs. Framework-agnostic, fully testable.
- **Book creation/linking**: When a user selects a search result, check if a `/books/` doc with that `externalId` already exists. If so, link to it. If not, create it. Then create the reading.

---

## 4. Tile Optimization Engine

### Problem

Each reading has an `eligibleTiles` set (potentially many tiles) but can only have up to 3 active tiles (or unlimited for the freebie). The user wants the system to automatically choose which eligible tiles to activate across *all* their readings to maximize their total score.

### Algorithm

This is a constrained combinatorial optimization problem. The scoring function has cross-book coupling (balance factor depends on the distribution across all books), so books can't be optimized independently.

**Approach: Greedy assignment**

1. Start with all tile slots empty
2. For each possible (book, eligible tile) pair, compute the marginal score gain of adding that assignment
3. Assign the pair with the highest marginal gain
4. Repeat until all books have filled their slots (3 per book, unlimited for freebie) or no assignments remain
5. Return the tile assignments per book

**Why greedy works here:**
- The search space is small (~30 books x ~10 eligible tiles x ~43 tile slots = a few thousand candidates per round)
- The scoring function is monotonic — adding a tile never decreases the score (variety points can only go up, volume points can only go up, balance factor may shift but net effect is bounded)
- The balance factor's nonlinearity could theoretically cause greedy to miss the global optimum, but for realistic inputs the difference is negligible

**Freebie handling:** Assign all eligible tiles to the freebie book first (no constraint, always beneficial), then optimize the remaining books.

### Interface

```ts
// lib/core/src/optimizer.ts

interface OptimizedAssignment {
  readingId: string;
  tiles: string[];          // the optimized active tiles for this reading
}

function optimizeTiles(
  readings: { id: string; eligibleTiles: string[]; isFreebie: boolean }[],
  strategy?: ScoringStrategy,
): OptimizedAssignment[]
```

### When optimization runs

- On every change to a reading's eligible tiles
- On book add/remove
- Client-side, synchronous (fast enough for the input sizes involved)
- The optimizer output replaces the `tiles` field on each reading; `eligibleTiles` is the user-curated source of truth

### User experience

The user does NOT manually pick which 3 tiles are "active." They curate eligible tiles, and the optimizer handles the rest. The UI shows:

- The optimized tile assignments (what's active)
- The full eligible tile set (what the optimizer chose from)
- The resulting score breakdown

---

## Implementation Sequence

### Phase 1: Enriched Book Model + Migration
- Remove `isManual` from `Tile` type and all tile definitions
- Remove `UserBook` type; introduce `ScoringInput` for scoring engine
- Remove `bookTitle`/`bookAuthor` from `Reading`; add `bookId` reference
- Add `BookMetadata` interface and enrich `Book` type
- Update scoring engine, validation, and statistics to use `ScoringInput`
- Create `/books/` Firestore collection and update `firestore.rules`
- Update data layer (`createReading`, `updateReading`) to create/link Book docs
- Add `useBooks()` hook; update pages/components to join readings with books
- Remove `mapReadingsToUserBooks` mapping layer
- Write and run migration script for existing data
- Update all tests and fixtures

### Phase 2: Community Library (issue #36)
- New `/library` route, `LibraryPage` component, and navigation tab
- Book detail view showing readers and their tile assignments across users
- Search/filter by title, author, or tile category
- Mobile-responsive layout consistent with existing pages

### Phase 3: Book Search & Prefill
- Implement Google Books API client in `app/web/src/lib/bookSearch.ts`
- Implement tile inference in `lib/core/src/inference.ts` with tests
- Redesign BookForm: search field → result selection → tile curation
- Book deduplication: match on `externalId` before creating new `/books/` doc

### Phase 4: Tile Optimization Engine
- Add `eligibleTiles` field to `Reading` type
- Implement `optimizeTiles()` in `lib/core/src/optimizer.ts`
- Comprehensive tests covering: freebie handling, balance factor optimization, edge cases
- Wire into the reading creation/update flow — optimizer runs after eligible tiles are set
- Update `ScoreDisplay` to reflect optimized assignments

---

## Risks and Open Questions

1. **Google Books API coverage.** Not all books are in Google Books, especially niche/indie titles. Manual entry fallback is essential.
2. **Tile inference accuracy.** Metadata-based inference works for concrete tiles but can't handle subjective ones ("socially taboo", "unreliable narrator"). The UX must make it clear that inference is a starting point, not a final answer.
3. **Migration complexity.** Deduplicating existing readings into shared book entities by string matching will have edge cases (typos, different editions, name variations). May need a lightweight manual review step.
4. **Optimizer correctness.** Greedy is not guaranteed optimal due to balance factor nonlinearity. Should test against brute-force on small inputs to validate that the greedy solution is within an acceptable margin.
5. **Birth year for `t37`.** "Published in birth year" inference requires user birth year, which we don't collect. Either add it to user profile or skip this inference.
