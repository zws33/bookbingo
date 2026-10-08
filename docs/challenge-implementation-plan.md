# Challenge Implementation Plan

Completes the challenge container on Postgres (Neon). Rules are numbered in `docs/challenge-model.md`; module shape is CLAUDE.md, `## functions/ Architecture`. The Firestore→Neon copy has its own plan: `docs/data-migration-plan.md`.

## Base

`db/migrations/0001`–`0007` and the six `postgresStore.ts` files are the target schema and the target data access, and are done. Neither changes to accommodate what is left — handlers, presenters and the client change to accommodate them.

Firestore stays intact and readable for the whole sequence. Nothing dual-writes.

Still absent: `challenges/guards.ts`, every challenge and tag handler, every v2 callable, and any Postgres access from a deployed function.

## Environments

Cloud SQL is out; Neon replaces it. `pool.ts` needs no change — Neon is a non-loopback host, so `sslFor` already returns `{ rejectUnauthorized: true }`.

| Database                                       | Named by                            | Role                                        |
| ---------------------------------------------- | ----------------------------------- | ------------------------------------------- |
| Docker `bookbingo_test`                        | `DATABASE_URL`, `TEST_DATABASE_URL` | Local dev and `test:db`. tmpfs, disposable. |
| Neon branch `integration`, db `bookbingo_test` | `TEST_DATABASE_URL`                 | `test:db` against Neon.                     |
| Neon `staging`                                 | `DATABASE_URL` (staging secret)     | Migrated data, manual testing.              |
| Neon `prod`                                    | `DATABASE_URL` (prod secret)        | Migrated data, live after cutover.          |

1. The integration branch is the only Neon database the test harness may touch — `reset()` truncates every table it finds.
2. `requireTestDatabaseUrl` demands a name ending `_test`, so that branch's database is `bookbingo_test`, not Neon's default `neondb`. **The staging and prod databases must not end `_test`**: that suffix is the whole guard keeping the harness off them, and it is a naming decision made once, here.
3. Integration tests and manual testing use different databases on purpose: pointing `test:db` at staging truncates the data staging exists to hold.
4. Functions use a Neon **pooled** connection string, not a direct one.

## Versioning

v1 callables stay exported and Firestore-backed, untouched. v2 callables are added beside them, Postgres-backed, with a `V2` export suffix (`listReadingsV2`). Both ship from one codebase and one deploy; the client repoints one endpoint at a time; v1 dies at step 9.

A suffix rather than a second codebase or region: a callable's name is its export name, so the suffix is the entire mechanism — no new deploy target, no routing.

## Ordered steps

1. **Provision Neon.** Three branches. Mark `integration` only. Bind `DATABASE_URL` as a Firebase secret per project, listed in the `secrets` of every v2 callable. Run `db:migrate` against all three.
2. **Data migration script.** `docs/data-migration-plan.md`. Validated against the local container, then run against **staging**.
3. **Guards.** `challenges/guards.ts` — `requireMembership`, `requireReadAccess`, `requirePermission`, `requireStatus`. Pure functions over an already-fetched `Challenge`, `Membership | undefined` and `Actor`. They throw `DomainError` and never read, so the read stays in the handler and the tests need no fake repository. A non-member gets `not-found`, not `forbidden`.
4. **v2 handlers.** `challenges/handler.ts` and `tags/handler.ts` as `xHandlers(...repos)` factories. `readings`, `library` and `tbr` get challenge-scoped handlers that call the guards and drop rows whose author is not `active` (rule 24). `present.ts` gains `tagIds`. Split per domain, as the repositories were.
5. **v2 callables.** `listMyChallengesV2`, `getChallengeV2`, `createChallengeV2`, `joinChallengeV2`, `leaveChallengeV2`, `removeMemberV2`, `setMemberRoleV2`, `setChallengeStatusV2`, `updateChallengeConfigV2`, `deleteChallengeV2`, `rotateJoinCodeV2`, tag create/update/delete, and a `challengeId`-taking v2 of each reading, library and TBR callable. `getBoardConfigV2` serves stored tags plus `tag_cap` instead of `TILES`.
6. **Manual testing on staging.** Web app pointed at the staging project against v2 endpoints. Board renders stored tags; readings, leaderboard, library and TBR match prod.
7. **Rehearse against prod.** A full run into Neon prod, unfrozen. Nothing reads it yet; this proves the script against real volume before it matters. Clear prod afterwards — the migration script requires an empty destination, so the rehearsal's rows would otherwise block the cutover run (`docs/data-migration-plan.md`).
8. **Client migration.** `challengeId` in every request type and every `queryClient` key — without it the cache serves challenge A's data under challenge B. Challenge selection context and switcher, post-sign-in challenge list, member management gated on role. `useTileCatalog`'s `staleTime: Infinity` is justified by "the catalog changes with a deploy"; that stops being true, so key it on challenge and drop to a finite time.
   Cutover order: freeze v1 writes, run the migration against empty prod, deploy the client, unfreeze. The freeze covers the whole migration rather than a delta, which is why the rehearsal at step 7 measures how long that is. The freeze is a `/system/maintenance` Firestore flag read by v1 write callables — instant to flip without a redeploy, and it disappears with Firestore at step 9.
