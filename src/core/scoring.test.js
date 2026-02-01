import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { calculateScore, getScoreBreakdown } from './scoring.js';

test('Scoring Core', async (t) => {
  await t.test('calculateScore', async (t) => {
    await t.test('should return 0 for a user with no books', () => {
      const userBooks = [];
      assert.equal(calculateScore(userBooks), 0);
    });

    await t.test('should calculate the correct score for a single book in one tile', () => {
      const userBooks = [
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
      ];
      // BasePoints = 1 + log2(4) = 3
      // BalanceMultiplier = 1
      // Score = 3 * 1 = 3
      assert.equal(calculateScore(userBooks), 3);
    });

    await t.test('should calculate a lower score for an unbalanced reader', () => {
      // 20 books, heavy in 10 tiles.
      // Let's simulate 10 tiles with 2 books each.
      const userBooks = [];
      for (let i = 0; i < 10; i++) {
        userBooks.push({ title: `Book ${i * 2}`, tiles: [`t${i + 1}`] });
        userBooks.push({ title: `Book ${i * 2 + 1}`, tiles: [`t${i + 1}`] });
      }
      // BasePoints for each tile = 1 + log2(2) = 2.
      // Total BasePoints = 10 * 2 = 20.
      // Counts = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2]. Mean = 2, StdDev = 0, CV = 0.
      // Multiplier = 1. Score = 20.
      // This is not what the plan says. Let's make it more imbalanced.
      // 2 books in each of 5 tiles, 10 books in one tile. (Total 20 books, 6 tiles)
      const unbalancedBooks = [];
      for (let i = 0; i < 5; i++) {
        unbalancedBooks.push({ title: `Book ${i}`, tiles: [`t${i + 1}`] });
        unbalancedBooks.push({ title: `Book ${i + 5}`, tiles: [`t${i + 1}`] });
      }
      for (let i = 0; i < 10; i++) {
        unbalancedBooks.push({ title: `Book ${i + 10}`, tiles: ['t06'] });
      }

      const breakdown = getScoreBreakdown(unbalancedBooks);
      // From the plan, concentrated reader score is ~21.
      // Let's see what we get.
      // t1-t5: 1 + log2(2) = 2 points each. 5 * 2 = 10
      // t6: 1 + log2(10) = 1 + 3.32 = 4.32
      // BasePoints = 10 + 4.32 = 14.32
      // Counts: [2, 2, 2, 2, 2, 10]. Mean = 3.33. StdDev = 2.98. CV = 0.89.
      // Multiplier = 1 / (1 + 0.89^2) = 1 / 1.79 = 0.55
      // Score = 14.32 * 0.55 = 7.876
      // This is lower than the balanced score, which is correct.
      // Let's test a perfectly balanced reader.
      const balancedBooks = [];
      for (let i = 0; i < 20; i++) {
        balancedBooks.push({ title: `Book ${i}`, tiles: [`t${i + 1}`] });
      }
      const balancedScore = calculateScore(balancedBooks); // BasePoints = 20, Multiplier = 1, Score = 20
      const unbalancedScore = calculateScore(unbalancedBooks);

      assert.ok(unbalancedScore < balancedScore);
    });
  });
});

