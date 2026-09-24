# BookBingo

Book reading bingo card tracker — a hobby project for a book club competition among friends. Users log books, tag them with categories, and earn scores that reward both volume and variety.

## Tech Stack

- **Language**: TypeScript (strict mode, ES2022, ESM only)
- **Web app**: React 19 + Vite + Tailwind CSS
- **Backend**: Firebase (Firestore, Hosting)
- **Package manager**: pnpm workspaces — never use `npm` or `yarn`
- **Tooling**: ESLint, Prettier, tsx

## Code Style

- ESM only. No CommonJS (`require`, `module.exports`).
- Prefer `const` over `let`. Never use `var`.
- Formatting is handled by Prettier — do not manually align code. Prettier owns **every** tracked file type (`.ts`, `.tsx`, `.js`, `.json`, `.css`, `.md`); `.prettierignore` carves out build output, dependencies, and Firebase local state.
- `verify` fails on unformatted files, so run `pnpm run format` before committing.
- Comments record constraints that are not derivable from the code. No file-header docblocks, no per-function summaries, no comments restating what a name already says.

## functions/ Architecture

Clean Architecture. Each domain module with persistence (`readings/`, `tbr/`, `users/`) has three files:

- `store.ts` — repository interface, a private `firestoreX` singleton, and an `xRepository()` factory. The only layer that imports `firebase-admin`. Entities carry `Date`, not ISO strings.
- `handler.ts` — an `xHandlers(...repos)` factory returning a plain object of closures. Never a class: `callable(x.method, …)` passes the method unbound, so `this` would be lost.
- `present.ts` — the response DTO and its mapper. Owns ISO encoding and the book flattening.

Rules:

- `index.ts` is the composition root and the only module that names a concrete repository. Handler dependency parameters are suffixed `*Repo`.
- Inner layers throw `DomainError` (`common/errors.ts`); `callable.ts` maps it to an `HttpsError` at the boundary. A `corrupt` message is never forwarded to the caller.
- `books/`, `config/` and `feedback/` keep free functions — they have no repository dependencies.
- Handler tests use a fake repository whose methods reject unless overridden, so an unexpected call fails loudly.

Two deviations are deliberate:

- **No Unit of Work.** `tbr/store.ts` imports `readings/store.ts` because the promote transaction spans both collections and Firestore requires one callback. Passing a `Transaction` across a repository boundary would leak `firebase-admin` inward, which is worse. Introduce Unit of Work when a _second_ cross-aggregate transaction appears.
- **Responses flatten the book** as `bookTitle`/`bookAuthor`/`bookMetadata`. The target is a nested `book: Book`, matching what `getLibrary` and `fetchBookDetails` already return. It is the only non-backward-compatible change pending and needs a coordinated `deploy:all`.

## Git

Use conventional commit format (the PR title becomes the squashed commit message):

- `feat: add score calculation for multi-tag books`
- `fix: prevent duplicate category assignment`
- `test: add edge cases for freebie book scoring`
- `refactor: extract validation into shared utility`
- `docs: update scoring plan with diminishing returns formula`
