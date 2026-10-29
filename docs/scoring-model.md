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

## Decay curve

```
ρ(j) = 1 / j^p
p     = log₂(1 / y)
y     = y_min + (y_max − y_min) · (k−1)/(N−1)

y_min = 0.20        y_max = 0.50
```

- `p` is the decay exponent. Each time a tag's depth doubles, the next book there is worth `2^p` times less.
- `y` is `ρ(2)`, the value of a tag's first repeat. The curve is set by `y` rather than by `p` because `y` is the quantity a member experiences directly, and because moving `y` in equal steps makes every tag covered worth the same improvement in decay rate.
- `y_min` and `y_max` are the only knobs. They are the value of a tag's first repeat at the two ends of the coverage range: `y_min` at `k = 1`, `y_max` at `k = N`. Everything else about the curve follows from them.
- Both arrive as inputs to the scoring call alongside `N`, per challenge. Not module constants.
- The ramp divides by `N−1`, not `N`, so both ends are hit exactly. With `k/N` a reader at `k = 1` lands at 0.206 rather than 0.200, and `y_min` would not mean what it says. `k = 0` is unreachable: no books, no repeats, score 0.
- `p` is computed once per score from `k` and held constant across the sum. Coverage sets the slope of the decay; it never scales the total.
- The current values are provisional. No reading data or stated group expectation has validated them.

## Calibration

`y_max` sets how far a tag can be taken by a reader at full coverage.

| `y_max` | `p` at `k = N` | books in one tag for 3 pts | for 5 pts |
| ------- | -------------- | -------------------------- | --------- |
| 0.50    | 1.00           | 31                         | 227       |
| 0.60    | 0.74           | 12                         | 29        |
| 0.65    | 0.62           | 9                          | 19        |
| 0.70    | 0.52           | 8                          | 14        |
| 0.80    | 0.32           | 6                          | 10        |

`y_min` sets the ceiling on what a reader at `k = 1` can extract from one tag, however many books go into it.

| `y_min` | `p` at `k = 1` | max repeat points from one tag |
| ------- | -------------- | ------------------------------ |
| 0.10    | 3.32           | 0.15                           |
| 0.20    | 2.32           | 0.42                           |
| 0.30    | 1.74           | 0.99                           |
| 0.40    | 1.32           | 2.70                           |
| 0.50    | 1.00           | none                           |

- A ceiling exists only while `p > 1`. At `p ≤ 1` repeat points from one tag grow without bound. At `p = 1` that growth is logarithmic — 3 points takes 31 books, 7 points takes 1,674. Below `p = 1` it is a power of the count, `n^(1−p)`, which is materially faster: at `y_max = 0.65` a tag with 20 books yields 5.19 repeat points where `y_max = 0.50` yields 2.60.
- The two knobs are not redundant. Raising `y_max` reaches only readers who earned a low `p`. At `N = 25`, moving `y_max` from 0.50 to 0.80 takes a reader with 3 tags at 10 books each from 4.39 to 4.65, and a reader at full coverage with a second pass over the board from 37.50 to 45.00.

## Invariants

1. **I1 — more is always better.** Every book strictly increases the score.
2. **I2 — repeats pay less each time.** `ρ(j)` is positive and gets smaller as `j` grows. Each repeat in a tag is worth less than the one before, and never zero.
3. **I3 — coverage sets the decay rate.** Broader coverage decays slower: `ρ(j)` rises with `k` for every `j`.

All three hold on one constraint: **`p` may depend on how many tags are covered, and must never depend on how unevenly books are spread across them.** Any measure of that unevenness — standard deviation, coefficient of variation, Gini coefficient, books per tag — breaks I1, because adding a book can worsen the spread even as it adds to the total.

Given that constraint, both possible moves are covered:

- A repeat leaves `k` and `p` unchanged, so the score rises by exactly `ρ(cᵢ+1)`, which is positive by I2.
- A new tag raises `k` by one and lowers `p`, so the score rises by the 1 point for the new tag plus whatever every existing repeat gains from the lower `p`, which is never negative by I3.

Covering a new tag is therefore always worth at least 1 point, with no special case.

## Parameter bounds

Consequences of the invariants, not preferences. Reject a challenge whose values violate them.

1. `0 < y_max < 1`. At `y_max = 1`, `p = 0` and every repeat is worth a full point, so I2 is gone. Above 1, `p < 0` and repeats grow, inverting it.
2. `y_min ≤ y_max`. Reversed, `p` rises with coverage, so covering a new tag devalues every repeat already banked and the 1 point gained can be outweighed. This is the defect the balance factor had, re-entering through configuration.
3. `y_min = y_max` is legal. Coverage stops modulating decay, I1 and I2 still hold, and I3 becomes non-strict.
4. `N ≥ 2`. A product bound rather than one derived from the invariants, and the reason the ramp may divide by `N−1` without a guard.

## Coverage

- A tag is covered when it holds at least one book, whatever claimed it.
- A freebie claiming `m` tags yields the same tag counts as `m` single-tag books, and scores identically. Scoring has no freebie branch.
- The tags a freebie may claim are uncapped. Reaching `k = N` in a single reading is a legal move and is rewarded as one.
- `N` is the challenge's vocabulary size, passed into the scoring call. Never read from `TILES`.

## Verification

- I1 — brute force over random states crossed with three move types: a repeat, a new tag, and a multi-tag book at `tag_cap`. Run at the bound-case parameters `y_min = 0.20`, `y_max = 0.90`, not only at the current values: minimum score change over 200k moves is +0.0016.
- I2 — repeat values strictly decreasing at fixed coverage, across a range of `k`.
- I3 — property test still outstanding. Only one family of distributions has been checked.
- Scoring reads no measure of unevenness, so `calculateCV` and `calculateStdDev` have no caller.
- Reference profiles pin magnitudes, not design claims. Re-derive their expected values rather than preserving them.
