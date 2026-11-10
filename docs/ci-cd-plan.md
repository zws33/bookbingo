# CI/CD hardening plan

## Objective

Gate `main` on CI, test the Postgres layer and migrations on every PR, and deploy staging hosting and functions together from a commit.

Current state, audited 2026-11-04:

- Ruleset `main protect` (id `15363103`) has `deletion`, `non_fast_forward`, `code_quality`. No `required_status_checks`, no `pull_request` rule — a red PR merges, and a direct push to `main` lands.
- The 7 `*.db.test.ts` files cover `postgresStore.ts` for every domain, including the `on delete restrict` invariant. They run only by hand, locally.
- Nothing verifies `db/migrations/*.sql` apply to a fresh database.
- `gh secret list` and `gh variable list` are empty; `ENABLE_STAGING_DEPLOY` was never set, so `deploy_staging` has never run, and no job deploys `functions/`. Every deploy runs from one machine against gitignored `.env.*`, so hosting and functions can ship out of step.

## Files to change

| File                         | Change                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`   | permissions, concurrency, `test_db` job, `deploy_functions_staging` job, pin third-party action |
| `.github/dependabot.yml`     | new                                                                                             |
| `functions/package.json`     | add `test:db:ci`                                                                                |
| `app/web/tsconfig.node.json` | drop `vitest.config.int.ts` from `include`                                                      |
| `eslint.config.js`           | drop `app/web/vitest.config.int.ts` from `allowDefaultProject`                                  |
| `functions/.env.example`     | drop the `mark-test-database.sql` line                                                          |

Ruleset and repo settings change through `gh`, not a file.

## Ordered steps

### 1. Gate main on CI

Add two rules to ruleset `15363103`, keeping the existing three:

- `pull_request`, 0 required approvals.
- `required_status_checks`, context `verify` — the job id, confirmed against the jobs API.

`paths-ignore: docs/**` sits on `push` only, so PRs always report `verify`. Never add `paths-ignore` to the `pull_request` trigger: a docs-only PR would then block on a check that never runs. Record that in a workflow comment.

### 2. Postgres and migration job

Add `test_db` to `ci.yml`, parallel to `verify`, with a `postgres:18-alpine` service: `POSTGRES_DB: bookbingo_test`, `POSTGRES_PASSWORD: postgres`, port 5432, `pg_isready` health check. Mirrors `docker-compose.yaml` except the port — 5433 exists locally only to dodge a host Postgres.

Set `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/bookbingo_test`, then run `pnpm run db:migrate` followed by `pnpm --filter @bookbingo/functions run test:db:ci`.

No `.env.local` is needed: `resolveDatabaseTarget` (`scripts/lib/db.ts:34`) reads `TEST_DATABASE_URL` from the process env, `db:migrate` uses `--env-file-if-exists`, and `isLoopback` in both `scripts/lib/db.ts` and `functions/src/testing/db.ts` disables SSL for localhost. The `_test` suffix check passes.

No build step is needed: every `@bookbingo/*` import in `functions/src` is `import type`, erased by tsx. A value import added later fails the job with a module-not-found, which is a better signal than a defensive `build:libs`.

`test:db` hardcodes `--env-file=.env.local` and fails when the file is absent, so add a sibling that omits it:

```jsonc
"test:db:ci": "node --test-concurrency=1 --import tsx --test \"src/**/*.db.test.ts\""
```

`--test-concurrency=1` stays — parallel files deadlock on the shared truncate.

Keep `test_db` out of required checks until it has passed on several PRs, then add its context alongside `verify`.

### 3. Workflow hardening

- `permissions: { contents: read }` at workflow level; `deploy_staging` elevates to what the Firebase action needs.
- `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }`.
- Pin `FirebaseExtended/action-hosting-deploy@v0` to a full SHA, resolved with `gh api repos/FirebaseExtended/action-hosting-deploy/commits/v0 --jq .sha`, tag in a trailing comment. It receives the service account key. First-party `actions/*` stay on tags.

### 4. Staging functions deploy

Add `deploy_functions_staging`: `needs: verify`, same gate as `deploy_staging`. Write the service account JSON to a temp file, export `GOOGLE_APPLICATION_CREDENTIALS`, run `firebase deploy --only functions --project staging`.

The `firebase.json` predeploy (`tsc -b`) builds `lib/types` and `lib/util` through its own `references`, so the job needs no separate build.

Do not pass `DATABASE_URL` or `GITHUB_PAT` as workflow env. `functions/src/index.ts` declares both with `defineSecret`, so they resolve from Secret Manager at runtime; they must already exist in the staging project or the deploy fails.

Prod stays manual — a deliberate brake, not an omission.

### 5. Dependabot

`.github/dependabot.yml` covering `npm` and `github-actions`, monthly, one group per ecosystem for minor and patch, majors separate.

### 6. Dead config

Three references point at files that do not exist:

- `app/web/tsconfig.node.json:4` includes `vitest.config.int.ts`.
- `eslint.config.js` lists it in `allowDefaultProject` with a comment explaining coverage it no longer provides. `vite.config.ts` must stay listed — it appears in no `tsconfig.json` `include`, so `projectService` cannot discover it.
- `functions/.env.example:16` cites `db/testing/mark-test-database.sql`. No `db/testing/` exists; the harness checks only the `_test` suffix.

### 7. Repo settings

```bash
gh repo edit --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge
```

Aligns the repo with the squash workflow in CLAUDE.md and the `clean_gone` command.

## Credential checklist

Interactive, and outside what CI can do:

1. Create a staging service account with Firebase Hosting Admin, Cloud Functions Admin, and Service Account User. Download the JSON.
2. `gh secret set FIREBASE_SERVICE_ACCOUNT_BOOKBINGO_STAGING < key.json`
3. Set 6 secrets — `VITE_FIREBASE_API_KEY_STAGING`, `AUTH_DOMAIN`, `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID`, `MEASUREMENT_ID` — and 1 variable, `VITE_FIREBASE_PROJECT_ID_STAGING`. That split is what the workflow already expects. Values come from `app/web/.env.staging`.
4. Confirm `DATABASE_URL` and `GITHUB_PAT` exist in the staging project's Secret Manager.
5. `gh variable set ENABLE_STAGING_DEPLOY --body true`, last.

`requireFirebaseEnv` in `app/web/vite.config.ts` fails the build on any missing value, so a half-set secret list cannot deploy a broken bundle.

## Validation

1. `pnpm run verify` — green baseline. Confirmed 2026-11-04: 199 web tests pass, ~70s.
2. `docker compose up -d --wait && pnpm run test:db` — run the new job's suite locally first.
3. `actionlint .github/workflows/ci.yml`, or push the branch and read the run.
4. Open a throwaway PR carrying a deliberate lint error. Confirm merge is blocked and `test_db` reports.
5. Confirm `verify` still reports on a docs-only PR.
6. After the credential checklist: flip `ENABLE_STAGING_DEPLOY`, merge to `main`, confirm both deploy jobs run and `https://bookbingo-staging.web.app` serves the new build.

## Risks

- **`test_db` flakes against the service container.** The `pg_isready` health check and the harness's eager `select 1` cover startup. If it still flakes it stays out of required checks and blocks nothing.
- **Required checks block a hotfix.** `bypass_actors` is empty and `current_user_can_bypass` is `never`. At 0 required approvals you can self-merge a PR; a true emergency needs a ruleset edit. Accepted.
- **A wrong service account scope fails the functions deploy after hosting succeeded** — the half-deployed state this work exists to prevent. On the first run, deploy functions before hosting and verify, then trust the pair.
- **Dependabot across pnpm workspaces can produce a lockfile `--frozen-lockfile` rejects.** Grouped monthly PRs keep each change reviewable.

## Commits

Six, each independently green:

1. `ci:` gate and hardening — steps 1, 3
2. `test:` db job and `test:db:ci` — step 2
3. `ci:` staging functions deploy — step 4
4. `chore:` dependabot — step 5
5. `chore:` remove dead config references — step 6
6. `docs:` this plan

Step 7 is a settings change, not a commit. Delete this file when the work ships.
