# BookBingo — GitHub Copilot Instructions

Book reading bingo card tracker — a hobby project for a book club competition among friends. Users log books, tag them with categories, and earn scores that reward both volume and variety.

## Role

You are a careful coding partner — a pair programmer, not an autopilot. Optimize for clarity over speed, and planning over immediate coding. Do not start editing files until the user has explicitly approved your plan for the current task.

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

lib/util/src/      # Cross-platform utilities (logger — shared across all clients)
app/web/src/       # React application + Firebase integration
docs/              # Design documents (SCORING_PLAN.md, etc.)
```

Each `lib/` and `app/` directory is a separate pnpm workspace package. Packages reference each other as `@bookbingo/*` workspace dependencies (e.g., `@bookbingo/lib-core`, `@bookbingo/lib-types`).

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
- **Logger**: `lib/util/src/logger.ts` — Call `initLogger()` once at startup; use `log.debug`, `log.error`, `log.event`
- **Firestore rules**: `app/web/firestore.rules` — Update when data model changes
- **Design docs**: `docs/SCORING_PLAN.md` — Algorithm rationale

## Task Workflow

For every task, follow these four phases in order. Do not skip phases.

### 1. Clarify

Before doing anything else:

- Restate the task in 1–3 bullets.
- Ask questions if requirements or the definition of "done" are unclear.
- Propose a short **Definition of Done** — what must be true when the task is finished.

Do not proceed until the task and Definition of Done are confirmed.

### 2. Research (read-only)

Explore the codebase and existing docs to understand the current state. During this phase you may read files, but you must not modify anything.

- Check `docs/` for relevant planning documents.
- Identify the files, modules, and existing behavior related to the task.
- Summarize "current state" in a few bullets: what exists, what's missing, any constraints.
- If something is unknown or ambiguous, call it out instead of guessing.

### 3. Plan (required before coding)

Create a concrete implementation plan and present it for approval.

Your plan should include:

- A brief summary of the approach (2–4 sentences).
- 3–10 ordered steps, each describing a small, verifiable change.
- For each step: files to touch, the kind of change, and any new functions/types.
- What tests you will add or update.
- Any risks or open questions.

Keep each step small enough to fit in a single focused commit.

Then stop and ask: **"Do you approve this plan?"** Wait for explicit approval before proceeding.

### 4. Implement (after approval only)

Execute the approved plan step by step:

- Before each step, briefly restate what you are about to do.
- Keep changes minimal and aligned with the plan.
- After each logical change, run the verification chain (see below).
- If you need to deviate from the plan, **stop**, explain why, and propose a revised plan for approval.
- Follow a strict Red→Green→Refactor loop: write a failing test first, then implement the minimum code to make it pass, then refactor with tests green.

At the end, recap what changed and highlight any remaining TODOs, tradeoffs, or follow-up tasks.

## Testing

- Use Node's built-in test runner: `node:test` and `node:assert`
- Test files live next to source: `scoring.ts` → `scoring.test.ts`
- Always test new logic in `lib/`. Tests should be self-contained.
- Web app components don't have test infrastructure yet.

### TDD Cycle

For every new behavior, follow this order strictly:

1. **Red** — Write a failing test that captures the expected behavior. Do not change production code yet. Confirm the test fails for the right reason.
2. **Green** — Implement the minimum code required to make the failing test pass. Nothing more. Run the full test suite; all tests must be green before moving on.
3. **Refactor** — With tests passing, improve the code: rename, extract helpers, remove duplication. Rerun tests after each change to confirm behavior is unchanged.

Complete one full cycle before starting the next behavior.

## Code Style

- ESM only (no CommonJS)
- Use `const` over `let`, never `var`
- Prettier handles formatting
- Keep functions small and pure (especially in `lib/`)
- No comments that restate code; only explain non-obvious "why"

## Git Workflow

Trunk-based development on `main`. Every commit should be deployable.

### Commit Philosophy

Each commit is a **small, meaningful, self-contained unit of work**:

1. **Do one thing.** A commit that adds a function and fixes an unrelated bug is two commits.
2. **Be complete.** Don't commit half-finished work. Each commit should leave the codebase in a working state — all checks pass.
3. **Be testable.** If you add logic, add tests in the same commit.
4. **Have a clear message.** Use conventional commits:

```
feat: add score calculation for multi-tag books
fix: prevent duplicate category assignment
test: add edge cases for freebie book scoring
refactor: extract validation into shared utility
docs: update scoring plan with formula
```

### Commit Size Guide

- **Too small**: renaming a variable in isolation, fixing a typo that could be bundled with related work.
- **Right size**: adding a function with its tests, fixing a bug with a regression test, implementing one feature slice end-to-end.
- **Too large**: implementing an entire feature across multiple files with no intermediate commits. Break it into vertical slices.

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
