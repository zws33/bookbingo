# TypeScript Config Architecture Migration Plan

## Objective

Replace the single flat root tsconfig (one program spanning `app/`, `lib/`, `scripts/`) with per-package project references backed by a shared `@bookbingo/tsconfig` axis package, so each package typechecks only against its real runtime environment. Fixes four verified gaps in the current setup:

- `functions/tsconfig.json` and `app/web/tsconfig.node.json` hand-duplicate flags (`strict`, `declaration`, `composite`, …) that the rest of the repo centralizes.
- No compiler-level boundary between Node and browser code — `lib/**` can see DOM types today; only ESLint's `no-restricted-globals` catches misuse.
- `moduleResolution: bundler` is applied even to code that runs un-bundled on Node (`lib/*` at runtime, all of `functions/`), masking real Node-ESM resolution bugs that `NodeNext` would catch.
- `functions/tsconfig.json` is a single config used for both typecheck and emit, so `tsc -b` compiles `src/**/*.test.ts` straight into `functions/lib/` on every build — wasted work, and the one package that doesn't follow the typecheck/build split every other package uses. (`firebase.json`'s `ignore: ["**/*.test.*"]` already keeps these out of the actual deploy bundle, so this is a build-hygiene gap, not a deploy-time one.)

## Design

`lib/tsconfig` package, axes composed by array-`extends`:

| File | Contents |
|---|---|
| `base.json` | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `useUnknownInCatchVariables`, `isolatedModules`, `verbatimModuleSyntax`, `skipLibCheck`, `resolveJsonModule`, `sourceMap`, `moduleDetection: force`, `incremental` |
| `node.json` (extends base) | `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`, `lib: ["ES2022"]`, `types: ["node"]` |
| `browser.json` (extends base) | `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `lib: ["ES2022", "DOM", "DOM.Iterable"]` |
| `lib.json` (extends base) | `composite: true`, `declaration: true`, `declarationMap: true` — role axis for anything other packages import |

No `react.json` — app/web is the only JSX consumer; `jsx`/`useDefineForClassFields` go directly in its own `tsconfig.json`, consistent with "package-specific settings live in the package."

`target` stays `ES2022` (not bumped to ES2024) — this migration changes program *shape*, not runtime target; keep that a separate decision.

Per package, two files as today (`tsconfig.json` for typecheck, `tsconfig.build.json` for emit — still needed to exclude `*.test.ts` from `dist`), but each is now self-contained: own `include`, own `references` to only the workspace packages it actually imports, extending `@bookbingo/tsconfig/*` instead of the root.

`app/web` drops `tsconfig.build.json` and `.tsbuild` entirely — it's `noEmit`, typechecked standalone, excluded from the `tsc -b` graph (matches the reference pattern; Vite does the real build, nothing consumes the throwaway emit today anyway). The root `paths` alias (`@bookbingo/lib-core` → source) moves out of the root and into `app/web/tsconfig.json`, scoped to only the three lib packages it imports — keeps Vite's dev-time source resolution (via `vite-tsconfig-paths`) working without a repo-wide hand-maintained map.

`functions/` gains the two-file split every other package already has: `tsconfig.json` (typecheck) and `tsconfig.build.json` (emit, `exclude: ["src/**/*.test.ts"]` — matches the pattern in `lib/*/tsconfig.build.json`), closing the gap where a single config compiles tests into `functions/lib/` on every build. Both extend `../lib/tsconfig/node.json` by **relative path** (not a package specifier) — this resolves at `tsc` invocation time inside the monorepo and needs no `devDependency` entry, so it doesn't reintroduce the `workspace:*` problem that blocks `npm install` at deploy time. Switches to `NodeNext` resolution. `functions/package.json`'s `build` script changes to `tsc -b tsconfig.build.json`. Both keep `functions`'s own `outDir`, `rootDir`, the `@bookbingo/lib-types` → source `paths` alias, and `composite: true`.

