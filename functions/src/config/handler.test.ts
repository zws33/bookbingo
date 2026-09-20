import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { getBoardConfigHandler } from './handler.js';
import { TILES } from '../domain/constants.js';
import { MAX_TILES_PER_BOOK } from '../domain/validation.js';

const AUTH = { uid: 'user-1', token: {}, rawToken: 'test' };

function makeRequest(auth: typeof AUTH | undefined): CallableRequest<unknown> {
  return {
    auth,
    data: {},
    rawRequest: {} as unknown as CallableRequest<unknown>['rawRequest'],
    acceptsStreaming: false,
  } as CallableRequest<unknown>;
}

describe('getBoardConfigHandler', () => {
  test('throws unauthenticated when request has no auth', () => {
    assert.throws(() => getBoardConfigHandler(makeRequest(undefined)), {
      code: 'unauthenticated',
    });
  });

  test('returns the full tile catalog and the cap', () => {
    const config = getBoardConfigHandler(makeRequest(AUTH));
    assert.equal(config.tiles.length, TILES.length);
    assert.equal(config.maxTilesPerBook, MAX_TILES_PER_BOOK);
  });

  test('returns tiles with an id and a name', () => {
    const [tile] = getBoardConfigHandler(makeRequest(AUTH)).tiles;
    assert.ok(tile);
    assert.equal(typeof tile.id, 'string');
    assert.equal(typeof tile.name, 'string');
  });
});
