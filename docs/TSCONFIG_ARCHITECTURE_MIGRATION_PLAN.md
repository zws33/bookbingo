# TypeScript Config Architecture Migration Plan

## Objective

Replace the flat root tsconfig (one program over `app/`, `lib/`, `scripts/`) with per-package configs extending a shared `@bookbingo/tsconfig` axis package. Each package typechecks against its real runtime environment.

Fixes:

1. `functions/tsconfig.json` and `app/web/tsconfig.node.json` hand-duplicate flags the rest of the repo centralizes.
2. No compiler-level Node/browser boundary — `lib/**` sees DOM types; only ESLint catches misuse.
3. `moduleResolution: bundler` applied to un-bundled Node code (`lib/*`, all of `functions/`), masking Node-ESM resolution bugs.
4. `functions/` uses one config for typecheck and emit, compiling `src/**/*.test.ts` into `functions/lib/` on every build.

## Constraints

Verified against TypeScript 5.9.3 in this repo. Violating any of these produces the listed error.

| #   | Rule                                                                                                                                                                                                                  | Violation                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| C1  | A `references` target must be `composite: true` and must emit. Never reference a `noEmit` config.                                                                                                                     | TS6306, TS6310                   |
| C2  | Never run `tsc --build --noEmit`. It fails on a clean tree because `--noEmit` propagates to the whole graph, so dependencies cannot emit the declarations dependents need. Passes on a warm tree, so it masks itself. | TS6310                           |
| C3  | A `composite` project cannot resolve `paths` into a sibling package's `src/`. Every typecheck config is non-composite.                                                                                                | TS6307, TS6059                   |
| C4  | `references` is not inherited through `extends`. Every config declares its own.                                                                                                                                       | silent coverage loss             |
| C5  | `functions/` extends by **relative path** and must not gain a `workspace:*` dependency. `firebase deploy` installs it with npm, which cannot parse that protocol.                                                     | `EUNSUPPORTEDPROTOCOL` at deploy |
| C6  | `-p` does not follow `references`. Each standalone check covers exactly its own `include`.                                                                                                                            | silent coverage loss             |

Two config roles, applied uniformly:

- `tsconfig.json` — typecheck. Non-composite, `noEmit`, `paths` → sibling **source**, includes tests, no `references`. Run via `tsc --noEmit -p`. Clean-tree safe.
- `tsconfig.build.json` — emit. Composite, `references` → other `tsconfig.build.json`, excludes tests. Run via `tsc --build`.

`target` stays `ES2022`. Bumping it is a separate decision.

## Files

| Path                                                                  | Action                                  |
| --------------------------------------------------------------------- | --------------------------------------- |
| `lib/tsconfig/{package.json,base,node,browser,lib}.json`              | create                                  |
| `lib/{types,core,util}/tsconfig.json` + `tsconfig.build.json`         | rewrite                                 |
| `functions/tsconfig.json`                                             | rewrite                                 |
| `functions/tsconfig.build.json`                                       | create                                  |
| `app/web/tsconfig.json`, `tsconfig.node.json`                         | rewrite                                 |
| `app/web/tsconfig.build.json`                                         | delete                                  |
| `scripts/tsconfig.json`                                               | create                                  |
| `tsconfig.json`, `tsconfig.build.json`                                | rewrite to references-only              |
| `{lib/types,lib/core,lib/util,app/web}/package.json`                  | add `@bookbingo/tsconfig` devDependency |
| root `package.json`, `functions/package.json`, `app/web/package.json` | update scripts                          |
| `eslint.config.js`, `app/web/vite.config.ts`, `.gitignore`            | drop `.tsbuild`; fix stale comment      |

## Steps

### 1. Axis package

`lib/tsconfig/package.json`:

```json
{
  "name": "@bookbingo/tsconfig",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./base": "./base.json",
    "./node": "./node.json",
    "./browser": "./browser.json",
    "./lib": "./lib.json"
  }
}
```

`base.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "useUnknownInCatchVariables": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "sourceMap": true,
    "moduleDetection": "force",
    "incremental": true
  }
}
```

`node.json`:

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "types": ["node"]
  }
}
```

`browser.json`:

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": []
  }
}
```

