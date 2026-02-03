# Book Bingo Web App - Implementation Plan (V0)

## Overview

Build a React-based Progressive Web App (PWA) for the Book Bingo competition. This extends the existing vanilla JS core engine with a modern web frontend and Firebase backend.

## Current State

**Already Built:**
- Core scoring engine (`lib/core/`) - portable, pure JS
- Data layer abstraction (`lib/data/`) - pluggable stores
- CLI (`app/cli/`) - command-line interface
- 49 tile definitions with validation rules
- Comprehensive test suite (50 tests)

**V0 Target:**
- Firebase Authentication
- Book CRUD (view, filter, add, edit, delete)
- Mobile-first responsive design
- PWA support
- Firebase Hosting deployment

---

## Architecture Decision Records

### ADR-1: Monorepo Structure

**Decision:** Organize into `app/` (deployables) and `lib/` (shared packages).

**Rationale:**
- Clear separation between executables and reusable code
- Core scoring engine can be imported by any app
- Shared types/constants without publishing packages
- Scales to additional apps (server, mobile) cleanly

**Structure:**
```
bookbingo/
├── app/                    # Deployable applications
│   ├── web/               # React PWA (V0 target)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── lib/       # Firebase config, utilities
│   │   │   └── App.tsx
│   │   ├── public/
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── cli/               # Command-line interface
│       └── index.js
├── lib/                    # Shared packages
│   ├── core/              # Portable scoring logic
│   └── data/              # Data layer abstractions
└── docs/
```

### ADR-2: Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Build** | Vite | Fast HMR, excellent React support, PWA plugin |
| **Framework** | React 18 | Hooks, Suspense, concurrent features |
| **Language** | TypeScript | Type safety, better DX, catches errors early |
| **Styling** | Tailwind CSS | Mobile-first utilities, rapid prototyping |
| **Auth** | Firebase Auth | Google/Email sign-in, free tier sufficient |
| **Database** | Cloud Firestore | Real-time sync, offline support, scales with Firebase |
| **Hosting** | Firebase Hosting | Free tier, automatic SSL, CDN, easy deploys |
| **PWA** | vite-plugin-pwa | Service worker, manifest, offline support |

### ADR-3: State Management

**Decision:** `react-firebase-hooks` + Context API (for non-Firebase state only)

**Rationale:**
- Firestore already provides real-time sync, caching, and offline persistence
- `react-firebase-hooks` is the most popular library for Firebase + React (~300k weekly npm downloads)
- Provides idiomatic hooks: `useAuthState`, `useCollection`, `useDocument`
- Context API only needed for UI preferences (not server state)

**Key Hooks from `react-firebase-hooks`:**
```typescript
import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollection, useDocument } from 'react-firebase-hooks/firestore';

// Auth state
const [user, loading, error] = useAuthState(auth);

// Real-time collection (auto-updates)
const [snapshot, loading, error] = useCollection(
  collection(db, 'users', userId, 'books')
);

// Single document
const [snapshot, loading, error] = useDocument(
  doc(db, 'users', userId)
);
```

### ADR-4: Data Model (Firestore)

```
/books/{bookId}
  - title: string
  - author: string
  - createdAt: timestamp
  - createdBy: userId (who first added it)

/users/{userId}
  - name: string
  - email: string
  - createdAt: timestamp

/users/{userId}/readings/{readingId}
  - bookId: string (reference to /books/{bookId})
  - bookTitle: string (denormalized for queries)
  - bookAuthor: string (denormalized for queries)
  - tiles: string[] (max 3, unless freebie)
  - isFreebie: boolean
  - readAt: timestamp
  - createdAt: timestamp
  - updatedAt: timestamp

/tiles (read-only collection)
  - id: string
  - name: string
  - isManual: boolean
```

