import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Tag, TagRepository } from '../tags/postgresStore.js';
import { scorer } from './scorer.js';

const unexpected = (name: string) => () =>
  Promise.reject(new Error(`unexpected ${name} call`));

function fakeTagRepo(tags: Tag[], onList?: () => void): TagRepository {
  return {
    listByChallenge: () => {
      onList?.();
      return Promise.resolve(tags);
    },
    create: unexpected('create'),
    update: unexpected('update'),
    remove: unexpected('remove'),
  };
}

const vocabulary = (size: number): Tag[] =>
  Array.from({ length: size }, (_, i) => ({ id: `t${i}`, label: `tag ${i}` }));

const readings = (counts: number[]) =>
  counts.flatMap((count, tile) =>
    Array.from({ length: count }, () => ({
      tiles: [`t${tile}`],
      isFreebie: false,
    })),
  );

test('scorer', async (t) => {
  await t.test('reads the vocabulary once per challenge', async () => {
    let calls = 0;
    const scoreOf = await scorer(
      fakeTagRepo(vocabulary(25), () => calls++),
    ).forChallenge('challenge-1');

    scoreOf(readings([1, 1]));
    scoreOf(readings([3]));

    assert.equal(calls, 1);
  });

  await t.test('takes N from the challenge, not from the catalog', async () => {
    const same = readings([4, 1, 1]);
    const narrow = await scorer(fakeTagRepo(vocabulary(3))).forChallenge('c');
    const wide = await scorer(fakeTagRepo(vocabulary(40))).forChallenge('c');

    // Coverage of 3 is full in a 3-tag vocabulary and barely any of a 40-tag
    // one, so the same readings decay differently.
    assert.ok(narrow(same).score > wide(same).score);
  });

  await t.test('encodes tile counts as a plain object', async () => {
    const scoreOf = await scorer(fakeTagRepo(vocabulary(25))).forChallenge('c');
    const dto = scoreOf(readings([2, 1]));

    assert.deepEqual(dto.tileCounts, { t0: 2, t1: 1 });
    assert.equal(dto.varietyPoints, 2);
    assert.equal(dto.totalBooks, 3);
  });

  await t.test('scores an empty reading list as zero', async () => {
    const scoreOf = await scorer(fakeTagRepo(vocabulary(25))).forChallenge('c');

    assert.deepEqual(scoreOf([]), {
      score: 0,
      varietyPoints: 0,
      volumePoints: 0,
      tileCounts: {},
      totalBooks: 0,
    });
  });

  await t.test('scores a challenge with no tags at all', async () => {
    // A draft challenge before its vocabulary exists: N = 0, and no reading can
    // reference a tag that is not there, so there is nothing to score.
    const scoreOf = await scorer(fakeTagRepo([])).forChallenge('c');

    assert.equal(scoreOf([]).score, 0);
  });
});
