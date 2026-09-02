# Product & Data Model Brainstorm

## Core premise

A user tracks which books they've read and which tags they associate with each. The composition of a user's tags across their read books determines their score. Every other feature stems from this.

## Established facts

### Book

- A globally-shared canonical record, sourced from Open Library.
- Pure "work" data only (title, author, page count, etc.). A Book knows nothing about how it is used — no tags, no readings, no scoring.
- The application database is the default source for book data. Open Library is queried only when a requested book is not already in the database.

### Tag

- Its own entity. Arbitrary, player-defined vocabulary.
- Not inherent to a book. A tag's association with a book is driven by user choice.
- Validity of an association is social — determined by player consensus, not enforced by the data model. The system permits an incorrect association; players regulate it out-of-band.

### Tag association hangs off a Reading

- A tag association can only exist with respect to a Reading.
- The aggregate Book↔Tag relationship is **derivable from the data, not a stored or independently-enforced edge.** A book-level view of tags is composed on demand by aggregating over readings.

### Challenge (container) — name TBD

- A scoping entity above everything. "Board" is its visual presentation, not a separate data entity.
- Exists to support: a user in multiple challenges at once (parallel friend groups), and a group running challenges serially (a new one per period).
- Scopes: its tag vocabulary (a set of tags established by that group, for that challenge only); its membership; each player's progress and scores (computed within the challenge); its rules.
- Rules are per-challenge and configurable by the challenge's creators — notably the per-reading tag cap (anti-gaming limit plus a single "freebie" exception). The cap is not a global constant.

### Current scoring behavior (from `lib/core/src/scoring.ts`, to be preserved)

- Per user, over their read books' tags:
  - Variety = count of distinct tags with ≥1 book (1 point each, never penalized).
  - Volume = repeat books per tag with harmonic diminishing returns (2nd book in a tag = +0.5).
  - Balance = `1/(1+CV²)` over per-tag counts; scales volume only, never variety.
  - Score = variety + (volume × balance).

## Working model (SQL sketch)

```text
Challenge  (id, name, created_by, tag_cap, freebie_rule, …config)   -- the container
Users      (id, profile…)
Books      (id, …work data…)                                        -- knows nothing about usage

Membership (challenge_id → Challenge, user_id → Users, role?)       -- who plays which challenge
Tags       (id, challenge_id → Challenge, label)                    -- vocabulary, scoped to a challenge
Reading    (id, user_id, book_id, challenge_id → Challenge, read_at, …)  -- scoped to a challenge
TBR        (id, user_id, book_id, …)
ReadingTag (reading_id → Reading, tag_id → Tags)                    -- a tag on a specific reading
```

## Resolved: what a Reading belongs to

A Reading is scoped to a challenge: `(user, book, challenge_id, read_at)`. The same book read for two challenges produces two Reading rows. The per-reading tag cap is enforced on the Reading row. A reading counts toward exactly one challenge; readings are not shared across challenges.

A Challenge is not time-bounded. `read_at` is not constrained to a window for a reading to count.

## Deferred (explicitly out of scope for now)

- `getTagsForBook(bookId)` — a theoretical future utility to aggregate all tags associated with a book. How this information is surfaced (counts, who assigned which tag) is downstream of the model and belongs to a later design brainstorm.
- Final naming of the container ("Challenge" vs "Board" vs other).
