/**
 * Phase 2 Migration Script: Backfill Reading bookId
 *
 * This script identifies readings that are missing a bookId (legacy data)
 * and matches them against the shared /books/ collection, creating new
 * book documents as needed.
 *
 * Usage:
 *   tsx scripts/migrate-readings.ts --project <project-id> [--dry-run]
 *
 * Examples:
 *   tsx scripts/migrate-readings.ts --project bookbingo-staging --dry-run
 *   tsx scripts/migrate-readings.ts --project bookbingo-staging
 *   tsx scripts/migrate-readings.ts --project bookbingo-3fdb1
 */
export {};
//# sourceMappingURL=migrate-readings.d.ts.map