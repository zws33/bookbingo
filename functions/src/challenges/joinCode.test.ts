import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  JOIN_CODE_LENGTH,
  JOIN_CODE_TTL_MS,
  expiresAtFrom,
  generateJoinCode,
  isExpired,
  normalizeJoinCode,
} from './joinCode.js';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SAMPLE = Array.from({ length: 2000 }, generateJoinCode);

describe('generateJoinCode', () => {
  test(`is ${JOIN_CODE_LENGTH} characters`, () => {
    for (const code of SAMPLE) {
      assert.equal(code.length, JOIN_CODE_LENGTH);
    }
  });

  test('uses only the Crockford alphabet', () => {
    for (const code of SAMPLE) {
      for (const character of code) {
        assert.ok(ALPHABET.includes(character), `unexpected ${character}`);
      }
    }
  });

  test('never emits the characters the alphabet omits', () => {
    for (const code of SAMPLE) {
      assert.doesNotMatch(code, /[ILOU]/);
    }
  });

  test('does not repeat itself across a sample', () => {
    assert.equal(new Set(SAMPLE).size, SAMPLE.length);
  });

  test('reaches every position of the alphabet, so no bits are stuck', () => {
    const seen = new Set(SAMPLE.join(''));
    assert.equal(seen.size, ALPHABET.length);
  });

  test('draws every character position from the full alphabet', () => {
    for (let index = 0; index < JOIN_CODE_LENGTH; index += 1) {
      const seen = new Set(SAMPLE.map((code) => code[index]));
      assert.ok(
        seen.size > ALPHABET.length / 2,
        `position ${index} only produced ${seen.size} distinct characters`,
      );
    }
  });
});

describe('normalizeJoinCode', () => {
  test('uppercases', () => {
    assert.equal(normalizeJoinCode('abcdef23'), 'ABCDEF23');
  });

  test('reads O as zero', () => {
    assert.equal(normalizeJoinCode('OOPS1234'), '00PS1234');
  });

  test('reads I and L as one', () => {
    assert.equal(normalizeJoinCode('ILL23456'), '11123456');
  });

  test('drops separators and surrounding space', () => {
    assert.equal(normalizeJoinCode(' 1234-5678 '), '12345678');
  });

  test('leaves a generated code untouched', () => {
    for (const code of SAMPLE) {
      assert.equal(normalizeJoinCode(code), code);
    }
  });
});

describe('expiresAtFrom', () => {
  test('is 72 hours after creation', () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    assert.equal(
      expiresAtFrom(createdAt).toISOString(),
      '2026-01-04T00:00:00.000Z',
    );
  });

  test('matches the exported TTL', () => {
    const createdAt = new Date('2026-06-15T09:30:00Z');
    assert.equal(
      expiresAtFrom(createdAt).getTime() - createdAt.getTime(),
      JOIN_CODE_TTL_MS,
    );
  });
});

describe('isExpired', () => {
  const expiresAt = new Date('2026-01-04T00:00:00Z');

  test('a code before its expiry is usable', () => {
    assert.equal(isExpired(expiresAt, new Date('2026-01-03T23:59:59Z')), false);
  });

  test('the expiry instant itself is expired', () => {
    assert.ok(isExpired(expiresAt, new Date('2026-01-04T00:00:00Z')));
  });

  test('after expiry is expired', () => {
    assert.ok(isExpired(expiresAt, new Date('2026-01-04T00:00:01Z')));
  });
});
