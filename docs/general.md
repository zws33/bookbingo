# Book Bingo

Book Bingo is a book reading competition among friends. Users log books they've read, tag them with bingo tile categories, and earn scores that reward both volume and variety of reading.

## Core Rules

- 49 total bingo tiles (43 book-assignable + 6 manual)
- Each book can be tagged with up to 3 tiles
- One designated "freebie" book can count for unlimited tiles
- Scoring rewards volume AND variety, penalizes imbalanced reading with diminishing returns
- Multi-user from the start

## Tech Stack

- **Language**: TypeScript (strict mode, ESM only)
- **Web app**: React 18 + Vite + Tailwind CSS
- **Backend**: Firebase (Auth, Firestore, Hosting)
- **Testing**: Node built-in test runner (`node:test` + `node:assert`)

## Project Structure

- `lib/core/` — Scoring engine, validation, tile definitions, statistics
- `lib/data/` — Data access layer (in-memory, JSON file)
- `lib/types/` — Shared type definitions
- `app/web/` — React web application (Vite + Firebase)
- `app/cli/` — Command-line interface
- `docs/` — Planning and design documents

## Future Work

- Calculating and displaying current score
- Suggesting options to rebalance tiles for a higher score
- Leaderboard of users and their scores
- Progressive Web App (installable, offline support)

## Related Docs

- [Scoring Plan](SCORING_PLAN.md) — Scoring formula and design rationale
