# BookBingo

Book reading bingo card tracker — a hobby project for a book club competition among friends. Users log books, tag them with categories, and earn scores that reward both volume and variety.

## Tech Stack

- **Language**: TypeScript (strict mode, ES2022, ESM only)
- **Web app**: React 19 + Vite + Tailwind CSS
- **Backend**: Firebase (Firestore, Hosting)
- **Testing**: `node:test` + `node:assert` in `lib/` and `functions/`; Vitest in `app/web/`
- **Package manager**: pnpm workspaces — never use `npm` or `yarn`
- **Build**: `tsc --build` in project-references mode — always `tsc -b`, never `tsc -p`, and always name the build config explicitly (`tsc -b tsconfig.build.json`)
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

Each `lib/`, `app/`, and `functions/` directory is a separate pnpm workspace package. All source lives under `src/` subdirectories. Packages reference each other as `@bookbingo/*` workspace dependencies (e.g., `@bookbingo/lib-core`, `@bookbingo/lib-types`).

Business logic lives in `lib/` and is framework-agnostic. The web app in `app/web/` consumes `lib/` and handles UI + Firebase integration. The `functions/` package is the backend; it is ESM and sits outside the monorepo's root tsconfig chain (its own composite project — see below).

## TypeScript Build Configuration

Two parallel tsconfig chains, with **different jobs**. Getting these confused is the single easiest way to break the build, so read this before touching any tsconfig.

### The two chains

- **`tsconfig.build.json`** — the **emit** chain. The root file is a _solution-style_ config: it declares `"files": []`, holds the shared compiler options every sub-project extends, and lists the project `references`. It compiles nothing itself; each sub-project's `tsconfig.build.json` declares its own `include` and `outDir`.
- **`tsconfig.json`** — the **typecheck / IDE** chain. Extends `tsconfig.build.json`, then adds `paths` aliases, `jsx`, and broad `include` globs (`app/**/*`, `lib/**/*`, `docs/**/*`, `scripts/**/*`). It resolves `@bookbingo/*` straight to **source**, never to `dist`, and type-checks everything as one flat program.

**`references` is NOT inherited through `extends`.** This is the trap. The root `tsconfig.json` extends `tsconfig.build.json` but gets an **empty** project graph. Consequently, every build command must **name the build config explicitly**:

```sh
tsc --build tsconfig.build.json          # correct — 5 projects
tsc --build                              # WRONG — resolves tsconfig.json, 1 project
tsc --build lib/*/tsconfig.build.json    # correct
tsc --build lib/*                        # WRONG — resolves the IDE tsconfig.json files
```

Sanity check any change with `npx tsc --build --dry --verbose`, which prints the project list. If it shows one project, the graph is broken.

### Output directories

Each output path has exactly one writer. Do not add a second.

| Path               | Written by            | Notes                                                            |
| ------------------ | --------------------- | ---------------------------------------------------------------- |
| `lib/*/dist`       | `tsc -b`              | Consumed by `functions/` via node_modules → `main`/`types`       |
| `app/web/.tsbuild` | `tsc -b`              | Throwaway. Nothing consumes it; `app/web` is a leaf in the graph |
| `app/web/dist`     | **`vite build` only** | The Firebase Hosting public root                                 |
| `functions/lib`    | `tsc -b`              | Deployed by the `firebase.json` predeploy hook                   |

`app/web` deliberately does **not** emit into `dist` — that belongs to Vite. A new build output directory must be added to three ignore lists: `.gitignore`, `eslint.config.js` `ignores`, and the Vitest `exclude` in `app/web/vite.config.ts`.

Tests (`*.test.ts`) are excluded from every `tsconfig.build.json`, so they are never compiled into build output. They are still fully type-checked, via the root `tsconfig.json` `include`.

**Note on `functions/`**: it uses `"moduleResolution": "Bundler"` (same as the root) and has only a `tsconfig.json` — no `tsconfig.build.json`. That single file is itself `composite` and carries the project `references`, so it serves as both the IDE and the build config. It is typechecked separately (`pnpm --filter @bookbingo/functions exec tsc --noEmit`, wired into `pnpm run typecheck`) because the root `tsconfig.json` `include` does not cover `functions/` — **not** because of a resolution conflict.

