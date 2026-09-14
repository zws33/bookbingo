/**
 * Pure helpers for the metadata backfill: search-query cleaning, candidate
 * scoring, and the "does this book already have metadata" predicate shared
 * with the identity migration and the missing-metadata finder. No I/O.
 */

import { normalizeForKey } from '../../functions/src/books/bookIdentity.js';

// =============================================================================
// Query cleaning
// =============================================================================

export interface CleanedQuery {
  title: string;
  /** Title with a `: subtitle` suffix removed, for a second search tier. */
  titleNoSubtitle: string;
  author: string;
}

const LAST_COMMA_FIRST = /^([^,]+),\s*(.+)$/;

/** NFKC + whitespace collapse, "Last, First" -> "First Last", subtitle strip. */
export function cleanQuery(title: string, author: string): CleanedQuery {
  const cleanTitle = collapseWhitespace(title.normalize('NFKC'));
  const cleanAuthor = flipLastFirst(
    collapseWhitespace(author.normalize('NFKC')),
  );
  const [beforeColon] = cleanTitle.split(':');

  return {
    title: cleanTitle,
    titleNoSubtitle: collapseWhitespace(beforeColon ?? cleanTitle),
    author: cleanAuthor,
  };
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function flipLastFirst(author: string): string {
  const match = author.match(LAST_COMMA_FIRST);
  if (!match) return author;
  const [, last, first] = match;
  return `${first} ${last}`;
}

/** The last whitespace-separated token, used to compare authors by surname. */
export function lastName(author: string): string {
  const parts = author.trim().split(/\s+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : '';
}

// =============================================================================
// Scoring
// =============================================================================

export type MatchStatus = 'auto' | 'review' | 'none';

export const AUTO_THRESHOLD = 0.9;
export const REVIEW_THRESHOLD = 0.7;

/**
 * Tokens that must never auto- or review-match on their own, however well
 * they score — an identical "test" title or author is a coincidence between
 * placeholder rows, not evidence the books are the same.
 */
const LOW_SIGNAL_TOKENS = new Set([
  'test',
  'todo',
  'tbd',
  'unknown',
  'placeholder',
]);

export interface ScoreCandidateInput {
  title: string;
  author: string;
  candidateTitle: string;
  candidateAuthor: string;
}

export interface ScoreResult {
  titleScore: number;
  authorScore: number;
  /** min(titleScore, authorScore) — both must clear a threshold, not either. */
  score: number;
  status: MatchStatus;
}

/**
 * Edit-distance ratio on normalizeForKey'd titles, and on author last names.
 * Authors are flipped out of "Last, First" order first — same as the search
 * query cleaning — so a comma-formatted doc author scores against its last
 * name correctly instead of against a fragment of its first name.
 */
export function scoreCandidate(input: ScoreCandidateInput): ScoreResult {
  const titleKey = normalizeForKey(input.title);
  const candidateTitleKey = normalizeForKey(input.candidateTitle);
  const authorKey = normalizeForKey(lastName(flipLastFirst(input.author)));
  const candidateAuthorKey = normalizeForKey(
    lastName(flipLastFirst(input.candidateAuthor)),
  );

  const titleScore = similarityRatio(titleKey, candidateTitleKey);
  const authorScore = similarityRatio(authorKey, candidateAuthorKey);
  const score = Math.min(titleScore, authorScore);

  const lowSignal =
    LOW_SIGNAL_TOKENS.has(titleKey) || LOW_SIGNAL_TOKENS.has(authorKey);

  const status: MatchStatus = lowSignal
    ? 'none'
    : score >= AUTO_THRESHOLD
      ? 'auto'
      : score >= REVIEW_THRESHOLD
        ? 'review'
        : 'none';

  return { titleScore, authorScore, score, status };
}

/** 1 - (Levenshtein distance / longer length); 1.0 for two empty strings. */
export function similarityRatio(a: string, b: string): number {
  if (a === '' && b === '') return 1;
  return 1 - levenshteinDistance(a, b) / Math.max(a.length, b.length);
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prevRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const currRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j]! + 1,
        currRow[j - 1]! + 1,
        prevRow[j - 1]! + cost,
      );
    }
    prevRow = currRow;
  }
  return prevRow[b.length]!;
}

// =============================================================================
// Empty-metadata predicate
// =============================================================================

/**
 * True when every metadata field is null/empty — covers both a missing
 * `metadata` field and EMPTY_METADATA (createManualBook's default), which is
 * itself a truthy object and would otherwise look "present."
 */
export function isEmptyMetadata(
  metadata: Record<string, unknown> | undefined,
): boolean {
  if (!metadata) return true;
  return Object.values(metadata).every(
    (value) => value == null || (Array.isArray(value) && value.length === 0),
  );
}
