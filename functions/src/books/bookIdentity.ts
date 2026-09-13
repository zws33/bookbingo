import { createHash } from 'node:crypto';

export interface BookIdentity {
  /**
   * Open Library Work key, e.g. "/works/OL166894W". When present, the book is
   * identified by this key and title/author are ignored for id derivation.
   */
  openLibraryKey?: string | null;
  title: string;
  author: string;
}

/**
 * Compute the deterministic document id for a book.
 *
 * The "openLibrary:" / "manual:" input prefixes domain-separate the two key
 * spaces so they can never collide. The raw `openLibraryKey` (slashes included)
 * is safe as hash input even though "/" is illegal in a Firestore doc id.
 */
export function deriveBookId(identity: BookIdentity): string {
  const key = identity.openLibraryKey?.trim();
  if (key) {
    return hashKey(`openLibrary:${key}`);
  }
  // The "|" separator preserves the title/author boundary so that
  // ("Go","Dog") and ("God","og") cannot collide after stripping.
  return hashKey(
    `manual:${normalizeForKey(identity.title)}|${normalizeForKey(identity.author)}`,
  );
}

/**
 * Frozen normalization for manual identity keys, applied to title and author
 * independently: lowercase, decompose (NFKD), drop combining marks (folds
 * diacritics: "é" -> "e"), then strip everything that is not a letter or digit
 * (removes whitespace and punctuation).
 *
 * Deliberately conservative: it does NOT strip leading articles or fold author
 * initials, to avoid irreversible over-merge of distinct works/authors.
 */
export function normalizeForKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * First 128 bits of sha256, as 32 hex chars (always a legal Firestore doc id).
 * Frozen: changing it changes every book id and requires a data migration.
 */
function hashKey(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 32);
}
