import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { log, initLogger } from './logger.js';

// Each test calls initLogger to reset module state before asserting.

test('log.event is a no-op when dispatch is null', () => {
  initLogger({ isDev: false, dispatch: null });
  // should not throw
  log.event('test_event', { key: 'value' });
});

test('log.event calls dispatch with name and params', () => {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  initLogger({ isDev: false, dispatch: (name, params) => calls.push([name, params]) });

  log.event('add_book', { book_id: '123' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'add_book');
  assert.deepEqual(calls[0][1], { book_id: '123' });
});

test('log.event calls dispatch with no params when omitted', () => {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  initLogger({ isDev: false, dispatch: (name, params) => calls.push([name, params]) });

  log.event('delete_book');

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'delete_book');
  assert.equal(calls[0][1], undefined);
});

test('log.error dispatches app_error event with label and message', () => {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  initLogger({ isDev: false, dispatch: (name, params) => calls.push([name, params]) });

  const originalError = console.error;
  console.error = () => {};
  log.error('books', new Error('firestore unavailable'));
  console.error = originalError;

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'app_error');
  assert.deepEqual(calls[0][1], { label: 'books', message: 'firestore unavailable' });
});

test('log.error dispatches app_error with string message', () => {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  initLogger({ isDev: false, dispatch: (name, params) => calls.push([name, params]) });

  const originalError = console.error;
  console.error = () => {};
  log.error('auth', 'token expired');
  console.error = originalError;

  assert.equal(calls[0][1]?.message, 'token expired');
});

test('log.error is safe when dispatch is null', () => {
  initLogger({ isDev: false, dispatch: null });
  const originalError = console.error;
  console.error = () => {};
  log.error('books', 'something went wrong');
  console.error = originalError;
});

test('log.debug writes to console when isDev is true', () => {
  const calls: unknown[][] = [];
  const originalDebug = console.debug;
  console.debug = (...args: unknown[]) => calls.push(args);

  initLogger({ isDev: true, dispatch: null });
  log.debug('firebase', 'initializing');

  console.debug = originalDebug;
  assert.equal(calls.length, 1);
});

test('log.debug is a no-op when isDev is false', () => {
  const calls: unknown[][] = [];
  const originalDebug = console.debug;
  console.debug = (...args: unknown[]) => calls.push(args);

  initLogger({ isDev: false, dispatch: null });
  log.debug('firebase', 'initializing');

  console.debug = originalDebug;
  assert.equal(calls.length, 0);
});