9. **Retire Firestore.** Delete the v1 callables, the Firestore `store.ts` paths, `firestore.rules`, `firestore.indexes.json`, the emulator scripts and `firebase-admin` from `functions/`. Rename each `postgresStore.ts` to `store.ts`. Hosting stays.

## Validation

- `pnpm run verify` after every commit; `pnpm run test:db` before every push.
- Guards, permissions and lifecycle are `node:test` units with no database. The permission and transition tables get a cell-by-cell loop against a transcription of `challenge-model.md`, not spot checks.
- Step 1 is not done until `test:db` passes against the integration branch **and** fails against staging.
- Migration parity: `docs/data-migration-plan.md`.

## Risks

- **Step 4 is the big one.** The Postgres repositories could not keep the Firestore interfaces: `readings.challenge_id` is `not null` with a composite foreign key to `memberships`, and `reading_tags.tag_id` is a uuid, so every reading and TBR signature gained `challengeId` and `tiles` became `tagIds`. Step 4 therefore touches both handlers, both presenters, three test files and `index.ts`. Split it per domain before starting.
- **`pool.ts` has never run anywhere.** Nothing imports `getPool` outside repository factory defaults, and the DB harness bypasses it. Step 1's deploy is the first execution of `requireConnectionString` and `sslFor`'s non-loopback branch.
- **Two stores per domain until step 9**, so a change to a shared rule has to be made twice or the two diverge silently.
- **Deploy ordering is two-sided**, but the `V2` suffix removes it for steps 4–7: no v1 signature changes, so a stale tab keeps working.
- **Connection count.** `MAX_CONNECTIONS_PER_INSTANCE = 2` against `maxInstances: 10` is the bound.
- **Dropping `metadata` is wire-breaking.** It joins the pending book-flattening change (CLAUDE.md) and lands with the v2 presenters.

## Open decisions

Each blocks step 5.

1. **`createManualBook`'s metadata fields.** `BookForm` collects page count, ISBN and the rest and `BookMetadataSchema` validates them; the Postgres book entity has nowhere to put them. Recommend deleting the inputs and the schema with the v2 callable — an input that silently discards what you type is worse than its absence.
2. **`createChallenge` rate limit.** Dropping the creation cap (rule 39) left the abuse it bounded unhandled; `maxInstances: 10` caps spend, not row count. Recommend accepting it at current scale and writing that down.
3. **`listMyChallenges` return shape.** `ChallengeDTO[]`, or each challenge plus the caller's role, which the UI needs to pick admin controls. Recommend including the role — the membership row is already read to authorize the call.
4. **Leaving a `complete` challenge.** Rule 36 freezes membership; whether self-service leave counts is unsaid, and `leave` is deliberately absent from `ChallengeAction` rather than guessed.

One more is open but blocks nothing:

5. **Challenge cleanup script.** Nothing in a challenge's subtree cascades, so deleting a challenge that holds readings or TBR entries needs an ordered script: `reading_tags`, `readings`, `tbr_entry_tags`, `tbr_entries`, then `challenges.remove` for the scaffolding. Deferred until a caller wants it; until then the constraints refuse the delete, so the absence fails loudly rather than silently. Never a repository method.
