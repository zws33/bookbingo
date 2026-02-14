import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { calculateScore, getScoreBreakdown } from './scoring.js';
import type { UserBook } from '@bookbingo/lib-types';

test('Scoring Core', async (t) => {
  await t.test('calculateScore', async (t) => {
    await t.test('should return 0 for a user with no books', () => {
      const userBooks: UserBook[] = [];
      assert.equal(calculateScore(userBooks), 0);
    });

    await t.test('should calculate the correct score for a single book in one tile', () => {
      const userBooks: UserBook[] = [
        {
          id: '1',
          userId: 'user1',
          title: 'The Hobbit',
          author: 'J.R.R. Tolkien',
          tiles: ['t01'],
          isFreebie: false,
          readAt: new Date(),
        },
      ];
      // BasePoints = 1 + log2(1) = 1
      // BalanceMultiplier = 1 / (1 + 0^2) = 1
      // Score = 1 * 1 = 1
      assert.equal(calculateScore(userBooks), 1);
    });

    await t.test('should calculate the correct score for multiple books in the same tile', () => {
      const userBooks = [
        { title: 'Book 1', tiles: ['t01'] },
        { title: 'Book 2', tiles: ['t01'] },
        { title: 'Book 3', tiles: ['t01'] },
        { title: 'Book 4', tiles: ['t01'] },
      ] as UserBook[];
      // BasePoints = 1 + log2(4) = 3
      // BalanceMultiplier = 1
      // Score = 3 * 1 = 3
      assert.equal(calculateScore(userBooks), 3);
    });

    await t.test('should calculate a lower score for an unbalanced reader', () => {
      // 2 books in each of 5 tiles, 10 books in one tile (20 books, 6 tiles)
      const unbalancedBooks: UserBook[] = [];
      for (let i = 0; i < 5; i++) {
        unbalancedBooks.push({ title: `Book ${i}`, tiles: [`t${i + 1}`] } as UserBook);
        unbalancedBooks.push({ title: `Book ${i + 5}`, tiles: [`t${i + 1}`] } as UserBook);
      }
      for (let i = 0; i < 10; i++) {
        unbalancedBooks.push({ title: `Book ${i + 10}`, tiles: ['t06'] } as UserBook);
      }

      // 1 book in each of 20 tiles (perfectly balanced)
      const balancedBooks: UserBook[] = [];
      for (let i = 0; i < 20; i++) {
        balancedBooks.push({ title: `Book ${i}`, tiles: [`t${i + 1}`] } as UserBook);
      }

      const unbalancedScore = calculateScore(unbalancedBooks);
      const balancedScore = calculateScore(balancedBooks);

      assert.ok(unbalancedScore < balancedScore);
    });
  });

  await t.test('getScoreBreakdown', async (t) => {
    await t.test('should return zeroed breakdown for empty input', () => {
      const breakdown = getScoreBreakdown([]);

      assert.equal(breakdown.score, 0);
      assert.equal(breakdown.basePoints, 0);
      assert.equal(breakdown.balanceMultiplier, 1);
      assert.equal(breakdown.totalBooks, 0);
      assert.equal(breakdown.tileCounts.size, 0);
    });

    await t.test('should return correct breakdown for a balanced reader', () => {
      // 1 book per tile across 3 tiles
      const books = [
        { title: 'Book 1', tiles: ['t01'] },
        { title: 'Book 2', tiles: ['t02'] },
        { title: 'Book 3', tiles: ['t03'] },
      ] as UserBook[];

      const breakdown = getScoreBreakdown(books);

      // BasePoints: 3 tiles * (1 + log2(1)) = 3
      // CV = 0 (all counts equal), Multiplier = 1
      // Score = 3
      assert.equal(breakdown.totalBooks, 3);
      assert.equal(breakdown.basePoints, 3);
      assert.equal(breakdown.balanceMultiplier, 1);
      assert.equal(breakdown.score, 3);
      assert.equal(breakdown.tileCounts.size, 3);
    });

    await t.test('should return correct breakdown for an unbalanced reader', () => {
      // 2 books in each of 5 tiles, 10 books in one tile (20 books, 6 tiles)
      const books: UserBook[] = [];
      for (let i = 0; i < 5; i++) {
        books.push({ title: `Book ${i}`, tiles: [`t${i + 1}`] } as UserBook);
        books.push({ title: `Book ${i + 5}`, tiles: [`t${i + 1}`] } as UserBook);
      }
      for (let i = 0; i < 10; i++) {
        books.push({ title: `Book ${i + 10}`, tiles: ['t06'] } as UserBook);
      }

      const breakdown = getScoreBreakdown(books);

      // t1-t5: 1 + log2(2) = 2 each = 10
      // t6: 1 + log2(10) = 1 + 3.3219 = 4.3219
      // BasePoints = 14.3219
      assert.equal(breakdown.totalBooks, 20);
      assert.ok(Math.abs(breakdown.basePoints - 14.32) < 0.01);
      assert.equal(breakdown.tileCounts.size, 6);
      assert.equal(breakdown.tileCounts.get('t06'), 10);

      // CV > 0 so multiplier < 1, penalizing imbalance
      assert.ok(breakdown.balanceMultiplier < 1);
      assert.ok(breakdown.balanceMultiplier > 0);

      // Score = basePoints * multiplier, should be roughly 7.88
      assert.ok(Math.abs(breakdown.score - 7.88) < 0.1);
    });

    await t.test('should be consistent with calculateScore', () => {
      const books = [
        { title: 'Book 1', tiles: ['t01', 't02'] },
        { title: 'Book 2', tiles: ['t02', 't03'] },
      ] as UserBook[];

      const score = calculateScore(books);
      const breakdown = getScoreBreakdown(books);

      assert.equal(breakdown.score, score);
    });
  });
});
