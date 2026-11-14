import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Engines, parseEngine, scoringEngine } from './scoringEngines.js';

describe('parseEngine', () => {
  test('accepts every registered name', () => {
    for (const engine of Engines) {
      assert.equal(parseEngine(engine), engine);
    }
  });

  test('rejects anything else', () => {
    for (const value of [
      'coverage-decay',
      'COVERAGE DECAY',
      '',
      ' COVERAGE_DECAY',
      undefined,
      null,
      0,
      {},
    ]) {
      assert.equal(parseEngine(value), undefined);
    }
  });
});

describe('scoringEngine', () => {
  test('builds every registered engine', () => {
    for (const engine of Engines) {
      assert.equal(typeof scoringEngine(25, engine), 'function');
    }
  });

  test('the engines disagree, so the name is load-bearing', () => {
    const inputs = [
      { tags: ['t0'], isFreebie: false },
      { tags: ['t0'], isFreebie: false },
    ];
    const decay = scoringEngine(25, 'COVERAGE_DECAY')(inputs).score;
    const harmonic = scoringEngine(25, 'SHIFTED_HARMONIC')(inputs).score;
    assert.notEqual(decay, harmonic);
  });
});
