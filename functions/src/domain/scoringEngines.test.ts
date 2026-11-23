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
      'shifted-harmonic',
      'SHIFTED HARMONIC',
      '',
      ' SHIFTED_HARMONIC',
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
});
