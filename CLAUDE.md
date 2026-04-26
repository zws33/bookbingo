# BookBingo

Book reading bingo card tracker — a hobby project for a book club competition among friends. Users log books, tag them with categories, and earn scores that reward both volume and variety.

## Tech Stack

- **Language**: TypeScript (strict mode, ES2022, ESM only)
- **Web app**: React 19 + Vite + Tailwind CSS
- **Backend**: Firebase (Firestore, Hosting)
- **Testing**: `node:test` + `node:assert` in `lib/` and `functions/`; Vitest in `app/web/`
- **Package manager**: pnpm workspaces — never use `npm` or `yarn`
- **Build**: `tsc --build` (project references mode — always use `tsc -b`, never `tsc -p`)
- **Tooling**: ESLint, Prettier, tsx

## Project Structure

```
lib/types/src/    # Shared TypeScript types (Tile, UserBook, Reading, etc.)
lib/core/src/     # Business logic (scoring, validation, statistics, tiles, constants)
lib/util/src/     # Cross-platform utilities (logger)
app/web/src/      # React web application (Vite + Firebase)
functions/src/    # Firebase Cloud Functions (Node.js, ESM)
scripts/          # Root-level management scripts (e.g., seeding)
emulator-data/    # Shared emulator data (imported/exported)
docs/             # Project documentation and planning
docs/archive/     # Obsolete or completed project records
```


Each `lib/`, `app/`, and `functions/` directory is a separate pnpm workspace package. All source lives under `src/` subdirectories. Packages reference each other as `@bookbingo/*` workspace dependencies (e.g., `@bookbingo/lib-core`, `@bookbingo/lib-types`).

