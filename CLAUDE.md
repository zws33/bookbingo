# BookBingo

Book reading bingo card tracker — a hobby project for a book club competition among friends. Users log books, tag them with categories, and earn scores that reward both volume and variety.

## Tech Stack

- **Language**: TypeScript (strict mode, ES2022, ESM only)
- **Web app**: React 19 + Vite + Tailwind CSS
- **Backend**: Firebase (Firestore, Hosting)
- **Testing**: `node:test` + `node:assert` in `lib/` and `functions/`; Vitest in `app/web/`
- **Package manager**: pnpm workspaces — never use `npm` or `yarn`
- **Tooling**: ESLint, Prettier, tsx

## Project Structure

```
lib/types/src/         # Shared TypeScript types (Tile, Book, Reading, TBREntry, etc.)
lib/core/src/          # Business logic (scoring, validation, statistics, tiles, constants, bookIdentity)
lib/util/src/          # Cross-platform utilities (logger)
app/web/src/           # React web application (Vite + Firebase)
app/web/src/testing/   # Test harness: test-utils, fixtures, setup, CONVENTIONS.md
functions/src/         # Firebase Cloud Functions (Node.js, ESM)
scripts/               # Root-level management scripts (seeding, mirroring, migrations)
scripts/lib/           # Shared script helpers (admin SDK setup, write guards, datasets)
emulator-data/         # Shared emulator data (imported/exported)
docs/                  # Project documentation and planning
docs/decisions/        # Architectural decision records (start at index.md)
docs/archive/          # Obsolete or completed project records
```

## Code Style

- ESM only. No CommonJS (`require`, `module.exports`).
- Prefer `const` over `let`. Never use `var`.
- Formatting is handled by Prettier — do not manually align code. Prettier owns **every** tracked file type (`.ts`, `.tsx`, `.js`, `.json`, `.css`, `.md`); `.prettierignore` carves out build output, dependencies, and Firebase local state. `verify` fails on unformatted files, so run `pnpm run format` before committing.

## Git

Use conventional commit format (the PR title becomes the squashed commit message):

- `feat: add score calculation for multi-tag books`
- `fix: prevent duplicate category assignment`
- `test: add edge cases for freebie book scoring`
- `refactor: extract validation into shared utility`
- `docs: update scoring plan with diminishing returns formula`
