# BookBingo Scoring Strategy

## Philosophy

BookBingo is a friendly reading competition. The scoring system exists to motivate readers to explore widely, not just read a lot. A reader who covers many different categories should outscore one who reads the same volume but concentrates in a few categories. At the same time, reading more books should always help — it should never be a disadvantage to read another book.

The scoring system encodes three values:

1. **Variety is king.** Covering a new category (tile) is the most valuable thing a reader can do. Each unique tile covered earns 1 full point with no penalty or diminishment.

2. **Volume matters, but with limits.** Reading additional books in a category you've already covered still earns points, but each subsequent book in the same tile earns less than the one before it. This prevents a reader from running up the score by stacking one or two categories.

3. **Balance is rewarded.** When two readers have the same number of tile-slots filled, the one who spread books more evenly across categories earns a higher score. This is the final guardrail against gaming the system through concentration.

## Challenge Rules

1. **49 total categories** (43 book-assignable + 6 manual)
2. **3-category limit**: Each book can count toward at most 3 categories
3. **One freebie**: One designated book can count for unlimited categories
4. **Equal weighting**: All books and all categories count equally — no tiers or difficulty bonuses
5. **Freebie scoring**: The freebie book's tile assignments are scored the same as any other book

## How Scoring Works

### The Formula

```
Score = VarietyPoints + VolumePoints × BalanceFactor
```

There are three components:

### 1. Variety Points — rewarding breadth

Every unique tile (category) that has at least one book assigned to it earns exactly **1 point**. These points are never diminished or penalized. This makes covering a new category the single most impactful action a reader can take.

```
VarietyPoints = number of tiles with at least 1 book
```

### 2. Volume Points — rewarding depth with diminishing returns

Once a tile already has one book, additional books in that tile still earn points — but each one earns less than the last. This uses the **harmonic series**: the 2nd book earns 1/2 point, the 3rd earns 1/3, the 4th earns 1/4, and so on.

```
VolumePoints = Σ (H(countₜ) - 1)   for each tile t

where H(n) = 1 + 1/2 + 1/3 + ... + 1/n   (the harmonic sum)
```

The `-1` removes the first book from each tile (that's already counted in VarietyPoints).

| Books in tile | Volume contribution | Marginal value of last book |
|---|---|---|
| 1 | 0.000 | (counted in variety) |
| 2 | 0.500 | 0.500 |
| 3 | 0.833 | 0.333 |
| 4 | 1.083 | 0.250 |
| 5 | 1.283 | 0.200 |
| 10 | 1.929 | 0.100 |

This curve means that stacking books into one tile has sharply diminishing returns. Reading your 10th book in the same category adds only 0.1 points, while covering a brand-new category adds 1.0 points.

### 3. Balance Factor — penalizing lopsided reading

The balance factor scales the volume points based on how evenly books are distributed across tiles. It uses the **coefficient of variation (CV)** — a standard statistical measure of relative spread.

```
BalanceFactor = 1 / (1 + CV²)

where CV = standard deviation / mean   of tile counts
```

| Distribution | CV | Balance Factor |
|---|---|---|
| Perfectly even | 0 | 1.00 |
| Slightly uneven | 0.3 | 0.92 |
| Moderately uneven | 0.5 | 0.80 |
| Very uneven | 1.0 | 0.50 |
| Extremely uneven | 2.0 | 0.20 |

The balance factor only scales the **volume points** — it never reduces variety points. This means a reader is never penalized for covering new tiles, only for how unevenly they stack repeat books.

### Why This Design

**Separating variety from volume** makes the scoring transparent and predictable. A reader can look at their breakdown and understand exactly why their score is what it is:

- "I've covered 15 categories (15 variety points)"
- "I have some repeat books adding 4.2 volume points"
- "My balance factor is 0.85 because I'm a bit heavy in fantasy"
- "Total: 15 + 4.2 × 0.85 = 18.57"

**The harmonic series** was chosen over logarithmic diminishing returns because it creates a steeper penalty for early repeats. With `log₂`, the 2nd book in a tile adds a full 1.0 points (no diminishment at all). With harmonic, the 2nd book adds 0.5 — immediately signaling that variety is more valuable.

**The balance factor on volume only** ensures that the core incentive (cover new tiles) is never undermined. Even a very unbalanced reader keeps all their variety points.

## Scoring Strategy Selection

The system supports two strategies:

- **`balanced-harmonic`** (default): Uses the full formula with the balance factor. This is the recommended strategy for competitive play.
- **`harmonic`**: Uses only harmonic diminishing returns with no balance factor (balance factor fixed at 1.0). Simpler, but doesn't penalize lopsided stacking as aggressively.

## Example Scenarios

### Scenario A: Balanced reader, 10 books

10 books, each with 3 tiles, spread across 25 unique tiles. 5 tiles have 2 books each, 20 tiles have 1 book.

- Variety: 25 points
- Volume: 5 × (H(2) - 1) = 5 × 0.5 = 2.5
- CV ≈ 0.22, Balance Factor ≈ 0.95
- **Score (balanced-harmonic): 25 + 2.5 × 0.95 = 27.38**
- **Score (harmonic): 25 + 2.5 = 27.50**

### Scenario B: Unbalanced reader, 10 books

10 books concentrated: 3 tiles × 5 books, 3 tiles × 3 books, 6 tiles × 1 book (12 unique tiles).

- Variety: 12 points
- Volume: 3 × (H(5)-1) + 3 × (H(3)-1) = 3 × 1.28 + 3 × 0.83 = 6.34
- CV ≈ 0.63, Balance Factor ≈ 0.72
- **Score (balanced-harmonic): 12 + 6.34 × 0.72 = 16.56**
- **Score (harmonic): 12 + 6.34 = 18.34**

### Scenario C: Volume stacker, 30 books, heavily concentrated

5 tiles × 12 books, 10 tiles × 3 books (15 unique tiles).

- Variety: 15 points
- Volume: 5 × (H(12)-1) + 10 × (H(3)-1) = 5 × 2.10 + 10 × 0.83 = 18.83
- CV ≈ 0.81, Balance Factor ≈ 0.60
- **Score (balanced-harmonic): 15 + 18.83 × 0.60 = 26.30**
- **Score (harmonic): 15 + 18.83 = 33.83**

### Scenario D: Balanced volume reader, 30 books, well-spread

30 tiles × 2 books, 10 tiles × 3 books (40 unique tiles).

- Variety: 40 points
- Volume: 30 × 0.5 + 10 × 0.83 = 23.33
- CV ≈ 0.24, Balance Factor ≈ 0.95
- **Score (balanced-harmonic): 40 + 23.33 × 0.95 = 62.17**
- **Score (harmonic): 40 + 23.33 = 63.33**

### Key takeaway

Under `balanced-harmonic`, the volume stacker with 30 books (Scenario C, 26.30) barely outscores the balanced reader with only 10 books (Scenario A, 27.38). Meanwhile, the balanced volume reader with 30 books (Scenario D, 62.17) scores more than double. The system strongly rewards reading broadly.

## Implementation

- **Scoring logic**: `lib/core/src/scoring.ts`
- **Statistics helpers**: `lib/core/src/statistics.ts`
- **Shared types**: `lib/types/src/index.ts` (`ScoreBreakdown`, `ScoringStrategy`)
