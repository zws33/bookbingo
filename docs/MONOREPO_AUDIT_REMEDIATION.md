# Monorepo Audit Remediation — High & Medium Findings

**Status:** Approved for implementation. Branch `fix/monorepo-audit-remediation`.
Derived from the repository audit run against `deef260` (2026-08-11).

**Scope:** the two **High** and four **Medium** findings. Each is independently
landable; the ordering in §2 exists to keep the tree green, not because the
changes are coupled.

**Explicitly out of scope:**

- **F1 (Critical) — CI never runs and cannot pass on a clean checkout.** Its
  primary remediation is a repository _setting_, not a code change: both
  workflows have been `active` since 2026-04-20 with zero runs, and why they
  never trigger cannot be determined from inside the repo. Tracked separately.
  One consequence for this branch: F5 and F6 add checks that only gate locally
  until CI runs, so `pnpm run verify` is the only enforcement they get for now.
- **F8 (Low) — manifest and hygiene defects.** Batched into a separate `chore:`
  PR; nothing here depends on it.
- **The `.env.prod` half of F2.** Moving the seven production `VITE_*` values
  into GitHub secrets is only worth doing once a deploy workflow exists to read
  them, which is F1. The target-selection half of F2 is in scope and is the part
  that carries the real risk.

---

## 0. Grounding — verified in code at `deef260`

| Fact                                                                        | Location                                                          |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `default` Firebase alias points at the **prod** project                     | `.firebaserc` → `"default": "bookbingo-3fdb1"`                    |
| Three deploy scripts pass no `--project`                                    | `package.json:22,23,25`                                           |
| No staging deploy path exists for functions                                 | `package.json` — `deploy:functions` is the only functions script  |
| `functions/` imports `lib-types` **type-only**; emitted JS has no reference | `functions/src/books/types.ts:1`; `grep @bookbingo functions/lib` |
| Firebase uploads `functions/package.json` and installs from it              | `firebase.json` → `functions.source: "functions"`                 |
| `lib/*` build scripts use `tsc -p`, which ignores `references`              | `lib/{core,types,util}/package.json` → `scripts.build`            |
| Cold `pnpm --filter @bookbingo/lib-core run build` fails with 5× TS2307     | reproduced 2026-08-11                                             |
| Root typecheck applies ES2022 + implicit full DOM lib to `app/**`           | `tsconfig.json` (no `lib`), `tsconfig.build.json` → `target`      |
| `app/web/tsconfig.json` applies ES2020 + three unused-code flags            | `app/web/tsconfig.json:3-16`                                      |
| `lib/core` sources and `lib.dom.d.ts` share one program                     | `tsc -p tsconfig.json --listFiles`                                |
| The only emulator switch is a `VITE_*` variable                             | `app/web/src/lib/firebase.ts:28`                                  |
| `VITE_USE_EMULATOR` is set only by an untracked `.env.test`                 | `git ls-files \| grep env` → `.env.example` only                  |

**Three constraints the findings do not call out:**

1. **`functions/tsconfig.json` does not extend the root build config.** It is
   standalone, with its own `lib: ["es2022"]` and `noUnusedLocals`. Compiler
   options added to `tsconfig.build.json` in F5 therefore reach `lib/*` and
   `app/web` **only** — `functions/` is unaffected and needs no coordination.

2. **pnpm already enforces half of F6.** `lib/core/node_modules` contains only
   `@bookbingo/lib-types`, so `import 'firebase/firestore'` from `lib/core`
   fails to resolve today. The unguarded half is **ambient browser globals**,
   which come from the type library rather than from a package. The ESLint rule
   is therefore belt-and-braces on imports and the _only_ guard on globals.

3. **F5 is the one task expected to fail on first run.** The three unused-code
   flags have never gated anything outside the editor, so turning them on
   repo-wide will surface real violations. Budget a cleanup pass; the other five
   tasks should land green on the first attempt.

---

## 1. Findings in scope

