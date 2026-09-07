import { test, describe } from 'node:test';
import assert from 'node:assert';
import { describeError } from './observability.js';

describe('describeError', () => {
  test('flattens name and message', () => {
    const fields = describeError(new TypeError('boom'));

    assert.equal(fields.errorName, 'TypeError');
    assert.equal(fields.errorMessage, 'boom');
    assert.equal(typeof fields.stack, 'string');
  });

  test('lifts an Error cause, including its diagnostic code', () => {
    // The shape undici throws: a useless outer message wrapping the real reason.
    const error = new Error('fetch failed', {
      cause: Object.assign(new Error('connect ETIMEDOUT 1.2.3.4:443'), {
        code: 'UND_ERR_CONNECT_TIMEOUT',
      }),
    });

    const fields = describeError(error);

    assert.equal(fields.errorMessage, 'fetch failed');
    assert.equal(fields.causeName, 'Error');
    assert.equal(fields.causeMessage, 'connect ETIMEDOUT 1.2.3.4:443');
    assert.equal(fields.causeCode, 'UND_ERR_CONNECT_TIMEOUT');
  });

  test('stringifies a non-Error cause', () => {
    const fields = describeError(new Error('outer', { cause: 'plain string' }));

    assert.equal(fields.causeMessage, 'plain string');
    assert.equal(fields.causeName, undefined);
  });

  test('handles a thrown non-Error', () => {
    const fields = describeError('just a string');

    assert.equal(fields.errorName, 'NonError');
    assert.equal(fields.errorMessage, 'just a string');
  });
});
