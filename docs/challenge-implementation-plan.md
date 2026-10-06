# Challenge Implementation Plan

Completes the challenge container on Postgres. Rules are numbered in `docs/challenge-model.md`; module shape is CLAUDE.md, `## functions/ Architecture`. Supersedes `docs/challenge-handlers-checklist.md`.

Assumes Postgres replaces Firestore. The spike that decides it is step 1 and gates everything after step 2.

## Done

`challenges/` already holds `permissions.ts` (roles, ranks, permission table, superadmin), `joinCode.ts`, request schemas in `schema.ts`, and `present.ts`. `readings/validate.ts` takes the vocabulary and cap as arguments. `db/migrations/0001`–`0007` define the target schema. None of it needs reverting.

Not done: any handler, any guard, any Postgres access, tags, and every callable listed below.

One deletion: `MAX_CHALLENGES_CREATED` and `exceedsCreationCap` in `permissions.ts`, plus their four cases in `permissions.test.ts`. The creation cap is dropped (`challenge-model.md` rule 39) and nothing counts creations.

## Ordered steps

1. **Close the storage spike.** `readings.list` + `getLeaderboard` on Postgres behind the existing `ReadingRepository`, deployed to staging. Retires Cloud Functions → Cloud SQL connectivity and the local loop replacing the Firestore emulator. New: a `pg` dependency, `functions/src/db/pool.ts`, a migration runner over `db/migrations/`, and `docker-compose.yaml` wired into `pnpm test`.
2. **Guards (storage-agnostic, ships now).** `challenges/guards.ts` — `requireMembership`, `requireReadAccess`, `requirePermission`, `requireStatus`. Pure functions over an already-fetched `Challenge`, `Membership | undefined` and `Actor`; they throw `DomainError`, they never read. The read stays in the handler, so guards stay unit-testable with no fake repository. A non-member gets `not-found`, not `forbidden` (`common/errors.ts`).
3. **`inTransaction`.** One helper in `functions/src/db/` handing a client to a callback. Repositories take an optional client, so a cross-aggregate write (promote, create challenge, rotate code) composes by passing that client inward. Done — see `docs/postgres-repositories-plan.md`.
4. **Repositories.** Rewrite `store.ts` for `users`, `books`, `readings`, `tbr`, `challenges`; add `tags/store.ts`. `store.ts` becomes the only importer of `pg` in place of `firebase-admin`. Entities keep carrying `Date`.
5. **Handlers and composition.** `challenges/handler.ts` and `tags/handler.ts` as `xHandlers(...repos)` factories. `getBoardConfig` takes a `challengeId` and serves stored tags plus `tag_cap`; `readings`, `library` and `tbr` handlers take a `challengeId`, call the guards, and drop rows whose author is not `active` (rule 24). Wire in `index.ts`.
6. **New callables.** `listMyChallenges`, `getChallenge`, `createChallenge`, `joinChallenge`, `leaveChallenge`, `removeMember`, `setMemberRole`, `setChallengeStatus`, `updateChallengeConfig`, `deleteChallenge`, `rotateJoinCode`, and tag create/update/delete. `challengeId` added to `listReadings`, `getLeaderboard`, `getLibrary`, `createReading`, `updateReading`, `deleteReading`, `listMyTBR`, `createTBREntry`.
7. **Migrate.** Firestore → Postgres in dependency order: `users`, `books` + `book_external_refs`, one default challenge seeded from `TILES`, `memberships` for every existing user with you as `owner`, then `readings` + `reading_tags`, then `tbr_entries`. Tag ids become uuids, so every stored `t01`-style id needs a remap table built during the tag insert. Superadmin claim set by a new `scripts/set-superadmin.ts`.
8. **Client.** `challengeId` in every request type and every `queryClient` key — without it the cache serves challenge A's data under challenge B. Challenge selection context and switcher, post-sign-in challenge list with create and join-by-code, member management and lifecycle controls gated on the caller's role. `useTileCatalog`'s `staleTime: Infinity` is justified by "the catalog changes with a deploy"; that stops being true, so key it on challenge and drop to a finite time.
9. **Retire Firestore.** Delete `store.ts` Firestore paths, `firestore.rules`, `firestore.indexes.json`, the emulator scripts and the `firebase-admin` dependency from `functions/`. Hosting stays.

## Validation

- `pnpm run verify` after every commit.
- Guards, permissions and lifecycle: `node:test` units, no database. Tables get a cell-by-cell loop against a transcription of `challenge-model.md`, not spot checks.
- Repository tests run against the throwaway Postgres in `docker-compose.yaml`, migrations applied per run.
- Constraint tests, which is the point of moving: a reading for a non-member, a tag from another challenge, a second freebie, a duplicate label differing only in case, and deleting a tag with history must all fail at the database.
- Permission matrix: one test per table row × role, plus admin-cannot-edit-an-owner's-reading, owner-cannot-demote-an-owner, admin-can-promote-to-admin-but-not-owner.
- Last owner: sole owner's leave and self-demotion rejected; with two owners, both succeed.
- Join codes: rotated-away code, `removed` member and `complete` challenge rejected; rotation leaves exactly one live row.
- Lifecycle: reading write in `draft` rejected; `tag_cap` or tag edit in `active` rejected; any write in `complete` rejected; status cannot move backward.
- Migration: reading counts and score parity per user, pre and post.

## Risks

- **Migration is one-way.** New ids in a new database. Keep Firestore readable until parity is verified, and do not dual-write — two stores with no shared transaction will diverge.
- **Deploy ordering is two-sided.** Functions and hosting deploy separately, so every step that changes a callable signature ships functions first. A stale tab meets a new signature at each boundary.
- **Connection count.** Cloud Functions scale to instances, not threads. `maxInstances: 10` bounds it today; a pool of more than a few per instance will exhaust Cloud SQL before traffic justifies it.
- **Tag delete is `restrict`.** Once a tag has history, superadmin cannot delete it either. That is deliberate, but the error needs to say so rather than surfacing a constraint violation.

## Open decisions

These need your input; each blocks the step named.

1. **`createChallenge` rate limit** (blocks step 6). Dropping the creation cap leaves the abuse it bounded unhandled. `maxInstances: 10` caps spend, not row count, so a loop can still fill `challenges`. Options: a per-uid limiter in front of the write, or accept it at current scale and revisit. Recommend accepting it and writing that down — the app is a private book club, and a limiter is cheap to add once the request layer exists.
2. **`listMyChallenges` return shape** (blocks step 6). `ChallengeDTO[]`, or each challenge plus the caller's role, which the UI needs to pick admin controls. Recommend including the role — the membership row is already read to authorize the call.
3. **Leaving a `complete` challenge** (blocks step 6). Rule 36 freezes membership; whether self-service leave counts is unsaid, and `leave` is deliberately absent from `ChallengeAction` rather than guessed.
4. **Default challenge id** (blocks step 7). Every migrated reading gets it. Fix it explicitly in the migration script, not by whatever `gen_random_uuid()` returns on the day.
