/**
 * Book Identity Migration: re-key /books/ to deterministic document IDs.
 *
 * Bridges the legacy book schema (random doc IDs, singular `externalId`,
 * `titleLower`/`authorLower`) to the deterministic-ID model
 * (see docs/decisions/book-identity-and-deduplication.md):
 *
 *   1. For each /books/{oldId}, compute its deterministic id via the SAME
 *      `deriveBookId` the app uses (imported from @bookbingo/lib-core — no
 *      hand-duplicated normalization).
 *   2. Collapse docs that share a derived id into one canonical /books/{newId}
 *      (prefer the OL-bearing doc's metadata, keep the earliest createdAt,
 *      carry the external reference as the new `externalIds` map).
 *   3. Re-point every reference — `users/*\/readings/*.bookId` AND
 *      `users/*\/tbr/*.bookId` — from old id to new id.
 *
 * Two-pass and reversible: the default run does NOT delete old docs. Once refs
 * are re-pointed, stale old docs have zero readings and are hidden by the
 * LibraryPage `readCount === 0` filter. Run again with --cleanup to delete them.
 *
 * Idempotent and resumable: re-running computes the same ids (it reads the OL
 * key from either the legacy `externalId` or the migrated `externalIds`), so
 * already-migrated docs are no-ops.
 *
 * MIGRATION-FIRST: run this against an environment BEFORE deploying the
 * deterministic `getOrCreateBook`. Deploying first opens a window where adding
 * an existing (legacy-id) book mints a fresh duplicate.
 *
 * Usage:
 *   tsx scripts/migrate-book-identity.ts --project <project-id> [--dry-run]
 *   tsx scripts/migrate-book-identity.ts --project <project-id> --cleanup [--dry-run]
 *
 * Examples:
 *   tsx scripts/migrate-book-identity.ts --project bookbingo-staging --dry-run
 *   tsx scripts/migrate-book-identity.ts --project bookbingo-staging
 *   tsx scripts/migrate-book-identity.ts --project bookbingo-staging --cleanup --dry-run
 */
export {};
//# sourceMappingURL=migrate-book-identity.d.ts.map