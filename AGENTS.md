# BookBingo

BookBingo is a TypeScript pnpm workspace for tracking book-club reading with a Firebase-backed web app. Users log books, tag them to bingo tiles, and compete on score via volume plus variety.

## Toolchain and Commands

- Use Node 22 from `.nvmrc` and pnpm 11 from the root `package.json`.
- This is a pnpm workspace monorepo. Do not use `npm` or `yarn`.
- Install: `pnpm install`
- Format: `pnpm run format`
- Format check: `pnpm run format:check`
- Lint: `pnpm run lint`
- Build: `pnpm run build`
- Type check: `pnpm run typecheck`
- Test: `pnpm test`
- Integration tests: `pnpm run test:integration`
- Full local verification: `pnpm run verify`

Run targeted tests with the package's native runner instead of the root aggregate script:

- Web unit test: `pnpm --filter @bookbingo/web exec vitest run src/components/BookForm.test.tsx`
- Shared library test: `pnpm --filter @bookbingo/lib-core exec node --import tsx --test src/scoring.test.ts`
- Functions test: `pnpm --filter @bookbingo/functions exec node --import tsx --test src/feedback/handler.test.ts`
- Web integration test: `pnpm exec firebase emulators:exec --project demo-bookbingo 'pnpm --filter @bookbingo/web exec vitest run --config vitest.config.int.ts src/data/readings.int.test.ts'`

## Architecture

- `lib/types`: shared Firestore entities, score types, and callable request/response contracts
- `lib/core`: framework-free domain logic, validation, scoring, statistics, and deterministic book identity
- `lib/util`: shared runtime utilities, especially structured logging
- `app/web`: React 19 + Vite client; `src/pages` holds route flows, `src/hooks` owns subscription state, `src/data` adapts Firestore reads, and `src/lib` contains Firebase bootstrap, writes, and callable wrappers
- `functions`: Firebase callable functions, including book enrichment and feedback submission
- `scripts`: operational and migration scripts

## Important Boundaries and Invariants

- Keep domain logic in `lib/core` and shared data contracts in `lib/types`.
- Do not import React, Firebase client SDKs, or browser-only code into `lib/*`.
- Treat `deriveBookId()` in `@bookbingo/lib-core` as a frozen identity contract. Reuse it everywhere; changing it is a data-migration event.
- `/books/{bookId}` is a shared catalog, not a per-user record.
- User-owned activity lives under `/users/{userId}/readings/{readingId}` and `/users/{userId}/tbr/{tbrId}`.
- Only completed readings contribute to scoring. TBR entries never do.
- Search results must come from the `enrichBook` callable, not direct browser calls to Open Library.
- On the web side, reads belong in `app/web/src/data/*` plus `app/web/src/hooks/*`; writes and callable wrappers belong in `app/web/src/lib/*`.
- Promote a TBR entry to a reading with `promoteTBREntry()` so create+delete happens in one batch write.

## Testing and Runtime Conventions

- `pnpm run verify` order matters: build before typecheck, because `functions/` resolves `@bookbingo/lib-types` through built workspace output.
- Web tests follow `app/web/src/testing/CONVENTIONS.md`: render through `src/testing/test-utils`, use `userEvent` instead of `fireEvent`, prefer accessibility queries, and build fresh render helpers per test.
- Unit tests exclude `*.int.test.*`; integration tests use `vitest.config.int.ts`.
- Firebase config is fail-fast. The Vite config blocks missing `VITE_FIREBASE_*` values, and the runtime Firebase bootstrap throws for incomplete config.
- Local emulator mode uses committed `.env.emulator`; do not assume a separate `.env.test`.
- Use `log` from `@bookbingo/lib-util` for app runtime logging. Keep plain `console.*` usage to scripts or narrow special cases.
- Prettier owns tracked Markdown, JSON, CSS, and TS/TSX files. If you edit docs or config, run `pnpm run format`.

## Change Protocol

- For non-trivial work, inspect the relevant files and propose a numbered implementation plan before editing.
- Ask before changing dependencies, schemas, migrations, CI, deployment, authentication, or other security-sensitive configuration.
- Favor small, reviewable changes over broad refactors.
- Do not overwrite shared `/books` identity fields in place when the change should instead update or repoint a user-owned reading or TBR document.
