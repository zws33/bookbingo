# CI/CD hardening plan

## Objective

Deploy staging hosting and functions from a commit, keylessly.

## Done

Workload Identity Federation is provisioned in `bookbingo-staging` (`984288512268`) and both staging deploy jobs are written.

- `sts.googleapis.com` enabled.
- Service account `github-deployer@bookbingo-staging.iam.gserviceaccount.com`, holding `roles/firebase.admin`, `cloudfunctions.admin`, `run.admin`, `artifactregistry.admin`, `cloudbuild.builds.editor`, `iam.serviceAccountUser`, `secretmanager.admin`, `serviceusage.serviceUsageConsumer`. Wider than a least-privilege set; tighten once a deploy is green.
- Pool `github`, OIDC provider `github`, issuer `https://token.actions.githubusercontent.com`, attribute condition `assertion.repository == 'zws33/bookbingo'`. The repo is public, so that condition is what stops any other repo exchanging a token for this service account.
- `principalSet://…/workloadIdentityPools/github/attribute.repository/zws33/bookbingo` holds `roles/iam.workloadIdentityUser` on the service account.
- Repo variables `WIF_PROVIDER_STAGING` and `WIF_SERVICE_ACCOUNT_STAGING` set.
- `DATABASE_URL` and `GITHUB_PAT` already exist in staging Secret Manager. Never pass them as workflow env: `functions/src/index.ts` declares both with `defineSecret`, so they resolve at runtime.

`FirebaseExtended/action-hosting-deploy` is gone. Its `firebaseServiceAccount` input requires a JSON key, which defeats the point of WIF. Hosting now deploys through the `firebase` CLI, which picks up the credentials file `google-github-actions/auth` writes. That drops per-PR preview channels; the job only ever deployed `channelId: live`.

The 6 `VITE_*_STAGING` secrets, the `VITE_FIREBASE_PROJECT_ID_STAGING` variable, and `ENABLE_STAGING_DEPLOY=true` are set. Values came from `app/web/.env.staging`. `requireFirebaseEnv` in `app/web/vite.config.ts` fails the build on any missing value, so a half-set secret list cannot deploy a broken bundle.

Prod stays manual — a deliberate brake, not an omission.

## Remaining

Merge to `main` and read the run. The deploy jobs skip pull requests, so a PR proves nothing about them.

1. `deploy_functions_staging` then `deploy_staging` both green, and `https://bookbingo-staging.web.app` serving the new build.
2. Unverified until that run: that `firebase-tools` accepts WIF external-account credentials. The Firebase CLI docs promise ADC support and name `GOOGLE_APPLICATION_CREDENTIALS` but never mention external-account files. If it rejects them, mint an access token in the auth step (`token_format: access_token`) and pass it to the CLI.
3. Tighten the deployer's roles once a deploy is green.

Delete this file when the work ships.
