import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveBookId, normalizeForKey } from './bookIdentity.js';

// =============================================================================
// normalizeForKey — the frozen pipeline
// =============================================================================

test('normalizeForKey folds case', () => {
  assert.equal(normalizeForKey('The Hobbit'), normalizeForKey('the hobbit'));
});

test('normalizeForKey strips whitespace and punctuation', () => {
  assert.equal(normalizeForKey('  the   hobbit! '), 'thehobbit');
  assert.equal(normalizeForKey('Catch-22'), 'catch22');
});

test('normalizeForKey folds diacritics (NFKD + strip marks)', () => {
  assert.equal(normalizeForKey('Les Misérables'), normalizeForKey('Les Miserables'));
  assert.equal(normalizeForKey('Les Misérables'), 'lesmiserables');
});

test('normalizeForKey does NOT strip leading articles', () => {
  assert.notEqual(normalizeForKey('The Hobbit'), normalizeForKey('Hobbit'));
});

// =============================================================================
// deriveBookId — catalog books
// =============================================================================

test('catalog id is deterministic for the same Work key', () => {
  const a = deriveBookId({ openLibraryKey: '/works/OL166894W', title: 'x', author: 'y' });
  const b = deriveBookId({ openLibraryKey: '/works/OL166894W', title: 'x', author: 'y' });
  assert.equal(a, b);
});

test('catalog id ignores title/author — only the Work key matters', () => {
  const a = deriveBookId({ openLibraryKey: '/works/OL166894W', title: 'Crime and Punishment', author: 'Dostoevsky' });
  const b = deriveBookId({ openLibraryKey: '/works/OL166894W', title: 'totally different', author: 'someone else' });
  assert.equal(a, b);
});

test('different Work keys produce different ids', () => {
  const a = deriveBookId({ openLibraryKey: '/works/OL1W', title: 't', author: 'a' });
  const b = deriveBookId({ openLibraryKey: '/works/OL2W', title: 't', author: 'a' });
  assert.notEqual(a, b);
});

test('blank/whitespace openLibraryKey falls back to the manual path', () => {
  const blank = deriveBookId({ openLibraryKey: '   ', title: 'The Hobbit', author: 'Tolkien' });
  const manual = deriveBookId({ title: 'The Hobbit', author: 'Tolkien' });
  assert.equal(blank, manual);
});

// =============================================================================
// deriveBookId — manual books
// =============================================================================

test('manual id is deterministic', () => {
  const a = deriveBookId({ title: 'The Hobbit', author: 'J.R.R. Tolkien' });
  const b = deriveBookId({ title: 'The Hobbit', author: 'J.R.R. Tolkien' });
  assert.equal(a, b);
});

test('manual id dedups case/diacritic/punctuation variants', () => {
  const a = deriveBookId({ title: 'Les Misérables', author: 'Victor Hugo' });
  const b = deriveBookId({ title: 'les miserables', author: 'victor  hugo!' });
  assert.equal(a, b);
});

test('manual id does NOT fold author initials (deliberate)', () => {
  const a = deriveBookId({ title: 'A Wizard of Earthsea', author: 'U. K. Le Guin' });
  const b = deriveBookId({ title: 'A Wizard of Earthsea', author: 'Ursula K. Le Guin' });
  assert.notEqual(a, b);
});

test('manual id keeps the title/author boundary distinct', () => {
  const a = deriveBookId({ title: 'Go', author: 'Dog' });
  const b = deriveBookId({ title: 'God', author: 'og' });
  assert.notEqual(a, b);
});

// =============================================================================
// Domain separation and id shape
// =============================================================================

test('catalog and manual key spaces are domain-separated', () => {
  // A manual book whose normalized key equals an OL key string must still differ.
  const catalog = deriveBookId({ openLibraryKey: 'worksOL1W', title: 't', author: 'a' });
  const manual = deriveBookId({ title: 'worksOL1W', author: '' });
  assert.notEqual(catalog, manual);
});

test('derived id is a legal Firestore document id', () => {
  for (const id of [
    deriveBookId({ openLibraryKey: '/works/OL166894W', title: 't', author: 'a' }),
    deriveBookId({ title: 'The Hobbit', author: 'Tolkien' }),
  ]) {
    assert.match(id, /^[0-9a-z]+$/);
    assert.ok(!id.includes('/'));
    assert.ok(id.length > 0 && id.length <= 1500);
  }
});
