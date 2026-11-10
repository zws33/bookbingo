# CI/CD hardening plan

## Objective

Deploy staging hosting and functions together from a commit.

Current state, audited 2026-11-10: `gh secret list` and `gh variable list` are empty; `ENABLE_STAGING_DEPLOY` was never set, so `deploy_staging` has never run, and no job deploys `functions/`. Every deploy runs from one machine against gitignored `.env.*`, so hosting and functions can ship out of step.

## Files to change

| File                       | Change                         |
| -------------------------- | ------------------------------ |
| `.github/workflows/ci.yml` | `deploy_functions_staging` job |

## Ordered steps

### Staging functions deploy

Add `deploy_functions_staging` with the same `needs` and `if` gate as `deploy_staging`. Write the service account JSON to a temp file, export `GOOGLE_APPLICATION_CREDENTIALS`, run `firebase deploy --only functions --project staging`.

The `firebase.json` predeploy (`pnpm --filter @bookbingo/functions run build`, i.e. `tsc -b tsconfig.build.json`) builds `lib/types` and `lib/util` through its own `references`, so the job needs no separate build.

Do not pass `DATABASE_URL` or `GITHUB_PAT` as workflow env. `functions/src/index.ts` declares both with `defineSecret`, so they resolve from Secret Manager at runtime; they must already exist in the staging project or the deploy fails.

Prod stays manual — a deliberate brake, not an omission.

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

## Commits

One `ci:` commit for the staging functions deploy.

Delete this file when the work ships.
