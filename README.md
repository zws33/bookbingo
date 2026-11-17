# BookBingo

A book reading competition tracker for book clubs. Log the books you've read, tag them with bingo categories, and compete with friends to see who can read the most diverse collection.

## What is BookBingo?

BookBingo turns reading into a friendly competition where you:

- Track books across 49 different categories (43 book-assignable + 6 manual)
- Earn points for both volume and variety of reading
- View your progress on a visual 7×7 bingo board
- See a score breakdown showing variety, volume, and balance contributions
- Compare scores with other members of your book club

The scoring algorithm rewards balanced reading across many categories while still recognizing readers who complete many books. The goal is to motivate exploration, not just volume.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v22 — pinned via `.nvmrc` and used in CI)
- [pnpm](https://pnpm.io/) (v11 — pinned via `packageManager` in the root `package.json`)

### Running Locally

```bash
# Clone the repository
git clone https://github.com/zws33/bookbingo.git
cd bookbingo

# Install dependencies
pnpm install

# Start the web app and the Auth/Functions emulators together
pnpm run dev:local
```

Open http://localhost:5173 in your browser.

If you prefer separate terminals, run `pnpm run emulator:start` in one and
`pnpm run dev:web:emulator` in another.

### Local Postgres

Postgres is the application database. Neon hosts staging and prod; Docker hosts
local dev and `test:db`.

```bash
docker compose up -d --wait              # Postgres on 5433, database bookbingo_test
cp functions/.env.example functions/.env.local
pnpm run db:migrate                      # Apply db/migrations/
```

Data lives in the `pgdata` named volume, so it survives `docker compose down`.
Run `docker compose down -v` to discard it and migrate again from empty.

Every script that writes to Postgres defaults to `TEST_DATABASE_URL` and reaches
a remote database only when passed `--database-url`:
`pnpm run db:migrate -- --database-url 'postgres://…neon…/bookbingo'`.
`DATABASE_URL` is the application's connection and is never a migration target.

For local runs against a real Firebase project, copy `app/web/.env.example` to
`app/web/.env.staging` or `app/web/.env.prod`, fill in the values, and use the
matching script: `pnpm run dev:web:staging` or `pnpm run dev:web:prod`.

## Project Structure

```
bookbingo/
├── lib/
│   ├── types/src/        # Shared TypeScript types (Tile, BoardConfig, Book, ScoringInput, ScoreBreakdown, …)
│   └── util/src/         # Cross-platform utilities (logger)
├── app/
│   └── web/src/          # React web application (Vite + Tailwind + Firebase)
├── functions/src/        # Firebase Cloud Functions (callable API over Postgres)
└── docs/                 # Design documents
```

The workspace packages live under `app/*` and `lib/*`, plus the top-level
`functions` package. They reference each other as `@bookbingo/*` workspace
dependencies.

## Architecture

The project enforces a strict boundary between business logic and the application layer:

- **`lib/`** — Pure TypeScript, framework-agnostic: the shared types every package reads and cross-platform utilities. No React, no Firebase.
- **`functions/`** — The callable API over Postgres, and where every domain rule lives. `functions/src/domain/` is pure and unit-testable: scoring engines, validation, statistics. Each module with persistence splits into `store.ts` / `handler.ts` / `present.ts`; `index.ts` is the only module naming a concrete repository.
- **`app/web/`** — React + Firebase. Consumes `lib/` types, handles UI and auth. Every read and write goes through a callable; `firebase/firestore` is ESLint-banned.

When adding a feature, start in `functions/src/domain/` (logic + tests), then its store and handler, then wire it into `app/web/` (UI). Never import React or Firebase into `lib/`.

## Development

### Verification chain

Run this after every change before committing:

```bash
pnpm run verify
```

`verify` runs `format:check -> lint -> build -> typecheck` in that order. The
build step intentionally comes before typecheck because `functions/` resolves
`@bookbingo/lib-types` from built workspace output.

`verify` does not run tests. CI runs them as separate jobs (`test` and
`test_db`); run them locally with:

```bash
pnpm test                  # Unit tests, all workspaces (builds lib/ first)
pnpm run test:db           # Postgres tests, needs Docker and functions/.env.local
```

### Individual commands

```bash
pnpm run typecheck         # Type-check workspace packages with tsc --noEmit
pnpm run lint              # Lint the repo
pnpm run format            # Format with Prettier
pnpm run build             # Compile all packages with tsc --build
pnpm run db:migrate        # Apply db/migrations/ to TEST_DATABASE_URL, or --database-url <url> (--dry-run lists pending)
```

### Environments

Recommended local development uses the committed emulator config:

```bash
pnpm run dev:local         # Web app + Auth/Functions emulators
pnpm run dev:web:emulator  # Web app only, pointed at local emulators
```

Real Firebase projects use environment-specific files in `app/web/`:

```bash
pnpm run dev:web:staging   # Staging environment
pnpm run dev:web:prod      # Production environment
```

Use `app/web/.env.example` as the template for `app/web/.env.staging` or
`app/web/.env.prod`. The emulator-backed local flow does not require real
Firebase credentials.

## Scoring System

Each book can be tagged with up to 3 categories (tiles). One designated freebie book can cover unlimited categories, and its tiles are scored exactly like any other book's. All books and all categories count equally — there are no difficulty tiers or bonus multipliers. The score formula is:

```
S = k + Σᵢ Σ_{j=2}^{cᵢ} ρ(j)
```

- `k` — tags holding at least one book. A tag's first book is a full point, never diminished, so covering a new category is the highest-value move.
- `ρ(j)` — the value of the j-th book within a tag, defined for `j ≥ 2`. The inner sum starts at 2, so coverage and repeats never double-count.

**Engines.** Two are registered in `domain/scoringEngines.ts` and differ only in `ρ(j)`: `COVERAGE_DECAY` uses `1 / j^p` with the exponent derived from coverage, and `SHIFTED_HARMONIC` uses `y·a/(j − 2 + a)` for an uncapped logarithmic tail. Broader coverage decays slower in both, which is what makes a new tag always worth at least 1 point.

Scoring reads no measure of how unevenly books are spread across tiles. Any such term — standard deviation, coefficient of variation, books per tag — breaks "more is always better," because adding a book can worsen the spread while adding to the total.

**Selection.** Which engine scores a challenge is a `challenge_scoring_config` row, read on every scoring call; a challenge with no row is scored with `COVERAGE_DECAY`. No score is persisted — every score is recomputed on read — so switching a challenge's engine rescores its whole history, and switching back restores the previous numbers exactly.

Scores are computed server-side and arrive with the readings they were computed from. The engines live in [`functions/src/domain/`](functions/src/domain/); [`docs/scoring-model.md`](docs/scoring-model.md) carries the parameters, invariants, and calibration tables.

## Tech Stack

| Layer           | Technology                                                                   |
| --------------- | ---------------------------------------------------------------------------- |
| Language        | TypeScript (strict, ESM only)                                                |
| Web app         | React 19 + Vite + Tailwind CSS                                               |
| Backend         | Firebase (Auth, Functions, Hosting) + Neon Postgres                          |
| Testing         | `node:test` in `lib/` + `functions/`; Vitest + Testing Library in `app/web/` |
| Package manager | pnpm 11 (monorepo workspaces)                                                |
| Build           | `tsc --build` (project references)                                           |

## License

This project is licensed under the Apache License 2.0 — see the [LICENSE](LICENSE) file for details.
