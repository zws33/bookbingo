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

Clean Architecture. Each domain module with persistence (`books/`, `challenges/`, `readings/`, `tags/`, `tbr/`, `users/`) has these files:

- `store.ts` — repository interface, a private `firestoreX` singleton, and an `xRepository()` factory. The only layer that imports `firebase-admin`. Entities carry `Date`, not ISO strings.
- `postgresStore.ts` — the Postgres replacement, built but wired to no handler (`docs/postgres-repositories-plan.md`). Declares its own interface and entities, challenge-scoped and different from the Firestore ones, so the two share nothing. `db/` owns the pool and `inTransaction`; `common/pgErrors.ts` maps a SQLSTATE to a `DomainError` by constraint name. Takes the `store.ts` name once Firestore is retired.
- `handler.ts` — an `xHandlers(...repos)` factory returning a plain object of closures. Never a class: `callable(x.method, …)` passes the method unbound, so `this` would be lost.
- `present.ts` — the response DTO and its mapper. Owns ISO encoding and the book flattening.

Rules:

- `index.ts` is the composition root and the only module that names a concrete repository. Handler dependency parameters are suffixed `*Repo`.
- Inner layers throw `DomainError` (`common/errors.ts`); `callable.ts` maps it to an `HttpsError` at the boundary. A `corrupt` message is never forwarded to the caller.
- `config/` and `feedback/` keep free functions — they have no repository dependencies. `tags/` has no `handler.ts` or `present.ts` yet, and no Firestore `store.ts` at all: the vocabulary arrives with challenges.
- Handler tests use a fake repository whose methods reject unless overridden, so an unexpected call fails loudly.
- **Nothing in a challenge's subtree is deleted implicitly.** Every foreign key reaching `challenges` is `on delete restrict`, as are `reading_tags` and `tbr_entry_tags` against their parent row. The `cascade` is absent on purpose, not forgotten: `challenges.remove` deletes memberships, tags and the join code by name, and readings and TBR entries refuse it outright. Clearing history is an explicit ordered script that does not exist yet (`docs/postgres-repositories-plan.md`, open decision 2).
- `*.db.test.ts` runs only under `pnpm run test:db`, against the Docker Postgres and never in `verify` or CI. It needs `docker compose up -d --wait` and `functions/.env.local`; an edited migration also needs `docker compose down` first, because `schema_migrations` survives the suite's own reset.

One deviation is deliberate:

- **Responses flatten the book** as `bookTitle`/`bookAuthor`/`bookMetadata`. The target is a nested `book: Book`, matching what `getLibrary` and `fetchBookDetails` already return. It is the only non-backward-compatible change pending and needs a coordinated `deploy:all`.

## Git

Use conventional commit format (the PR title becomes the squashed commit message):

- `feat: add score calculation for multi-tag books`
- `fix: prevent duplicate category assignment`
- `test: add edge cases for freebie book scoring`
- `refactor: extract validation into shared utility`
- `docs: update scoring plan with diminishing returns formula`
