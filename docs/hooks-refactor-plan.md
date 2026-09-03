# Hooks Refactor Plan: Extract Data Access to Repository Layer

This document outlines the architectural refactoring plan to extract all data access logic from hooks in `@app/web/src/hooks/` into repository implementations in `@app/web/src/data/`.

The goal is to achieve clean layering where hooks depend only on the data layer, not directly on Firebase or `react-firebase-hooks`.

Reference commits:

- `8305241` - refactor: back useBooks with a subscribeToBooks repository seam
- `1af08d9` - refactor: back useReadings with a subscribeToReadings repository seam

---

## Already Refactored

- **useBooks.ts** - uses `subscribeToBooks` from `../data/books`
- **useReadings.ts** - uses `subscribeToReadings` from `../data/readings`

---

## Remaining Hooks to Refactor

- **useAllReadings.ts** → Create `data/allReadings.ts`
  - Define `AllReadingsRepository` interface with `subscribeToAllReadings(onData, onError) => unsubscribe`
  - Implement `subscribeToAllReadings` using `collectionGroup(db, 'readings')` with `onSnapshot`
  - Add `toReading` helper that extracts `userId` from doc ref path (`doc.ref.parent.parent?.id`) and maps to `Reading`
  - Return `Map<string, Reading[]>` grouped by userId
  - Hook becomes thin wrapper: calls repository, manages `readingsByUser`, `loading`, `error` state

- **useTBR.ts** → Create `data/tbr.ts`
  - Define `TBRRepository` interface with `subscribeToTBR(userId, onData, onError) => unsubscribe`
  - Implement `subscribeToTBR` using `collection(db, 'users', userId, 'tbr')` with `onSnapshot`
  - Add `toTBREntry` helper that maps Firestore doc to `TBREntry` with id
  - Hook becomes thin wrapper: calls repository, manages `entries`, `loading`, `error` state, handles empty `userId` case

- **useUsers.ts** → Create `data/users.ts`
  - Define `UsersRepository` interface with `subscribeToUsers(onData, onError) => unsubscribe`
  - Implement `subscribeToUsers` using `collection(db, 'users')` with `onSnapshot`
  - Add `toUserProfile` helper that maps Firestore doc to `UserProfile` with id, name, photoURL
  - Hook becomes thin wrapper: calls repository, manages `users`, `loading`, `error` state

- **useUserProfile.ts** → Create `data/userProfile.ts`
  - Define `UserProfileRepository` interface with `subscribeToUserProfile(userId, onData, onError) => unsubscribe`
  - Implement `subscribeToUserProfile` using `doc(db, 'users', userId)` with `onSnapshot`
  - Add `toUserProfile` helper (reusable from users.ts) that maps Firestore doc snapshot to `UserProfile`
  - Hook becomes thin wrapper: calls repository, manages `profile`, `loading`, `error` state, handles undefined snapshot case
