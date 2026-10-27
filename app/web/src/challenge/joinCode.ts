/**
 * A mirror of `functions/src/challenges/joinCode.ts`, minus the generator.
 * The client normalizes so the field accepts a code as it was read aloud or
 * pasted with its separator, and checks the shape so an obvious typo fails
 * without a round trip. The server normalizes and matches again.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const JOIN_CODE_LENGTH = 8;

export const JOIN_CODE_PATTERN = new RegExp(
  `^[${ALPHABET}]{${JOIN_CODE_LENGTH}}$`,
);

export function normalizeJoinCode(input: string): string {
  return input
    .replace(/[\s-]/g, '')
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/** Grouped in fours for reading aloud. `normalizeJoinCode` strips the space again. */
export function formatJoinCode(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}
