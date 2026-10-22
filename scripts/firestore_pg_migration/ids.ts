import { createHash } from 'node:crypto';
import { IMPORT_NAMESPACE } from './constants.js';

const NAMESPACE_BYTES = Buffer.from(IMPORT_NAMESPACE.replace(/-/g, ''), 'hex');

/**
 * A uuid v5 of a Firestore document path. Postgres stores no Firestore id for
 * readings and TBR entries, so the path is the only stable identity available:
 * deriving the primary key from it is what lets a rerun upsert the row it wrote
 * last time instead of inserting a second copy.
 */
export function importId(path: string): string {
  const bytes = createHash('sha1')
    .update(NAMESPACE_BYTES)
    .update(path, 'utf8')
    .digest()
    .subarray(0, 16);

  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
