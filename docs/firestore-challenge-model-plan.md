# Firestore Challenge-Model Plan

Approximates the SQL sketch in `docs/product-model-brainstorm.md` as a Firestore document model. Decisions here are one-way doors (data model + callable contracts).

Post-#89 premise: `functions/` is the only reader and writer of Firestore. `firestore.rules` is deny-all and stays that way. Every rule below is enforced in a handler, not a matcher.

## Decisions

1. **Readings are challenge-rooted.** A Reading lives at `/challenges/{cid}/readings/{rid}` with `userId` + `bookId` fields. The challenge is the query, authorization, and scoring boundary.
2. **`userId` is read from the field, never the path.** `readingsByUser` currently derives it from `doc.ref.parent.parent.id`; under a challenge root that resolves to the challenge. The stored field becomes the only source.
3. **The `ReadingTag` join is an embedded array.** Per-reading tags are tiny and capped, so `tags: string[]` on the Reading doc replaces a join collection. Promote to a subcollection only if per-association metadata or challenge-wide tag queries are needed (both deferred).
4. **Tags become stored, challenge-scoped documents.** `/challenges/{cid}/tags/{tagId}` with `{ label }`. The global `TILES` constant becomes seed data for one challenge's vocabulary.
5. **Membership is a doc keyed by userId.** `/challenges/{cid}/members/{userId}` gives an O(1) point read in `requireMembership`.
6. **Tag cap + freebie rule are per-challenge config** on the `/challenges/{cid}` doc, not `functions/src/domain/` constants.
7. **Vocabulary renames to "tag" at the storage layer only.** Wire and UI keep `tile` until Phase 6. See Open question 1 — this is provisional.

## Target layout

```text
/challenges/{cid}                     { name, createdBy, tagCap, freebieRule, createdAt }
/challenges/{cid}/tags/{tagId}        { label }
/challenges/{cid}/members/{userId}    { role, joinedAt }
/challenges/{cid}/readings/{rid}      { userId, bookId, tags[], isFreebie, readAt, createdAt }
/books/{bookId}                       unchanged (global, deterministic id)
/users/{userId}                       unchanged (profile)
/users/{userId}/tbr/{tbrId}           unchanged (TBR stays user-scoped)
```

## Mapping to the sketch

| Sketch                                                  | Firestore                                                      |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| `Challenge (id, name, tag_cap, freebie_rule)`           | `/challenges/{cid}` doc                                        |
| `Membership (challenge_id, user_id, role)`              | `/challenges/{cid}/members/{userId}`                           |
| `Tags (id, challenge_id, label)`                        | `/challenges/{cid}/tags/{tagId}`                               |
| `Reading (id, user_id, book_id, challenge_id, read_at)` | `/challenges/{cid}/readings/{rid}` + `userId`, `bookId` fields |
| `ReadingTag (reading_id, tag_id)`                       | `tags: string[]` on the Reading doc                            |
| `TBR`, `Books`, `Users`                                 | unchanged from today                                           |

## Files to change

### Server — contracts

- `functions/src/config/handler.ts` — `getBoardConfig` takes a `challengeId` and serves that challenge's tags + `tagCap` from stored docs, not `TILES` + `MAX_TILES_PER_BOOK`. This is the client's only source of vocabulary and cap; nothing else can move until it does.
- `functions/src/index.ts` — new callables: `listMyChallenges`, `createChallenge`, `joinChallenge`. `challengeId` added to `listReadings`, `getLeaderboard`, `getLibrary`, `createReading`, `updateReading`, `deleteReading`, `promoteTBREntry`.
- `functions/src/schemas.ts` — `ReadingDocSchema` gains `userId` and `tags`, both **optional** until Phase 5 completes. A required field here silently drops every legacy doc through `mapValid` — a blank leaderboard with no error. New `ChallengeDocSchema`, `MembershipDocSchema`, `TagDocSchema`.

### Server — storage and rules

- `functions/src/readings/store.ts` — the highest-leverage file. `readingsCollection(cid)`, `readingDoc(cid, rid)`, `newReadingFields` gains `userId`. `readingsByUser` switches to the stored `userId` (Decision 2). `allReadingsQuery` (global `collectionGroup('readings')`) is replaced by a per-challenge collection query.
- `functions/src/readings/guards.ts` — new `requireMembership(cid, uid)`. `requireNoOtherFreebie` becomes a challenge-scoped composite query on `userId` + `isFreebie`.
- `functions/src/readings/validate.ts` — `validateReadingTiles` takes the challenge's tag set and cap as arguments instead of closing over module-level `TILE_IDS` and `MAX_TILES_PER_BOOK`.
- `functions/src/domain/validation.ts` — `canAssignTile` / `validateBookTiles` take cap + vocabulary as parameters.
- `functions/src/domain/scoring.ts` — **no change** (vocabulary-agnostic).
- `functions/src/library/handler.ts`, `readings/handler.ts` (leaderboard) — both consume `allReadingsQuery()` + `readingsByUser`; both become per-challenge and membership-gated.
- `functions/src/tbr/handler.ts` — `promoteTBREntry` needs a `challengeId` it does not have today; TBR stays user-scoped, so the challenge is chosen at promote time.
- `firestore.rules` — **no change.** Deny-all already covers a new collection by construction.
- `firestore.indexes.json` — composite index on `readings` for `userId` + `isFreebie` (the freebie guard) and `userId` + `readAt desc` (per-user listing within a challenge). Collection-scoped, not collection-group.