| ID     | Severity | Title                                                               | Primary files                                  |
| ------ | -------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| **F2** | High     | Production is the fallback deploy target; functions have no staging | `package.json`                                 |
| **F3** | High     | `functions/` ships a `workspace:*` dep it only uses for types       | `functions/package.json`                       |
| **F4** | Medium   | `lib/*` build scripts use `tsc -p` and cannot build their deps      | `lib/{core,types,util}/package.json`           |
| **F5** | Medium   | Three compiler configurations apply to the same `app/web` sources   | `tsconfig.build.json`, `app/web/tsconfig.json` |
| **F6** | Medium   | The `lib/` boundary is convention-only; DOM globals are in scope    | `eslint.config.js`                             |
| **F7** | Medium   | Integration-test emulator targeting depends on an untracked file    | `app/web/vitest.config.int.ts`, `.env.example` |

---

## 2. Implementation order

Ordered by blast radius, smallest first, so a failure is easy to attribute:

```
F3 → F2 → F4 → F7 → F6 → F5
```

- **F3, F2** first: they carry the deployment risk and are the smallest diffs.
- **F4, F7** next: single-line changes to build and test invocation.
- **F6** before F5: it is additive and passes on the current tree, so it lands
  green and isolates F5's expected failures from the boundary rules.
- **F5** last: the only task that changes what compiles.

Run `pnpm run verify` after **each** task, not once at the end.

---

## 3. Tasks

### F3 — Move the functions type dependency out of `dependencies`

**Why:** `@bookbingo/lib-types` is declared as a runtime dependency but the only
import is `import type`, erased at compile time. `firebase.json` uploads this
manifest and Cloud Build installs from it, where `workspace:` is not an
npm-resolvable protocol. Moving it is correct regardless of whether that
currently breaks the deploy.

- [ ] Move `"@bookbingo/lib-types": "workspace:*"` from `dependencies` to
      `devDependencies` in `functions/package.json`
- [ ] `pnpm install` to update the lockfile
- [ ] `pnpm run verify` green
- [ ] `grep -rn "@bookbingo" functions/lib --include="*.js"` returns nothing
- [ ] `pnpm --filter @bookbingo/functions exec tsc --noEmit` passes

**Deferred validation** (needs the F2 staging target, and a real deploy):
a staging functions deploy completes and its Cloud Build log shows a clean
install.

---

### F2 — Name the Firebase project in every deploy script

**Why:** `firebase deploy` without `--project` resolves the _active_ alias set by
`firebase use`, falling back to `default` — which is the prod project. The
artifact and its destination are therefore chosen independently: after a
`firebase use staging`, `pnpm run deploy:prod` builds the prod bundle, with prod
API keys, and ships it to staging. Nothing in the output shows this.

- [ ] `deploy:prod` — add `--project prod`
- [ ] `deploy:all:prod` — add `--project prod`
- [ ] `deploy:functions` — add `--project prod`
- [ ] Add `deploy:functions:staging` with `--project staging`
- [ ] Confirm `deploy:staging` and `deploy:all:staging` already name
      `--project staging` (they do; verify no regression)
- [ ] `pnpm run verify` green

**Validation:** with `firebase use staging` active, each `:prod` script still
reaches prod; with `firebase use prod` active, each `:staging` script still
reaches staging. Check the project id echoed in the CLI's deploy banner rather
than waiting for the deploy to finish.

**Note:** `emulator:start`, `seed:staging`, and `test:integration` already pass
`--project`, and the Admin-SDK scripts route every write through
`guardWriteTarget` in `scripts/lib/admin.ts`. The deploy scripts are the only
gap; this task brings them up to the standard the rest of the repo already
meets.

---

### F4 — Per-package builds must build their own dependencies

**Why:** `tsc -p` ignores `references`. A cold
`pnpm --filter @bookbingo/lib-core run build` fails with five `TS2307`s and
never creates `lib/types/dist`. This also contradicts the rule in `CLAUDE.md`:
"always `tsc -b`, never `tsc -p`, and always name the build config explicitly."

