# Challenge Implementation Plan

Completes the challenge container on Postgres (Neon). Rules are numbered in `docs/challenge-model.md`; module shape is CLAUDE.md, `## functions/ Architecture`. The Firestore→Neon copy has its own plan: `docs/data-migration-plan.md`.

## Base

`db/migrations/0001`–`0007` and the six `postgresStore.ts` files are the target schema and the target data access, and are done. Neither changes to accommodate what is left — handlers, presenters and the client change to accommodate them.

Firestore stays intact and readable for the whole sequence. Nothing dual-writes.

## Environments

Cloud SQL is out; Neon replaces it. `pool.ts` needs no change — Neon is a non-loopback host, so `sslFor` already returns `{ rejectUnauthorized: true }`.

| Database                                       | Named by                            | Role                                      |
| ---------------------------------------------- | ----------------------------------- | ----------------------------------------- |
| Docker `bookbingo_test`                        | `DATABASE_URL`, `TEST_DATABASE_URL` | Local dev and `test:db`. `pgdata` volume. |
| Neon branch `integration`, db `bookbingo_test` | `TEST_DATABASE_URL`                 | `test:db` against Neon.                   |
| Neon `staging`                                 | `DATABASE_URL` (staging secret)     | Migrated data, manual testing.            |
| Neon `prod`                                    | `DATABASE_URL` (prod secret)        | Migrated data, live after cutover.        |

1. The integration branch is the only Neon database the test harness may touch — `reset()` truncates every table it finds.
2. `requireTestDatabaseUrl` demands a name ending `_test`, so that branch's database is `bookbingo_test`, not Neon's default `neondb`. **The staging and prod databases must not end `_test`**: that suffix is the whole guard keeping the harness off them, and it is a naming decision made once, here.
3. Integration tests and manual testing use different databases on purpose: pointing `test:db` at staging truncates the data staging exists to hold.
4. Functions use a Neon **pooled** connection string, not a direct one.

## Versioning

`index.ts` is the only file that names a version. Handler modules and handler methods never do.

1. A callable's export name is its deployed name, unique per project and region, so a v2 endpoint coexisting with a v1 needs a distinct wire name: the `V2` suffix (`listReadingsV2`). The suffix stops at `index.ts`.
2. A domain that still has a Firestore `handler.ts` gets its Postgres handler as a second file, `postgresHandler.ts` — the `store.ts`/`postgresStore.ts` convention one layer up, and it takes the plain name at step 8.
3. Both modules export the same factory name and the same method names (`list`, `create`, `remove`). `index.ts` separates them by import alias:

   ```ts
   import { readingHandlers } from './readings/handler.js';
   import { readingHandlers as postgresReadingHandlers } from './readings/postgresHandler.js';
   ```

4. Only `readings`, `library`, `tbr`, `users`, `books` and `config` need the second file — each exports a callable whose name its v2 has to claim. Two do not fit the shape point 2 describes: `config` has no Firestore `handler.ts` at all (`getBoardConfigHandler` is a free function over `TILES`) and needs a v2 only because v2 serves stored tags; `books` exports callables from both `books/handler.ts` and `books/manual.ts`, so it takes two second files, `postgresHandler.ts` and `postgresManual.ts`.
5. `challenges` and `tags` need none of it: `challenges/handler.ts` is already Postgres-backed, `challenges/store.ts` has no non-test consumer, and no challenge callable is exported. Their endpoints ship unsuffixed.
6. Both versions ship from one codebase and one deploy; the client repoints one endpoint at a time; v1 dies at step 8.

Three alternatives are closed, so that they are not re-litigated:

- **One handler parameterized over both repositories.** The two repository interfaces deliberately share nothing (CLAUDE.md), so there is no interface to parameterize over. Inventing one re-couples the schemas.
- **A second Firebase codebase.** Codebases organize source and deploy subsets; they do not namespace function names. `listReadings` still collides.
- **A version in the request payload.** Every v1 callable would then need the `DATABASE_URL` secret and a pool on cold start, and the step-7 write freeze depends on v1 write callables staying distinguishable.

