import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import z from 'zod/v4';
import { logWarning } from '../observability.js';

/**
 * Primitives shared by every domain's read-time document schema. The only
 * reader of Firestore is this package, so those schemas describe every
 * document the app has ever written, not just what it writes today.
 *
 * Bad documents go to Cloud Logging rather than `@bookbingo/lib-util`: a
 * runtime import of a workspace package fails in the deployed function (see
 * deploy-manifest.test.ts).
 */

/** Structural, so both admin and client Timestamps satisfy it. */
export const FirestoreTimestamp = z.custom<{ toDate(): Date }>(
  (v) => typeof (v as { toDate?: unknown })?.toDate === 'function',
);

/** Required instant. null/undefined means a pending serverTimestamp() write. */
export const ServerInstant = FirestoreTimestamp.nullish().transform(
  (t) => t?.toDate() ?? new Date(),
);

/** Optional instant. Output key is typed `Date | undefined`; spread it conditionally. */
export const OptionalInstant = FirestoreTimestamp.nullish().transform((t) =>
  t?.toDate(),
);

/**
 * Maps a snapshot's documents, dropping any that fail validation.
 * One malformed document must not blank an entire collection-group read.
 */
export function mapValid<T>(
  label: string,
  docs: QueryDocumentSnapshot[],
  map: (doc: QueryDocumentSnapshot) => T,
): T[] {
  const out: T[] = [];
  for (const doc of docs) {
    try {
      out.push(map(doc));
    } catch (error) {
      logWarning('document.invalid', error, { label, path: doc.ref.path });
    }
  }
  return out;
}

/** Firestore reports an update to a missing document as NOT_FOUND (code 5). */
export function isNotFound(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 5;
}