`lib.json`:

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true
  }
}
```

No `react.json` — `jsx` and `useDefineForClassFields` go in `app/web/tsconfig.json`.

Add `"@bookbingo/tsconfig": "workspace:*"` to `devDependencies` of `lib/types`, `lib/core`, `lib/util`, `app/web`. Not `functions` (C5). Run `pnpm install`.

Validate: `pnpm install` links it; `npx tsc --showConfig -p lib/core/tsconfig.json` resolves after step 2.

### 2. `lib/{types,core,util}`

Typecheck config — `lib/core/tsconfig.json` (the only one needing `paths`; `types` and `util` import nothing cross-package):

```json
{
  "extends": "@bookbingo/tsconfig/node",
  "compilerOptions": {
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@bookbingo/lib-types": ["../types/src/index.ts"] }
  },
  "include": ["src/**/*"]
}
```

`lib/types/tsconfig.json` and `lib/util/tsconfig.json`: same without `baseUrl`/`paths`.

Build config — `lib/core/tsconfig.build.json`:

```json
{
  "extends": ["@bookbingo/tsconfig/node", "@bookbingo/tsconfig/lib"],
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts"],
  "references": [{ "path": "../types/tsconfig.build.json" }]
}
```

`lib/types` and `lib/util`: same without `references`. Build configs resolve `@bookbingo/lib-types` through the node_modules workspace link to `dist` — do not add `paths` here (C3).

Validate: `npx tsc --build lib/types/tsconfig.build.json lib/core/tsconfig.build.json lib/util/tsconfig.build.json` — clean. `pnpm test` passes.

### 3. `functions/`

`functions/tsconfig.json`:

```json
{
  "extends": "../lib/tsconfig/node.json",
  "compilerOptions": {
    "noEmit": true,
    "noImplicitReturns": true,
    "baseUrl": ".",
    "paths": { "@bookbingo/lib-types": ["../lib/types/src/index.ts"] }
  },
  "include": ["src"]
}
```

`functions/tsconfig.build.json`:

```json
{
  "extends": ["../lib/tsconfig/node.json", "../lib/tsconfig/lib.json"],
  "compilerOptions": {
    "outDir": "lib",
    "rootDir": "src",
    "noImplicitReturns": true,
    "baseUrl": ".",
    "paths": { "@bookbingo/lib-types": ["../lib/types/src/index.ts"] }
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"],
  "references": [
    { "path": "../lib/types/tsconfig.build.json" },
    { "path": "../lib/util/tsconfig.build.json" }
  ]
}
```

`functions/package.json`: `"build": "tsc -b tsconfig.build.json"`.

Validate: `rm -rf functions/lib && pnpm --filter @bookbingo/functions run build`, then `find functions/lib -name '*.test.js'` returns nothing.

### 4. `app/web`

`app/web/tsconfig.json`:

```json
{
  "extends": "@bookbingo/tsconfig/browser",
  "compilerOptions": {
    "noEmit": true,
    "jsx": "react-jsx",
    "useDefineForClassFields": true,
    "allowImportingTsExtensions": true,
    "baseUrl": ".",
    "paths": {
      "@bookbingo/lib-core": ["../../lib/core/src/index.ts"],
      "@bookbingo/lib-types": ["../../lib/types/src/index.ts"],
      "@bookbingo/lib-util": ["../../lib/util/src/index.ts"]
    }
  },
  "include": ["src"]
}
```

Drop the `references` entry to `tsconfig.node.json` — it is checked standalone (C1, C6). `types: []` from the browser axis is safe: every test imports `describe`/`it`/`expect` from `vitest` explicitly.

`app/web/tsconfig.node.json`:

```json
{
  "extends": "@bookbingo/tsconfig/node",
  "compilerOptions": { "noEmit": true },
  "include": ["vite.config.ts"]
}
```

Delete `app/web/tsconfig.build.json` and `app/web/.tsbuild/`. Change `build:staging` / `build:prod` to `tsc --noEmit -p tsconfig.json && vite build --mode <mode>`.

Validate: `pnpm --filter @bookbingo/web run build:prod`; `pnpm --filter @bookbingo/web run dev` and confirm a live edit to `lib/core/src` hot-reloads.

### 5. `scripts/`

`scripts/tsconfig.json`:

```json
{
  "extends": "../lib/tsconfig/node.json",
  "compilerOptions": {
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@bookbingo/lib-core": ["../lib/core/src/index.ts"],
      "@bookbingo/lib-types": ["../lib/types/src/index.ts"],
      "@bookbingo/lib-util": ["../lib/util/src/index.ts"]
    }
  },
  "include": ["**/*.ts"],
  "exclude": ["**/*.d.ts"]
}
```

Not a workspace package and not in any reference graph (C1, C3). Delete the untracked `scripts/*.{js,d.ts,map}` build artifacts left by an earlier composite build and add `scripts/*.js`, `scripts/*.d.ts`, `scripts/*.map` to `.gitignore`.

Validate: `npx tsc --noEmit -p scripts/tsconfig.json`.

### 6. Root configs and scripts

`tsconfig.build.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./lib/types/tsconfig.build.json" },
    { "path": "./lib/core/tsconfig.build.json" },
    { "path": "./lib/util/tsconfig.build.json" },
    { "path": "./functions/tsconfig.build.json" }
  ]
}
```

`tsconfig.json`: identical content. It exists for editor and `tsc -b --dry` project discovery only; no script reads it. It must not reference typecheck configs (C1).

Root `package.json`:

```json
"build": "tsc --build tsconfig.build.json",
"typecheck": "tsc --noEmit -p lib/types/tsconfig.json && tsc --noEmit -p lib/core/tsconfig.json && tsc --noEmit -p lib/util/tsconfig.json && tsc --noEmit -p functions/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json && tsc --noEmit -p app/web/tsconfig.json && tsc --noEmit -p app/web/tsconfig.node.json"
```

Delete `build:apps` (`app/web` no longer has a build config). Keep `build:libs` as-is — `lib/*/tsconfig.build.json` does not match `lib/tsconfig/`. `verify` is unchanged.

`typecheck` no longer depends on `build` having run.

### 7. Fix the 57 source errors

The new `base.json` flags are not enabled anywhere today. Expected inventory below — treat anything outside it as a regression from this migration.

| Package                                   | Errors |
| ----------------------------------------- | ------ |
| `lib/types`, `app/web/tsconfig.node.json` | 0      |
| `lib/core`                                | 0      |
| `lib/util`                                | 7      |
| `functions`                               | 9      |
| `scripts`                                 | 13     |
| `app/web`                                 | 28     |

| Code             | Count | Cause                                                    | Fix                                                                                     |
| ---------------- | ----- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| TS1484           | 20    | `verbatimModuleSyntax`                                   | `import type`                                                                           |
| TS2375 / TS2379  | 15    | `exactOptionalPropertyTypes`                             | widen target property to `\| undefined`, or omit the key instead of passing `undefined` |
| TS2532 / TS18048 | 14    | `noUncheckedIndexedAccess`                               | guard or non-null after index access                                                    |
| TS2345 / TS2322  | 5     | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | narrow before passing                                                                   |
| TS4114           | 3     | `noImplicitOverride`                                     | add `override` (all in `ErrorBoundary.tsx`)                                             |

Concentrations: `lib/util/src/logger.test.ts` (7), `functions/src/books/**` (8 TS1484), `scripts/*` `firebase-admin` `AppOptions` `{ projectId: process.env.X }` (4 TS2379), `app/web/src/components/ErrorBoundary.tsx` (3 TS4114 + 2 TS1484), `app/web` page components (8 TS2375).

### 8. Tooling cleanup

- `eslint.config.js`: drop `'**/.tsbuild/**'` from `ignores`. Rewrite the stale sentence in the `lib/**/*.ts` block comment claiming "the root typecheck program puts lib/ sources and lib.dom.d.ts together" — after this change `lib/` no longer sees DOM types, so `no-restricted-globals` is defence in depth, not the only check.
- `app/web/vite.config.ts`: drop `'**/.tsbuild/**'` from `test.exclude`.
- `.gitignore`: no `.tsbuild` entry exists; add the `scripts/` artifact patterns from step 5.
- ESLint `projectService: true` resolves each file through the nearest config. `scripts/tsconfig.json` and `app/web/tsconfig.node.json` are what keep `scripts/*.ts` and `vite.config.ts` linted once the flat root include is gone.

## Validation

Run on a clean tree: `rm -rf lib/*/dist functions/lib app/web/.tsbuild && find . -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete`.

1. `pnpm run typecheck` — passes with no prior `build`. Any `TS63xx` means a reference-graph error (C1–C3), not a source error.
2. `pnpm run build` — clean; `find functions/lib -name '*.test.js'` returns nothing.
3. `pnpm run verify` — clean.
4. `npx tsc --build --dry --verbose tsconfig.build.json` — lists exactly 4 projects.
5. Add a DOM global to a `lib/core` source file — fails `pnpm run typecheck`, not just lint. Revert.
6. Add a type error to each of `app/web/src`, `scripts/`, `app/web/vite.config.ts` — each fails `pnpm run verify`. Revert. These three are covered only by explicit `-p` entries in the `typecheck` script (C6).
7. `pnpm --filter @bookbingo/web run build:prod` fails on a deliberate type error in `app/web/src`. Revert.