## Ordered steps

1. **Provision Neon.** Three branches. Mark `integration` only. Bind `DATABASE_URL` as a Firebase secret per project, listed in the `secrets` of every v2 callable. Run `db:migrate` against all three, each passed as `--database-url`.
2. **Data migration script.** `docs/data-migration-plan.md`. Validated against the local container.
3. **Run against prod.** A full run into Neon prod, unfrozen. Nothing reads it yet; this proves the script against real volume before it matters. Clear prod afterwards — the migration script requires an empty destination
4. **v2 handlers.** `challenges/handler.ts` and `tags/handler.ts` as `xHandlers(...repos)` factories. `readings`, `library` and `tbr` get challenge-scoped handlers in `postgresHandler.ts`, beside the Firestore one, that check permissions inline and drop rows whose author is not `active` (rule 24). `present.ts` gains `tagIds`. Split per domain, as the repositories were.
5. **v2 callables.** `getMyChallenges`, `getChallenge`, `createChallenge`, `joinChallenge`, `leaveChallenge`, `removeMember`, `setMemberRole`, `setChallengeStatus`, `updateChallengeConfig`, `deleteChallenge`, `rotateJoinCode` and the tag create/update/delete ship unsuffixed — no v1 holds those names. A `challengeId`-taking `V2` of each reading, library and TBR callable coexists with its v1. `getBoardConfigV2` serves stored tags plus `tag_cap` instead of `TILES`.
6. **Manual testing on staging.** Web app pointed at the staging project against v2 endpoints. Board renders stored tags; readings, leaderboard, library and TBR match prod.
7. **Client migration.** `challengeId` in every request type and every `queryClient` key — without it the cache serves challenge A's data under challenge B. Challenge selection context and switcher, post-sign-in challenge list, member management gated on role. `useTileCatalog`'s `staleTime: Infinity` is justified by "the catalog changes with a deploy"; that stops being true, so key it on challenge and drop to a finite time. Cutover order: freeze v1 writes, run the migration against empty prod, deploy the client, unfreeze. The freeze covers the whole migration rather than a delta, which is why the rehearsal at step 6 measures how long that is. The freeze is a `/system/maintenance` Firestore flag read by v1 write callables — instant to flip without a redeploy, and it disappears with Firestore at step 8.
8. **Retire Firestore.** Delete the v1 callables, the Firestore `store.ts` paths, `firestore.rules`, `firestore.indexes.json`, the emulator scripts and `firebase-admin` from `functions/`. Rename each `postgresStore.ts` to `store.ts` and each `postgresHandler.ts` to `handler.ts`. No handler body changes. Hosting stays.

   Dropping the `V2` suffixes is a second breaking cutover, not an internal rename: an export name is a wire name (point 1), so deleting `listReadingsV2` breaks every client still running the step-7 bundle until it reloads. Three deploys, in order:
   1. Export each handler under both names — `listReadingsV2` and `listReadings`, the plain name now free because v1 is gone. Deploy functions.
   2. Repoint the client to the plain names. Deploy hosting, then wait out the cached bundles.
   3. Delete the suffixed exports and the import aliases in `index.ts`. Deploy functions.

   The alternative is to keep the suffixes permanently and skip all three; it costs a `V2` in those endpoint names forever.

## Validation

- `pnpm run verify` after every commit; `pnpm run test:db` before every push.
- Permissions and lifecycle are `node:test` units with no database; the per-handler permission checks are covered by the handler tests against a fake repository. The permission and transition tables get a cell-by-cell loop against a transcription of `challenge-model.md`, not spot checks.
- Step 1 is not done until `test:db` passes against the integration branch **and** fails against staging.
- Migration parity: `docs/data-migration-plan.md`.
