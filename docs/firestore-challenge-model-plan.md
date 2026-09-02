# Firestore Challenge-Model Plan

Approximates the SQL sketch in `docs/product-model-brainstorm.md` as a Firestore document model. Decisions here are one-way doors (data model + security rules).

## Decisions

1. **Readings are challenge-rooted.** A Reading lives at `/challenges/{cid}/readings/{rid}` with `userId` + `bookId` fields. The challenge is the aggregate root: the query, security, and scoping boundary.
2. **The `ReadingTag` join is an embedded array.** Per-reading tags are tiny and capped, so `tags: string[]` on the Reading doc replaces a join collection — the shape `tiles[]` already has. Promote to a subcollection only if per-association metadata or challenge-wide tag queries are needed (both deferred).
3. **Tags become stored, challenge-scoped documents.** `/challenges/{cid}/tags/{tagId}` with `{ label }`. The global `TILES` constant becomes seed data for one challenge's vocabulary.
4. **Membership is a doc keyed by userId.** `/challenges/{cid}/members/{userId}` gives O(1) `exists()` checks in rules.
5. **Tag cap + freebie rule are per-challenge config** on the `/challenges/{cid}` doc, not `lib/` constants.

## Target layout

```text
/challenges/{cid}                     { name, createdBy, tagCap, freebieRule, createdAt }
/challenges/{cid}/tags/{tagId}        { label }
/challenges/{cid}/members/{userId}    { role, joinedAt }
/challenges/{cid}/readings/{rid}      { userId, bookId, tags[], isFreebie, readAt, createdAt }
/books/{bookId}                       unchanged (global, deterministic id)
/users/{userId}                       unchanged (profile)
/users/{userId}/tbr/{tbrId}           unchanged (TBR stays user-scoped; sketch has no challenge_id on TBR)
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

- `lib/types/src/index.ts` — add `Challenge`, `ChallengeConfig`, `Membership`, `Tag`; add `challengeId`, `userId` to `Reading`; keep `tiles` as a deprecated alias during migration (Parallel Change).
- `lib/core/src/validation.ts` — `MAX_TILES_PER_BOOK` constant → cap passed in from `ChallengeConfig`; `canAssignTile` validates against the challenge's tag set, not global `TILES`.
- `lib/core/src/scoring.ts` — **no change** (vocabulary-agnostic).
- `firestore.rules` — new `/challenges/**` matchers; membership-gated reads/writes; `request.resource.data.userId == request.auth.uid` on reading writes.
- `firestore.indexes.json` — collectionGroup index on `readings.userId` (a user's readings across challenges); `challengeId` not needed (path-scoped).
- `app/web/src/hooks/*`, `lib/books.ts`, `lib/tbr.ts` — repoint reading paths from `/users/{uid}/readings` to `/challenges/{cid}/readings`; add challenge context/selection.
- `scripts/` — new migration script; update seed scripts.

## Ordered phases

1. **Types + validation.** Add the new types; parameterize the cap. No storage change yet. Unit-tested in `lib/`.
2. **Challenge + Membership storage + rules.** Create `/challenges`, `/members`, `/tags`; seed one default challenge from `TILES`; add every existing user as a member. Rules for the new tree.
3. **Migrate readings.** One-way script: copy each `/users/{uid}/readings/{rid}` → `/challenges/{defaultCid}/readings/{rid}` with `userId`, `challengeId`, `tags = tiles`. Model on `scripts/migrate-book-identity.ts`; verify with a read-back script; run staging → prod.
4. **Repoint the app.** Reading queries, leaderboard (`/challenges/{cid}/readings` plain collection query, dropping the global `collectionGroup('readings')` for per-challenge views), and challenge selection UI.
5. **Retire the constant path.** Remove `tiles[]` alias and the global-`TILES`-as-vocabulary assumption once no data or code reads it.

## Validation

- `lib/` unit tests for cap-from-config and challenge-scoped tag validation.
- Emulator integration test: create challenge → join → log reading → leaderboard reflects it; non-member is denied.
- Rules test: a member cannot write a reading with another user's `userId`.
- Migration verify script: reading counts and score parity pre/post.

## Risks & open questions

- **Migration is irreversible** (new document paths). Stage it; keep the source `/users/{uid}/readings` until parity is verified.
- **`freebieRule` shape is undefined in the sketch** — needs a decision (e.g. `{ maxFreebies: number }` vs. a richer rule). Blocks Phase 1's `ChallengeConfig` type.
- **Cap enforcement in rules** would require a `get()` of the challenge config per write (a doc read). Acceptable for a hobby app, or keep cap enforcement client/function-side and let rules check only ownership + membership.
- **Cross-challenge "my readings" view** now needs the collectionGroup index; confirm it's the only such query before adding more.
