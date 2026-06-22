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
- **Web app**: React 19 + Vite + Tailwind CSS
- **Backend**: Firebase (Auth, Firestore, Hosting)
- **Testing**: Node built-in test runner (`node:test` + `node:assert`)

## Project Structure

- `lib/core/` — Scoring engine, validation, tile definitions, statistics
- `lib/types/` — Shared type definitions
- `lib/util/` — Cross-platform utilities (logger)
- `app/web/` — React web application (Vite + Firebase)
- `functions/` — Firebase Cloud Functions (e.g. `enrichBook`, `submitFeedback`)
- `docs/` — Design documents

## Future Work

- **Community Library** — the `/library` page (club-wide reading with reader counts and tile aggregation) has shipped; per-reader detail expansion, search, and sort toggle remain planned
- Suggesting options to rebalance tiles for a higher score
- Progressive Web App (installable, offline support)

## Related Docs

- [Scoring Plan](SCORING_PLAN.md) — Scoring formula and design rationale