**`functions/` typechecking requires `lib/types/dist` to exist.** It has no `paths` aliases, so `@bookbingo/lib-types` resolves through node_modules to the built declarations. On a cold tree, run a build first — `pnpm run verify` does this for you by ordering `build` before `typecheck`.

### Import conventions

- **Cross-package imports**: Use `@bookbingo/*` workspace package names (e.g., `import { TILES } from '@bookbingo/lib-core'`). Do not use `@lib/*` path aliases — those are stale.
- **Within-package imports**: Use relative paths with `.js` extensions (e.g., `import { TILES } from './constants.js'`).

## Commands

- `pnpm run verify` — run full verification suite (format:check, lint, build, test, typecheck). Passes from a clean tree; `build` runs before `typecheck` because the `functions/` typecheck needs `lib/types/dist`
- `pnpm test` — run unit tests across all packages
- `pnpm run test:integration` — run integration tests (emulator lifecycle managed automatically via `firebase emulators:exec`)
- `pnpm run lint` — lint all packages (ESLint from repo root)
- `pnpm run format` — format the repo with Prettier (`prettier --write .`, scoped by `.prettierignore`)
- `pnpm run format:check` — assert formatting without writing; this is the gate inside `verify`
- `pnpm run typecheck` — type-check `lib/`, `app/web/`, and `scripts/` with `tsc --build --noEmit`, then `functions/` separately. **Needs `lib/types/dist` present** — on a cold tree run `pnpm run build` first (or just use `pnpm run verify`)
- `pnpm run build` — build the whole project-reference graph (`tsc --build tsconfig.build.json`): `lib/*`, `app/web`, `functions`
- `pnpm run build:libs` / `pnpm run build:apps` — build a subset of the graph
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

When changing **build or TypeScript configuration**, also verify from a genuinely clean state — stale outputs and `.tsbuildinfo` files mask broken graphs:

```sh
rm -rf lib/*/dist app/web/dist app/web/.tsbuild functions/lib
find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete
pnpm run verify
```

Then confirm the two deploy paths still work, since neither goes through the root scripts:

```sh
pnpm --filter @bookbingo/web run build:prod        # must yield dist/index.html + assets
pnpm --filter @bookbingo/functions run build       # the firebase.json predeploy hook
```

Finally, check `git status` — a build that emits outside a package `outDir` leaves untracked files behind.

## Code Style

- ESM only. No CommonJS (`require`, `module.exports`).
- Prefer `const` over `let`. Never use `var`.
- Formatting is handled by Prettier — do not manually align code. Prettier owns **every** tracked file type (`.ts`, `.tsx`, `.js`, `.json`, `.css`, `.md`); `.prettierignore` carves out build output, dependencies, and Firebase local state. `verify` fails on unformatted files, so run `pnpm run format` before committing.

## Testing

- Write tests for all new logic in `lib/`. Use `node:test` and `node:assert`.
- Test files live next to the code they test: `scoring.ts` → `scoring.test.ts`.
- When planning, explicitly state what you will test, where, and what scenarios you will cover.
- **Web (`app/web`) component/hook tests** use Vitest + Testing Library. Follow `app/web/src/testing/CONVENTIONS.md` and use `app/web/src/components/BookForm.test.tsx` as the reference example (userEvent-only, role-first queries, per-test factories, mock only at the I/O boundary).

## Git Workflow

**Branch + PR + squash.** All work happens on a feature branch and lands via a pull request that is **squash-merged** into `main`. Every squashed commit on `main` should be deployable.

- **Keep local `main` a clean mirror of origin** — never commit feature work directly to it. Branch for everything:
  ```sh
  git checkout main && git pull          # start from latest
  git checkout -b feat/short-description # do all work here
  ```
- **Exception — docs-only / trivial cleanup may land directly on `main`.** Pure documentation edits (`docs:`) and no-runtime-surface cleanup (`chore:` formatting, comments, typos) may be committed straight to `main`, **provided you then push directly to origin** (`git push`) rather than routing through a squash-merged PR. Direct push keeps `main` a true mirror because origin advances to the _same_ SHA; a squashed PR would re-SHA the commit and cause the exact divergence this rule guards against. Scope is strict: no changes to `lib/`, `app/`, `functions/`, build/TS config, `firestore.rules`, or anything with a behavioral or deploy surface — those still take a branch + PR.
- **After a PR is squash-merged**, update `main` by fast-forward and delete the merged branch:
  ```sh
  git checkout main
  git pull --ff-only                     # fast-forwards cleanly when main has no local commits
  git branch -d feat/short-description
  ```