**Rationale:**
- Books are top-level entities with shared metadata (title, author)
- User-specific data (tiles, freebie, readAt) stored in `/users/{userId}/readings`
- Enables future book deduplication (V1+) - two users reading same book can share metadata
- All users can see what others are reading (for leaderboard/social features)

**Security Rules:**
- `/books` - readable by all authenticated users, writable only by creator (`createdBy == request.auth.uid`)
- `/users/{userId}` - readable by all authenticated users, writable only by owner
- `/users/{userId}/readings` - readable by all authenticated users, writable only by owner
- `/tiles` - readable by authenticated users, writable only by admin

---

## Implementation Phases

### Phase 0: Codebase Restructure & TypeScript Migration

**Goal:** Reorganize existing code to target structure and convert to TypeScript

#### Phase 0a: Restructure Package Layout

**Tasks:**
1. Create new directory structure (`app/`, `lib/`)
2. Move `src/core/` → `lib/core/`
3. Move `src/data/` → `lib/data/`
4. Move `src/index.js` → `app/cli/index.js`
5. Update import paths
6. Update root `package.json` scripts to point to new locations
7. Verify all tests pass

**Deliverables:**
- New folder structure in place
- CLI still works (`npm start`)
- All tests pass (`npm test`)

**Structure After:**
```
bookbingo/
├── app/
│   └── cli/
│       └── index.js
├── lib/
│   ├── core/
│   │   ├── index.js
│   │   ├── constants.js
│   │   ├── scoring.js
│   │   ├── statistics.js
│   │   └── validation.js
│   └── data/
│       ├── index.js
│       ├── memory.js
│       └── json-file.js
└── docs/
```

#### Phase 0b: TypeScript Migration

**Tasks:**
1. Add TypeScript dependencies to root `package.json`
2. Create `tsconfig.json` with appropriate settings
3. Define shared types in `lib/types/`
4. Convert `lib/core/*.js` → `lib/core/*.ts`
5. Convert `lib/data/*.js` → `lib/data/*.ts`
6. Convert `app/cli/index.js` → `app/cli/index.ts`
7. Update test files to `.ts`
8. Update build/lint scripts for TypeScript
9. Verify all tests pass

**Type Definitions (lib/types/index.ts):**
```typescript
export interface Tile {
  id: string;
  name: string;
  isManual: boolean;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  createdAt: Date;
  createdBy: string;
}

export interface Reading {
  id: string;
  bookId: string;
  bookTitle: string;   // denormalized
  bookAuthor: string;  // denormalized
  tiles: string[];
  isFreebie: boolean;
  readAt: Date;
  createdAt: Date;
  updatedAt?: Date;
}

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface ScoreBreakdown {
  basePoints: number;
  balanceMultiplier: number;
  finalScore: number;
  tileCounts: Record<string, number>;
}
```

**Deliverables:**
- All code converted to TypeScript
- Shared type definitions in `lib/types/`
- Type-safe imports across packages
- All tests pass
- Linting passes

**Files After:**
```
bookbingo/
├── app/
│   └── cli/
│       └── index.ts
├── lib/
│   ├── types/
│   │   └── index.ts
│   ├── core/
│   │   ├── index.ts
│   │   ├── constants.ts
│   │   ├── scoring.ts
│   │   ├── statistics.ts
│   │   ├── validation.ts
│   │   └── *.test.ts
│   └── data/
│       ├── index.ts
│       ├── memory.ts
│       ├── json-file.ts
│       └── *.test.ts
├── tsconfig.json
└── package.json
```

---

### Phase 1: Project Setup & Authentication

**Goal:** Scaffolded React app with Firebase Auth working

**Tasks:**
1. Initialize Vite + React + TypeScript in `app/web/`
2. Configure Tailwind CSS
3. Set up Firebase project (console.firebase.google.com)
4. Implement Firebase Auth (Google + Email/Password)
5. Create protected routes using `useAuthState` from `react-firebase-hooks/auth`
6. Build Login/Register pages

