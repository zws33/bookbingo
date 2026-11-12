# Plan — select the scoring engine from Firebase Remote Config

Delete this file when the work ships.

## Objective

Choose between registered scoring engines without redeploying `functions/`. One string parameter in a Remote Config **server** template, resolved once per callable invocation, with the current engine as the in-code fallback.

## 1. Repository findings

Confirmed by reading the files named.

**Functions runtime**

- `functions/` — Node 22 (`functions/package.json` engines, `.nvmrc`), ESM, TypeScript NodeNext.
- `firebase-functions@7.4.0`, `firebase-admin@14.5.0` (both verified with `pnpm ls`).
- Only 2nd-gen `onCall` exports. `functions/src/index.ts` is the complete surface: no HTTP, scheduled, Pub/Sub, Firestore, or Storage trigger exists anywhere in `functions/src`.
- `setGlobalOptions({ region: 'northamerica-northeast1', maxInstances: 10 })` — `functions/src/index.ts:27`.
- `firebase-admin` is declared in `functions/package.json` but **imported by no module** in `functions/src`. Adding Remote Config introduces the first Admin SDK usage, including the first `initializeApp()`.
- Deploy: `firebase.json` `functions.source = "functions"`, predeploy runs the package build. CI deploys staging on push to `main` (`.github/workflows/ci.yml`, job `deploy_functions_staging`) via workload identity federation.
- `functions/src/deploy-manifest.test.ts` forbids `workspace:` specifiers in `functions/package.json` — no new dependency is needed, so this stays green.

**Scoring**

- `functions/src/domain/scoringEngines.ts` — the registry already exists: `ScoringEngine` type, `ScoringParams`, `EngineName = 'coverage-decay'`, `ENGINES` record, `ACTIVE_ENGINE`, `DEFAULT_KNOBS`, `scoringEngine(name, params)`.
- `functions/src/domain/decay.ts` — `coverageDecay(params)`, the one registered engine. Throws `DomainError('corrupt')` on out-of-bounds knobs.
- `functions/src/domain/statistics.ts` — `calculateTileCounts`, `harmonicSum`.
- `functions/src/scoring/scoreCalculator.ts:16` — `scoreCalculator(tagsCount)`. The single place the engine name and knobs are chosen today; it reads `ACTIVE_ENGINE` internally and exposes no seam.
- `functions/src/scoring/present.ts` — `toScoringInputs(readings)`, `toScoreDTO(breakdown)`, `ScoreDTO`.
- Inputs: `ScoringInput { tiles: string[]; isFreebie: boolean }` and output `ScoreBreakdown` live in `lib/types/src/index.ts:52` and `:62`.

**Every call site** (grep for `scoreCalculator` — three, all read paths):

1. `functions/src/scoring/handler.ts:53` — `getScore` callable, one member.
2. `functions/src/readings/handler.ts:140` — `listReadingsV2`, returns readings plus that member's score.
3. `functions/src/readings/handler.ts:187` — `getLeaderboardV2`, builds one calculator and maps it over every active member.

Each already builds one calculator per invocation, so "one engine per operation" is the shape the code is in. No write path computes a score: `readings.create` returns `{ readingId }` only.

**Persistence**

- No score is stored. `grep -rn score db/migrations/` returns one comment and no column. `readings` and `reading_tags` (`db/migrations/0006_readings.sql`) hold tags, freebie status and timestamps.
- Every score is computed on read, from the full reading list, every request.
- Client caching: TanStack Query, `staleTime` 30s (`app/web/src/lib/queryClient.ts`); `useScore` and `useLeaderboard` only render what the server returns.

**Conventions**

