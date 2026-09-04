# BookBingo Copilot Instructions

## Build, test, and lint commands

Use **Node 22** from `.nvmrc` and **pnpm 11** from the root `package.json`. This repo is a pnpm workspace monorepo; do not use `npm` or `yarn`.

```bash
pnpm install

pnpm run dev:local              # web app + Firebase emulators
pnpm run dev:web                # Vite dev server
pnpm run dev:web:emulator
pnpm run dev:web:staging
pnpm run dev:web:prod
pnpm run emulator:start
pnpm run emulator:seed

pnpm run format
pnpm run format:check
pnpm run lint
pnpm run build
pnpm run typecheck
pnpm test
pnpm run test:integration
pnpm run verify
```

Run a single test file or test case with the package's native runner instead of the root aggregate script:

```bash
# Web unit tests (Vitest)
pnpm --filter @bookbingo/web exec vitest run src/components/BookForm.test.tsx
pnpm --filter @bookbingo/web exec vitest run src/components/BookForm.test.tsx -t "trims surrounding whitespace from the submitted title and author"

# Shared libs / functions (node:test + tsx)
pnpm --filter @bookbingo/lib-core exec node --import tsx --test src/scoring.test.ts
pnpm --filter @bookbingo/lib-core exec node --import tsx --test --test-name-pattern="balanced reader should score higher than unbalanced" src/scoring.test.ts
pnpm --filter @bookbingo/functions exec node --import tsx --test src/feedback/handler.test.ts

# Web integration tests (Firebase emulator-backed)
pnpm exec firebase emulators:exec --project demo-bookbingo 'pnpm --filter @bookbingo/web exec vitest run --config vitest.config.int.ts src/data/readings.int.test.ts'
```

`pnpm run verify` is the same chain CI runs locally: `format:check -> lint -> build -> test -> typecheck`.

## High-level architecture

BookBingo is split into reusable domain packages plus a Firebase-backed web app:

- `lib/types` defines the shared domain and API contract types: Firestore entities (`Book`, `Reading`, `TBREntry`), score breakdown types, and callable request/response shapes used by both the web app and Cloud Functions.
- `lib/core` holds the framework-free domain logic: tile definitions, validation, statistics, scoring, and deterministic book identity. This package is reused by the web app, migration scripts, and tests.
- `lib/util` contains shared runtime utilities, mainly the structured logger used by the app.
- `app/web` is the React 19 + Vite client. `src/pages` owns route-level flows, `src/hooks` turns subscriptions into loading/error state, `src/data` adapts Firestore snapshots into typed entities for reads, and `src/lib` contains Firebase bootstrap, write helpers, and callable wrappers.
- `functions` exposes Firebase callable functions. `enrichBook` delegates to an Open Library provider for search and metadata lookup; `submitFeedback` creates GitHub issues from in-app feedback.

The Firestore model is intentionally split between shared catalog data and user-owned activity data:

- `/books/{bookId}` is the shared catalog. Multiple users can reference the same book.
- `/users/{userId}` stores the profile written on sign-in.
- `/users/{userId}/readings/{readingId}` stores completed books and is the only data that contributes to scoring.
- `/users/{userId}/tbr/{tbrId}` stores the reading list and never contributes to scoring.
- Cross-user pages (`LeaderboardPage`, `LibraryPage`) aggregate through `collectionGroup('readings')`; scores are computed from live readings, not stored in Firestore.

The main end-to-end flows are:

1. Book selection starts in the web app. Search results come from the `enrichBook` callable, not direct browser requests to Open Library.
2. The client resolves the shared `/books/{bookId}` document with `getOrCreateBook(...)`, then writes a user-owned `reading` or `tbr` document that references that `bookId`.
3. UI reads join `Reading` / `TBREntry` documents with the shared `booksById` map returned by `useBooks()`.

Firebase Hosting serves `app/web/dist`. Firebase Functions predeploy builds the `functions` workspace before deploy.

## Key conventions

- Keep domain logic in `lib/core` and shared data contracts in `lib/types`. Do **not** import React, Firebase client SDKs, or browser-only code into `lib/*`.
- Treat `deriveBookId()` in `@bookbingo/lib-core` as a **frozen identity contract**. Reuse it everywhere; do not reimplement the normalization/hash logic in app code, functions, or scripts. Changing it is a data-migration event.
- `/books` is a shared catalog, not a per-user record. Editing an existing reading or TBR entry should usually update the user-owned document or repoint `bookId`, not overwrite shared book identity fields in place. `BookForm`'s `identityLocked` flow exists for this reason.
- Reads and writes are separated on the web side: new read/subscription code should usually live in `app/web/src/data/*` + `app/web/src/hooks/*`, while writes and callable wrappers belong in `app/web/src/lib/*`.
- Promoting a TBR entry to a completed reading should use `promoteTBREntry()` so the create+delete happens in a single batch write.
- `verify` order matters. Build before typecheck, because `functions/` resolves `@bookbingo/lib-types` through the built workspace output.
- Firebase config is fail-fast. `app/web/vite.config.ts` blocks builds with missing `VITE_FIREBASE_*` values, and `app/web/src/lib/firebase.ts` throws at runtime for incomplete config. Local emulator mode uses committed `.env.emulator`; web integration tests pin emulator env in `vitest.config.int.ts` instead of relying on a local `.env.test`.
- Web tests follow `app/web/src/testing/CONVENTIONS.md`: render through `src/testing/test-utils`, use `userEvent` instead of `fireEvent`, prefer accessibility queries, and build fresh render helpers per test. Unit tests exclude `*.int.test.*`; integration tests use `vitest.config.int.ts`.
- App runtime logging should use `log` from `@bookbingo/lib-util`; keep plain `console.*` usage to scripts or narrow special cases.
- Prettier owns tracked Markdown, JSON, CSS, and TS/TSX files. If you edit docs or config, run `pnpm run format`.
- When asked to commit, use conventional commit prefixes (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`).