**Deliverables:**
- `app/web/` directory with working dev server
- Users can sign in/out
- Protected routes redirect to login
- Auth state persisted across refreshes

**Files:**
```
app/web/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── ProtectedRoute.tsx
│   │   └── Layout.tsx
│   ├── pages/
│   │   ├── Login.tsx
│   │   └── Register.tsx
│   └── lib/
│       └── firebase.ts
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── postcss.config.js
```

**Note:** No custom AuthContext needed - `useAuthState` from `react-firebase-hooks/auth` handles auth state directly.

### Phase 2: Book List & Filtering

**Goal:** Display user's books with author filter

**Tasks:**
1. Set up Firestore and security rules
2. Use `useCollection` from `react-firebase-hooks/firestore` for real-time book data
3. Build BookList component (responsive grid/list)
4. Add author filter (search input with debounce, client-side filtering)
5. Display book count and basic stats

**Deliverables:**
- Users see their books on home page
- Filter by author name (case-insensitive)
- Empty state for new users
- Loading and error states

**Files:**
```
app/web/src/
├── components/
│   ├── BookList.tsx
│   ├── BookCard.tsx
│   ├── SearchFilter.tsx
│   └── EmptyState.tsx
└── pages/
    └── Home.tsx
```

**Example Usage:**
```typescript
// Home.tsx - fetch user's readings with denormalized book data
const [user] = useAuthState(auth);
const [readingsSnapshot] = useCollection(
  user ? collection(db, 'users', user.uid, 'readings') : null
);

const readings = readingsSnapshot?.docs.map(doc => ({
  id: doc.id,
  ...doc.data()
})) ?? [];

// Filter by author (using denormalized field)
const filtered = readings.filter(r =>
  r.bookAuthor.toLowerCase().includes(authorFilter.toLowerCase())
);
```

**Note:** For V0, denormalize `bookTitle` and `bookAuthor` into the reading document to avoid joins. This simplifies filtering and display. Book deduplication (V1) will reconcile this.

### Phase 3: Book CRUD Operations

**Goal:** Full create, read, update, delete for books

**Tasks:**
1. Build AddBook form (title, author fields)
2. Build EditBook form (pre-populated)
3. Implement delete with confirmation
4. Form validation (required fields)
5. Toast notifications for success/error

**Deliverables:**
- "Add Book" button opens modal/drawer
- Click book to edit
- Delete with confirmation dialog
- Real-time UI updates (Firestore handles this automatically)

**Files:**
```
app/web/src/
├── components/
│   ├── BookForm.tsx          # Shared add/edit form
│   ├── Modal.tsx
│   ├── ConfirmDialog.tsx
│   └── Toast.tsx
└── pages/
    ├── AddBook.tsx           # Or modal
    └── EditBook.tsx
```

**Example CRUD Operations:**
```typescript
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

// Create book + reading (with denormalized fields)
const bookRef = await addDoc(collection(db, 'books'), {
  title, author, createdAt: serverTimestamp(), createdBy: userId
});
await addDoc(collection(db, 'users', userId, 'readings'), {
  bookId: bookRef.id,
  bookTitle: title,      // denormalized
  bookAuthor: author,    // denormalized
  tiles: [], isFreebie: false,
  readAt: serverTimestamp(), createdAt: serverTimestamp()
});

// Update reading (user-specific data)
await updateDoc(doc(db, 'users', userId, 'readings', readingId), {
  tiles, isFreebie, updatedAt: serverTimestamp()
});

// Delete reading
await deleteDoc(doc(db, 'users', userId, 'readings', readingId));
```

**Note:** No custom hooks needed for mutations - Firebase SDK is already simple. The `useCollection` hook automatically reflects changes after mutations.

### Phase 4: PWA Setup

**Goal:** Installable PWA with offline support