### Client

- `app/web/src/data/*.ts` — callable wrappers gain `challengeId` in their request types. No Firestore paths exist here to repoint.
- `app/web/src/lib/queryClient.ts` — `readings`, `leaderboard`, `library`, `boardConfig` keys all gain `challengeId`. Without this the cache serves challenge A's data under challenge B.
- `app/web/src/hooks/useTileCatalog.ts` — `staleTime: Infinity` is justified by "the catalog changes with a deploy." That stops being true; key on challenge and drop to a finite stale time.
- `app/web/src/types/schemas.ts` — the client's own `Reading` type (`lib/types` no longer owns it). Add `challengeId`, `userId`.
- New: challenge selection context + switcher UI.

### Types and scripts

- `lib/types/src/index.ts` — add `Challenge`, `ChallengeConfig`, `Membership`, `Tag`. It has no `Reading` to amend; that type lives in three places now (`functions/src/readings/store.ts`, `functions/src/schemas.ts`, `app/web/src/types/schemas.ts`), so Parallel Change has three sites.
- `scripts/` — new `migrate-readings-to-challenge.ts` modeled on `migrate-book-identity.ts`; a read-back verify script; update `seed-emulator.ts`, `seed-staging.ts`, **and `mirror-prod-to-staging.ts`** (the tool that stages the rehearsal).

## Ordered phases

1. **Types + parameterized domain.** Add the new types; make cap and vocabulary arguments rather than constants. No storage change. Unit-tested in `functions/src/domain/`.
2. **Challenge storage + a default challenge.** Create `/challenges`, `/members`, `/tags`; seed one challenge from `TILES`; add every existing user as a member. Fix `defaultCid` explicitly — it is a one-way door.
3. **Challenge-scoped handlers.** `getBoardConfig(challengeId)`, `requireMembership`, per-challenge reading/leaderboard/library queries. Handlers still read the old path; only the signatures and guards change. Deploy functions before hosting.
4. **Migrate readings.** Copy `/users/{uid}/readings/{rid}` → `/challenges/{defaultCid}/readings/{rid}` with `userId`, `tags = tiles`. Verify parity, then cut over. See Risk 1 for the double-count hazard.
5. **Repoint the client.** Payloads, query keys, challenge selection UI.
6. **Retire the constant path.** Remove the `tiles[]` alias, the global-`TILES`-as-vocabulary assumption, and the legacy `/users/{uid}/readings` tree.

## Validation

- `functions/src/domain/` unit tests for cap-from-config and challenge-scoped tag validation.
- `functions/src/readings/handler.test.ts` — a non-member's read and write are both rejected.
- `app/web/src/data/readings.int.test.ts`, `tbr.int.test.ts` — the existing emulator harness, extended: create challenge → join → log reading → leaderboard reflects it.
- `app/web/src/data/rules.int.test.ts` — unchanged; still asserts the client SDK is denied.
- Migration verify script: reading counts and score parity pre/post, per user.
- Deploy-order check: every phase that changes a callable signature ships functions first, hosting second.

## Risks & open questions

- **Double-counting during Parallel Change.** `collectionGroup('readings')` matches by collection id, so while both trees exist the leaderboard and library count every reading twice. Cut `allReadingsQuery` over to the per-challenge query _before_ the copy runs, or name the new subcollection differently.
- **Migration is irreversible** (new document paths). Stage it; keep `/users/{uid}/readings` until parity is verified — subject to the hazard above.
- **`freebieRule` shape is undefined in the sketch.** Blocks Phase 1's `ChallengeConfig`.
- **Freebie scope is undecided** — per-user (today), per-challenge, or global. Determines the guard's query and whether the Phase 4 parity check is well-defined. Blocks Phase 3, ahead of `freebieRule`'s shape.
- **tile vs. tag, name vs. label.** Three names for one concept across `getBoardConfig`'s `Tile { id, name }`, the plan's `Tag { label }`, and every component (`TileSelector`, `TileBadge`, `useTileCatalog`). Pick one before Phase 1 or the rename leaks everywhere.
- **Write cost per reading.** Each write already reads the book doc in its transaction; membership + config add two more. Three point reads per write — acceptable, but it is the number to watch.
- **Deploy ordering is two-sided.** Functions and hosting deploy separately (established by #89). A stale tab meets a new signature on every phase boundary.
