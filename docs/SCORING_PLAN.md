# BookBingo Scoring System Implementation Plan

## Overview
Build a core "engine" for the book reading challenge that:
- Rewards both volume AND variety
- Penalizes imbalanced reading with diminishing returns
- Is architected as a standalone module for future full-stack/multi-client use
- Supports multi-user from the start

## Challenge Rules (Codified)
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

## Architecture: Core Engine

### Design Principles
- **Portable**: Pure JS module with no CLI/web dependencies
- **Testable**: All business logic in isolated functions
- **Multi-user ready**: Data structures support user context
- **Extensible**: Easy to add new rules or scoring variations

### Project Structure
```
src/
├── engine/                 # Core business logic (portable)
│   ├── index.js           # Public API exports
│   ├── scoring.js         # Score calculation
│   ├── statistics.js      # stdDev, CV, mean calculations
│   ├── validation.js      # Rule enforcement (3-category limit, freebie)
│   └── constants.js       # 49 tile definitions
├── data/                   # Data layer (swappable)
│   ├── index.js           # Data access interface
│   ├── memory.js          # In-memory store (for testing/CLI)
│   └── json-file.js       # JSON file persistence
├── cli/                    # CLI interface
│   └── index.js           # Command-line app
└── index.js               # Current file (to be refactored)
```

## Implementation Phases

### Phase 1: Extract Core Engine
**Goal**: Create `src/engine/` with pure business logic

**Files to create:**
- `src/engine/constants.js` - 49 tile definitions
- `src/engine/statistics.js` - stdDev, CV, mean functions
- `src/engine/scoring.js` - Score calculation
- `src/engine/validation.js` - Rule enforcement
- `src/engine/index.js` - Public API

**Key functions:**
```javascript
// scoring.js
calculateBasePoints(tileCounts)
calculateBalanceMultiplier(tileCounts)
calculateScore(userBooks)
getScoreBreakdown(userBooks)

// validation.js
validateBookTiles(book)         // Enforce 3-category limit
validateFreebie(userBooks)      // Ensure only one freebie
canAssignTile(book, tile)       // Check if assignment is valid

// statistics.js
calculateMean(counts)
calculateStdDev(counts)
calculateCV(counts)
calculateTileCounts(userBooks)
```

### Phase 2: Data Layer
**Goal**: Abstract data storage for multi-user support

**Data model:**
```javascript
// User
{ id, name, createdAt }

// UserBook
{
  id,
  userId,
  title,
  author,
  tiles: [tileId, tileId, tileId],  // Max 3
  isFreebie: boolean,               // Unlimited tiles if true
  readAt
}

// Tile (global)
{ id, name, isManual }
```

**Files to create:**
- `src/data/index.js` - Interface definition
- `src/data/memory.js` - In-memory implementation
- `src/data/json-file.js` - File-based persistence

### Phase 3: CLI Enhancement
**Goal**: Wire engine to CLI with multi-user support

**Commands:**
```bash
npm start                    # Show current user's score/stats
npm start -- --user=alice    # Show specific user
npm start -- --add-book      # Interactive book addition
npm start -- --leaderboard   # Compare all users
```

### Phase 4: Future (Web App)
- Express API wrapping engine
- React/Vue frontend
- SQLite/Postgres for persistence
- Offline-first PWA

## Files to Modify
- `src/index.js` - Refactor to use engine, becomes CLI entry point

## Files to Create
- `src/engine/*.js` - Core business logic
- `src/data/*.js` - Data layer abstraction

## Verification
1. `npm run lint` passes
2. Unit tests for scoring edge cases:
   - Empty user (0 books) = score 0
   - 1 book in 1 tile = base score
   - 3-category limit enforced
   - Freebie allows unlimited tiles
3. Manual test: Add books, verify score changes appropriately
4. Verify: Well-balanced reading scores higher than concentrated
