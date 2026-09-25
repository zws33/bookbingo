import { randomBytes } from 'node:crypto';

/** no I, L, O or U for ease of being read aloud. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const JOIN_CODE_LENGTH = 6;

export function generateJoinCode(): string {
  const bytes = randomBytes(JOIN_CODE_LENGTH);
  return Array.from(bytes, (byte) => ALPHABET.charAt(byte & 31)).join('');
}

export function normalizeJoinCode(input: string): string {
  return input
    .replace(/[\s-]/g, '')
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}