**Tasks:**
1. Configure vite-plugin-pwa
2. Create app manifest (icons, theme colors)
3. Generate PWA icons (multiple sizes)
4. Configure service worker caching strategy
5. Add "install app" prompt
6. Test offline behavior

**Deliverables:**
- App installable on mobile/desktop
- Works offline (shows cached data)
- App icon on home screen
- Proper splash screen

**Files:**
```
app/web/
├── public/
│   ├── manifest.json
│   ├── icons/
│   │   ├── icon-192.png
│   │   ├── icon-512.png
│   │   └── apple-touch-icon.png
│   └── favicon.ico
└── vite.config.ts            # PWA plugin config
```

### Phase 5: Deployment & Polish

**Goal:** Production-ready deployed application

**Tasks:**
1. Configure Firebase Hosting
2. Set up GitHub Actions for CI/CD
3. Environment variables (Firebase config)
4. Error boundary and 404 page
5. Loading skeletons
6. Accessibility audit (a11y)
7. Performance optimization (lazy loading, code splitting)

**Deliverables:**
- Live URL on Firebase Hosting
- Auto-deploy on push to main
- Error tracking setup
- Core Web Vitals passing

**Files:**
```
bookbingo/
├── .github/
│   └── workflows/
│       └── deploy.yml
└── app/web/
    ├── firebase.json
    ├── .firebaserc
    └── src/
        ├── components/
        │   └── ErrorBoundary.tsx
        └── pages/
            └── NotFound.tsx
```

---

## Detailed Component Specifications

### Authentication Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Landing   │────▶│    Login     │────▶│    Home     │
│   (Public)  │     │  (Firebase)  │     │ (Protected) │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   Register   │
                    │  (Firebase)  │
                    └──────────────┘
```

**Auth Methods:**
1. Google Sign-In (recommended, one-click)
2. Email/Password (fallback)

### Book List UI (Mobile-First)

```
┌────────────────────────────────┐
│  📚 Book Bingo           [👤]  │  <- Header with profile
├────────────────────────────────┤
│  🔍 Filter by author...        │  <- Search input
├────────────────────────────────┤
│  ┌────────────────────────┐   │
│  │ Book Title             │   │
│  │ by Author Name         │   │
│  │ 🏷️ Tile1, Tile2        │   │
│  └────────────────────────┘   │
│  ┌────────────────────────┐   │
│  │ Another Book           │   │
│  │ by Different Author    │   │
│  │ 🏷️ Tile3               │   │
│  └────────────────────────┘   │
│           ...                  │
├────────────────────────────────┤
│         [+ Add Book]           │  <- FAB or bottom button
└────────────────────────────────┘
```

### Book Form (Add/Edit)

```
┌────────────────────────────────┐
│  Add Book              [✕]    │
├────────────────────────────────┤
│  Title *                       │
│  ┌────────────────────────┐   │
│  │                        │   │
│  └────────────────────────┘   │
│                                │
│  Author *                      │
│  ┌────────────────────────┐   │
│  │                        │   │
│  └────────────────────────┘   │
│                                │
│  ┌────────────────────────┐   │
│  │       Save Book        │   │
│  └────────────────────────┘   │
└────────────────────────────────┘
```

Note: Tile assignment deferred to V1 (per V0 scope: just title + author)

---

## Firebase Setup Guide

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create new project: "book-bingo" (or similar)
3. Disable Google Analytics (optional for MVP)

### 2. Enable Authentication

1. Authentication → Sign-in method
2. Enable **Google** provider
3. Enable **Email/Password** provider
4. Add authorized domain for production

### 3. Create Firestore Database

1. Firestore Database → Create database
2. Start in **production mode**
3. Choose region (us-central1 recommended)

### 4. Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Books - all authenticated users can read, only creator can write
    match /books/{bookId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null
        && resource.data.createdBy == request.auth.uid;
    }

    // Users - all authenticated can read, only owner can write
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;

      // Readings - all authenticated can read, only owner can write
      match /readings/{readingId} {
        allow read: if request.auth != null;
        allow write: if request.auth != null && request.auth.uid == userId;
      }
    }

    // Tiles are read-only for authenticated users
    match /tiles/{tileId} {
      allow read: if request.auth != null;
      allow write: if false; // Admin-only via console
    }
  }
}
```

