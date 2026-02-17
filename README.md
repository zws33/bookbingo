# BookBingo

A book reading competition tracker for book clubs. Log the books you've read, tag them with bingo categories, and compete with friends to see who can read the most diverse collection.

## What is BookBingo?

BookBingo turns reading into a friendly competition where you:
- Track books across 49 different categories
- Earn points for both volume and variety of reading
- View your progress on a visual bingo board
- Compare your reading with other members of your book club

The scoring algorithm rewards balanced reading across many categories while still recognizing readers who complete many books.

## Getting Started

### Prerequisites

You'll need:
- [Node.js](https://nodejs.org/) (v18 or higher)
- [pnpm](https://pnpm.io/) (v8 or higher)

### Running Locally

```bash
# Clone the repository
git clone https://github.com/zws33/bookbingo.git
cd bookbingo

# Install dependencies
pnpm install

# Start the development server
pnpm run dev:web
```

Open http://localhost:5173 in your browser to see the app.

## Project Structure

```
bookbingo/
├── lib/                    # Core libraries
│   ├── types/             # Type definitions
│   ├── core/              # Business logic (scoring, validation)
│   └── data/              # Data access layer
├── app/web/               # React web application
└── docs/                   # Documentation
```

## Development

### Running Tests

```bash
pnpm test
```

### Building

```bash
pnpm run build
```

### Linting

```bash
pnpm run lint
```

## How It Works

Each book you log can be tagged with up to 3 categories (or unlimited if marked as your "freebie" book). The scoring system awards points based on:

- **Volume**: More books = more points
- **Variety**: Reading across diverse categories earns bonus multipliers
- **Balance**: Diminishing returns discourage over-concentrating in few categories

For details on the scoring algorithm, see [docs/SCORING_PLAN.md](docs/SCORING_PLAN.md).

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.