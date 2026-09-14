import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanQuery,
  scoreCandidate,
  isEmptyMetadata,
  REVIEW_THRESHOLD,
} from './matching.js';

// =============================================================================
// cleanQuery
// =============================================================================

test('cleanQuery flips "Last, First" author order', () => {
  assert.equal(cleanQuery('', 'Rivera, Tomás').author, 'Tomás Rivera');
});

test('cleanQuery leaves an already "First Last" author alone', () => {
  assert.equal(cleanQuery('', 'Tomás Rivera').author, 'Tomás Rivera');
});

test('cleanQuery strips a subtitle after ":" into titleNoSubtitle', () => {
  const cleaned = cleanQuery('Mistborn: The Final Empire', 'Brandon Sanderson');
  assert.equal(cleaned.title, 'Mistborn: The Final Empire');
  assert.equal(cleaned.titleNoSubtitle, 'Mistborn');
});

// =============================================================================
// scoreCandidate
// =============================================================================

test('an author-name typo still matches (Abercombie / Abercrombie)', () => {
  const result = scoreCandidate({
    title: 'The Blade Itself',
    author: 'Joe Abercombie',
    candidateTitle: 'The Blade Itself',
    candidateAuthor: 'Joe Abercrombie',
  });
  assert.ok(result.authorScore >= REVIEW_THRESHOLD);
  assert.notEqual(result.status, 'none');
});

test('a title typo still matches (Pheonix / Phoenix)', () => {
  const result = scoreCandidate({
    title: 'Pheonix',
    author: 'A. Author',
    candidateTitle: 'Phoenix',
    candidateAuthor: 'A. Author',
  });
  assert.ok(result.titleScore >= REVIEW_THRESHOLD);
  assert.notEqual(result.status, 'none');
});

test('identical low-signal placeholder text never matches', () => {
  const result = scoreCandidate({
    title: 'test',
    author: 'test',
    candidateTitle: 'test',
    candidateAuthor: 'test',
  });
  assert.equal(result.status, 'none');
});

test('a "Last, First" doc author scores against its own last name', () => {
  const result = scoreCandidate({
    title: 'Wonder Boys',
    author: 'Chabon, Michael',
    candidateTitle: 'Wonder Boys',
    candidateAuthor: 'Michael Chabon',
  });
  assert.equal(result.status, 'auto');
});

test('unrelated books score none', () => {
  const result = scoreCandidate({
    title: 'Dune',
    author: 'Frank Herbert',
    candidateTitle: 'Emma',
    candidateAuthor: 'Jane Austen',
  });
  assert.equal(result.status, 'none');
});

// =============================================================================
// isEmptyMetadata
// =============================================================================

const EMPTY_METADATA_SHAPE = {
  pageCount: null,
  publishedDate: null,
  categories: [],
  language: null,
  isbn: null,
  thumbnailUrl: null,
};

test('EMPTY_METADATA counts as empty', () => {
  assert.equal(isEmptyMetadata(EMPTY_METADATA_SHAPE), true);
});

test('a missing metadata field counts as empty', () => {
  assert.equal(isEmptyMetadata(undefined), true);
});

test('metadata with a real field is not empty', () => {
  assert.equal(
    isEmptyMetadata({ ...EMPTY_METADATA_SHAPE, pageCount: 300 }),
    false,
  );
});
