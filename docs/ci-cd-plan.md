# CI/CD hardening plan

## Objective

Deploy staging hosting and functions together from a commit.

Current state, audited 2026-11-10: `gh secret list` and `gh variable list` are empty; `ENABLE_STAGING_DEPLOY` was never set, so `deploy_staging` has never run, and no job deploys `functions/`. Every deploy runs from one machine against gitignored `.env.*`, so hosting and functions can ship out of step.

## Files to change

| File                       | Change                         |
| -------------------------- | ------------------------------ |
| `.github/workflows/ci.yml` | `deploy_functions_staging` job |
| `.github/dependabot.yml`   | new                            |

## Ordered steps

### 1. Staging functions deploy

Add `deploy_functions_staging`: `needs: verify`, same gate as `deploy_staging`. Write the service account JSON to a temp file, export `GOOGLE_APPLICATION_CREDENTIALS`, run `firebase deploy --only functions --project staging`.

The `firebase.json` predeploy (`pnpm --filter @bookbingo/functions run build`, i.e. `tsc -b tsconfig.build.json`) builds `lib/types` and `lib/util` through its own `references`, so the job needs no separate build.

Do not pass `DATABASE_URL` or `GITHUB_PAT` as workflow env. `functions/src/index.ts` declares both with `defineSecret`, so they resolve from Secret Manager at runtime; they must already exist in the staging project or the deploy fails.

Prod stays manual — a deliberate brake, not an omission.

### 2. Dependabot

`.github/dependabot.yml` covering `npm` and `github-actions`, monthly, one group per ecosystem for minor and patch, majors separate.

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
- **Dependabot across pnpm workspaces can produce a lockfile `--frozen-lockfile` rejects.** Grouped monthly PRs keep each change reviewable.

## Commits

Two, each independently green:

1. `ci:` staging functions deploy — step 1
2. `chore:` dependabot — step 2

Delete this file when the work ships.
