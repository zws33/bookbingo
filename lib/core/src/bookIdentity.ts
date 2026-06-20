/**
 * Deterministic book identity.
 *
 * A book's Firestore document id is a pure function of its identity:
 *   - catalog book: hash("openLibrary:" + workKey)
 *   - manual book:  hash("manual:" + normTitle + "|" + normAuthor)
 *
 * Because the id is deterministic, deduplication is a `getDoc` on the computed
 * id rather than a query, and the create race (issue #7) closes by construction
 * — concurrent creates target the same id and converge.
 *
 * FROZEN CONTRACT. The normalization pipeline and hash below must not change
 * once books are migrated: changing them changes every derived id and silently
 * re-introduces duplicates. bookIdentity.test.ts is the source of truth; treat
 * edits here as a data-migration event. See
 * docs/decisions/book-identity-and-deduplication.md.
 */

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
 * cyrb53 — a fast, well-distributed 53-bit hash, rendered base36 (~11 chars of
 * [0-9a-z], always a legal Firestore doc id). Synchronous and dependency-free
 * so the app (browser) and the migration script (Node) derive identical ids,
 * unlike async SubtleCrypto. 53 bits makes collisions negligible at this
 * catalog's scale; a collision would silently merge two distinct books.
 */
function hashKey(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(36);
}
