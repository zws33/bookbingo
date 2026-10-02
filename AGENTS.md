# AGENTS.md

BookBingo: a book-reading bingo tracker. pnpm-workspace monorepo, TypeScript
strict + ESM only. Deeper context lives in `CLAUDE.md`,
`.github/copilot-instructions.md`, and `docs/`.

## Environment

- Node 22 (`.nvmrc`) and pnpm (`packageManager` in `package.json`). Never use
  `npm` or `yarn`. CI uses `pnpm install --frozen-lockfile`.
- Local dev: `pnpm run dev:local` (web + Firebase emulators). No real Firebase
  credentials needed — emulator flow uses committed `.env.emulator`.
  `pnpm run emulator:seed` for sample data.
- Real environments copy `app/web/.env.example` → `.env.staging` / `.env.prod`
  and run `dev:web:staging` / `dev:web:prod`. Missing `VITE_FIREBASE_*` fails
  the build by design.
- Local Postgres: `docker compose up -d --wait` (port 5433, database
  `bookbingo_test`), `cp functions/.env.example functions/.env.local`, then
  `pnpm run db:migrate` (`--dry-run` lists pending). The container is `tmpfs`,
  so stopping it discards the data. Deployed environments get `DATABASE_URL` as
  a secret, never from a file.

## Verify (run before committing; this is exactly what CI runs)

- `pnpm run verify` = `format:check -> lint -> build -> test -> typecheck`. Order
  matters: **build before typecheck** because `functions/` resolves
  `@bookbingo/lib-types` from built workspace output that doesn't exist on a fresh
  checkout.
- Single test — use the package's native runner, not the root aggregate:
  - `pnpm --filter @bookbingo/functions exec node --import tsx --test path/to/file.test.ts`
    (node:test; add `--test-name-pattern="..."` for one case)
  - `pnpm --filter @bookbingo/web exec vitest run src/.../X.test.tsx`
    (Vitest; add `-t "..."` for one case)
- `pnpm run test:integration` runs web integration tests against the emulators.
  Unit tests exclude `*.int.test.*`; integration uses `vitest.config.int.ts`.
- `pnpm run test:db` runs the Postgres repository tests: migrates, then the
  `functions/src/**/*.db.test.ts` suite. Needs `docker compose up -d --wait` and
  `functions/.env.local`. Local only, not in `verify` and not in CI. Each test
  truncates every table, so the harness refuses a database not named `*_test`,
  and the files run serially (`--test-concurrency=1`) because they share it.
- `prettier --write .` after editing; `verify` fails on unformatted files.

## Architecture

- `lib/*` — pure TS (types, core logic, util). **No React, no Firebase, no
  browser imports.** Add logic here first, then wire into `app/web`.
- `functions/` — Firebase Cloud Functions. `firebase deploy` uploads this dir alone
  and installs deps with npm, so domain logic lives here instead of `lib/`.
  `functions/` may import `lib/types` for **types only** — a runtime import breaks
  the deploy.
- `app/web/` — React 19 + Vite + Tailwind + Firebase. Every read/write goes
  through a callable; `firebase/firestore` is banned in `app/web/src/data` by
  ESLint. Reads live in `src/data` + `src/hooks`; writes in `src/lib`.
- `scripts/` — tsx scripts (migrations, seeds, backfills). `db/migrations` holds
  Postgres SQL; a Postgres pool (`functions/src/db/pool.ts`, `DATABASE_URL`,
  docker-compose) is **in progress and not yet wired into handlers** — current
  backend is still Firestore.

## functions/ conventions

- Clean Architecture per domain module: `store.ts` (only layer importing
  `firebase-admin`; entities carry `Date`), `handler.ts` (factory returning a plain
  object of closures — **never a class**, `callable` loses `this`), `present.ts`
  (response DTO + ISO codec). Handler deps are suffixed `*Repo`; `index.ts` is the
  only composition root. Inner layers throw `DomainError` (`common/errors.ts`);
  `callable.ts` maps it to `HttpsError` and never forwards a `corrupt` message.
  Handler tests use a fake repo that rejects un-overridden calls.
- **Frozen contract:** `deriveBookId()` in `functions/src/books/bookIdentity.ts`
  must not be reimplemented — changing it needs a data migration.
- `/books` is a shared catalog (deterministic id, never overwritten). Edit a
  reading/TBR via its own doc or by repointing `bookId`; use `promoteTBREntry()`
  for a single-batch promote.
- No Unit of Work: `tbr/store.ts` imports `readings/store.ts` (one cross-collection
  transaction). A second cross-aggregate transaction is the trigger to add one.

## Web tests

Follow `app/web/src/testing/CONVENTIONS.md` (`BookForm.test.tsx` is the reference):
render via `src/testing/test-utils`, `userEvent` only (no `fireEvent`/manual
`act()`), accessibility-first queries, fresh helpers per test, assert observable
outcomes only.

## Conventions

- Logging: `log` from `@bookbingo/lib-util`; keep `console.*` to scripts.
- Commits: conventional (`feat:`/`fix:`/`test:`/`refactor:`/`docs:`/`chore:`).
  CI squashes PRs, so the PR title becomes the commit message.
- Staging deploy is opt-in via `gh variable set ENABLE_STAGING_DEPLOY --body true`
  (no repo secrets exist yet).
