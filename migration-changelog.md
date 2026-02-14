# Migration Changelog

This document logs the changes made during the migration to a pnpm monorepo with a structured TypeScript configuration.

## 1. Project Structure

-   **pnpm Workspaces**: Initialized the project as a pnpm workspace.
    -   Created `pnpm-workspace.yaml` to define the workspaces in `app/*` and `lib/*`.
-   **Package-Based Structure**: The `lib` and `app` directories are now treated as proper packages.
    -   Created `package.json` for `lib/core`, `lib/data`, `lib/types`, and `app/cli`.
    -   Moved all source files within these packages into a `src/` directory.

## 2. TypeScript Configuration

-   **Root `tsconfig.json`**:
    -   Created a root `tsconfig.json` for IDE-level support and path alias definitions (`@lib/*`, `@app/*`).
    -   Created a root `tsconfig.build.json` to act as a base for all other `tsconfig` files, enabling `composite` and `incremental` builds.
-   **Package-Level `tsconfig.json`**:
    -   Each package (`lib/core`, `app/web`, etc.) now has its own `tsconfig.json` (for local development) and `tsconfig.build.json` (for compilation).
    -   These files extend the root `tsconfig` files and use project `references` to define the dependency graph.
-   **Path Alias Updates**:
    -   Updated all relative import paths (`../../lib/core`) throughout the codebase to use the new workspace aliases (`@lib/core`).
    -   Updated `app/web/vite.config.ts` to use `vite-tsconfig-paths` to automatically handle these aliases, replacing the previous manual configuration.

## 3. Package Management & Scripts

-   **Root `package.json`**:
    -   Modified to act as the monorepo root (`"private": true`).
    -   Added new root scripts (`build`, `lint`, `test`, `dev`) that use `pnpm -r` to run commands across all workspaces.
    -   Updated the `start` script to correctly delegate to the `@bookbingo/cli` package.
-   **Package-Level Scripts**:
    -   Each package now has its own `build` script.
    -   `lib/core` and `lib/data` have their own `test` scripts.
-   **Dependencies**:
    -   Added `vite-tsconfig-paths` to the root `devDependencies`.
    -   Updated dependencies between packages to use `workspace:*` protocol.

## 4. Housekeeping

-   Created a `pre-migration-backup/` directory containing all original `package.json` and `tsconfig.json` files.
-   Removed the old `package-lock.json` file in favor of the new `pnpm-lock.yaml`.
