# Firestore Challenge-Model Plan

Approximates the SQL sketch in `docs/product-model-brainstorm.md` as a Firestore document model. Decisions here are one-way doors (data model + callable contracts).

Post-#89 premise: `functions/` is the only reader and writer of Firestore. `firestore.rules` is deny-all and stays that way. Every rule below is enforced in a handler, not a matcher.

## Decisions

1. **Readings are challenge-rooted.** A Reading lives at `/challenges/{cid}/readings/{rid}` with `userId` + `bookId` fields. The challenge is the query, authorization, and scoring boundary.
2. **`userId` is read from the field, never the path.** `readingsByUser` currently derives it from `doc.ref.parent.parent.id`; under a challenge root that resolves to the challenge. The stored field becomes the only source.
3. **The `ReadingTag` join is an embedded array.** Per-reading tags are tiny and capped, so `tags: string[]` on the Reading doc replaces a join collection. Promote to a subcollection only if per-association metadata or challenge-wide tag queries are needed (both deferred).
4. **Tags become stored, challenge-scoped documents.** `/challenges/{cid}/tags/{tagId}` with `{ label }`. The global `TILES` constant becomes seed data for one challenge's vocabulary.
5. **Membership is a doc keyed by userId.** `/challenges/{cid}/members/{userId}` gives an O(1) point read in `requireMembership`. It also stores `userId` as a field: `listMyChallenges` is a collection-group query, which cannot filter on the doc id.
6. **Tag cap + freebie rule are per-challenge config** on the `/challenges/{cid}` doc, not `functions/src/domain/` constants.
7. **Vocabulary renames to "tag" at the storage layer only.** Wire and UI keep `tile` until Phase 6. See Open question 1 — this is provisional.

## Target layout

```text
/challenges/{cid}                     { name, status, createdBy, tagCap, freebieRule, createdAt }
/challenges/{cid}/tags/{tagId}        { label }
/challenges/{cid}/members/{userId}    { userId, role, status, joinedAt }
/challenges/{cid}/readings/{rid}      { userId, bookId, tags[], isFreebie, readAt, createdAt }
/joinCodes/{code}                     { cid, createdBy, createdAt, expiresAt }
/books/{bookId}                       unchanged (global, deterministic id)
/users/{userId}                       profile + challengesCreated
/users/{userId}/tbr/{tbrId}           unchanged (TBR stays user-scoped)
```

## Roles & membership

### Roles

1. Three roles, fixed for every challenge: `owner` > `admin` > `member`. No per-challenge permission config.
2. Every role participates: every member appears on the leaderboard. No spectator role.
3. Only the role string is stored. The role → permission map is code in `functions/src/challenges/permissions.ts`; handlers call `requirePermission(cid, uid, permission)`, never compare role names.
4. `createdBy` is informational. It grants nothing.

### Permissions

| Permission                                    | owner | admin | member |
| --------------------------------------------- | ----- | ----- | ------ |
| Log / edit / delete own readings              | ✓     | ✓     | ✓      |
| View leaderboard, library                     | ✓     | ✓     | ✓      |
| Generate / revoke join codes                  | ✓     | ✓     |        |
| Remove members                                | ✓     | ✓     |        |
| Edit / delete other players' readings         | ✓     | ✓     |        |
| CRUD tags                                     | ✓     | ✓     |        |
| Edit config (`name`, `tagCap`, `freebieRule`) | ✓     | ✓     |        |
| Change roles                                  | ✓     | ✓\*   |        |
| Change status (start, complete)               | ✓     |       |        |
| Delete challenge                              | ✓     |       |        |

\* Admins can only promote a member to admin (rule 6).

### Rank rules

5. An actor acts only on targets of strictly lower rank. Applies to removal, role changes, **and** editing or deleting another player's readings.
6. An actor may grant any role up to and including their own. An owner can promote to owner; an admin can promote to admin.
7. Owners cannot remove or demote other owners. Owner promotion is permanent except by self-demotion, leaving, or superadmin.
8. A challenge always has at least one active owner. The last owner cannot leave or self-demote. Enforced inside the same transaction as the write.
9. Ownership transfer is "promote, then leave." No dedicated operation.

### Membership lifecycle

10. Member `status`: `active` | `left` | `removed`. Member docs are never deleted.
11. Leaving and removal have the same effect on data: readings are kept and excluded from leaderboard and library.
12. `left` users may rejoin with a valid code. They return as `member` with their previous readings visible again.
13. `removed` users cannot rejoin. Only superadmin can reinstate.
14. Non-`active` members fail `requireMembership`, same as non-members.

### Join codes