Root `tsconfig.build.json` and `tsconfig.json` both become references-only, no `compilerOptions`, matching bacons-law's root shape — one for the build graph (`lib/types`, `lib/core`, `lib/util`, `functions`), one for the typecheck graph (same four **plus `functions`**, now that per-package references remove the flat-include limitation that forced `functions` into a separate `pnpm --filter` typecheck script). Now that `functions` has separate typecheck/build configs, the build graph references `./functions/tsconfig.build.json` explicitly and the typecheck graph references `./functions/tsconfig.json` — previously `./functions` resolved to the single shared file.

## Ordered steps

0. Branch the existing uncommitted WIP off `main` (`git checkout -b feat/tsconfig-architecture`) before any further edits — build/TS config changes need a branch + PR per the git workflow, independent of anything else being revisited.
1. Finish `lib/tsconfig`: write `base.json`/`node.json`/`browser.json`/`lib.json` per the table above (supersedes the WIP scaffold), `pnpm install` to link it.
2. Migrate `lib/types`, `lib/core`, `lib/util` to extend `@bookbingo/tsconfig/node` + `/lib`. Validate: `pnpm run build && pnpm test`.
3. Migrate `functions/`: split into `tsconfig.json` (typecheck) and `tsconfig.build.json` (emit, `exclude: ["src/**/*.test.ts"]`), both via the relative-path `extends` + `NodeNext`; update `functions/package.json`'s `build` script to `tsc -b tsconfig.build.json`. Validate: `pnpm --filter @bookbingo/functions run build`, confirm `find functions/lib -name '*.test.js'` returns nothing, and run its own test suite.
4. Migrate `app/web`: `browser.json`, drop `tsconfig.build.json`/`.tsbuild`, move `paths` locally, change `build:staging`/`build:prod` from `tsc -b tsconfig.build.json && vite build` to `tsc --noEmit -p tsconfig.json && vite build`. Validate: `pnpm --filter @bookbingo/web run build:prod`, `pnpm --filter @bookbingo/web run dev` (confirm live source edits to `lib/core` still hot-reload).
5. Collapse root `tsconfig.build.json`/`tsconfig.json` to references-only, pointing the build graph's `functions` entry at `./functions/tsconfig.build.json` and the typecheck graph's at `./functions/tsconfig.json`; fold `functions` into the unified `typecheck` script, dropping the separate `pnpm --filter @bookbingo/functions exec tsc --noEmit`; retire or repoint `build:apps`.
6. Update `.gitignore`, `eslint.config.js` `ignores`, and the Vitest `exclude` to drop `app/web/.tsbuild`.
7. Full clean-tree verification (rm all `dist`/`.tsbuild`/`lib` build output + `*.tsbuildinfo`, then `pnpm run verify`).
8. Write an ADR at `docs/decisions/` recording the switch away from the flat single-program model. Update `CLAUDE.md`'s "TypeScript Build Configuration" section to describe the new architecture — it currently documents the old one as deliberate.

## Validation

- `npx tsc --build --dry --verbose` on both root configs after step 5 — confirms the project count matches expectations (not collapsed to 1, not missing a package).
- `pnpm run verify` clean-tree pass (per existing repo convention).
- Manual: edit a `lib/core` file, confirm the change is visible in `pnpm run dev:web` without a manual `pnpm run build:libs`.
- Manual: introduce a deliberate DOM global reference in a `lib/core` file — confirm it now fails **typecheck**, not just lint.

## Risks

- Step 4 is the highest-risk step: dropping `tsconfig.build.json` changes the deploy build command shape; verify `build:staging`/`build:prod` still fail on real type errors (test with a deliberately broken type) before merging.
- `verbatimModuleSyntax` + `esModuleInterop` together can produce import-style errors on packages with unusual default-export shapes (`firebase-admin`, some CJS interop) — check `scripts/` and `functions/` against this after step 1.
- Reference-graph edits are error-prone by hand; recheck every package's `references` list points at the *typecheck* config (`tsconfig.json`) not the emit config, for source-level (not stale-`dist`) type resolution.