Business logic lives in `lib/` and is framework-agnostic. The web app in `app/web/` consumes `lib/` and handles UI + Firebase integration. The `functions/` package is the backend; it uses ESM with `NodeNext` module resolution (separate from the monorepo's root tsconfig chain).

## TypeScript Build Configuration

The project uses a dual-tsconfig pattern:

- **`tsconfig.build.json`** — Base config for compilation. All sub-project `tsconfig.build.json` files extend this. Contains `composite`, `incremental`, and project `references`. This is what `tsc --build` uses.
- **`tsconfig.json`** — Extends `tsconfig.build.json`. Adds `paths` aliases, `jsx`, and broad `include` globs for IDE support and `tsc --build --noEmit` typechecking.

Each workspace package has its own `tsconfig.build.json` (for builds) and `tsconfig.json` (for IDE). The build configs extend the **root `tsconfig.build.json`**.

**Critical**: In `tsc --build` mode, each sub-project is compiled using its own tsconfig chain independently. Settings in the root `tsconfig.json` do **not** apply to sub-projects. Any compiler options that sub-projects need (like `paths` for resolving `@bookbingo/*` imports) must be in `tsconfig.build.json`, not just `tsconfig.json`.

**Note on `functions/`**: The `functions/` package uses `NodeNext` module resolution, which is incompatible with the monorepo root's `bundler` resolution. It is therefore excluded from the root `tsconfig.json` `include` glob and typechecked separately via `pnpm --filter @bookbingo/functions exec tsc --noEmit`, which is integrated into `pnpm run typecheck`.

### Import conventions

- **Cross-package imports**: Use `@bookbingo/*` workspace package names (e.g., `import { TILES } from '@bookbingo/lib-core'`). Do not use `@lib/*` path aliases — those are stale.
- **Within-package imports**: Use relative paths with `.js` extensions (e.g., `import { TILES } from './constants.js'`).

## Commands

- `pnpm run verify` — run full verification suite (lint, test, typecheck)
- `pnpm test` — run unit tests across all packages
- `pnpm run test:integration` — run integration tests (emulator lifecycle managed automatically via `firebase emulators:exec`)
- `pnpm run lint` — lint all packages (ESLint from repo root)
- `pnpm run format` — format with Prettier
- `pnpm run typecheck` — type-check `lib/` and `app/web/` with `tsc --build --noEmit`, then `functions/` separately
- `pnpm run build` — build all packages with `tsc --build`
- `pnpm run dev:web` — run the web app dev server
- `pnpm run dev:local` — start emulator and web dev server together
- `pnpm run emulator:start` — start Firebase emulators (root data/scripts)
- `pnpm run emulator:seed` — seed emulators with test data

## Package Management

This is a **pnpm monorepo**. Each directory under `lib/`, `app/`, and `functions/` is a separate workspace package with its own `package.json` and dependency tree.

**Installing dependencies** — always scope to a workspace, never install at the repo root unless it is shared tooling (ESLint, TypeScript, Prettier):

```sh
pnpm --filter @bookbingo/web add <package>        # add to app/web
pnpm --filter @bookbingo/lib-core add <package>   # add to lib/core
pnpm add -D <package> -w                          # root-level dev tooling only
```

**Inspecting packages** — do not use `node -e "require(...)"`. This project is ESM-only and packages are hoisted per-workspace. To verify a dependency is installed, read the workspace `package.json` directly:

```sh
cat app/web/package.json      # dependencies available to app/web
cat lib/core/package.json     # dependencies available to lib/core
```

**Running workspace-specific commands:**

```sh
pnpm --filter @bookbingo/web run <script>
pnpm --filter @bookbingo/functions exec tsc --noEmit
```

## Task Workflow Addenda

Task workflow follows the standard 4-phase process (Clarify → Research → Plan → Implement). Project-specific additions:

- During **Research**, check `docs/` for relevant planning documents and `docs/decisions/index.md` for architectural decisions that may affect your approach.
- During **Implement**, review your diff for CLAUDE.md staleness if you changed any of:
  - Workspace packages or modules in `lib/core/src/`
  - TypeScript configuration (tsconfig files, paths, references)
  - Import conventions or package aliases
  - Build/test/lint commands or scripts
  - Files referenced in Architecture Guidance
  - Architectural patterns (data flow, module boundaries, new dependencies)

## Verification Workflow

**After every code change**, run the full verification chain before committing:

```
pnpm run verify
```

Do not commit code that fails checks, contains `console.log` debug statements, or has not been formatted with Prettier.

When changing **build or TypeScript configuration**, also verify from a clean state:

```
rm -rf lib/*/dist app/*/dist && pnpm run typecheck
```

## Code Style

- ESM only. No CommonJS (`require`, `module.exports`).
- Prefer `const` over `let`. Never use `var`.
- Formatting is handled by Prettier — do not manually align code.

## Testing

- Write tests for all new logic in `lib/`. Use `node:test` and `node:assert`.
- Test files live next to the code they test: `scoring.ts` → `scoring.test.ts`.
- When planning, explicitly state what you will test, where, and what scenarios you will cover.

## Git Workflow

Work directly on `main` (trunk-based). Every commit should be deployable.

Use conventional commit format:
- `feat: add score calculation for multi-tag books`
- `fix: prevent duplicate category assignment`
- `test: add edge cases for freebie book scoring`
- `refactor: extract validation into shared utility`
- `docs: update scoring plan with diminishing returns formula`

When creating PRs, include a summary of changes but do not include a test plan section.

## Architecture Guidance

- The `lib/` ↔ `app/web/` separation is a first-class architectural concern — defend it. Never import React or Firebase in `lib/`.
- Consider Firestore query costs, index requirements, and listener lifecycle in every data-layer decision.
- **Firebase config** (`firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`) all live at the repo root. Deploy and emulator commands are run from root via root `package.json` scripts.
- **Firestore rules** are in `firestore.rules` (repo root). Update them when data model changes.
- **Scoring logic** is in `lib/core/src/scoring.ts`. The scoring algorithm rewards volume and variety while penalizing imbalance. See `docs/SCORING_PLAN.md` for design rationale.
- **Validation** is in `lib/core/src/validation.ts`. Enforce constraints here (e.g., max 3 categories per book, freebie rules).
- **Tile lookup** is in `lib/core/src/tiles.ts`. Provides `getTileById()` for resolving tile IDs to names.
- **Shared types** are in `lib/types/src/index.ts`. All type definitions (`Tile`, `UserBook`, `Reading`, `ScoreBreakdown`, etc.) live here.
- **Logger** is in `lib/util/src/logger.ts` (`@bookbingo/lib-util`). Call `initLogger()` once at app startup (in `firebase.ts`) with a platform-specific dispatcher. Use `log.debug`, `log.error`, and `log.event` everywhere else.
- **UI primitives** are in `app/web/src/components/ui/` (`Button`, `Input`, `Label`) and `app/web/src/lib/cn.ts` (`cn()`). Use `cn()` for conditional Tailwind class composition. Prefer these over raw `<button>` and `<input>` tags. Use `Button variant="ghost"` for interactive inline controls (e.g. row expand toggles).
- **Feedback / GitHub Issues** — `functions/src/index.ts` contains the `submitFeedback` callable Cloud Function. It reads the `GITHUB_PAT` secret (set via `firebase functions:secrets:set GITHUB_PAT`) and POSTs to the GitHub Issues API. The frontend calls it via `httpsCallable(functions, 'submitFeedback')`. The `FeedbackModal` component in `app/web/src/components/FeedbackModal.tsx` provides the UI.
- When adding new features, start with `lib/` (logic + tests), then wire it into `app/web/` (UI).
- For larger features, create a planning doc in `docs/` before writing code. This is especially important when the task involves new data models, scoring changes, or architectural decisions.
- **Architectural decisions** are indexed at `docs/decisions/index.md`. Add a new entry whenever a non-obvious design choice is made — especially patterns that future agents or contributors might otherwise second-guess or undo.
