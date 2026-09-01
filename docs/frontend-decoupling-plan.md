# Frontend Decoupling Plan

Refactors that turn the challenge-model migration (`firestore-challenge-model-plan.md`, Phase 4) from a scattered edit into a localized one. Do these **before** the migration; each stands alone and ships to `main` without a data change.

## The coupling today

| Coupling | Where | Why it blocks the migration |
|---|---|---|
| Firestore path shape is written literally | 17 call sites (`useReadings`, `useAllReadings`, `useBooks`, `useTBR`, `lib/books.ts`, `lib/tbr.ts`) | Moving readings to `/challenges/{cid}/readings` means editing every one in lockstep |
| Scoring runs in the UI over full collections | `MyBooksPage`, `UserBooksPage`, `LeaderboardPage` each call `getScoreBreakdown` directly; leaderboard pulls all users' readings via `collectionGroup` | Three independent call sites; no seam to scope by challenge or move server-side |
| Vocabulary + cap are compile-time imports | `TileSelector` imports `TILES`, `MAX_TILES_PER_BOOK` | Challenge-scoped tags make these runtime data that must be fetched and injected |
| No data-root context | `userId` threaded as a prop from `App.tsx` through every route | `challengeId` would need the same manual threading everywhere |

## Refactors, ordered by leverage

### 1. Repository seam (highest leverage)
One module (`app/web/src/data/`) owns every `collection`/`doc`/`collectionGroup` path. Hooks and write functions name an intent against a **scope object**, never a path literal.

```ts
// data/scope.ts
type Scope = { kind: 'user'; userId: string }; // migration adds { kind: 'challenge'; challengeId }
// data/readings.ts
export const readingsPath = (s: Scope) => /* the one place the path lives */;
export const watchReadings = (s: Scope) => collection(db, ...);
export const createReading = (s: Scope, ...) => addDoc(...);
```

After this, migration Phase 4 is: change `readingsPath` and the `Scope` type. Nothing else moves.

### 2. Scope provider
`ChallengeContext` supplies the active scope. Today it returns a hardcoded default (user-scope); the migration swaps its internals to read a selected `challengeId`. Removes prop-threading and gives one switch to flip. Auth already lives in `App.tsx` with no provider — add this alongside.

### 3. Single scoring call site
Extract `useScoreBreakdown(readings)` and `useLeaderboard()` so scoring has **one** call site each. This is a prerequisite for any later server-side move — you cannot cleanly relocate three scattered `getScoreBreakdown` calls. Keep the computation in `lib/` (unchanged).

### 4. Inject vocabulary + cap
`TileSelector` takes `tiles` and `tagCap` as props (or from `useChallengeConfig()`), not imports. Validation (`canAssignTile`) takes the cap as a parameter — already flagged in the migration plan's `lib/core/src/validation.ts` change.

## On moving logic to Cloud Functions

Reads and writes deserve opposite decisions.

- **Writes → callable functions: yes, eventually.** `createReading`/`promoteTBREntry` are where challenge membership + per-challenge cap must be enforced server-side. Route them through the repository seam (#1) now; the function is a drop-in behind the same interface later. Not required before the migration — rules can gate ownership/membership without a function.
- **Scoring reads → functions: no.** `useCollection` gives live recomputation for free; the leaderboard re-scores on every write with no polling. A function forfeits that and adds latency + cold-start for a computation that is cheap and already correct in `lib/`. Keep it client-side behind #3; revisit only if a challenge's reading set grows past what the client should download.

## Sequencing

1. Repository seam (#1) — no behavior change, pure indirection.
2. Scope provider (#2) — no behavior change.
3. Scoring hooks (#3) + inject config (#4).
4. *Then* run the challenge-model migration; Phase 4 becomes a `Scope`/path edit.

## Risks

- The seam is only worth it if **every** path goes through it — a stray `collection(db, ...)` in a component defeats the point. Add an ESLint `no-restricted-imports` rule blocking `firebase/firestore` outside `app/web/src/data/`.
- Over-abstracting the repository (generic CRUD for one collection) is the failure mode. Model concrete intents (`watchReadings`, `createReading`), not a generic ORM.
