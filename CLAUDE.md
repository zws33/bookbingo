# BookBingo: Book reading bingo card tracker

## Commands
- Run: `npm start` or `node src/index.js`
- Lint: `npm run lint`
- Format: `npm run format`

## Style & Guardrails
- **Language**: Vanilla JavaScript (ESM only). No CommonJS.
- **Standards**: Prefer `const` over `let`. No `var`.
- **Formatting**: Automated via Prettier; do not manually align code.

## Verification Workflow
- ALWAYS run `npm run lint` after every code change.
- Do not commit code that fails linting or has `console.log` debug statements.
- Ensure code is formatted with Prettier before committing.
