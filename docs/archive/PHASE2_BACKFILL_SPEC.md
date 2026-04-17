# Specification: Phase 2 Backfill Script (Data Migration)

## Objective
Migrate historical reading documents from the denormalized model (`bookTitle`/`bookAuthor`) to the normalized model (`bookId` referencing the shared `/books/` collection).

## Migration Logic
The script must iterate through all readings and perform the following steps for each document missing a valid `bookId`:

1.  **Normalize Input:** Clean the `bookTitle` and `bookAuthor` from the reading document (trim and lowercase).
2.  **Lookup/Match:**
    *   Query the `/books/` collection for a document matching the normalized `titleLower` and `authorLower`.
    *   If a match exists, use its ID.
    *   If no match exists, create a new shared book document using the original casing from the reading.
3.  **Update Reading:** Write the resolved `bookId` back to the reading document. **Do not** delete the legacy `bookTitle`/`bookAuthor` fields yet (that happens in Phase 3).

## Edge Cases & Rules
- **Missing Legacy Data:** If a reading has neither `bookId` nor `bookTitle`, log a warning and skip (manual intervention required).
- **Deduplication:** The script must handle the same book appearing across multiple users' readings by correctly resolving them to a single shared `/books/` document.
- **Race Conditions:** Since users may be active during migration, the script must skip any reading that already has a `bookId` populated by the app's dual-write logic.

## Technical Requirements
- **Environment:** Node.js script using `firebase-admin` SDK.
- **Authentication:** Must run with service account credentials (local) or via Firebase Functions/Admin context.
- **Batching:** Use `WriteBatch` to perform updates in chunks (max 500 per batch) for performance and Firestore limits.
- **Safety Flags:**
    *   `--dry-run`: Log all intended changes without writing to the database.
    *   `--limit <n>`: Stop after processing `n` documents for incremental testing.
- **Idempotency:** The script must be safe to run multiple times. It only processes documents that do not yet satisfy the normalized state.

## Verification Plan
1.  **Dry Run:** Verify logs correctly identify legacy readings and match them to (real or planned) books.
2.  **Emulator Test:** Run against the local emulator with seeded legacy data and verify `bookId` population.
3.  **Staging Run:** Execute in the staging environment and verify no data corruption occurred.
