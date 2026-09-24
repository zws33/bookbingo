# Challenge Handlers Checklist

Implementation order for the challenge callables. Numbered rules are in `docs/firestore-challenge-model-plan.md`. Module shape is in CLAUDE.md, `## functions/ Architecture`.

Done: `challenges/schema.ts`, `challenges/store.ts`, `challenges/present.ts`, tests for all three (`c0bb056`). The repository covers the challenge doc only — membership methods are still to write.

## 0. Conform the existing module

- [x] `store.ts` — entities carry `Date`; `ChallengeRepository` + private `firestoreChallenges` + `challengeRepository()`; `ChallengeFields` for writes; `setChallengeStatus` split out of `update`
- [x] `challenges/present.ts` — `ChallengeDTO`, `MembershipDTO`, owns ISO encoding
- [x] `store.ts` — `toMembership` reads `userId` from `doc.id`, pinned by a test where the key and the stored field disagree
- [x] `schema.ts` — typos fixed; requests constrained; `maxTagsPerBook` → `tagCap` (rule 6)
- [ ] `handler.ts` — `challengeHandlers(challengesRepo, usersRepo)` factory; delete `getChallengesCallback`
- [ ] `handler.ts` — import `CallableRequest` from `firebase-functions/v2/https`, as every other handler does
- [ ] `store.ts` — membership methods; re-add `membersCollection` / `memberDoc`, deleted as dead code

## 1. Error taxonomy

- [ ] `common/errors.ts` — add `'forbidden'` to `DomainErrorKind`
- [ ] `callable.ts` — map `forbidden` → `permission-denied`. The switch has no `default`, so the build fails until this lands
- [ ] Rule 18 then maps cleanly: `not-found` → `not-found`, `conflict` → `failed-precondition`, `forbidden` → `permission-denied`

## 2. Pure permission logic

- [ ] `challenges/permissions.ts` (new) — role → permission map, rank comparison (rules 5–7), superadmin claim (rules 29–32). No `firebase-admin` import; unit-tested like `domain/`
- [ ] `canTransition(from, to)` beside the permission map. `setChallengeStatus` writes any value today, so rule 20's one-way lifecycle is unenforced
- [ ] Guards that query Firestore (`requireMembership`, `requireReadAccess`) go in `challenges/store.ts`, **not** a `guards.ts`. `guards.ts` was deleted in `49bbdfc` to break a store↔guards cycle; the plan's "Server — storage and rules" bullet predates that

## 3. Buildable callables

- [ ] `listMyChallenges` — collection-group on `members` (`userId ==`, `status == 'active'`), `cid` from `doc.ref.parent.parent.id`, challenges loaded with `db.getAll`
- [ ] `createChallenge` — transaction below
- [ ] `getChallenge(challengeId)` — gated by `requireMembership`
- [ ] `leaveChallenge` — last-owner check (rule 8) inside the same transaction as the write

### `createChallenge` transaction

1. [ ] Read `/users/{uid}`; throw `conflict` when `challengesCreated >= 5`, unless the token has `superadmin` (rules 26–28, 32)
2. [ ] Write the challenge doc: `status: 'draft'`, `createdBy: uid`
3. [ ] Write `/members/{uid}`: `{ userId, role: 'owner', status: 'active' }`
4. [ ] Increment `challengesCreated`
5. [ ] `logEvent` / `reportWriteFailure` under `challenge.create`; return `{ challengeId }`

## 4. Wire

- [ ] `index.ts` — `challengeRepository()`, then `challengeHandlers(...)`, then each endpoint as `onCall({ invoker: 'public' }, callable(challenges.x, '…'))`. The `callable` wrapper is the only place `DomainError` becomes an `HttpsError`
- [ ] `firestore.indexes.json` — collection-group index on `members` for `userId` + `status`. Collection-group queries get no automatic single-field index, so `listMyChallenges` fails in production without it

## Blocked

- [ ] `joinChallenge`, `createJoinCode`, `revokeJoinCode` — need `/joinCodes` storage and code generation (rules 15–19)
- [ ] `removeMember`, `setMemberRole`, `setChallengeStatus`, `updateChallengeConfig`, `deleteChallenge` — need step 2
- [ ] Tag CRUD — needs `TagDocSchema` and the tile-vs-tag naming decision

## Open decisions

- [ ] `listMyChallenges` return shape: `ChallengeDTO[]`, or each challenge plus the caller's `role`. The UI needs the role to pick which admin controls to show
- [ ] `freebieRule` shape is undefined, so leave it off `createChallenge` rather than writing a placeholder into stored docs
- [ ] Whether `Membership` carries `challengeId`, and whether it comes from the path or a stored field

## Validation

- [ ] Handler tests use a fake repository whose methods reject unless overridden, so an unexpected call fails loudly
- [ ] Unauthenticated and invalid-argument cases for each callable
- [ ] Creation cap: sixth create rejected; delete then create still rejected; superadmin exempt
- [ ] Non-member, `left` and `removed` callers all fail `requireMembership`
- [ ] Deploy functions before hosting on every signature change

## Risk

Reading writes will need `requireMembership` inside their transaction, which makes it a **second cross-aggregate transaction** — the recorded trigger for introducing Unit of Work (CLAUDE.md). Decide before step 3 rather than during it.