### 5. Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Select existing project
# Public directory: dist
# Single-page app: yes
# GitHub Actions: yes (optional)
```

### 6. Environment Variables

Create `app/web/.env.local`:
```
VITE_FIREBASE_API_KEY=xxx
VITE_FIREBASE_AUTH_DOMAIN=xxx.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=xxx
VITE_FIREBASE_STORAGE_BUCKET=xxx.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=xxx
VITE_FIREBASE_APP_ID=xxx
```

---

## Deployment Strategy

### Development
```bash
cd app/web
npm run dev          # Vite dev server with HMR
```

### Preview (Production Build)
```bash
npm run build        # Build to /dist
npm run preview      # Preview production build locally
```

### Production Deploy
```bash
firebase deploy --only hosting
```

### CI/CD (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
name: Deploy to Firebase

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: app/web/package-lock.json

      - name: Install dependencies
        run: cd app/web && npm ci

      - name: Build
        run: cd app/web && npm run build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          # ... other env vars

      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          channelId: live
          projectId: your-project-id
          entryPoint: ./app/web
```

---

## Out of Scope for V0

The following features are intentionally deferred:

| Feature | Reason | Target Version |
|---------|--------|----------------|
| Tile assignment UI | Focus on book CRUD first | V1 |
| Score display | Needs tile assignment | V1 |
| Leaderboard | Needs scoring | V1 |
| Freebie designation | Needs tile assignment | V1 |
| Book deduplication | Complexity (matching logic); V0 creates new book per reading | V1 |
| Push notifications | Nice-to-have | V2 |
| Social sharing | Nice-to-have | V2 |
| Dark mode | Nice-to-have | V1 |
| Book cover images | Complexity (storage) | V2 |

---

## Success Criteria

### V0 Complete When:

- [ ] User can sign in with Google or email
- [ ] User can view their book list
- [ ] User can filter books by author name
- [ ] User can add a new book (title + author)
- [ ] User can edit an existing book
- [ ] User can delete a book
- [ ] App is responsive (works on mobile and desktop)
- [ ] App is installable as PWA
- [ ] App is deployed to Firebase Hosting
- [ ] All linting passes
- [ ] Core Web Vitals are green

---

## Migration Notes

### Reusing Core Engine

After Phase 0, `lib/core/` and `lib/types/` are TypeScript modules. The web app imports them directly:

**Configuration (app/web/vite.config.ts):**
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, '../../lib/core'),
      '@types': path.resolve(__dirname, '../../lib/types'),
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### Data Layer Transition

Current: `lib/data/json-file.ts` (local file, used by CLI)
Target: Firestore (cloud, used by web app)

The React app uses Firebase SDK directly with `react-firebase-hooks` for real-time subscriptions, following standard Firebase + React patterns. Shared types from `lib/types/` ensure consistency between CLI and web app.

---

## Appendix: Package Dependencies

### app/web/package.json (Initial)

```json
{
  "name": "book-bingo-web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0",
    "firebase": "^10.8.0",
    "react-firebase-hooks": "^5.1.1"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.17",
    "eslint": "^8.56.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.5",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.3.0",
    "vite": "^5.1.0",
    "vite-plugin-pwa": "^0.19.0"
  }
}
```

---

## Resolved Questions

| Question | Answer |
|----------|--------|
| Firebase project name | Book Bingo |
| Color scheme / branding | Sensible defaults |
| Auth method | Google only |
| Domain name | Default `*.web.app` (free) |

## Open Questions

1. **Firebase account ready?** (need to create project before Phase 1)
