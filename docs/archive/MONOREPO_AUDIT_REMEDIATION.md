# Monorepo Audit Remediation — High & Medium Findings

> **🗄️ Archived 2026-08-14.** Every finding in §3 shipped (#65, #66, #67). Retained
> as the narrative record of what broke and why — notably §3's account of how an
> unsupported Node runtime masked an unparseable `workspace:` specifier for six weeks,
> and the observation that static review found every Medium finding while only
> execution found the Criticals.
>
> Its two live threads were extracted to issues before archiving; **track those, not
> this file**:
>
> - **#68** — staging deploy secrets, the F10 remainder. Still unconfigured.
> - **#69** — the §5 deferred backlog, seven items with their original reasons.
>
> Two statuses here are stale as written. F3's "Remaining: the prod deploy" is
> **done** — prod runs `enrichbook-00003-gol`, updated 2026-08-13. F11's unchecked
> upload-size check was never captured and is folded into #69.
>
> For current build and deploy rules see `CLAUDE.md`.

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

3. ~~**F5 is the one task expected to fail on first run.**~~ **This prediction
   was wrong.** The reasoning was that the three unused-code flags had never
   gated anything outside the editor, so turning them on repo-wide would surface
   real violations. It surfaced zero: `@typescript-eslint/no-unused-vars` is
   already `error` and had been covering nearly the same ground, so the code was
   being kept clean by the linter even though the compiler never checked. Every
   task in this branch landed green on the first attempt.

---

## 1. Findings in scope

| ID      | Severity     | Title                                                                                                     | Primary files                                       |
| ------- | ------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **F9**  | **Critical** | `functions` declares a Node runtime Cloud Functions does not support                                      | `functions/package.json`                            |
| **F10** | **High**     | A build with no Firebase config succeeds and ships a dead bundle                                          | `app/web/vite.config.ts`, `src/lib/firebase.ts`     |
| **F2**  | High         | Production is the fallback deploy target; functions have no staging                                       | `package.json`                                      |
| **F3**  | **Critical** | `workspace:*` in the deployed manifest — npm cannot parse it, blocking functions deploys since 2026-07-02 | `functions/package.json`, `functions/tsconfig.json` |
| **F4**  | Medium       | `lib/*` build scripts use `tsc -p` and cannot build their deps                                            | `lib/{core,types,util}/package.json`                |
| **F5**  | Medium       | Three compiler configurations apply to the same `app/web` sources                                         | `tsconfig.build.json`, `app/web/tsconfig.json`      |
| **F6**  | Medium       | The `lib/` boundary is convention-only; DOM globals are in scope                                          | `eslint.config.js`                                  |
| **F7**  | Medium       | Integration-test emulator targeting depends on an untracked file                                          | `app/web/vitest.config.int.ts`, `.env.example`      |
| **F11** | Low          | `functions/` compiled its tests into the deployed upload                                                  | `firebase.json`                                     |

**F9, F10 and F11 were not in the original audit, and F3 was underrated.**
F9 surfaced while validating F7 — the emulator refused to load the functions.
F10 surfaced when CI ran for the first time and the staging deploy failed. F3
was raised to Critical and F11 found when the first real deploy was attempted.
All of them are the same subject as F2: whether this repository can deploy its
**functions**. Hosting and rules deploys were never affected — see the scope
table under F3 in §3 before drawing a broader conclusion from these findings.

**The pattern is worth stating plainly: static review found the Medium
findings; execution found every Critical one.** Reading configs surfaced the
`tsc -p` bug and the three-way compiler split. "Functions have been
undeployable for six weeks," "a build with no config succeeds," and "the
manifest is unparseable by npm" were all invisible on the page. Each needed
something to actually run — the emulator, CI, Cloud Build. Marking a finding
_Conditional_ rather than clearing it is what pointed at where to spend
execution effort; F3 shows the cost of reasoning about a runtime instead of
invoking it.

---

## 2. Implementation order

Ordered by blast radius, smallest first, so a failure is easy to attribute:

```
F3 → F2 → F4 → F7 → [F9] → F6 → F5
```

- **F3, F2** first: they carry the deployment risk and are the smallest diffs.
- **F4, F7** next: single-line changes to build and test invocation.
- **F9** landed here, where it was found, rather than being deferred — it is a
  one-line fix for a Critical defect in the same area F2 and F3 just touched.
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

- [x] Move `"@bookbingo/lib-types": "workspace:*"` from `dependencies` to
      `devDependencies` in `functions/package.json`
- [x] `pnpm install` to update the lockfile
- [x] `pnpm run verify` green
- [x] `grep -rn "@bookbingo" functions/lib --include="*.js"` returns nothing
- [x] `pnpm --filter @bookbingo/functions exec tsc --noEmit` passes

**Deferred validation** (needs the F2 staging target, and a real deploy):
a staging functions deploy completes and its Cloud Build log shows a clean
install.

#### Which deploys this actually affected

Worth stating precisely, because it is easy to over-read. **Three different
deploy paths exist and only one was broken:**

| Path                                                | Status                                                                                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `deploy:{staging,prod}` — `hosting,firestore:rules` | **Always worked.** Never touches `functions/`, so it never reaches Cloud Build or reads that manifest. Run manually, often. |
| GitHub Actions                                      | Never ran at all until Actions was enabled 2026-08-12. Separate problem (F1).                                               |
| `deploy:functions:*` — `--only functions`           | Worked until **2026-07-02**. Broken since.                                                                                  |

Both defects entered in the **same commit**, `222cfd3` (#49, 2026-07-02), which
changed `engines.node` 22 → 24 _and_ added `@bookbingo/lib-types: workspace:*`
to `dependencies`. Before it: valid runtime, no workspace specifier.

**They were layered, and the outer one hid the inner one.** An unsupported
runtime is rejected early — by the CLI and the Functions API, before anything is
packaged — so no deploy between 2026-07-02 and 2026-08-12 ever reached the npm
install step. #65 removed the runtime defect; the 2026-08-13 attempt was the
first deploy in the repository's history to get far enough to trip the
`workspace:` protocol.

Corroborated read-only: `firebase functions:list` reports `enrichBook` and
`submitFeedback` on **`nodejs22`** in both staging and prod — the pre-#49
runtime, i.e. both environments are still running code deployed before
2026-07-02.

#### Outcome: the deferred validation failed. F3 reopened, then fixed properly.

`pnpm run deploy:functions:staging`, run 2026-08-13, got as far as Cloud Build
and died there:

```
npm error code EUNSUPPORTEDPROTOCOL
npm error Unsupported URL Type "workspace:": workspace:*
```

**The fix above was the wrong half.** `EUNSUPPORTEDPROTOCOL` comes from npm's
manifest _parser_, not its resolver — npm has never implemented the
`workspace:` protocol. It fires before npm decides what to install, so which
dependency section holds the specifier is irrelevant. Moving it to
`devDependencies` changed nothing about the deploy.

The reasoning error is worth naming: the original finding said the specifier
"is not an npm-resolvable protocol," which is true, and then treated
`devDependencies` as a place npm would not look. Resolution never happened.

**Real fix** — the specifier leaves the manifest entirely:

- [x] Delete `@bookbingo/lib-types` from `functions/package.json` (all sections)
- [x] Add a `paths` alias in `functions/tsconfig.json`; the existing project
      reference makes TypeScript redirect it to `lib/types/dist/index.d.ts`
- [x] `pnpm install` — lockfile drops the entry, pnpm removes the symlink
- [x] Cold build of the whole graph after `rm -rf lib/*/dist functions/lib` and
      deleting every `.tsbuildinfo`: green, `functions/lib` emitted
- [x] `pnpm --filter @bookbingo/functions exec tsc --noEmit` passes with
      `functions/node_modules/@bookbingo/lib-types` gone — proving the alias,
      not the symlink, is doing the work
- [x] **Reproduced against npm directly.** The old manifest in a scratch dir:
      `npm install --package-lock-only` → the byte-identical Cloud Build error.
      The new manifest: resolves and writes a lockfile.
- [x] Regression guard: `functions/src/deploy-manifest.test.ts` asserts no
      `workspace:`/`catalog:` specifier in any dependency section, and that
      `engines.node` is one Cloud Functions offers (folding in F9). Verified
      load-bearing by reintroducing the specifier and watching it fail.

Nothing is lost at runtime — the sole import is `import type`, and
`functions/lib/books/types.js` compiles to exactly `export {};`.

**Closed 2026-08-13.** `pnpm run deploy:functions:staging` succeeded against
`7b9f291`. Confirmed independently rather than taken on the deploy's word —
`gcloud functions describe enrichBook --gen2` reports staging on revision
`enrichbook-00004-nic`, updated `2026-08-13T15:08:28Z`.

The same query pins the last successful functions deploy before this one:
**prod is on `enrichbook-00002-bef`, updated `2026-06-11T16:04:54Z`.** That is
three weeks earlier than the `222cfd3` (2026-07-02) bound this document
previously inferred, and it means prod has been serving June 11 code — well
before `178d79f` (#61, OL parallelism and search caching, 2026-07-26).

**Remaining:** the prod deploy. `deploy:functions:prod`.

---

### F11 — `functions/` shipped its tests to production (Low, unplanned)

**Found while fixing F3.** 76 KB of the 180 KB in `functions/lib` was compiled
test code, all of it uploaded. Not a correctness bug — the tests import only
built-ins and real dependencies, and nothing loads them — but it is dead
production surface, including the tests for the GitHub-PAT feedback handler.

**Cause:** CLAUDE.md claimed tests "are excluded from every
`tsconfig.build.json`, so they are never compiled into build output."
`functions/` has no `tsconfig.build.json` — its single composite config is both
the IDE and the build config, and its `include: ["src"]` takes the tests with it.

**Fix chosen — exclude at packaging, not at compile:** `**/*.test.*` added to
`functions.ignore` in `firebase.json`.

The obvious alternative, adding `functions/tsconfig.build.json` that excludes
tests, was rejected for now: functions' single config is the _only_ thing
type-checking those tests, because the root `tsconfig.json` `include` does not
cover `functions/`. Splitting the config to fix a 76 KB upload would restructure
the build graph on the exact path this branch is unbreaking. The packaging
pattern solves the real concern — production surface — at zero build risk, and
worst case is a no-op.

- [x] `**/*.test.*` added to `functions.ignore`
- [x] CLAUDE.md corrected on both counts
- [ ] Confirm the upload shrinks (~180 KB → ~105 KB). The 2026-08-13 staging
      deploy succeeded but its `functions: packaged … for uploading` line was
      not captured, so this is still unverified. Check it on the prod deploy.

---

### F2 — Name the Firebase project in every deploy script

**Why:** `firebase deploy` without `--project` resolves the _active_ alias set by
`firebase use`, falling back to `default` — which is the prod project. The
artifact and its destination are therefore chosen independently: after a
`firebase use staging`, `pnpm run deploy:prod` builds the prod bundle, with prod
API keys, and ships it to staging. Nothing in the output shows this.

- [x] `deploy:prod` — add `--project prod`
- [x] `deploy:all:prod` — add `--project prod`
- [x] `deploy:functions` — **renamed** to `deploy:functions:prod` with
      `--project prod` (see below)
- [x] Add `deploy:functions:staging` with `--project staging`
- [x] Confirm `deploy:staging` and `deploy:all:staging` already name
      `--project staging` (they do; verify no regression)
- [x] `pnpm run verify` green

**Deviation from the plan — the bare `deploy:functions` was renamed, not
patched.** Adding `--project prod` to it would have left the one script whose
_name_ does not say where it deploys, which is the ambiguity this finding is
about. The other two pairs already use `:staging`/`:prod` suffixes, so functions
now match: `deploy:functions:staging` and `deploy:functions:prod`, with no
unsuffixed name that implicitly means production. Nothing outside `package.json`
referenced the old name, so the rename cost nothing; typing it now fails loudly
instead of deploying somewhere.

**Validation:** all six deploy scripts carry an explicit `--project`, checked
mechanically rather than by eye:

```
--project staging  deploy:staging            --project prod  deploy:prod
--project staging  deploy:functions:staging  --project prod  deploy:functions:prod
--project staging  deploy:all:staging        --project prod  deploy:all:prod
```

Target selection no longer depends on the active `firebase use` alias, since
`--project` overrides it. Confirming that end-to-end requires a real deploy and
is left for the next one.

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

- [x] `lib/types/package.json` — `build` → `tsc -b tsconfig.build.json`
- [x] `lib/core/package.json` — `build` → `tsc -b tsconfig.build.json`
- [x] `lib/util/package.json` — `build` → `tsc -b tsconfig.build.json`
- [x] From a cold tree, `pnpm --filter @bookbingo/lib-core run build` succeeds
      and creates `lib/types/dist` as a side effect
- [x] `pnpm run verify` green

---

### F7 — Make the integration suite target the emulator by construction

**Why:** the suite performs real writes (`createReading`, `updateReading`,
`deleteReading`, `getOrCreateBook`) and authenticates with `signInAnonymously`.
What keeps those writes off a real project is `VITE_USE_EMULATOR=true` in a
gitignored `.env.test` that exists on one machine. A fresh clone cannot run the
suite, and the safety property is opt-in rather than fail-closed.

- [x] Add an `env` block to `app/web/vitest.config.int.ts` — **the whole
      emulator config, not just the flag** (see below)
- [x] Document the arrangement in `app/web/.env.example`
- [x] Move `.env.test` aside and confirm `pnpm run test:integration` still
      passes against the emulator
- [x] Confirm no documents appear in the staging or prod Firestore console
- [x] Restore `.env.test`
- [x] `pnpm run verify` green

**Wider than planned — the whole config moved, not just the flag.** Both
`.env.test` and `.env.emulator` turned out to hold nothing but fake values
pointed at `demo-bookbingo`, which is also the `--project` the root
`test:integration` script passes to `firebase emulators:exec`. `demo-` ids are
reserved for emulator use and can never resolve to a real project. Setting only
`VITE_USE_EMULATOR` would have left the suite still needing an untracked file
for its `projectId`; moving all seven values makes it genuinely self-contained.

**Validated three ways**, each a full emulator run of the 4-test suite:

| `.env.test` state                                    | Result   |
| ---------------------------------------------------- | -------- |
| Present, as on the original machine                  | 4 passed |
| Deleted — simulating a fresh clone                   | 4 passed |
| `VITE_USE_EMULATOR=false` + a different `PROJECT_ID` | 4 passed |

The third case is the one that matters: `test.env` takes precedence over any
`.env` file, so local state can no longer point this suite at a real project.

**Follow-on (not this branch):** with the suite clone-portable, it becomes
runnable in CI. That depends on F1.

**Also fixed here:** `.env.example` documented two commands that do not exist
(`pnpm --filter @bookbingo/web emulator:start` and `… emulator:seed` — both are
root scripts, not `app/web` ones). Corrected, and `pnpm run dev:local` added
since it starts the emulator and dev server together.

---

### F9 — `functions` declared an unsupported Node runtime (Critical, unplanned)

**Why:** `functions/package.json` declared `engines.node: "24"`. Cloud Functions
has no `nodejs24` runtime — firebase-tools 14.5.1 lists exactly two GA options:

```
nodejs20  GA
nodejs22  GA          nodejs24 present? false
```

`engines.node` is what firebase-tools reads to pick the runtime, and the same
validation runs on both the emulator and the deploy path. The emulator refused
outright:

```
functions: Failed to load function definition from source: FirebaseError:
Detected node engine 24 in package.json, which is not a supported version.
Valid versions are 20, 22
```

`222cfd3` ("chore: migrate to Node 24", #49, 2026-07-02) changed this line from
`"22"` — a valid runtime — to `"24"`. The repo-wide Node 24 migration was
correct for the build and CI toolchain, but the functions **runtime** is chosen
by Google, not by us, and it did not have a Node 24 option.

**Consequence:** `functions/` has not been deployable since 2026-07-02, and the
functions emulator has not run locally since then either. Whatever is serving
`enrichBook` and `submitFeedback` in production predates that date — notably it
cannot include `178d79f` (#61, "perf: parallelize OL lookup fan-out and cache
search responses", 2026-07-26), which is entirely functions code.

- [x] `functions/package.json` — `engines.node` → `"22"`
- [x] Emulator loads both functions:
      `✔ functions: Loaded functions definitions from source: enrichBook, submitFeedback`
- [x] Both initialize:
      `✔ functions[us-central1-enrichBook]`, `✔ functions[us-central1-submitFeedback]`
- [x] `pnpm run verify` green

**Not changed:** CI and local development stay on Node 24. Build-time and
runtime versions are independent, `functions/tsconfig.json` targets `es2022`,
and nothing in `functions/src` uses a Node-24-only API.

**Follow-up worth doing** (not this branch): `functions/` inherits
`@types/node@^24` from the root while running on Node 22, so a Node-24-only API
would typecheck and then fail at runtime. Pinning `@types/node@^22` in
`functions/` would close that gap. Low risk today; it belongs with the F8
manifest batch.

**Deploy verification is still outstanding.** The emulator proves the runtime is
now valid, but only a real deploy proves the whole path — and that same deploy
resolves F3's open question. Recommended first action after this branch merges:
`pnpm run deploy:functions:staging`.

---

### F10 — A build with no Firebase config succeeded (High, unplanned)

**Why:** enabling Actions and merging #64 produced the repository's first real
staging deploy. It failed — but not where it should have:

```
success  Run pnpm --filter @bookbingo/web build:staging
failure  Run FirebaseExtended/action-hosting-deploy@v0
         Error: Input required and not supplied: firebaseServiceAccount
```

`gh secret list` and `gh variable list` are both **empty**. None of the eight
values that workflow references has ever existed; it was generated by the
Firebase CLI in April and never ran, so nobody found out.

The deploy failure is the lesser problem. The **build step passed** with all
seven `VITE_FIREBASE_*` values empty. `src/lib/firebase.ts` assigned them
straight into `firebaseConfig`, Vite inlined `undefined` for each, and
`initializeApp` accepted it. Had the service account been present and the other
seven still missing, CI would have deployed a completely non-functional bundle
over a working staging site and reported success.

- [x] Build-time guard: `requireFirebaseEnv()` plugin in
      `app/web/vite.config.ts`, `apply: 'build'`
- [x] Runtime guard: throw on incomplete config in `src/lib/firebase.ts`
- [x] Gate the deploy job on `vars.ENABLE_STAGING_DEPLOY == 'true'` so `main`
      is not permanently red while the deploy is unconfigured
- [x] `pnpm run verify` green from a clean state

**A top-level `throw` alone does not fail a build.** This was the first attempt,
and it does not work: Rollup _bundles_ `firebase.ts` without executing it, so
the throw only fires in the browser — after the broken bundle has shipped. A
build with no env still succeeded. The guard has to run during the build, hence
the plugin. The runtime throw is kept as a second line of defence, since it also
covers `dev`, which the plugin deliberately does not.

**Validated four ways:**

| Condition                                 | Expected   | Result                                        |
| ----------------------------------------- | ---------- | --------------------------------------------- |
| `.env` + `.env.staging` present           | build      | passes                                        |
| Neither present — what CI actually has    | **fail**   | `Refusing to build mode "staging" — missing…` |
| No env files, `VITE_*` set as process env | build      | passes                                        |
| `pnpm test`                               | unaffected | 64 passed — `apply: 'build'` excludes Vitest  |

The third row is the one that keeps this from becoming tomorrow's problem:
GitHub secrets arrive as process env, not files, and `loadEnv` picks up
`VITE_`-prefixed process env, so the guard will not block CI once the secrets
exist.

**Note on `app/web/.env`.** An untracked plain `.env` sits alongside the
per-mode files and acts as a fallback for _every_ mode, which is why the first
attempt at this test wrongly appeared to pass — removing `.env.staging` alone
still left a full config in scope. Worth knowing when reasoning about which
values a local build actually used.

**Still outstanding, and yours to do:** create a Firebase service account for
`bookbingo-staging`, set `FIREBASE_SERVICE_ACCOUNT_BOOKBINGO_STAGING` and the
seven `VITE_*_STAGING` values, then `gh variable set ENABLE_STAGING_DEPLOY
--body true`. No workflow edit is needed at that point.

---

### F6 — Make the `lib/` boundary machine-checked

**Why:** `CLAUDE.md` treats the `lib/` ↔ `app/web/` separation as a first-class
architectural concern, but nothing enforces it. `lib/core` is consumed by the
browser, by Node scripts, and — per `docs/decisions/guarded-writes.md` — soon by
Cloud Functions. A `window` or `localStorage` reference typechecks cleanly today
and crashes at runtime in two of those three environments.

- [x] Add an `eslint.config.js` override scoped to `lib/**/*.ts`:
  - [x] `no-restricted-imports` for `react*`, `firebase*`, `firebase-admin*`,
        `firebase-functions*`, `@bookbingo/web`
  - [x] `no-restricted-globals` for `window`, `document`, `localStorage`,
        `sessionStorage`, `navigator`
- [x] Confirm the `files` pattern is anchored at the repo root — it must **not**
      match `app/web/src/lib/**`, which is app-internal and unrelated
- [x] `pnpm run lint` green on the unmodified tree (the rules should pass today)
- [x] Add `const x = window.innerWidth;` to `lib/core/src/scoring.ts` →
      `pnpm run lint` **fails**. Revert.
- [x] Add `import 'react';` to `lib/core/src/scoring.ts` → `pnpm run lint`
      **fails**. Revert.
- [x] `pnpm run verify` green

**Validated four ways**, each reverted afterwards:

| Probe                                  | Result                                            |
| -------------------------------------- | ------------------------------------------------- |
| Unmodified tree                        | lint green — rules do not fire on current code    |
| `window.innerWidth` in `lib/core`      | `error … no-restricted-globals`                   |
| `import 'react'` in `lib/core`         | `error … no-restricted-imports`                   |
| `typeof document` in `app/web/src/lib` | lint green — the app-internal `lib/` is untouched |

The fourth probe is the one worth keeping: `app/web/src/lib/` and the
workspace-root `lib/` share a name, and an unanchored pattern would have
quietly applied Node-only rules to thirteen React components.

**Decision taken:** the base `no-restricted-imports`, not the typescript-eslint
extension. The extension's only advantage here is `allowTypeImports`, and a
type-only `import type { ReactNode }` in `lib/` is still a framework dependency
leaking into a framework-agnostic package — so both should fail, which is what
the base rule already does. Fewer moving parts, no base-rule/extension-rule
interaction to get wrong.

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

- [x] Add `noUnusedLocals`, `noUnusedParameters`, and
      `noFallthroughCasesInSwitch` to `compilerOptions` in the root
      `tsconfig.build.json`
- [x] Remove the same three flags from `app/web/tsconfig.json`
- [x] Drop the `target: ES2020` override in `app/web/tsconfig.json` so it
      inherits ES2022 from the root chain; keep an explicit `lib` that includes
      `DOM` and `DOM.Iterable`
- [x] Fix the violations this surfaces — ~~expect a non-trivial cleanup pass~~
      **there were none; see below**
- [x] `npx tsc -p tsconfig.json --showConfig` and
      `npx tsc -p app/web/tsconfig.json --showConfig` agree on `target` and the
      three flags
- [x] Introduce an unused local in an `app/web` component →
      `pnpm run typecheck` **fails**. Revert.
- [x] `pnpm run verify` green

**The predicted cleanup pass did not materialise — zero violations.** §0
constraint 3 called this "the one task expected to fail on first run"; that was
wrong, and the reason is worth recording. `@typescript-eslint/no-unused-vars` is
already `error` in `eslint.config.js` and has been covering nearly the same
ground as `noUnusedLocals`/`noUnusedParameters` all along. The flags were never
enforced by the compiler, but the code was being kept clean by the linter
anyway, so switching them on was a no-op against current sources. What changes
is that the guarantee is now the compiler's as well, in the emit chain and in
`typecheck`, not just a lint rule that a future config change could relax.

**Both configs now report identical settings**, read back through
`--showConfig` rather than by comparing source files:

```
tsconfig.json          target=es2022 | lib=es2022,dom,dom.iterable | all three flags true
app/web/tsconfig.json  target=es2022 | lib=es2022,dom,dom.iterable | all three flags true
```

**`lib` is now explicit in the root config too.** It was previously implicit,
resolving via `target: ES2022` to `lib.es2022.full`, which includes DOM. Stating
it makes the two configs comparable by reading, and documents a real constraint:
the root is one flat program spanning `app/`, `lib/`, and `scripts/`, so DOM
cannot be withheld from the Node-only packages there. That is precisely why F6's
boundary enforcement had to be an ESLint rule rather than a `lib` setting.

---

## 4. Exit criteria

The branch is complete when every box in §3 is checked and all of the following
pass from a genuinely clean state:

```sh
rm -rf lib/*/dist app/web/dist app/web/.tsbuild functions/lib
find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete
pnpm run verify
```

- [x] `pnpm install --frozen-lockfile` succeeds
- [x] `pnpm run verify` green from the clean state above
- [x] `git status --short` clean afterwards — no stray build output
- [x] `npx tsc --build --dry --verbose tsconfig.build.json` lists **6** projects
      — the five sub-projects plus the solution root. (An earlier draft of this
      list said five; the root config counts itself. One project would mean a
      broken graph.)
- [x] `pnpm --filter @bookbingo/web run build:prod` yields
      `app/web/dist/index.html` plus assets
- [x] `pnpm --filter @bookbingo/functions run build` yields `functions/lib`
- [x] Cold `pnpm --filter @bookbingo/lib-core run build` succeeds (F4)
- [x] Boundary violations fail lint — both a DOM global and a `react` import in
      `lib/core` (F6)
- [x] An unused local in `app/web` fails typecheck (F5)
- [x] `pnpm run test:integration` passes with `.env.test` moved aside (F7)
- [x] Every deploy script names its `--project`; `deploy:functions:staging`
      exists (F2)
- [x] ~~`functions/package.json` carries no `workspace:*` entry under
      `dependencies`~~ — **this criterion was too weak and passed a broken
      deploy.** Replaced: `functions/package.json` carries no `workspace:*`
      entry in _any_ dependency section, enforced by
      `functions/src/deploy-manifest.test.ts` (F3)
- [x] The functions emulator loads `enrichBook` and `submitFeedback` (F9)
- [x] Compiled tests are excluded from the functions upload (F11)

**CLAUDE.md review** — this branch touches build/TypeScript configuration, the
`lib/*` build commands, and the deploy scripts, all of which are documented.
Before opening the PR, check these sections for staleness:

- [x] "Commands" — `test:integration` now records that it needs no `.env` file
      and that the emulator pin lives in `vitest.config.int.ts`
- [x] "TypeScript Build Configuration" — added two rules the branch established:
      compiler options belong in the root `tsconfig.build.json` because both
      chains extend it, and a flag set only in `app/web/tsconfig.json` is read
      by the editor alone; plus why `lib` includes DOM everywhere and must not
      be narrowed to fix the `lib/` boundary
- [x] "Architecture Guidance" — the `lib/` boundary is now **enforced**, with
      the anchoring caveat about `app/web/src/lib/`; deploy scripts always name
      a project and there is deliberately no unsuffixed `deploy:functions`;
      `functions/` runs on Node 22 while everything else builds on 24

No change needed to the "Output directories" table, the `references`-not-
inherited trap, or the import conventions — this branch did not alter any of
them.

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