- Clean Architecture per `CLAUDE.md`: `store.ts` / `handler.ts` factory of closures / `present.ts`; `functions/src/index.ts` is the composition root and the only module naming a concrete implementation.
- Config and secrets: `defineSecret('GITHUB_PAT')`, `defineSecret('DATABASE_URL')` in `index.ts`; `process.env.DATABASE_URL` read in `functions/src/db/pool.ts`. Secrets are deploy-time bindings — changing one requires a redeploy, which is why they do not solve this problem.
- DI: handler factories take dependencies as parameters, built lazily in `buildApi()` (`index.ts:46`) because secrets are unbound at deploy-time module load.
- Logging: `functions/src/observability.ts` — `logEvent`, `logWarning`, `logFailure`, `reportWriteFailure`. Every event carries an `event` field for Log Explorer.
- Tests: `node:test` via tsx. Handler tests use fake repositories whose methods reject unless overridden (`functions/src/scoring/handler.test.ts:23`). `*.db.test.ts` runs only under `pnpm run test:db`.
- Environments: two Firebase projects — `bookbingo-3fdb1` (prod) and `bookbingo-staging` (`.firebaserc`). Emulators configured for auth, functions, hosting and UI only (`firebase.json`).

**The alternative implementation**

- `docs/shifted-harmonic-plan.md` specifies a second engine, `shifted-harmonic`, as a planned but unwritten commit. It is the concrete second value for the parameter. Until that commit lands, the parameter has one legal non-default value and nothing to switch to.

Assumption, not confirmed: 2nd-gen callables here run as the project's default compute service account, since no `serviceAccount` option is set in `index.ts`.

## 2. Firebase verification

Sources: `firebase.google.com/docs/remote-config/server`, `/docs/remote-config/parameters`, `/docs/remote-config/parameters/server`, `/docs/remote-config/solution-server`, `/docs/remote-config/quotas-limits`. Read 2026-11-12.

- **The server SDK is a different product from the client SDK.** The client SDK fetches a derived, client-specific config and activates it; the Admin SDK downloads the whole **server template** and evaluates it in memory. Client fetch/activate, minimum-fetch-interval, realtime listeners and client targeting (app version, OS, country, Analytics audiences) do not exist server-side.
- Server templates are a separate template type from client templates within the same project — the console has a Client/Server selector (`/config/env/firebase-server`).
- API: `import { getRemoteConfig } from 'firebase-admin/remote-config'`, then either `const t = rc.initServerTemplate({ defaultConfig }); await t.load();` or, documented for Cloud Functions, `const t = await rc.getServerTemplate({ defaultConfig });`. Then `const config = t.evaluate(); config.getString('key')`. Node getters: `getString`, `getBoolean`, `getNumber`, `getValue`.
- **Minimum Admin SDK: v12.1.0.** We are on 14.5.0 — no dependency upgrade.
- **Status: Preview. The docs carry a no-SLA, may-change-incompatibly banner.** This is the main risk in the whole plan. Pin `firebase-admin` behaviour behind our own module so a breaking change is one file.
- Server-side condition rules are limited to _user in random percentage_ (needs a `randomizationId` in the evaluation context) and _custom signals_. There is no per-challenge or per-user targeting without passing our own signals, and nothing resembling a Firestore lookup.
- **Caching, refresh cadence, propagation delay and server read quotas are not documented at all.** The docs say only that a long-running server should reload periodically (`setInterval`), and the Cloud Functions tutorial calls `getServerTemplate` on every request with no caching. We must supply our own cache and TTL; we cannot cite a propagation guarantee.
- **No last-known-good mechanism in Node.** Java and Go accept a cached template JSON (`.cachedTemplate(...)`, `InitServerTemplate(defaultConfig, json)`); Node exposes no equivalent. The only documented fallback is the in-code `defaultConfig`. Whether `load()` preserves the previously loaded template after a failed reload is unstated — so we hold last-known-good ourselves.
- IAM: the API `firebaseremoteconfig.googleapis.com` must be enabled, and the function's runtime service account needs `roles/cloudconfig.viewer` ("Remote Config Viewer" in the console). The docs do not state that the default compute or App Engine service account has it, so grant it explicitly in both projects.
- Limits: 3,000 parameters and 2,000 conditions per project, 300 template versions per template type (older than 90 days auto-deleted), 256-character parameter keys. One string parameter is nowhere near any limit. No read-quota or price for server fetches is published; at `maxInstances: 10` and a 5-minute TTL the worst case is ~120 template reads per hour.
- **The Local Emulator Suite does not emulate Remote Config.** The documented tutorial runs the functions emulator against the live server template using `GOOGLE_APPLICATION_CREDENTIALS`. For `pnpm run dev:local` (project `demo-bookbingo`, no credentials) the load will fail and the code default applies — that is the correct local behaviour and must be documented, not worked around.
- Environment separation is per Firebase project. Staging and prod each get their own server template. This is already how the repo separates everything else.