- [ ] `lib/types/package.json` — `build` → `tsc -b tsconfig.build.json`
- [ ] `lib/core/package.json` — `build` → `tsc -b tsconfig.build.json`
- [ ] `lib/util/package.json` — `build` → `tsc -b tsconfig.build.json`
- [ ] From a cold tree, `pnpm --filter @bookbingo/lib-core run build` succeeds
      and creates `lib/types/dist` as a side effect
- [ ] `pnpm run verify` green

---

### F7 — Make the integration suite target the emulator by construction

**Why:** the suite performs real writes (`createReading`, `updateReading`,
`deleteReading`, `getOrCreateBook`) and authenticates with `signInAnonymously`.
What keeps those writes off a real project is `VITE_USE_EMULATOR=true` in a
gitignored `.env.test` that exists on one machine. A fresh clone cannot run the
suite, and the safety property is opt-in rather than fail-closed.

- [ ] Add `env: { VITE_USE_EMULATOR: 'true' }` to the `test` block in
      `app/web/vitest.config.int.ts`
- [ ] Document `.env.test` and `VITE_USE_EMULATOR` in `app/web/.env.example`
- [ ] Move `.env.test` aside and confirm `pnpm run test:integration` still
      passes against the emulator
- [ ] Confirm no documents appear in the staging or prod Firestore console
- [ ] Restore `.env.test`
- [ ] `pnpm run verify` green

**Follow-on (not this branch):** with the suite clone-portable, it becomes
runnable in CI. That depends on F1.

---

### F6 — Make the `lib/` boundary machine-checked

**Why:** `CLAUDE.md` treats the `lib/` ↔ `app/web/` separation as a first-class
architectural concern, but nothing enforces it. `lib/core` is consumed by the
browser, by Node scripts, and — per `docs/decisions/guarded-writes.md` — soon by
Cloud Functions. A `window` or `localStorage` reference typechecks cleanly today
and crashes at runtime in two of those three environments.

- [ ] Add an `eslint.config.js` override scoped to `lib/**/*.ts`:
  - [ ] `no-restricted-imports` for `react*`, `firebase*`, `firebase-admin*`,
        `firebase-functions*`, `@bookbingo/web`
  - [ ] `no-restricted-globals` for `window`, `document`, `localStorage`,
        `sessionStorage`, `navigator`
- [ ] Confirm the `files` pattern is anchored at the repo root — it must **not**
      match `app/web/src/lib/**`, which is app-internal and unrelated
- [ ] `pnpm run lint` green on the unmodified tree (the rules should pass today)
- [ ] Add `const x = window.innerWidth;` to `lib/core/src/scoring.ts` →
      `pnpm run lint` **fails**. Revert.
- [ ] Add `import 'react';` to `lib/core/src/scoring.ts` → `pnpm run lint`
      **fails**. Revert.
- [ ] `pnpm run verify` green

**Decision to make during implementation:** whether to use the base
`no-restricted-imports` or `@typescript-eslint/no-restricted-imports`. The
TS-aware rule can distinguish type-only imports via `allowTypeImports`. A
type-only `import type { ReactNode }` in `lib/` is a weaker violation than a
value import, but it is still a framework dependency leaking into a
framework-agnostic package — recommend disallowing both, and revisiting only if
it proves obstructive.

**Optional hardening:** set `"lib": ["ES2022"]` in the three
`lib/*/tsconfig.build.json` files so `tsc` enforces the no-DOM rule in the emit
chain as well. This does **not** fix the root typecheck program, which will
still supply DOM to `lib/**` — ESLint remains the enforcement point.

---

### F5 — Reconcile the three compiler views of `app/web`

**Why:** the same source files are checked three different ways. The root
`tsconfig.json` — what `pnpm run typecheck` actually runs — applies ES2022 with
an implicit full DOM lib. `app/web/tsconfig.json` — what the editor applies —
sets ES2020 plus `noUnusedLocals`, `noUnusedParameters`, and
`noFallthroughCasesInSwitch`. `app/web/tsconfig.build.json` inherits ES2022 and
none of the three flags. The result is editor-red / CI-green divergence in both
directions, and three strictness flags that gate nothing.

