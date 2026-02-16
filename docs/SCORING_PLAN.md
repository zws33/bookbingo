# BookBingo Scoring System

## Overview

The scoring engine rewards both volume AND variety of reading. It penalizes imbalanced reading with diminishing returns. The implementation lives in `lib/core/src/scoring.ts` with supporting statistics in `lib/core/src/statistics.ts`.

## Challenge Rules

1. **49 total categories** (43 book-assignable + 6 manual)
2. **3-category limit**: Each book can count toward max 3 categories
3. **One freebie**: One designated book can count for unlimited categories
4. **Scoring factors**: Categories covered, balance across categories, total books read
5. **No tier/difficulty weighting**: All books count equally

## Scoring Formula

### Balance-Penalized Volume Score
```
Score = BasePoints × BalanceMultiplier
```

**How it works:**
- More books → more tile assignments → higher BasePoints (always increases)
- Repeating tiles → diminishing returns via logarithm
- Uneven distribution → lower BalanceMultiplier (penalty)
- Even distribution → higher BalanceMultiplier (reward)

**Components:**

1. **BasePoints** - Sum of logarithmic points per tile:
   ```
   BasePoints = Σ (1 + log2(booksInTile)) for each tile with books
   ```
   - 1 book in tile = 1.0 points
   - 2 books = 2.0 points
   - 4 books = 3.0 points
   - 8 books = 4.0 points

   *This ensures more books always = higher score, but with diminishing returns for stacking the same tile.*

2. **BalanceMultiplier** - Rewards even distribution:
   ```
   BalanceMultiplier = 1 / (1 + CV²)
   where CV = stdDev / mean (coefficient of variation)
   ```
   - Perfectly balanced (CV ≈ 0): multiplier ≈ 1.0
   - Moderately imbalanced (CV = 0.5): multiplier ≈ 0.8
   - Very imbalanced (CV = 1.0): multiplier ≈ 0.5

**Example scenarios:**

| Scenario | Books | Tile Distribution | BasePoints | CV | Multiplier | Score |
|----------|-------|-------------------|------------|-----|------------|-------|
| Balanced reader | 20 | Even across 40 tiles | ~50 | 0.3 | 0.92 | ~46 |
| Concentrated reader | 20 | Heavy in 10 tiles | ~35 | 0.8 | 0.61 | ~21 |
| New reader | 5 | 5 unique tiles | 5 | 0 | 1.0 | 5 |

**Key behavior:**
- Person A (10 books) vs Person B (20 books) with same tile spread: B scores higher (more base points)
- Person A (20 books, even) vs Person B (20 books, uneven): A scores higher (better multiplier)
