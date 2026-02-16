# User Books View — Implementation Plan

View another user's book list in read-only mode, with user search. Stepping stone toward a leaderboard.

## Overview

- Add `react-router-dom` for URL-based navigation
- Convert existing tab switching to routes
- Store user profiles in Firestore on sign-in
- Add user search page and read-only book list view for any user
- Update Firestore security rules

## Steps

### Step 1: Install `react-router-dom`

Add the dependency to `app/web/`.

- **Files**: `app/web/package.json`
- **Change**: `pnpm add react-router-dom --filter @bookbingo/web`

### Step 2: Wrap the app in `<BrowserRouter>` and convert tabs to routes

Replace `useState`-based tab switching with React Router.

- **Files**: `app/web/src/main.tsx`, `app/web/src/App.tsx`
- **Changes**:
  - In `main.tsx`: wrap `<App />` in `<BrowserRouter>`
  - In `App.tsx`: replace `activeTab` state with `<Routes>` and `<Route>`:
    - `/` — books view
    - `/board` — bingo board view
  - Convert tab buttons to `<NavLink>` components

### Step 3: Extract page components from `App.tsx`

Move the books view (BookList + FAB + add modal) into its own page component.

- **Files**: new `app/web/src/pages/MyBooksPage.tsx`, `app/web/src/App.tsx`
- **Changes**:
  - Move FAB, add modal, `handleAddBook`, and `<BookList>` into `MyBooksPage`
  - `App.tsx` becomes a layout shell: header, nav, `<Routes>`

### Step 4: Add `readOnly` prop to `BookList`, `BookCard`, and `BookRow`

- **Files**: `BookList.tsx`, `BookCard.tsx`, `BookRow.tsx`
- **Changes**:
  - Add optional `readOnly?: boolean` to each props interface
  - `BookCard`: when `readOnly`, remove `onClick`, cursor/hover styles, `role`, `tabIndex`
  - `BookRow`: same
  - `BookList`: when `readOnly`, skip edit modal, delete dialog, and `onClick` handlers

### Step 5: Write user profile to Firestore on sign-in

- **Files**: new `app/web/src/lib/users.ts`, `app/web/src/App.tsx`, `app/web/src/types/index.ts`
- **Changes**:
  - `users.ts`: `saveUserProfile(user)` — `setDoc` with `{ name, photoURL, updatedAt }` using `{ merge: true }`
  - Call `saveUserProfile` after successful sign-in in `App.tsx`
  - Add `UserProfile` interface to `types/index.ts`
- **Data**: uses `user.displayName` and `user.photoURL` from Google Auth

### Step 6: Build user search page

- **Files**: new `app/web/src/pages/UsersPage.tsx`, new `app/web/src/hooks/useUsers.ts`, `app/web/src/App.tsx`
- **Changes**:
  - `useUsers` hook: queries `/users` collection, returns all profiles
  - `UsersPage`: search input + filtered user list, each user links to `/users/:userId`
  - Add `/users` route and "People" nav link in `App.tsx`
- **Notes**: client-side filtering is fine for small user base

### Step 7: Build the "view user's books" page

- **Files**: new `app/web/src/pages/UserBooksPage.tsx`, new `app/web/src/hooks/useUserProfile.ts`, `app/web/src/App.tsx`
- **Changes**:
  - `UserBooksPage`: uses `useParams()` for `userId`, `useReadings(userId)` for books, `useUserProfile(userId)` for name
  - Renders header with first name (e.g., "Sarah's Books") and `<BookList readOnly />`
  - Includes back link to `/users`
  - Add `/users/:userId` route in `App.tsx`
- **New hook**: `useUserProfile(userId)` fetches single doc from `/users/{userId}`

### Step 8: Update Firestore security rules

- **Files**: `app/web/firestore.rules`
- **Changes**:
  - Any authenticated user can read any user's profile and readings
  - Users can only write their own profile and readings

## Out of Scope

- Leaderboard
- Scoring display on user books page
- Bingo board view for other users
- Full-text search (client-side filtering is sufficient for now)

## Risks

- **First name extraction**: `displayName` from Google is typically "First Last" — split on space, take first token. Fall back to "User" if missing.
- **Initial data**: existing users won't have profile docs until they sign in again after this change.