### Trade-off to settle before building

Remote Config is the right mechanism for "flip the model globally without a redeploy." A `challenges.scoring_engine` column in Postgres is the right mechanism for "this challenge uses this model." They are not the same feature and only one should exist.

- Remote Config: no migration, no schema, operator-facing console, but global, eventually-consistent across instances, Preview-status, and untestable locally.
- Postgres column: strongly consistent, per-challenge, read in the same query path the handler already runs, fully covered by `*.db.test.ts` — but every change is a SQL write by hand and there is no console.

`docs/shifted-harmonic-plan.md` already anticipates a per-challenge column for the _knobs_. If per-challenge pinning is wanted for the _engine_ too, build the column and skip Remote Config entirely. This plan assumes the stated goal — a global switch — and recommends Remote Config for it. Do not build both.

## 3. Design

### Parameter schema

| Field              | Value                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Template           | **Server** (not client)                                                                                                              |
| Key                | `scoring_engine`                                                                                                                     |
| Type               | String                                                                                                                               |
| Default value      | `coverage-decay`                                                                                                                     |
| Legal values       | exactly the keys of `ENGINES` in `domain/scoringEngines.ts` — today `coverage-decay`, plus `shifted-harmonic` once that commit lands |
| Conditions         | none                                                                                                                                 |
| Evaluation context | none — `evaluate()` is called with no arguments                                                                                      |

String, not JSON: the knobs stay in code where `requireKnobsInBounds` already guards them, and a JSON blob would let an operator publish a configuration the engine rejects at runtime. One identifier, one decision.

No `randomizationId` and no conditions: a percentage rollout of a scoring model would give two members of the same book club different standings for the same readings, which is the one outcome scoring must not produce.

### Selection boundary

`scoreCalculator` stops choosing and starts being told. The engine name is resolved once at the top of each callable handler and threaded down.

```ts
// domain/scoringEngines.ts
export const ENGINE_NAMES = ['coverage-decay'] as const; // + 'shifted-harmonic' later
export type EngineName = (typeof ENGINE_NAMES)[number];
export const FALLBACK_ENGINE: EngineName = 'coverage-decay'; // was ACTIVE_ENGINE
export function parseEngineName(value: unknown): EngineName | undefined;

// scoring/scoreCalculator.ts — pure, no I/O
export function scoreCalculator(
  engine: EngineName,
  tagsCount: number,
): ScoreCalculator;

// scoring/engineSelector.ts
export type EngineSelector = () => Promise<EngineName>;
```

`ACTIVE_ENGINE` is renamed rather than kept: its meaning changes from "the engine" to "the engine when configuration is unavailable," and a stale name is how the two get confused.

Handler factories gain one parameter: `scoringHandlers(readingsRepo, challengesRepo, tagsRepo, selectEngine)` and `readingHandlers(readingsRepo, booksRepo, challengesRepo, tagsRepo, selectEngine)`. `index.ts` builds the one concrete selector in `buildApi()`, consistent with the rule that the composition root is the only module naming a concrete implementation.

### Resolving once per operation

Each handler calls `await selectEngine()` once, before any scoring, and passes the result into every `scoreCalculator(...)` it builds:

- `getScore` — one call, one score.
- `listReadingsV2` — one call, one score.
- `getLeaderboardV2` — one call; the resolved name scores every member in the loop. A member's rank is never computed under a different model from their neighbour's.

The selector is a closure over per-instance state built in `buildApi()`, so warm invocations share the cache and no scoring loop ever touches the network.

### Cache and refresh

One module-level cache per function instance, inside the selector closure:

- **TTL 5 minutes.** On a call with a fresh cache, return it — no network, no `await` that resolves off-process.
- **On a stale cache, await the reload** rather than revalidating in the background. One request every five minutes per instance pays the template fetch. Stale-while-revalidate is the upgrade if that latency ever shows up in traces; it is not worth the concurrency bug surface now.
- **Single-flight.** Concurrent calls during a reload share the one in-flight promise. Cloud Functions 2nd gen serves concurrent requests per instance, so this is required, not defensive.
- **3-second timeout** on `load()` via `Promise.race`. A hung Remote Config must not hold a callable open.
- **Last-known-good.** A failed reload keeps the previously resolved value and re-arms the TTL. The Node SDK gives us nothing here, so the selector holds it.
- **Negative cache, 60 seconds.** If the _first_ load of an instance fails, serve `FALLBACK_ENGINE` and do not retry for 60s, so a Remote Config outage costs one timeout per minute per instance instead of one per request.

### Failure modes

| Condition                                                                  | Resolved engine                               | Log                                                                |
| -------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| Parameter missing or `defaultConfig` applies                               | `FALLBACK_ENGINE`                             | `scoring.engine.resolved` with `source: 'default'`, on change only |
| Value empty or whitespace                                                  | `FALLBACK_ENGINE`                             | `scoring.engine.unknown` (warn), once per TTL                      |
| Value not a key of `ENGINES` (typo, or an engine this deployment predates) | `FALLBACK_ENGINE`                             | `scoring.engine.unknown` (warn) with `requested`, once per TTL     |
| `load()` fails on a cold instance                                          | `FALLBACK_ENGINE`                             | `scoring.engine.unavailable` (warn)                                |
| `load()` fails on a warm instance                                          | last-known-good                               | `scoring.engine.unavailable` (warn), once per TTL                  |
| Resolved engine throws (bad knobs)                                         | nothing — `DomainError('corrupt')` propagates | existing `callable.ts` path returns `internal`                     |

Falling back silently is the correct policy **here specifically** because no score is persisted and no aggregate is incrementally updated: the cost of a fallback is that the operator's change did not take effect, not a wrong number written to a row. The cost of rejecting instead would be a dead leaderboard for the whole club because of one console typo.

That reasoning expires the moment a score is written down. If a future change persists a score — a frozen final standing on `complete`, a materialised leaderboard, a cached breakdown — the write path must record the engine name alongside the value and must **fail** rather than fall back, because a row stamped `shifted-harmonic` whose number came from `coverage-decay` is unrecoverable without recomputation.

### Propagation

Publishing the parameter does **not** switch instances instantly, and the mechanism guarantees nothing about timing.

- Per instance, the change is observed at most one TTL (5 min) after the next request that finds the cache stale.
- Instances refresh independently, so for up to ~5 minutes different requests can be served by instances on different engines. With `maxInstances: 10` and this traffic level, in practice that is a handful of instances.
- The client holds its own 30-second `staleTime` on top of that.
- To force the switch immediately, redeploy the functions (all instances cold-start and load the new value) or wait out the window. There is no server-side realtime channel; Remote Config realtime is a client SDK feature only.

Budget: **publish → fully consistent in under ~6 minutes**, with a mixed window before that. Say this to the book club before flipping anything mid-competition.

## 4. Consistency and rollback

- **Scores are computed on read, every time.** Confirmed: no score column in `db/migrations/`, no write path calls `scoreCalculator`, no scheduled or triggered function exists.
- **Switching changes every score at once, retroactively.** It is not "future calculations only" — there are no stored past calculations. Every historical reading is re-scored under the new model on the next request.
- **No recomputation job is needed, now or ever, under this data model.** That is the single fact that makes this design cheap.
- **Rollback is complete.** Republishing `coverage-decay` restores every score exactly, within the propagation window. Nothing persisted changed, so nothing needs repair.
- **Retries and duplicate events do not apply.** There are no background jobs, no multi-step scoring pipelines, and no event-driven recomputation. A retried callable just recomputes.
- **Pinning:** at the operation level, as described above. Pinning per challenge or per competition is not achievable with server-side Remote Config conditions (random percentage and custom signals only) and belongs in a `challenges.scoring_engine` column if it is wanted.
- **Version metadata:** nothing is persisted, so there is nothing to stamp. Put the engine name in the structured log, not in `ScoreDTO` — the client has no use for it and `ScoreSchema` in `app/web/src/types/schemas.ts` would need to change. Revisit the moment anything is written.

