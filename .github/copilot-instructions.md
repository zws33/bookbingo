# BookBingo — GitHub Copilot Instructions

Book reading bingo card tracker using TypeScript, React, and Firebase. Users log books, assign categories, and earn scores rewarding volume and variety.

## Tech Stack & Build Tools

- **TypeScript 5.4+** (strict mode, ES2022, ESM only) with project references
- **React 18** + Vite + Tailwind CSS
- **Firebase** (Firestore, Hosting)
- **Node.js 22**, **pnpm 10** (monorepo with workspaces)
- **Testing**: Node built-in test runner (`node:test` + `node:assert`)
- **Linting/Formatting**: ESLint, Prettier

## Essential Commands

Run in this exact order:

```bash
# Bootstrap (required after fresh clone or dependency changes)
pnpm install --frozen-lockfile

# Development workflow
pnpm run lint          # ESLint across all packages
pnpm test              # Run tests across all packages
pnpm run typecheck     # Type-check with tsc --build --noEmit

# Build (uses TypeScript project references)
pnpm run build         # Build all packages with tsc --build

# Run web app locally
pnpm run dev:web       # Start Vite dev server
```

**Critical**: Always use `pnpm` (not npm/yarn). Always run the full verification chain after code changes:

```bash
pnpm run lint && pnpm test && pnpm run typecheck
```

## Project Structure

Monorepo with three workspace packages:

```
lib/types/src/     # Shared TypeScript types (Tile, UserBook, Reading, ScoreBreakdown)
lib/core/src/      # Pure business logic (scoring, validation, statistics, tiles)
app/web/src/       # React application + Firebase integration
docs/              # Design documents (SCORING_PLAN.md, etc.)
```

**Separation of concerns**: `lib/` packages are framework-agnostic. Never import React or Firebase in `lib/`. The web app consumes `lib/` packages and handles UI + Firebase.

## TypeScript Build Configuration

Uses a **dual-tsconfig pattern** with project references:

- **`tsconfig.build.json`** — Base compilation config (extends root, used by `tsc --build`)
- **`tsconfig.json`** — IDE support (extends build, adds paths/jsx/includes)

Each workspace package has both files. The root has both files too.

**Critical**: In `tsc --build` mode, sub-projects compile independently. Settings in root `tsconfig.json` do NOT apply to sub-projects. Compiler options needed by sub-projects (like `paths` for `@bookbingo/*` imports) must be in `tsconfig.build.json`, not just `tsconfig.json`.

**Always use `tsc --build` (or `tsc -b`), never `tsc -p`.**

If TypeScript configuration changes fail, verify from clean state:

```bash
rm -rf lib/*/dist app/*/dist && pnpm run typecheck
```

## Import Conventions

- **Cross-package**: Use workspace names: `import { TILES } from '@bookbingo/lib-core'`
- **Within-package**: Use relative paths with `.js` extension: `import { TILES } from './constants.js'`
- **Never use** `@lib/*` path aliases (stale)

## Key Files & Locations

- **Types**: `lib/types/src/index.ts` — All type definitions
- **Scoring logic**: `lib/core/src/scoring.ts` — Rewards volume and variety
- **Validation**: `lib/core/src/validation.ts` — Constraints (max 3 categories, etc.)
- **Tile lookup**: `lib/core/src/tiles.ts` — `getTileById()` utility
- **Firestore rules**: `app/web/firestore.rules` — Update when data model changes
- **Design docs**: `docs/SCORING_PLAN.md` — Algorithm rationale

## Testing

- Use Node's built-in test runner: `node:test` and `node:assert`
- Test files live next to source: `scoring.ts` → `scoring.test.ts`
- Always test new logic in `lib/`. Tests should be self-contained.
- Web app components don't have test infrastructure yet.

## Code Style

- ESM only (no CommonJS)
- Use `const` over `let`, never `var`
- Prettier handles formatting
- Keep functions small and pure (especially in `lib/`)
- No comments that restate code; only explain non-obvious "why"

## Git Workflow

Trunk-based development on `main`. Use conventional commits:

```
feat: add score calculation for multi-tag books
fix: prevent duplicate category assignment
test: add edge cases for freebie book scoring
refactor: extract validation into shared utility
docs: update scoring plan with formula
```

Each commit should be complete, passing all checks.

## CI/CD

GitHub Actions workflow on push to `main`:

1. Install dependencies: `pnpm install --frozen-lockfile`
2. Build web app: `pnpm --filter @bookbingo/web build`
3. Deploy to Firebase Hosting (staging)

Uses Node 22, pnpm 10. Deployment requires Firebase environment variables.

## Common Pitfalls

1. **Don't use `npm` or `yarn`** — This is a pnpm workspace
2. **Don't skip `pnpm install`** after pulling dependency changes
3. **Don't use `tsc -p`** — Always use `tsc --build` or `tsc -b`
4. **Don't import React/Firebase in `lib/`** — Keep business logic pure
5. **Don't commit without running lint + test + typecheck**
6. **Don't use `@lib/*` imports** — Use `@bookbingo/*` workspace names
7. **Always include `.js` extension** in relative imports (ESM requirement)

## Additional Context

For comprehensive guidance on architecture, workflow, and development practices, see `CLAUDE.md` in the repository root.
