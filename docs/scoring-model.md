# Scoring Model

How a member's score is computed from their readings. Storage-independent.

## Formula

```
S = k + Σᵢ Σ_{j=2}^{cᵢ} ρ(j)
```

- `S` — the member's score.
- `k` — tags holding at least one book.
- `N` — size of the challenge's tag vocabulary.
- `cᵢ` — books counted under tag `i`.
- `ρ(j)` — value of the j-th book within a tag, defined for `j ≥ 2`.

The first book in a tag is the `+1` in `k`. The inner sum starts at `j = 2`, so coverage and repeats never double-count.

## Engines

`SHIFTED_HARMONIC` is the only engine registered in `domain/scoringEngines.ts`.
Any engine shares the formula above and supplies its own ρ(j). Which one scores
a challenge is a `challenge_scoring_config` row, read on every scoring call; a
challenge with no row is scored with the default, `SHIFTED_HARMONIC`.

## SHIFTED_HARMONIC

```
ρ(j) = y · a / (j − 2 + a)
y    = y_min + (y_max − y_min) · (k−1)/(N−1)

y_min = 0.45        y_max = 0.75        a = 2
```

- `y` is `ρ(2)`, the value of a tag's first repeat. The curve is set by `y` because `y` is the quantity a member experiences directly.
- `a` in the numerator is the scale forced by `ρ(2) = y`, so a tag's first repeat is worth `y` whatever the shift is.
- The `1/j` tail holds a tag's volume to logarithmic growth, which is why the curve is harmonic rather than a power law: with `ρ(j) = 1/j^p` and the exponent derived from `y`, bounding one tag's volume needs `p > 1`, which caps `y_max` at 0.5.
- `a > 0` is an invariant, not a preference: at `a = 0` the denominator is zero at the first repeat. `a ≥ 1` is the preference.
- All three are module constants in `domain/shiftedHarmonic.ts`, asserted in bounds at import. Only `N` is supplied per call, by `scoring/scoreCalculator.ts` from the challenge's tag count, so scoring itself takes only readings. An engine owns its own parameters; they become per-challenge the day they move to a column.
- The ramp divides by `N−1`, not `N`, so both ends are hit exactly. With `k/N` a reader at `k = 1` lands above `y_min` rather than on it, and `y_min` would not mean what it says. `k = 0` is unreachable: no books, no repeats, score 0.
- The three parameters are provisional. No reading data has validated them, and there are no calibration tables for this curve.

## Invariants

1. **I1 — more is always better.** Every book strictly increases the score.
2. **I2 — repeats pay less each time.** `ρ(j)` is positive and gets smaller as `j` grows. Each repeat in a tag is worth less than the one before, and never zero.
3. **I3 — coverage sets the decay rate.** Broader coverage decays slower: `ρ(j)` rises with `k` for every `j`.

All three hold on one constraint: **`y` may depend on how many tags are covered, and must never depend on how unevenly books are spread across them.** Any measure of that unevenness — standard deviation, coefficient of variation, Gini coefficient, books per tag — breaks I1, because adding a book can worsen the spread even as it adds to the total.

Given that constraint, both possible moves are covered:

- A repeat leaves `k` and `y` unchanged, so the score rises by exactly `ρ(cᵢ+1)`, which is positive by I2.
- A new tag raises `k` by one and raises `y`, so the score rises by the 1 point for the new tag plus whatever every existing repeat gains from the higher `y`, which is never negative by I3.

Covering a new tag is therefore always worth at least 1 point, with no special case.

## Parameter bounds

Consequences of the invariants, not preferences. Reject a challenge whose values violate them.

1. `0 < y_max < 1`. At `y_max = 1` a tag's first repeat is worth a full new tag, so I2 is gone. Above 1 a repeat outvalues covering a new tag, inverting it.
2. `y_min ≤ y_max`. Reversed, `ρ(j)` falls as coverage rises, so covering a new tag devalues every repeat already banked and the 1 point gained can be outweighed. This is the defect the balance factor had, re-entering through configuration.
3. `y_min = y_max` is legal. Coverage stops modulating `ρ(j)`, I1 and I2 still hold, and I3 becomes non-strict.
4. `a > 0`. At `a = 0` the denominator is zero at `j = 2`.
5. `N ≥ 2`. A product bound rather than one derived from the invariants, and the reason the ramp may divide by `N−1` without a guard.

## Coverage

- A tag is covered when it holds at least one book, whatever claimed it.
- A freebie claiming `m` tags yields the same tag counts as `m` single-tag books, and scores identically. Scoring has no freebie branch.
- The tags a freebie may claim are uncapped. Reaching `k = N` in a single reading is a legal move and is rewarded as one.
- `N` is the challenge's vocabulary size, passed into the scoring call. Never read from `TILES`.

## Verification

- I1 — brute force over random states crossed with three move types: a repeat, a new tag, and a multi-tag book at `tag_cap`. The smallest score change across 5,000 trials at `N = 25` is asserted positive.
- I2 — repeat values strictly decreasing and never zero at fixed coverage, across a range of `k`.
- I3 — `ρ(j)` asserted rising across every `k` from 2 to `N`, for one family of distributions: one tag at depth `j` and the rest at 1. Other families are still unchecked.
- Closed forms rather than recorded numbers: one tag of depth `d` sums to `2y(H(d) − 1)`, `ρ(a + 2)` is half of `ρ(2)`, and `ρ(3)/ρ(2) = a/(1+a)` at every `k`.
- The engine reads no measure of unevenness. The earlier models that did, and the CV and standard-deviation helpers behind the balance factor, are removed.
- Switching a challenge's engine is an `update` to `challenge_scoring_config`, not a migration. No score is persisted, so the whole history rescores on the next read. Only one engine is registered, so there is nothing to switch to today.
- Reference profiles pin magnitudes, not design claims. Re-derive their expected values rather than preserving them.