### Product decisions needed before implementation

1. **May a live competition's model change mid-flight?** Switching rewrites every standing retroactively. If the answer is no, this feature is staging-only until a challenge reaches `complete`, or the mechanism should be a per-challenge column instead.
2. **Should a `complete` challenge freeze its standings?** Today a completed challenge is re-scored under whatever model is live. That is already true without this change; the switch makes it visible.
3. **Is `shifted-harmonic` landing first?** Until that commit exists the parameter has exactly one legal value and this work cannot be exercised end to end.

## 5. Testing and observability

No test may import `firebase-admin/remote-config` or reach the network. `remoteConfigEngineSelector` takes its loader and its clock as injected dependencies with real defaults bound only in `index.ts`.

**`scoring/engineSelector.test.ts`** (new) — fake loader returning a string or rejecting, fake `now`:

- each legal value resolves to itself;
- missing, empty, whitespace-only, and unknown values each resolve to `FALLBACK_ENGINE` and log once;
- load rejects on a cold selector → `FALLBACK_ENGINE`; the negative cache suppresses retries for 60s;
- load rejects after a successful load → last-known-good, not `FALLBACK_ENGINE`;
- within the TTL the loader is called once across many calls; past it, exactly once more;
- concurrent calls during a reload share one loader call (single-flight);
- a loader that never settles resolves to the fallback at the timeout, not a hang.

**`scoring/scoreCalculator.test.ts`** — parameterise over engine name. The existing `coverage-decay` assertions must pass **unmodified**: that is the proof the default configuration changed nothing.

**`scoring/handler.test.ts` and `readings/handler.test.ts`** — a fake `EngineSelector` that counts calls:

- exactly one selector call per `getScore`, per `listReadingsV2`, per `getLeaderboardV2`;
- a selector that rejects on its second call still produces a complete leaderboard — proof the loop does not re-resolve per member;
- the existing assertions run with a selector pinned to `coverage-decay` and keep their current expected values.

**Local and CI** — `pnpm test` is unaffected; Remote Config is never contacted. `pnpm run dev:local` against `demo-bookbingo` has no credentials, the load fails, and the code default applies. Document that in the plan's replacement doc: local development always runs `coverage-decay` unless a selector override is wired for the emulator. Verify the real path in staging by publishing the parameter and watching the log event, not by writing an integration test against the live service.

**Logging** — through `observability.ts`, no new mechanism:

- `scoring.engine.resolved` (`logEvent`) — emitted only when the resolved value differs from the last one this instance logged, plus once on cold start. Fields: `engine`, `source: 'remote-config' | 'default' | 'last-known-good'`. Not per request, not per score.
- `scoring.engine.unknown` (`logWarning`) — fields `requested`, `fallback`. Throttled to once per TTL.
- `scoring.engine.unavailable` (`logWarning`) — the load failure, through `describeError`. Throttled to once per TTL.
- No user ids, no challenge ids, no reading data on any of these — the value is global, so per-user context adds nothing.
- Monitoring: a log-based counter on `jsonPayload.event="scoring.engine.unavailable"`. Alert only if it is continuous, since a single failure is invisible to users by design.

## 6. Runtime flow

```
onCall(getScore | listReadingsV2 | getLeaderboardV2)
  → callable() wrapper                               (functions/src/callable.ts)
  → handler: requireAuth, parseRequest, membership and permission checks
  → await selectEngine()                             ONE call per invocation
       ├ cache fresh (< 5 min)            → cached EngineName            [no network]
       ├ cache stale / cold               → load server template
       │     ├ ok    → getString('scoring_engine') → parseEngineName
       │     │            ├ known   → cache + return
       │     │            └ unknown → log scoring.engine.unknown → FALLBACK_ENGINE
       │     ├ fail (warm) → log scoring.engine.unavailable → last-known-good
       │     └ fail (cold) → log scoring.engine.unavailable → FALLBACK_ENGINE, negative-cache 60s
       └ timeout 3s                       → same as fail
  → scoreCalculator(engine, tags.length)             pure, built once
  → calculator(toScoringInputs(readings))  [× every member, for the leaderboard]
  → ScoreDTO → HTTPS response
```

