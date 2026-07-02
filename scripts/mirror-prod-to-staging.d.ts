/**
 * Mirror a snapshot of prod into staging via a programmatic Admin-SDK copy.
 *
 * Reads the SOURCE (prod) read-only and writes the DEST (staging, guarded so it
 * can never be prod). Books are copied verbatim (deterministic ids, no PII).
 * User profile names are anonymized by default. One persona's readings/TBR are
 * re-keyed to YOUR staging uid so your personal dashboard is populated.
 *
 * The app is Google-only, so Auth is intentionally NOT mirrored (prod uids
 * wouldn't match a staging Google login). See docs/STAGING_DATA.md.
 *
 * Usage:
 *   pnpm exec tsx scripts/mirror-prod-to-staging.ts [--from <id>] [--to <id>]
 *        [--wipe] [--no-anonymize] [--dry-run] [--claim <email> | --claim-uid <uid>]
 *
 * Examples:
 *   pnpm exec tsx scripts/mirror-prod-to-staging.ts --dry-run
 *   pnpm exec tsx scripts/mirror-prod-to-staging.ts --wipe --claim me@example.com
 */
export {};
//# sourceMappingURL=mirror-prod-to-staging.d.ts.map