15. Joining is by code only. There is no user-facing challenge identifier; `cid` stays an opaque Firestore id.
16. A code is a `/joinCodes/{code}` doc: 8 characters, Crockford base32 from `crypto.randomBytes` (~40 bits).
17. Codes are multi-use and expire 72h after creation. Revoke = delete the doc. A Firestore TTL policy on `expiresAt` cleans up expired docs; handlers still check `expiresAt` because TTL deletion is delayed.
18. `joinChallenge(code)`: missing or expired → `not-found`; challenge `complete` → `failed-precondition`; member `removed` → `permission-denied`; `active` → no-op; `left` or absent → `active` `member`.
19. Joining always grants `member`.

### Challenge lifecycle

20. Challenge `status`: `draft` → `active` → `complete`. One-way. Only owners transition. Names provisional.
21. `draft`: config and tags editable, joining allowed, reading writes rejected.
22. `active`: `tagCap`, tag set, and `freebieRule` locked; `name` editable; joining and reading writes allowed.
23. `complete`: readings, membership, and config frozen. Read-only. Deletion still allowed.
24. Deletion is `firestore.recursiveDelete` on the challenge doc. Firestore does not cascade subcollections. Also deletes the challenge's `/joinCodes`.

### Creation cap

25. Any signed-in user can create a challenge and becomes its sole owner.
26. The cap limits creations, not owned challenges: `challengesCreated` on `/users/{uid}`, incremented in the `createChallenge` transaction. Promotions never hit the cap.
27. Deletion does not decrement the counter, so create/delete cannot bypass it.
28. Cap is 5, a constant in `functions/src/`.

### Superadmin

29. A Firebase Auth custom claim `superadmin: true`, read from `request.auth.token`. No Firestore read.
30. Superadmin passes every `requirePermission` check with rank above owner, including removing or demoting owners and reinstating `removed` users.
31. Superadmin has no member doc: absent from leaderboards and excluded from the last-owner count (rule 8).
32. Exempt from the creation cap.
33. Development/operator tool. Expected to change into a support/moderation role if the project grows; nothing else may depend on it.

### Private now, public later

34. All challenges are private. Reads require an `active` membership.
35. Read handlers call `requireReadAccess(cid, uid)`, which today delegates to `requireMembership`. Public read access later changes one function, not every handler.
36. Leaderboard and library payloads expose `displayName` plus an opaque member id, never email.
37. Going public is a per-challenge opt-in, never a migration. Existing readings were shared under "private."
38. If added, `visibility` (who can read) and `joinPolicy` (how you join) are separate fields. Deferred.

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
- `functions/src/index.ts` — new callables: `listMyChallenges`, `createChallenge`, `joinChallenge`, `leaveChallenge`, `removeMember`, `setMemberRole`, `setChallengeStatus`, `updateChallengeConfig`, `deleteChallenge`, `createJoinCode`, `revokeJoinCode`, tag CRUD. `challengeId` added to `listReadings`, `getLeaderboard`, `getLibrary`, `createReading`, `updateReading`, `deleteReading`, `promoteTBREntry`.
- `functions/src/schemas.ts` — `ReadingDocSchema` gains `userId` and `tags`, both **optional** until Phase 5 completes. A required field here silently drops every legacy doc through `mapValid` — a blank leaderboard with no error. New `ChallengeDocSchema`, `MembershipDocSchema`, `TagDocSchema`.

### Server — storage and rules

- `functions/src/readings/store.ts` — the highest-leverage file. `readingsCollection(cid)`, `readingDoc(cid, rid)`, `newReadingFields` gains `userId`. `readingsByUser` switches to the stored `userId` (Decision 2). `allReadingsQuery` (global `collectionGroup('readings')`) is replaced by a per-challenge collection query.
- New `functions/src/challenges/` — `permissions.ts` (role → permission map, rank comparison, superadmin claim), `guards.ts` (`requireMembership`, `requireReadAccess`, `requirePermission`, `requireStatus`), join-code generation, handlers for the membership and lifecycle callables.
- `functions/src/readings/guards.ts` — calls `requireMembership(cid, uid)`; edits to another player's reading add `requirePermission` + rank check (rule 5); writes require `status == 'active'`. `requireNoOtherFreebie` becomes a challenge-scoped composite query on `userId` + `isFreebie`.
- `functions/src/readings/validate.ts` — `validateReadingTiles` takes the challenge's tag set and cap as arguments instead of closing over module-level `TILE_IDS` and `MAX_TILES_PER_BOOK`.
- `functions/src/domain/validation.ts` — `canAssignTile` / `validateBookTiles` take cap + vocabulary as parameters.
- `functions/src/domain/scoring.ts` — **no change** (vocabulary-agnostic).
- `functions/src/library/handler.ts`, `readings/handler.ts` (leaderboard) — both consume `allReadingsQuery()` + `readingsByUser`; both become per-challenge, gated by `requireReadAccess`, and drop readings whose `userId` is not an `active` member (rule 11).
- `functions/src/tbr/handler.ts` — `promoteTBREntry` needs a `challengeId` it does not have today; TBR stays user-scoped, so the challenge is chosen at promote time.
- `firestore.rules` — **no change.** Deny-all already covers a new collection by construction.
- `firestore.indexes.json` — composite index on `readings` for `userId` + `isFreebie` (the freebie guard) and `userId` + `readAt desc` (per-user listing within a challenge). Collection-scoped, not collection-group. Plus a collection-group index on `members` for `userId` + `status` (`listMyChallenges`), and a TTL policy on `joinCodes.expiresAt`.

