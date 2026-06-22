# Staging data: seeding & mirroring prod

Tooling to put **non-trivial, reproducible** data into the staging project
(`bookbingo-staging`) — either synthetic (`seed-staging`) or a sanitized snapshot
of prod (`mirror-prod-to-staging`). Both are useful for exercising features and
for testing migrations (e.g. `migrate-book-identity.ts`) against realistic data.

## Prerequisites

These scripts use the Firebase **Admin SDK** against a real project, so they need
Application Default Credentials:

```sh
gcloud auth application-default login
# or: export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

Run scripts with `pnpm exec tsx` (not bare `tsx`).

## Safety model

- **Writes never target prod.** `guardWriteTarget` (in `scripts/lib/admin.ts`)
  exits if the destination project is `bookbingo-3fdb1`. The mirror's _source_
  may be prod, but it is read-only.
- `--wipe` recursively clears the destination's `/users` and `/books` first, for a
  clean, reproducible result. Without it, writes are overwrite-by-id (additive).
- Always do a `--dry-run` first to review the summary.

## Why Auth is not seeded or mirrored

The app is **Google-sign-in only**, and Firebase assigns the Google uid _per
project_. So:

- Importing prod Auth into staging is pointless — those uids won't match the uid
  staging mints when you sign in with the same Google account.
- Seeding email/password users is pointless — there's no UI to log in with them.

Both scripts therefore write **Firestore docs only**. Seeded/mirrored data is
visible to anyone via the world-readable leaderboard and community library
(`collectionGroup('readings')`, see `firestore.rules`). To populate **your own**
dashboard, use `--claim` to re-key one persona's readings/TBR onto your staging uid.

### Finding your staging uid (for `--claim`)

Sign into the staging web app once with your Google account (this creates your
staging Auth user), then pass `--claim <your-email>` — the script resolves the uid
via `auth.getUserByEmail`. Or pass `--claim-uid <uid>` directly (copy it from the
Firebase console → Authentication).

## Synthetic seed

`scripts/seed-staging.ts` applies a static dataset (`scripts/lib/dataset.ts`): 5
personas (heavy reader, repeat-heavy, light + big TBR, freebie-heavy, brand-new)
and ~16 books, several shared across users so dedup and the community library are
exercised. Book ids are derived with the app's `deriveBookId`.

```sh
# Preview
pnpm exec tsx scripts/seed-staging.ts --dry-run

# Seed staging, wipe first, populate my dashboard
pnpm exec tsx scripts/seed-staging.ts --wipe --claim me@example.com

# Convenience (targets staging, pass extra flags after --)
pnpm run seed:staging -- --dry-run
```

Idempotent: reading/TBR doc ids are the `bookId`, so re-running converges rather
than duplicating.

## Mirror prod → staging

`scripts/mirror-prod-to-staging.ts` does a programmatic Admin-SDK copy: reads prod
read-only, copies `/books` verbatim (deterministic ids, no PII), and copies each
user's profile/readings/TBR. By default it **anonymizes** display names
(`Reader N`) and **re-keys** the densest persona onto your staging uid.

```sh
# Preview
pnpm exec tsx scripts/mirror-prod-to-staging.ts --dry-run

# Mirror, wipe staging first, claim densest persona as me
pnpm exec tsx scripts/mirror-prod-to-staging.ts --wipe --claim me@example.com

# Keep real names (only do this if you accept PII in staging)
pnpm exec tsx scripts/mirror-prod-to-staging.ts --no-anonymize
```

Flags: `--from <id>` (default prod), `--to <id>` (default staging, guarded),
`--wipe`, `--no-anonymize`, `--dry-run`, `--claim <email>` / `--claim-uid <uid>`.

## Alternative: managed export/import (not built)

For a large or byte-exact snapshot you could instead use the managed path:

```sh
gcloud firestore export gs://<bucket> --project bookbingo-3fdb1
gcloud firestore import gs://<bucket>/<timestamp> --project bookbingo-staging
```

Trade-offs vs. the programmatic copy: server-side and scales to huge datasets, but
needs cross-project GCS bucket IAM (the staging service account must read the prod
export bucket) and **cannot transform or scrub during the copy** — you'd import
real PII and prod uids, then sanitize after. For this hobby-scale DB the
programmatic copy is simpler and safer.