- [ ] Add `noUnusedLocals`, `noUnusedParameters`, and
      `noFallthroughCasesInSwitch` to `compilerOptions` in the root
      `tsconfig.build.json`
- [ ] Remove the same three flags from `app/web/tsconfig.json`
- [ ] Drop the `target: ES2020` override in `app/web/tsconfig.json` so it
      inherits ES2022 from the root chain; keep an explicit `lib` that includes
      `DOM` and `DOM.Iterable`
- [ ] Fix the violations this surfaces — **expect a non-trivial cleanup pass**
- [ ] `npx tsc -p tsconfig.json --showConfig` and
      `npx tsc -p app/web/tsconfig.json --showConfig` agree on `target` and the
      three flags
- [ ] Introduce an unused local in an `app/web` component →
      `pnpm run typecheck` **fails**. Revert.
- [ ] `pnpm run verify` green

**Watch for:** the flags also reach `lib/*` through the shared build config,
which is intended. If the cleanup pass grows past roughly a dozen sites,
consider landing the flags one at a time rather than all three together.

---

## 4. Exit criteria

The branch is complete when every box in §3 is checked and all of the following
pass from a genuinely clean state:

```sh
rm -rf lib/*/dist app/web/dist app/web/.tsbuild functions/lib
find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete
pnpm run verify
```

- [ ] `pnpm install --frozen-lockfile` succeeds
- [ ] `pnpm run verify` green from the clean state above
- [ ] `git status --short` clean afterwards — no stray build output
- [ ] `pnpm --filter @bookbingo/web run build:prod` yields
      `app/web/dist/index.html` plus assets
- [ ] `pnpm --filter @bookbingo/functions run build` yields `functions/lib`
- [ ] Cold `pnpm --filter @bookbingo/lib-core run build` succeeds (F4)
- [ ] Boundary violations fail lint — both a DOM global and a `react` import in
      `lib/core` (F6)
- [ ] An unused local in `app/web` fails typecheck (F5)
- [ ] `pnpm run test:integration` passes with `.env.test` moved aside (F7)
- [ ] Every deploy script names its `--project`; `deploy:functions:staging`
      exists (F2)
- [ ] `functions/package.json` carries no `workspace:*` entry under
      `dependencies` (F3)

**CLAUDE.md review** — this branch touches build/TypeScript configuration, the
`lib/*` build commands, and the deploy scripts, all of which are documented.
Before opening the PR, check these sections for staleness:

- [ ] "Commands" — the `lib/*` build invocation and any new deploy script
- [ ] "TypeScript Build Configuration" — the reconciled compiler options
- [ ] "Architecture Guidance" — the `lib/` boundary is now enforced by ESLint,
      not convention alone

---

## 5. Deferred, with reasons

| Item                                                                       | Why deferred                                                                                              |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **F1** — CI never runs; cannot pass cold                                   | Primary fix is a repository setting, not code. Blocks nothing here.                                       |
| **F8** — manifest and hygiene batch                                        | Independent; separate `chore:` PR.                                                                        |
| Prod `VITE_*` values → GitHub secrets                                      | Needs a deploy workflow to read them (F1).                                                                |
| Integration tests in CI                                                    | Needs F1 and F7. F7 is the precondition and lands here.                                                   |
| Production deploy workflow with approval gate                              | Needs F1 and F2.                                                                                          |
| `scripts/` as its own workspace package                                    | Clarity gain, not a correctness fix.                                                                      |
| Rename `app/web/src/lib` to end the "lib" clash                            | Churn across ~13 import sites for a readability gain; revisit if it keeps causing misreadings.            |
| Remove the dangling `../lib/util` reference from `functions/tsconfig.json` | Already owned by `docs/OPEN_LIBRARY_READ_THROUGH_PLAN.md` PR 3, which removes it while adding `lib-core`. |