### Client

- `app/web/src/data/*.ts` — callable wrappers gain `challengeId` in their request types. No Firestore paths exist here to repoint.
- `app/web/src/lib/queryClient.ts` — `readings`, `leaderboard`, `library`, `boardConfig` keys all gain `challengeId`. Without this the cache serves challenge A's data under challenge B.
- `app/web/src/hooks/useTileCatalog.ts` — `staleTime: Infinity` is justified by "the catalog changes with a deploy." That stops being true; key on challenge and drop to a finite stale time.
- `app/web/src/types/schemas.ts` — the client's own `Reading` type (`lib/types` no longer owns it). Add `challengeId`, `userId`.
- New: challenge selection context + switcher UI.
- New: post-sign-in challenge list with an "Add challenge" CTA → create, or join by code.
- New: member management (roles, removal), join-code generation, and start/complete controls, shown per the caller's role. The server is still the enforcement point.

### Types and scripts

- `lib/types/src/index.ts` — add `Challenge`, `ChallengeConfig`, `Membership`, `Tag`. It has no `Reading` to amend; that type lives in three places now (`functions/src/readings/store.ts`, `functions/src/schemas.ts`, `app/web/src/types/schemas.ts`), so Parallel Change has three sites.
- `scripts/` — new `migrate-readings-to-challenge.ts` modeled on `migrate-book-identity.ts`; a read-back verify script; update `seed-emulator.ts`, `seed-staging.ts`, **and `mirror-prod-to-staging.ts`** (the tool that stages the rehearsal). New `set-superadmin.ts` sets the custom claim per project.

## Ordered phases

1. **Types + parameterized domain.** Add the new types; make cap and vocabulary arguments rather than constants. Add the pure permission map and rank rules. No storage change. Unit-tested in `functions/src/domain/` and `functions/src/challenges/`.
2. **Challenge storage + a default challenge.** Create `/challenges`, `/members`, `/tags`; seed one challenge from `TILES` with `status: 'active'`; add every existing user as an `active` `member`, with you as `owner`. Set the superadmin claim. Fix `defaultCid` explicitly — it is a one-way door.
3. **Challenge-scoped handlers.** `getBoardConfig(challengeId)`, membership/permission/status guards, per-challenge reading/leaderboard/library queries, membership and lifecycle callables. Handlers still read the old path; only the signatures and guards change. Deploy functions before hosting.
4. **Migrate readings.** Copy `/users/{uid}/readings/{rid}` → `/challenges/{defaultCid}/readings/{rid}` with `userId`, `tags = tiles`. Verify parity, then cut over. See Risk 1 for the double-count hazard.
5. **Repoint the client.** Payloads, query keys, challenge selection UI.
6. **Retire the constant path.** Remove the `tiles[]` alias, the global-`TILES`-as-vocabulary assumption, and the legacy `/users/{uid}/readings` tree.

## Validation

- `functions/src/domain/` unit tests for cap-from-config and challenge-scoped tag validation.
- `functions/src/readings/handler.test.ts` — a non-member's read and write are both rejected; so are a `left` or `removed` member's.
- Permission matrix: one test per table row × role, plus the rank cases — admin cannot edit an owner's reading, owner cannot demote an owner, admin can promote to admin but not owner.
- Last-owner invariant: sole owner's leave and self-demotion are rejected; with two owners, both succeed.
- Join codes: expired, revoked, `removed` user, and `complete` challenge are rejected; `left` user rejoins as `member` with readings restored to the leaderboard.
- Lifecycle: reading write in `draft` rejected; `tagCap`/tag edit in `active` rejected; any write in `complete` rejected; status cannot move backward.
- Creation cap: sixth create rejected; delete then create still rejected; superadmin exempt.
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
- **Leaderboard reads the member list.** Excluding non-`active` members adds one `members` collection read per leaderboard/library call. Small at current scale; the number to watch alongside write cost.
- **Removal is not revocation of past data.** A `removed` user's readings stay stored indefinitely. Deleting them is a separate, unscoped decision.
- **Deploy ordering is two-sided.** Functions and hosting deploy separately (established by #89). A stale tab meets a new signature on every phase boundary.
