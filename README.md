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

- [Node.js](https://nodejs.org/) (v18 or higher)
- [pnpm](https://pnpm.io/) (v8 or higher)

### Running Locally

```bash
# Clone the repository
git clone https://github.com/zws33/bookbingo.git
cd bookbingo

# Install dependencies
pnpm install

# Copy environment config and fill in your Firebase credentials
cp app/web/.env.example app/web/.env.local

# Start the development server
pnpm run dev:web
```

Open http://localhost:5173 in your browser.

## Project Structure

```
bookbingo/
├── lib/
│   ├── types/src/        # Shared TypeScript types (Tile, UserBook, Reading, ScoreBreakdown, …)
│   └── core/src/         # Business logic: scoring, validation, tile definitions, statistics
├── app/
│   └── web/src/          # React web application (Vite + Tailwind + Firebase)
└── docs/                 # Design documents
```

Each `lib/` and `app/` directory is a separate [pnpm workspace](https://pnpm.io/workspaces) package. They reference each other as `@bookbingo/*` workspace dependencies.

## Architecture

The project enforces a strict boundary between business logic and the application layer:

- **`lib/`** — Pure TypeScript. No React, no Firebase. All scoring, validation, and tile logic lives here. This code is framework-agnostic and fully unit-testable.
- **`app/web/`** — React + Firebase. Consumes `lib/` packages for logic, handles UI, auth, and Firestore reads/writes.

When adding a feature, start in `lib/` (logic + tests), then wire it into `app/web/` (UI). Never import React or Firebase into `lib/`.

## Development

### Verification chain

Run this after every change before committing:

```bash
pnpm run lint && pnpm test && pnpm run typecheck
```

### Individual commands

```bash
pnpm test              # Run all tests (node:test)
pnpm run typecheck     # Type-check with tsc --build --noEmit
pnpm run lint          # Lint all TypeScript files
pnpm run format        # Format with Prettier
pnpm run build         # Compile all packages with tsc --build
```

### Environments

The app has separate staging and production Firebase environments:

```bash
pnpm run dev:web           # Development (uses .env.local)
pnpm run dev:web:staging   # Staging environment
pnpm run dev:web:prod      # Production environment
```

Environment config files live in `app/web/`. Copy `.env.example` to `.env.local` and fill in your Firebase project credentials.

## Scoring System

Each book can be tagged with up to 3 categories (tiles). One designated freebie book can cover unlimited categories. The score formula is:

```
Score = VarietyPoints + VolumePoints × BalanceFactor
```

**Variety Points** — 1 point per unique tile covered, never diminished. Covering a new category is the single highest-value action.

**Volume Points** — Additional books in an already-covered tile still earn points, but with harmonic diminishing returns: the 2nd book earns ½ point, the 3rd earns ⅓, the 4th earns ¼, and so on.

**Balance Factor** — Scales volume points based on how evenly books are distributed across tiles, using the coefficient of variation. A perfectly even distribution gives a factor of 1.0; heavy concentration reduces it. Variety points are never affected.

The result: a reader who covers 25 diverse tiles with 10 books will outscore one who stacks 30 books into 5 tiles. See [docs/SCORING_PLAN.md](docs/SCORING_PLAN.md) for the full formula, trade-off rationale, and worked examples.

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict, ESM only) |
| Web app | React 18 + Vite + Tailwind CSS |
| Backend | Firebase (Auth, Firestore, Hosting) |
| Testing | Node built-in test runner (`node:test`) |
| Package manager | pnpm (monorepo workspaces) |
| Build | `tsc --build` (project references) |

## License

This project is licensed under the Apache License 2.0 — see the [LICENSE](LICENSE) file for details.
