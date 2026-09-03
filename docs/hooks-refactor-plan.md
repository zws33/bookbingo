# Hooks Refactor: Data Access in the Repository Layer

**Status: complete.** Every Firestore read in `app/web/src/hooks/` now goes through a module in `app/web/src/data/`. Book, reading, and TBR **writes** followed (`books-data-consolidation-plan.md`); `lib/users.ts` is the only Firestore access left outside `data/`.

## Rules

1. Hooks and components import from `../data/*` only — never `firebase/firestore`, `../lib/firebase`, or `react-firebase-hooks/firestore`.
2. A repository exports `subscribeToX(…, onData, onError) => unsubscribe` and a `XRepository` interface describing it. Writes live in the same module as the reads for their collection and are listed in the same interface.
3. Mapping Firestore documents to domain types lives in the repository (`toBook`, `toReading`, `toTBREntry`, `toUserProfile`), not the hook.
4. Mappers tolerate a pending `serverTimestamp()` (null until the write lands) by falling back to `new Date()`.
5. Hooks own `loading` / `error` / data state, clear `error` on a good snapshot, and log through `log.debug` / `log.error` under their own name.
6. A hook taking a `userId` returns empty and does not subscribe when it is blank — an empty path segment throws in Firestore.
7. Repository tests mock `firebase/firestore`; hook tests mock the repository. Neither loads both.

## Layout

| Hook             | Repository                                       | Query                                            |
| ---------------- | ------------------------------------------------ | ------------------------------------------------ |
| `useBooks`       | `data/books.ts` → `subscribeToBooks`             | `/books`                                         |
| `useReadings`    | `data/readings.ts` → `subscribeToReadings`       | `/users/{id}/readings`, `readAt desc`            |
| `useAllReadings` | `data/readings.ts` → `subscribeToAllReadings`    | `readings` collection group, grouped by owner id |
| `useTBR`         | `data/tbr.ts` → `subscribeToTBR`                 | `/users/{id}/tbr`, `addedAt desc`                |
| `useUsers`       | `data/users.ts` → `subscribeToUsers`             | `/users`                                         |
| `useUserProfile` | `data/userProfile.ts` → `subscribeToUserProfile` | `/users/{id}`                                    |

Writes are grouped by the collection they touch, not by the feature that calls them:

| Write                                                  | Repository         | Target                                            |
| ------------------------------------------------------ | ------------------ | ------------------------------------------------- |
| `getOrCreateBook`                                      | `data/books.ts`    | `/books/{deriveBookId(...)}`                      |
| `createReading` / `updateReading` / `deleteReading`    | `data/readings.ts` | `/users/{id}/readings`                            |
| `createTBREntry` / `updateTBREntry` / `deleteTBREntry` | `data/tbr.ts`      | `/users/{id}/tbr`                                 |
| `promoteTBREntry`                                      | `data/tbr.ts`      | batch: `/users/{id}/readings` + `/users/{id}/tbr` |

`promoteTBREntry` writes across both collections in one `writeBatch`, so it cannot call `createReading` (which commits its own write). It imports `readingsCollection` and `newReadingFields` from `data/readings.ts` instead, keeping the readings path and document shape in one module.

`subscribeToAllReadings` shares `data/readings.ts` with the per-user query rather than getting its own module, so both reuse `toReading`.

`toUserProfile` lives in `data/users.ts` and is reused by `data/userProfile.ts`. It takes a `DocumentSnapshot`, not a `QueryDocumentSnapshot`, so the single-document read can pass its snapshot through.

## Contracts worth not re-deriving

- `useUserProfile` returns `profile: undefined` both while loading and when `/users/{id}` does not exist. A missing profile is a normal outcome — the leaderboard links to any user id present in the readings collection group. Callers must check `loading` before treating an absent profile as "not found".
- `data/readings.ts` also exports `getReadingsByUser`, a one-shot `getDocs` fetch for non-reactive callers (scoring, exports, integration tests).

## Out of scope

`App.tsx` still uses `react-firebase-hooks/auth` for `useAuthState`. This plan covered Firestore reads only; the auth seam is untouched.

`lib/users.ts` (`saveUserProfile`, called from the auth flow) still writes `/users/{id}` directly. Until it moves, the `no-restricted-imports` rule blocking `firebase/firestore` outside `data/` cannot be enabled.

## Reference commits

| Commit    | Change                                                                |
| --------- | --------------------------------------------------------------------- |
| `1af08d9` | `useReadings` seam — the template                                     |
| `8305241` | `useBooks` seam                                                       |
| `31ecf2d` | `useTBR` and `useAllReadings` seams                                   |
| `78af58b` | Corrections to `31ecf2d` (blank-userId guard, naming, error handling) |
