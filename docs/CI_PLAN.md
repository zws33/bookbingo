# CI Plan

## Problem

The only existing GitHub Actions workflow (`firebase-hosting-merge.yml`) is a deploy pipeline.
It builds and ships to staging on every `main` push but never runs `lint`, `test`, or `typecheck`.
A broken commit can land in staging undetected.

## Solution

A dedicated `CI` workflow (`.github/workflows/ci.yml`) runs the full verification chain on every
push to `main` and on every pull request targeting `main`.

## Trigger Conditions

| Event | Condition |
|-------|-----------|
| `push` | Branch `main`, paths not under `docs/**` |
| `pull_request` | Targeting `main` |

Doc-only commits skip CI to avoid burning runner minutes on prose changes.

## Job Structure

Single job `verify` running on `ubuntu-latest`:

1. Checkout
2. Install pnpm 10
3. Set up Node 22 with pnpm cache
4. `pnpm install --frozen-lockfile`
5. `pnpm run lint`
6. `pnpm test`
7. `pnpm run typecheck`

Steps run sequentially. No secrets or Firebase emulator required — all three checks are
self-contained.

## Rationale

- **Single job over parallel jobs**: Simpler workflow graph; failure signal is equally fast at
  current codebase size. Parallelism can be introduced if total runtime exceeds ~3 minutes.
- **Node 22 + pnpm 10**: Matches the existing deploy workflow to keep environments consistent.
- **`--frozen-lockfile`**: Prevents accidental lockfile drift in CI.

## Out of Scope

- Code coverage reporting (add later via `--coverage` + Codecov action)
- README status badges (follow-up once workflow is confirmed green)
- Firebase emulator for integration tests (not currently part of `pnpm test`)
