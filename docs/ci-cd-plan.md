# CI/CD hardening plan

## Objective

Deploy staging hosting and functions together from a commit.

Current state, audited 2026-11-10:

- `gh secret list` and `gh variable list` are empty; `ENABLE_STAGING_DEPLOY` was never set, so `deploy_staging` has never run, and no job deploys `functions/`. Every deploy runs from one machine against gitignored `.env.*`, so hosting and functions can ship out of step.
- `test_db` passes on every PR but is not a required check.

## Files to change

| File                         | Change                                                         |
| ---------------------------- | -------------------------------------------------------------- |
| `.github/workflows/ci.yml`   | `deploy_functions_staging` job                                 |
| `.github/dependabot.yml`     | new                                                            |
| `app/web/tsconfig.node.json` | drop `vitest.config.int.ts` from `include`                     |
| `eslint.config.js`           | drop `app/web/vitest.config.int.ts` from `allowDefaultProject` |
| `functions/.env.example`     | drop the `mark-test-database.sql` line                         |

Ruleset and repo settings change through `gh`, not a file.

## Ordered steps

### 1. Staging functions deploy

Add `deploy_functions_staging`: `needs: verify`, same gate as `deploy_staging`. Write the service account JSON to a temp file, export `GOOGLE_APPLICATION_CREDENTIALS`, run `firebase deploy --only functions --project staging`.

The `firebase.json` predeploy (`pnpm --filter @bookbingo/functions run build`, i.e. `tsc -b tsconfig.build.json`) builds `lib/types` and `lib/util` through its own `references`, so the job needs no separate build.

Do not pass `DATABASE_URL` or `GITHUB_PAT` as workflow env. `functions/src/index.ts` declares both with `defineSecret`, so they resolve from Secret Manager at runtime; they must already exist in the staging project or the deploy fails.

Prod stays manual — a deliberate brake, not an omission.

### 2. Dependabot

`.github/dependabot.yml` covering `npm` and `github-actions`, monthly, one group per ecosystem for minor and patch, majors separate.

### 3. Dead config

Three references point at files that do not exist:

- `app/web/tsconfig.node.json:4` includes `vitest.config.int.ts`.
- `eslint.config.js` lists it in `allowDefaultProject` with a comment explaining coverage it no longer provides. `vite.config.ts` must stay listed — it appears in no `tsconfig.json` `include`, so `projectService` cannot discover it.
- `functions/.env.example:16` cites `db/testing/mark-test-database.sql`. No `db/testing/` exists; the harness checks only the `_test` suffix.

### 4. Repo settings

```bash
gh repo edit --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge
```

Aligns the repo with the squash workflow in CLAUDE.md and the `clean_gone` command.

### 5. Require test_db

Add `test_db` to ruleset `15363103`'s `required_status_checks` alongside `verify`, once it has passed on several PRs.

## Credential checklist

Interactive, and outside what CI can do:

1. Create a staging service account with Firebase Hosting Admin, Cloud Functions Admin, and Service Account User. Download the JSON.
2. `gh secret set FIREBASE_SERVICE_ACCOUNT_BOOKBINGO_STAGING < key.json`
3. Set 6 secrets — `VITE_FIREBASE_API_KEY_STAGING`, `AUTH_DOMAIN`, `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID`, `MEASUREMENT_ID` — and 1 variable, `VITE_FIREBASE_PROJECT_ID_STAGING`. That split is what the workflow already expects. Values come from `app/web/.env.staging`.
4. Confirm `DATABASE_URL` and `GITHUB_PAT` exist in the staging project's Secret Manager.
5. `gh variable set ENABLE_STAGING_DEPLOY --body true`, last.

`requireFirebaseEnv` in `app/web/vite.config.ts` fails the build on any missing value, so a half-set secret list cannot deploy a broken bundle.

## Validation

1. `actionlint .github/workflows/ci.yml`, or push the branch and read the run.
2. After the credential checklist: flip `ENABLE_STAGING_DEPLOY`, merge to `main`, confirm both deploy jobs run and `https://bookbingo-staging.web.app` serves the new build.

## Risks

- **A wrong service account scope fails the functions deploy after hosting succeeded** — the half-deployed state this work exists to prevent. On the first run, deploy functions before hosting and verify, then trust the pair.
- **`test_db` flakes against the service container.** The `pg_isready` health check and the harness's eager `select 1` cover startup. While it stays out of required checks it blocks nothing; step 5 is what makes a flake matter.
- **Dependabot across pnpm workspaces can produce a lockfile `--frozen-lockfile` rejects.** Grouped monthly PRs keep each change reviewable.

## Commits

Three, each independently green:

1. `ci:` staging functions deploy — step 1
2. `chore:` dependabot — step 2
3. `chore:` remove dead config references — step 3

Steps 4 and 5 are `gh` changes, not commits. Delete this file when the work ships.
