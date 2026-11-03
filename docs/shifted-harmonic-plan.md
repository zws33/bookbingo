# Plan — add the shifted-harmonic scoring engine

## Objective

Register a second scoring curve, `ρ(j) = y · a/(j − 2 + a)`, without activating it, and delete `balanced-harmonic` from the engine contract.

Why: `coverage-decay` derives its decay rate from its first-repeat value (`p = log₂(1/y)`), which forces `y_max ≤ 0.5` — above that, repeat points grow as a power law and volume overtakes coverage. So "a repeat is worth more than half a tag" and "coverage always wins" cannot both hold in that curve. Shifted harmonic splits the two: `y` sets the first repeat, `a` sets how many books into a tag the fade starts, and the `1/j` tail holds score growth to logarithmic in volume and linear in coverage. The ceilings in `scoring-behavior-phase1.md` (7.61 points for life at 5 tags) disappear.

Settled: `ACTIVE_ENGINE` stays `coverage-decay`, so no score moves. Defaults `yMin 0.45`, `yMax 0.75`, `shift 2` — the value of a tag's repeats halves at the (shift+2)-th book.

## Commit 1 — `feat: add the shifted-harmonic scoring engine`

**`domain/scoringEngines.ts`** — replace the name-keyed registry with a discriminated union, so each engine declares its own knobs and a knob-ignoring adapter is unrepresentable:

```ts
export type EngineConfig =
  | { name: 'coverage-decay'; knobs: { yMin: number; yMax: number } }
  | { name: 'shifted-harmonic'; knobs: { yMin: number; yMax: number; shift: number } };

export const COVERAGE_DECAY: EngineConfig = { … };
export const SHIFTED_HARMONIC: EngineConfig = { … };
export const ACTIVE_ENGINE: EngineConfig = COVERAGE_DECAY;

export function scoringEngine(config: EngineConfig, vocabularySize: number): ScoringEngine;
```

`ScoringParams` and `DEFAULT_KNOBS` go away. Activation later is one identifier.

**`domain/decay.ts`** — both curves and a shared private helper holding what they already have in common: the bounds check, the ramp `y(k)`, the empty-state return, `calculateTileCounts`, and the double sum. The helper takes a per-score term builder so neither curve recomputes constants in the inner loop:

```ts
type Curve = (y: number) => (j: number) => number;
// coverage-decay:   (y) => { const p = Math.log2(1 / y); return (j) => 1 / j ** p; }
// shifted-harmonic: (y) => (j) => (y * shift) / (j - 2 + shift)
```

Export `coverageDecay(knobs, vocabularySize)` and `shiftedHarmonic(knobs, vocabularySize)`. Reuse `requireKnobsInBounds`; add `shift > 0`, below which `ρ(2)` is undefined, throwing `DomainError('corrupt', …)`. `shift ≥ 1` is a preference, not an invariant — document, don't enforce.

**`scoring/scoreCalculator.ts`** — `scoringEngine(ACTIVE_ENGINE, tagsCount)`.

**`domain/decay.test.ts`** — run I1/I2/I3 and the knob-rejection cases over a table of both configs; the existing `state`/`atCoverage`/`repeatValue` helpers and I1 brute force already take a `ScoringEngine` and need no change. Add shifted-harmonic calibration:

- `ρ(2) === y` exactly, at any `shift`.
- `ρ(shift + 2) === y/2` exactly — the half-value rule.
- `shift = 1` reproduces plain harmonic, `ρ(j) === y/(j − 1)`.
- One tile at depth `d` with `shift = 2` matches `2y·(H(d) − 1)` via `harmonicSum`.
- No ceiling: volume at depth 100,000 strictly exceeds depth 5,000 — the counterpart of the coverage-decay convergence test.

Split the shared table into `domain/engineInvariants.test.ts` past ~400 lines.

**`analysis/compare.ts`** — new, reusing `analysis/phase1.ts`'s `even`/`pareto`/`concentrated` builders and reader matrix. Prints both engines side by side: reader matrix, marginal repeat vs. new tag by coverage, repeat value by depth, and the slots a 5-tag reader needs to match a 30-tag reader. Update `phase1.ts` for the new signature.

**`docs/scoring-model.md`** — split "Decay curve" into the shared ramp plus one subsection per curve; add the shifted-harmonic formula, the `shift` knob, the half-value rule; scope the "Calibration" ceiling tables to coverage-decay and state that shifted harmonic has none; add `shift > 0` to "Parameter bounds"; rewrite the final "Verification" bullet, which says `balanced-harmonic` stays registered to compare against. `scoring-behavior-phase1.md` is unchanged — it describes the engine that stays live.

## Validation

- `pnpm run format`, then `pnpm run verify` at the repo root.
- `pnpm --filter @bookbingo/functions test` while iterating. No Postgres; `test:db` untouched.
- `scoring/scoreCalculator.test.ts` and `scoring/handler.test.ts` must pass **unmodified** — the proof that the live `getScore` response did not move.
- `node --import tsx functions/src/analysis/compare.ts`, checked against the agreed targets: a 30-tag reader's books 2–5 in a tag worth 0.63 / 0.42 / 0.32 / 0.25, and ~1,500 tag-claims for a 5-tag reader to match 30 tags touched once.

## Risks

- No score is persisted — `scoreCalculator` is built per request — so activating the new curve later is a two-way door with no data migration.
- Nothing in commit 1 is on a deployed path after #136, so there is no wire or callable change in either commit.