## 7. Implementation checklist

Ordered; each step leaves the tree green.

1. **`functions/src/domain/scoringEngines.ts`** — add `ENGINE_NAMES`, derive `EngineName` from it, add `parseEngineName(value: unknown): EngineName | undefined` backed by `ENGINES`, rename `ACTIVE_ENGINE` → `FALLBACK_ENGINE`.
2. **`functions/src/scoring/scoreCalculator.ts`** — take `engine: EngineName` as the first parameter; drop the `FALLBACK_ENGINE` import. Still pure, still the only place knobs are chosen.
3. **`functions/src/scoring/engineSelector.ts`** (new) — `EngineSelector` type; `fixedEngineSelector(name)` for tests and local development; `engineSelector({ load, now })` holding the TTL, single-flight, timeout, last-known-good and negative cache. Imports nothing from `firebase-admin`.
4. **`functions/src/scoring/remoteConfigTemplate.ts`** (new) — the only module importing `firebase-admin`. Lazy `initializeApp()`, `getRemoteConfig().getServerTemplate({ defaultConfig: { scoring_engine: FALLBACK_ENGINE } })`, `evaluate().getString('scoring_engine')`. Exports one function matching the selector's `load` dependency. Isolating it is what keeps a Preview-API break to one file.
5. **`functions/src/scoring/handler.ts`** — accept `selectEngine`, resolve once, pass to `scoreCalculator`.
6. **`functions/src/readings/handler.ts`** — same, for `list` (line 140) and `leaderboard` (line 187). Resolve before the member loop.
7. **`functions/src/index.ts`** — build the selector in `buildApi()` from `remoteConfigTemplate`'s loader; pass it to both handler factories. No new secret, no `CallableOptions` change.
8. **Tests** — `scoring/engineSelector.test.ts` (new); parameterise `scoring/scoreCalculator.test.ts`; add selector-call assertions to `scoring/handler.test.ts` and `readings/handler.test.ts`.
9. **Project configuration, both `bookbingo-staging` and `bookbingo-3fdb1`** — enable `firebaseremoteconfig.googleapis.com`; grant `roles/cloudconfig.viewer` to the functions runtime service account; create the **server**-template parameter `scoring_engine` (String, default `coverage-decay`, no conditions). Staging first, and verify via the `scoring.engine.resolved` log before touching prod.
10. **Docs** — in `docs/scoring-model.md`, correct the line claiming `scoring/scoreCalculator.ts` is where the model is chosen, and the Verification bullet stating that rollback means reverting a commit. Add a short section recording the parameter, the fallback, the ~6-minute propagation budget, and that local development always runs the fallback.

## Validation

- `pnpm run format`, then `pnpm run verify` at the repo root.
- `pnpm --filter @bookbingo/functions test` while iterating. No Postgres involved; `test:db` is untouched.
- `scoring/handler.test.ts` and the `coverage-decay` cases in `scoreCalculator.test.ts` must pass with their expected values unchanged — the proof that the default configuration moved no score.
- In staging: deploy, confirm `scoring.engine.resolved` with `source: 'default'`, publish the parameter, confirm the resolved value changes within the TTL, republish the old value, confirm scores return to their previous numbers.

## Risks

1. **Server-side Remote Config is Preview.** No SLA; the API may change incompatibly. Mitigated by step 4's one-file isolation and by a fallback that is always the current engine.
2. **Not emulated locally.** The path cannot be exercised before staging. Mitigated by injecting the loader so every branch except the SDK call itself is unit-tested.
3. **Propagation is unspecified by the docs.** The 5-minute TTL is our number, not Firebase's; the mixed window is real and visible to users as briefly disagreeing standings.
4. **Retroactive rescoring.** A mid-competition switch rewrites history for everyone. This is a product decision, not a technical one — see §4.
5. **Nothing to switch to yet.** `shifted-harmonic` is still a plan. Landing this first gives a selector with one option.
