# Challenge Implementation Checklist

Storage-agnostic challenge work ships now. Firestore-specific work is parked until the Postgres decision. Numbered rules are in `docs/firestore-challenge-model-plan.md`; module shape is in CLAUDE.md, `## functions/ Architecture`.

## Why the split

- Rule 1 re-roots readings to `/challenges/{cid}/readings/{rid}` — a full backfill. Running it into Firestore and again into Postgres is the same migration twice, and the Firestore one has no constraints to catch what it breaks.
- Unit of Work (CLAUDE.md) is triggered only by Firestore scoping transactions to a callback. The decision does not exist in Postgres.
- Pure rules — permissions, lifecycle, join codes, request schemas, validation — survive either store unchanged.

## Done

Branch `feat/challenge-forbidden-error`. Earlier work on `main`: `challenges/schema.ts`, `store.ts`, `present.ts`, membership reads (`c0bb056`, `c907d07`).

| Commit    | Scope                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------- |
| `9685eef` | `forbidden` `DomainErrorKind`, mapped to `permission-denied` in `callable.ts`                       |
| `c65cd0d` | deleted the unwired `challenges/handler.ts` stub                                                    |
| `e3ca7ad` | `challenges/permissions.ts` — roles, ranks, permission table, creation cap, superadmin (5–7, 26–32) |
| `b63ad84` | `statusAllows` + `canTransition`, same file (18, 20–23)                                             |

## Remaining — storage-agnostic

- [x] **5.** `challenges/joinCode.ts` — `generateJoinCode()` (6 chars, Crockford base32, one byte masked to 5 bits) and `normalizeJoinCode()` (16–17)
- [x] **6.** `challenges/schema.ts` request schemas for `joinChallenge`, `leaveChallenge`, `removeMember`, `setMemberRole`, `setChallengeStatus`, `updateChallengeConfig`, `deleteChallenge`, `rotateJoinCode`. `updateChallengeConfig` carries `{ name?, tagCap? }`, one required; `joinChallenge` normalizes the code in the schema
- [ ] **7a.** Delete `domain/index.ts`, `domain/tiles.ts`, and `canAssignTile` / `validateBookTiles` / `validateFreebie` — all have zero callers. Move `MAX_TILES_PER_BOOK` to `domain/constants.ts` beside `TILES`; delete `domain/validation.ts`
- [ ] **7b.** `readings/validate.ts` — `validateTileIds(tiles, validIds)` and `validateReadingTiles(tiles, isFreebie, validIds, maxTiles)`. The five call sites pass the constants directly

Not in 7b: injecting the catalog into the handler factories. It becomes a per-request lookup keyed by `challengeId`, so a factory parameter would be written twice.

## Parked — needs the storage decision

- `store.ts` membership writes, `getMany`, `requireMembership` / `requireReadAccess`
- The `createChallenge` transaction: cap check, challenge doc, owner member doc, counter increment
- Every handler body that calls a repository, and the `index.ts` wiring
- `firestore.indexes.json` — collection-group `members` (`userId` + `status`); `readings` (`userId` + `isFreebie`, `userId` + `readAt desc`)
- `getBoardConfig(challengeId)` — needs stored tags
- Tag CRUD — also blocked on `TagDocSchema`
- Unit of Work — a Firestore-only problem

## Open decisions

- [x] **tile vs tag — `tag` wins server-side.** Scoring reads tag ids as opaque strings, so nothing persisted depends on the display; `tile` couples a book-attribute relation to one visual form the product may drop. The client keeps `tile` with shims at the boundary, and a later refactor narrows it to the board view. No rename in `challenges/`
- [ ] **Leaving a `complete` challenge.** Rule 23 freezes membership but does not say whether self-service leave counts. `leave` is deliberately absent from `ChallengeAction` rather than guessed
- [ ] **Freebie scope** — per-user, per-challenge or global. Determines the guard's query
- [ ] **`freebieRule` shape** — undefined, so it stays off `createChallenge` and `updateChallengeConfig`
- [ ] **`listMyChallenges` return shape** — `ChallengeDTO[]`, or each challenge plus the caller's role, which the UI needs to pick admin controls

## Validation

- `pnpm run verify` after every commit.
- New tests are `node:test` units beside each file. No emulator, no fake repositories — nothing here touches storage.
- Tables get a cell-by-cell loop against a transcription of the doc, not spot checks. Done for permissions and lifecycle; join codes still need alphabet, length, distinctness and the expiry boundary.

## Risks

- The last-owner invariant (rule 8) counts active owners, so it stays in the write transaction and cannot move into `permissions.ts`.
- If the Postgres migration is declined, the parked list resumes as written. Nothing in commits 1–7 needs reverting either way.
