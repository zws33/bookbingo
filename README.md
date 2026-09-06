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

# Start the web app and Firebase emulators together
pnpm run dev:local

# Optional: seed the local emulator with sample data
pnpm run emulator:seed
```

Open http://localhost:5173 in your browser.

If you prefer separate terminals, run `pnpm run emulator:start` in one and
`pnpm run dev:web:emulator` in another.

For local runs against a real Firebase project, copy `app/web/.env.example` to
`app/web/.env.staging` or `app/web/.env.prod`, fill in the values, and use the
matching script: `pnpm run dev:web:staging` or `pnpm run dev:web:prod`.

## Project Structure

```
bookbingo/
├── lib/
│   ├── types/src/        # Shared TypeScript types (Tile, Book, Reading, TBREntry, ScoreBreakdown, …)
│   ├── core/src/         # Business logic: scoring, validation, tile definitions, statistics
│   └── util/src/         # Cross-platform utilities (logger)
├── app/
│   └── web/src/          # React web application (Vite + Tailwind + Firebase)
├── functions/src/        # Firebase Cloud Functions (enrichBook, submitFeedback)
└── docs/                 # Design documents
```

The workspace packages live under `app/*` and `lib/*`, plus the top-level
`functions` package. They reference each other as `@bookbingo/*` workspace
dependencies.

## Architecture

The project enforces a strict boundary between business logic and the application layer:

- **`lib/`** — Pure TypeScript. No React, no Firebase. All scoring, validation, and tile logic lives here. This code is framework-agnostic and fully unit-testable.
- **`app/web/`** — React + Firebase. Consumes `lib/` packages for logic, handles UI, auth, and Firestore reads/writes.

When adding a feature, start in `lib/` (logic + tests), then wire it into `app/web/` (UI). Never import React or Firebase into `lib/`.

## Development

### Verification chain

Run this after every change before committing:

```bash
pnpm run verify
```

`verify` matches CI and runs `format:check -> lint -> build -> test ->
typecheck` in that order. The build step intentionally comes before typecheck
because `functions/` resolves `@bookbingo/lib-types` from built workspace
output.

### Individual commands

```bash
pnpm test                  # Run all workspace tests (node:test + Vitest)
pnpm run test:integration  # Run web integration tests against Firebase emulators
pnpm run typecheck         # Type-check workspace packages with tsc --noEmit
pnpm run lint              # Lint the repo
pnpm run format            # Format with Prettier
pnpm run build             # Compile all packages with tsc --build
```

### Environments

Recommended local development uses the committed emulator config:

```bash
pnpm run dev:local         # Web app + Firebase emulators
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
Score = VarietyPoints + VolumePoints × BalanceFactor
```

**Variety Points** — 1 point per unique tile covered, never diminished. Covering a new category is the single highest-value action.

**Volume Points** — Additional books in an already-covered tile still earn points, but with harmonic diminishing returns: the 2nd book earns ½ point, the 3rd earns ⅓, the 4th earns ¼, and so on.

**Balance Factor** — Scales volume points by how evenly books are spread across the tiles you have _already covered_, using the coefficient of variation. An even spread gives 1.0; piling extra books onto a few of your tiles reduces it. Covering only a handful of tiles is not penalized here — that cost is the variety points you never earn. Variety points are never scaled.

The result: a reader who covers 25 diverse tiles with 10 books will outscore one who stacks 30 books into 5 tiles. The implementation and the rationale for each term live in [`lib/core/src/scoring.ts`](lib/core/src/scoring.ts); [`scoring.test.ts`](lib/core/src/scoring.test.ts) carries worked scenarios with their expected scores.

## Tech Stack

| Layer           | Technology                                                                   |
| --------------- | ---------------------------------------------------------------------------- |
| Language        | TypeScript (strict, ESM only)                                                |
| Web app         | React 19 + Vite + Tailwind CSS                                               |
| Backend         | Firebase (Auth, Firestore, Hosting)                                          |
| Testing         | `node:test` in `lib/` + `functions/`; Vitest + Testing Library in `app/web/` |
| Package manager | pnpm 11 (monorepo workspaces)                                                |
| Build           | `tsc --build` (project references)                                           |

## License

This project is licensed under the Apache License 2.0 — see the [LICENSE](LICENSE) file for details.