- **Recommended once:** `git config --global pull.ff only`. A clean `main` always fast-forwards; if it ever diverges (e.g. a stray local commit) the pull _errors loudly_ instead of silently merging. Recovery in that case is `git reset --hard origin/main` (safe because the squashed PR already contains your branch's changes).
- **Why squash + mirror:** squash gives one tidy commit per feature, but it returns your branch's commits to `main` under a _new_ SHA — so committing to local `main` directly causes divergence. Keeping `main` as a pure mirror avoids that entirely.

Use conventional commit format (the PR title becomes the squashed commit message):

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
- **Book identity** is in `lib/core/src/bookIdentity.ts` (`deriveBookId`). Computes the deterministic `/books/{bookId}` document id (hash of the Open Library Work key, or of a normalized title+author key for manual books). This is a **frozen contract** — changing the normalization pipeline or hash changes every id and requires a coordinated re-key migration. `bookIdentity.test.ts` is the source of truth. See `docs/decisions/book-identity-and-deduplication.md`.
- **Shared types** are in `lib/types/src/index.ts`. All type definitions (`Tile`, `Book`, `Reading`, `TBREntry`, `ScoringInput`, `ScoreBreakdown`, etc.) live here. There is no `UserBook` type.
- **Logger** is in `lib/util/src/logger.ts` (`@bookbingo/lib-util`). Call `initLogger()` once at app startup (in `firebase.ts`) with a platform-specific dispatcher. Use `log.debug`, `log.error`, and `log.event` everywhere else.
- **UI primitives** are in `app/web/src/components/ui/`, all re-exported from `ui/index.ts`. Two kinds live in one folder (deliberately — see `docs/decisions/ui-primitives-architecture.md`):
  - _Radix-backed_, accessible by construction: `Dialog`, `AlertDialog`, `Toast` (`ToastItem`/`ToastViewport`), `ToggleGroup`, `Tooltip`, `Accordion`. Radix owns focus management, portalling, scroll lock, and ARIA; we own styling.
  - _Plain presentational_, **no a11y guarantees**: `Button`, `Input`, `Label`, `Textarea`, `Avatar`, `Spinner`, `TileBadge`.

  Prefer these over raw `<button>`/`<input>`. `Button` variants are `primary | secondary | ghost | danger | outline`; use `ghost` for interactive inline controls (e.g. row expand toggles). Compose conditional Tailwind classes with `cn()` from `app/web/src/lib/cn.ts`. Components reference **semantic design tokens** (`bg-primary`, `text-on-surface`), never raw palette hues — see `docs/decisions/design-token-system.md`, and `/catalog` for the live reference.

- **Cloud Functions** are wired in `functions/src/index.ts`, which only declares the `onCall` handlers; the implementations live in feature folders.
  - **`enrichBook`** (`functions/src/books/`) — the Open Library integration and the backend for book search. Two actions: `search` (query → `BookSearchResult[]`) and `lookup` (Work key → `BookEnrichmentResult`). `providers/open-library.ts` implements the `BookProvider` interface in `books/types.ts` and holds an in-memory TTL cache for `search`. The frontend calls it through `app/web/src/lib/bookSearch.ts`. See `docs/BOOK_DATA_MODEL.md` and `docs/OPEN_LIBRARY_DEPENDENCY_ROADMAP.md`.
  - **`submitFeedback`** (`functions/src/feedback/handler.ts`) — reads the `GITHUB_PAT` secret (set via `firebase functions:secrets:set GITHUB_PAT`) and POSTs to the GitHub Issues API. The frontend calls it via `httpsCallable(functions, 'submitFeedback')`; `app/web/src/components/FeedbackModal.tsx` provides the UI.
- When adding new features, start with `lib/` (logic + tests), then wire it into `app/web/` (UI).
- For larger features, create a planning doc in `docs/` before writing code. This is especially important when the task involves new data models, scoring changes, or architectural decisions.
- **Architectural decisions** are indexed at `docs/decisions/index.md`. Add a new entry whenever a non-obvious design choice is made — especially patterns that future agents or contributors might otherwise second-guess or undo.
