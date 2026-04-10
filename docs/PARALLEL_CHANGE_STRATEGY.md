# Strategic Implementation Plan: Parallel Change Data Migration

This document outlines the strategy for moving BookBingo from a denormalized data model (`bookTitle` and `bookAuthor` embedded in every reading) to a normalized model (a shared `/books/` collection).

We are using the **Parallel Change (Expand-Migrate-Contract)** pattern to achieve zero downtime, backward compatibility, and a safe rollback path.

## The Problem with "Big Bang"
A "Big Bang" migration cuts over the types, the read/write logic, and the UI all at once. If legacy data (readings without a `bookId`) exists when the new UI is deployed, users see errors or "Unknown Book" fallbacks. This creates a hard dependency between deploying code and running the data migration script.

## The Parallel Change Strategy

### Phase 1: Expand (Compatibility & Dual Writes)
**Goal:** Stabilize the application. Ensure it can read both old and new data shapes, and write data in a forward-compatible way.

**Strategic Impact:** This decouples the code deployment from the data migration. Once Phase 1 is deployed, the app is safe, and the background data migration can take as long as it needs.

**Implementation Steps:**
1.  **Relax Constraints on the `Reading` Type:** Re-introduce `bookTitle` and `bookAuthor` to the `Reading` interface as *optional* fields (`?`). This acknowledges reality: legacy data exists.
2.  **Dual Writing (The "Expand" Action):** Modify the `createReading` and `updateReading` functions. They must now:
    *   Resolve the shared `bookId` (via `getOrCreateBook`).
    *   Write the new `bookId` to the reading document.
    *   **Crucially:** Also continue to write the legacy `bookTitle` and `bookAuthor` strings to the reading document.
3.  **Cooperative UI (Dual Reading):** Update any component that displays a book title/author (e.g., `BookList`, `BingoBoard`, `BookCard`). The logic should be a cooperative cascade:
    *   *First Choice:* Look up the shared book using `booksById.get(reading.bookId)`.
    *   *Fallback:* Use `reading.bookTitle`.
    *   *Last Resort:* Use `'Unknown Book'`.

**Definition of Done for Phase 1:** The app compiles. Tests pass. When a user adds a book, both the shared `bookId` and the raw string fields are written to their reading document.

---

### Phase 2: Migrate (The Background Backfill)
**Goal:** Move historical data into the new normalized model without impacting active users.

**Strategic Impact:** Because Phase 1 is in place, we don't have to take the app offline. If a user creates a reading while the script is running, the dual-write logic ensures the new reading is already fully migrated.

**Implementation Steps:**
1.  **Develop the Backfill Script:** Create a standalone Node script (using the Firebase Admin SDK) that:
    *   Queries all readings (`collectionGroup('readings')`).
    *   Identifies readings missing a `bookId` (or where the `bookId` doesn't resolve to a valid `/books/` doc).
    *   Uses the normalization logic (`titleLower`, `authorLower`) to find or create the correct shared `/books/` document.
    *   Updates the reading with the new `bookId`.
2.  **Idempotency & Safety:** The script must be safe to interrupt and restart. It must include a `--dry-run` flag to log intended changes without committing them. Use `WriteBatch` for efficient updates.
3.  **Execution:** Run the script against the local emulator, then staging, then production.

**Definition of Done for Phase 2:** Every reading document in the database has a valid `bookId` that points to an existing document in the `/books/` collection.

---

### Phase 3: Contract (The Cleanup)
**Goal:** Remove the "scaffolding" introduced in Phase 1 to permanently reduce system complexity.

**Strategic Impact:** This is where we pay down the technical debt we intentionally took on during the Expand phase. We finalize the transition to the clean, normalized architecture.

**Implementation Steps:**
1.  **Stop Dual Writing:** Update `createReading` and `updateReading` to *stop* writing the `bookTitle` and `bookAuthor` fields to the reading documents.
2.  **Tighten Constraints on the `Reading` Type:** Remove the optional `bookTitle` and `bookAuthor` fields from the `Reading` interface entirely.
3.  **Remove UI Fallbacks:** Update UI components to strictly rely on `booksById.get(reading.bookId)`. Remove the `reading.bookTitle` fallback logic.
4.  **Data Scouring (Optional but Recommended):** Run a final, destructive script to delete the `bookTitle` and `bookAuthor` fields from all reading documents in Firestore to save storage space and prevent future developer confusion.

**Definition of Done for Phase 3:** The codebase is entirely unaware of the legacy data shape. Tests pass using only the new normalized data model.
