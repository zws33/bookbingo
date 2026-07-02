/**
 * Seed a real Firebase project (staging) with reproducible, non-trivial data:
 * shared books, multiple personas, readings, and TBR lists — matching the
 * CURRENT production write shapes (see docs/STAGING_DATA.md and the data model).
 *
 * The app is Google-sign-in only, so this writes Firestore docs only (no Auth):
 * seeded data is visible to anyone via the world-readable leaderboard / community
 * library. To populate YOUR personal dashboard, pass --claim so the densest
 * persona's data is written under your staging uid.
 *
 * Usage:
 *   pnpm exec tsx scripts/seed-staging.ts [--project <id>] [--wipe] [--dry-run]
 *                                         [--claim <email> | --claim-uid <uid>]
 *
 * Examples:
 *   pnpm exec tsx scripts/seed-staging.ts --dry-run
 *   pnpm exec tsx scripts/seed-staging.ts --wipe --claim me@example.com
 */
export {};
//# sourceMappingURL=seed-staging.d.ts.map