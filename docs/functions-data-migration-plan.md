# Functions Data Migration Plan

Moves every Firestore read and write, plus scoring, validation, and the tile catalog, from `app/web` into `functions/`. The client keeps only Firebase Auth and callables. Runs before `docs/firestore-challenge-model-plan.md`, so that plan's path changes become server-only.

## Decisions

1. **Transport is `onCall` callables**, matching the existing four functions.
2. **Client caching is TanStack Query.** Mutations invalidate affected query keys. Realtime `onSnapshot` updates are dropped; queries refetch on window focus.
3. **Region is `northamerica-northeast1`**, colocated with Firestore. Set via `setGlobalOptions` in `functions/src/index.ts` and `getFunctions(app, region)` in the client.
4. **`lib/core` moves to `functions/src/domain/` and is deleted.** Functions deploy as a standalone npm install, so runtime `workspace:*` imports are impossible (`deploy-manifest.test.ts`). `lib/types` stays shared because its imports are type-only.
5. **The server computes scores.** `ScoreBreakdown.tileCounts` becomes `Record<string, number>` so it serializes.
6. **The tile catalog is served by `getBoardConfig`** as `{ tiles, maxTilesPerBook }`, cached with `staleTime: Infinity`. The client uses the cap only to disable extra picks; the server enforces it.
7. **Caller identity comes from `request.auth.uid`.** Client functions drop `userId` for the caller's own data. `syncMyProfile` reads name and photo from ID token claims.
8. **Responses carry instants as ISO strings.** Client zod response schemas parse them to `Date`.
9. **End-state rules deny all client access.** The Admin SDK bypasses rules.

## Endpoints

| Callable                                                              | Replaces                                              | Server enforces                                                              |
| --------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `getBoardConfig()`                                                    | `TILES`, `getTileById`, `MAX_TILES_PER_BOOK`          | —                                                                            |
| `getBooks({ ids })`                                                   | `getBooksById`                                        | —                                                                            |
| `listReadings({ userId })` → `{ readings, score }`                    | `subscribeToReadings`, `getScoreBreakdown`            | —                                                                            |
| `listAllReadings()`                                                   | `subscribeToAllReadings` (Library)                    | —                                                                            |
| `getLeaderboard()` → `{ userId, name, photoURL, score, bookCount }[]` | `useUsers` + `useAllReadings` + scoring (Leaderboard) | —                                                                            |
| `listUsers()`, `getUserProfile({ userId })`                           | `subscribeToUsers`, `subscribeToUserProfile`          | —                                                                            |
| `syncMyProfile()`                                                     | `saveUserProfile`                                     | Profile fields from token claims                                             |
| `createReading`, `updateReading`, `deleteReading`                     | same names                                            | Known tile ids, no duplicates, cap unless freebie, one freebie (transaction) |
| `listMyTBR`, `createTBREntry`, `updateTBREntry`, `deleteTBREntry`     | same names                                            | Known tile ids                                                               |
| `promoteTBREntry`                                                     | same name                                             | Reading rules; single batch; `readingId = tbrId`                             |

## Ordered steps

Each step is one commit that leaves the app working.

0. Commit this plan.
1. **Region move.** Update server and client region.
   - `deploy:functions:staging`; answer **no** when the CLI offers to delete the `us-central1` functions.
   - `deploy:staging`.
   - `firebase functions:delete submitFeedback fetchBookDetails searchBooks createManualBook --region us-central1 --project staging`.
   - Repeat for prod.
2. **Copy `lib/core/src/*` to `functions/src/domain/`** with tests. Scoring logic is frozen until step 9 so the copies cannot drift.
3. **Server helpers.** `requireAuth` and `parseRequest`; move Firestore document read schemas and `mapValid` from `app/web/src/data/schemas.ts`.
4. **Server endpoints**, additive, in order: config, books, users, readings + leaderboard, TBR. Deploy functions.
5. **Client: config and books.** Add `QueryClientProvider` and `useBoardConfig`; switch `BingoBoard`, `BookRow`, `TileBadge`, `TileSelector`; `BookList` uses `useBooksByIds`.
6. **Client: users, profile, leaderboard.** `App.tsx` calls `syncMyProfile`; `LeaderboardPage` uses `getLeaderboard`.
7. **Client: readings.** `MyBooksPage` and `UserBooksPage` read the score from the response. Mutations invalidate `['readings', uid]`, `['allReadings']`, `['leaderboard']`.
8. **Client: TBR.** Promote also invalidates reading keys.
9. **Cleanup.**
   - Remove `db` and `connectFirestoreEmulator` from `app/web/src/lib/firebase.ts`.
   - Move `AuthUserSchema` beside `lib/auth.ts`; wrap `FeedbackModal`'s callable in `lib/`.
   - ESLint `no-restricted-imports` for `firebase/firestore` and `@bookbingo/lib-core` in `app/web/src`.
   - Delete `lib/core` and its references: root `tsconfig.json`, `tsconfig.build.json`, `typecheck` script, `app/web/package.json`, `app/web/tsconfig.json`, `eslint.config.js`, `README.md`, `.github/copilot-instructions.md`, `docs/firestore-challenge-model-plan.md`.
10. **Rules lockdown.** `firestore.rules` → `allow read, write: if false`; deploy separately after the step 9 hosting build is live. Update access rules in `docs/firestore-schema.md`.

## Validation

- Moved `lib/core` tests pass unchanged under `functions/`.
- Score parity: record staging leaderboard scores before step 6; `getLeaderboard` matches after step 7.
- Handler tests per mutation: unauthenticated, invalid argument, another user's id, unknown tile, 4th tile, second freebie.
- `readings.int.test.ts` and `tbr.int.test.ts` seed via `firebase-admin` and exercise callables.
- After step 10: client SDK read and write return `permission-denied`.
- `git grep -E "firebase/firestore|lib-core" app/web/src` is empty; `pnpm run verify` passes.

## Risks

- **No live updates.** Other users' readings appear on refetch; own writes appear after invalidation, not instantly.
- **Stale tabs break** when `us-central1` functions are deleted (step 1) and when rules lock (step 10). Leave a gap between deploy and delete.
- **Cold starts** apply to several parallel reads per page load. Fallback: merge reads per page or set `minInstances` on hot endpoints (cost).
