import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  submitFeedbackHandler,
  GITHUB_API_URL,
  TITLE_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
} from './handler.js';
import type { FeedbackDeps } from './handler.js';

const TEST_DEPS: FeedbackDeps = { pat: 'test-pat', apiUrl: GITHUB_API_URL };

type MockAuth = { uid: string; token: Record<string, unknown> } | null;

function makeRequest(auth: MockAuth, data: unknown) {
  return { auth, data, rawRequest: {}, acceptsStreaming: false };
}

function makeFetchOk(issueUrl: string, issueNumber: number) {
  return mock.fn((_url: string, _init: { body?: string }) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ html_url: issueUrl, number: issueNumber }),
      text: () => Promise.resolve(''),
    }),
  );
}

function makeFetchFail(status: number, body: string) {
  return mock.fn(() =>
    Promise.resolve({
      ok: false,
      status,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(body),
    }),
  );
}

type HttpsErrorLike = Error & { code: string };

describe('submitFeedbackHandler', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('auth validation', () => {
    it('throws unauthenticated when request has no auth', async () => {
      const req = makeRequest(null, { type: 'bug', title: 'oops', description: 'it broke' });
      await assert.rejects(
        () => submitFeedbackHandler(req as never, TEST_DEPS),
        (err: HttpsErrorLike) => {
          assert.equal(err.code, 'unauthenticated');
          return true;
        },
      );
    });
  });

  describe('input validation', () => {
    const authedReq = (data: unknown) =>
      makeRequest({ uid: 'user-1', token: {} }, data) as never;

    it('throws invalid-argument for an unrecognised type', async () => {
      await assert.rejects(
        () =>
          submitFeedbackHandler(authedReq({ type: 'unknown', title: 'a', description: 'b' }), TEST_DEPS),
        (err: HttpsErrorLike) => {
          assert.equal(err.code, 'invalid-argument');
          return true;
        },
      );
    });

    it('throws invalid-argument for an empty title', async () => {
      await assert.rejects(
        () =>
          submitFeedbackHandler(authedReq({ type: 'bug', title: '  ', description: 'b' }), TEST_DEPS),
        (err: HttpsErrorLike) => {
          assert.equal(err.code, 'invalid-argument');
          return true;
        },
      );
    });

    it('throws invalid-argument when title exceeds max length', async () => {
      const longTitle = 'a'.repeat(TITLE_MAX_LENGTH + 1);
      await assert.rejects(
        () =>
          submitFeedbackHandler(authedReq({ type: 'bug', title: longTitle, description: 'b' }), TEST_DEPS),
        (err: HttpsErrorLike) => {
          assert.equal(err.code, 'invalid-argument');
          assert.match(err.message, /title must be at most/);
          return true;
        },
      );
    });

    it('accepts a title exactly at the max length', async () => {
      globalThis.fetch = makeFetchOk('https://github.com/issues/1', 1) as never;
      const maxTitle = 'a'.repeat(TITLE_MAX_LENGTH);
      const result = await submitFeedbackHandler(
        authedReq({ type: 'bug', title: maxTitle, description: 'some description' }),
        TEST_DEPS,
      );
      assert.equal(result.issueNumber, 1);
    });

    it('throws invalid-argument for an empty description', async () => {
      await assert.rejects(
        () =>
          submitFeedbackHandler(authedReq({ type: 'bug', title: 'a title', description: '' }), TEST_DEPS),
        (err: HttpsErrorLike) => {
          assert.equal(err.code, 'invalid-argument');
          return true;
        },
      );
    });

    it('throws invalid-argument when description exceeds max length', async () => {
      const longDesc = 'a'.repeat(DESCRIPTION_MAX_LENGTH + 1);
      await assert.rejects(
        () =>
          submitFeedbackHandler(
            authedReq({ type: 'feature', title: 'a title', description: longDesc }),
            TEST_DEPS,
          ),
        (err: HttpsErrorLike) => {
          assert.equal(err.code, 'invalid-argument');
          assert.match(err.message, /description must be at most/);
          return true;
        },
      );
    });

    it('accepts a description exactly at the max length', async () => {
      globalThis.fetch = makeFetchOk('https://github.com/issues/2', 2) as never;
      const maxDesc = 'a'.repeat(DESCRIPTION_MAX_LENGTH);
      const result = await submitFeedbackHandler(
        authedReq({ type: 'bug', title: 'a title', description: maxDesc }),
        TEST_DEPS,
      );
      assert.equal(result.issueNumber, 2);
    });
  });

  describe('GitHub API integration', () => {
    const authedReq = (data: unknown) =>
      makeRequest({ uid: 'user-1', token: {} }, data) as never;

    it('returns issueUrl and issueNumber on success', async () => {
      globalThis.fetch = makeFetchOk('https://github.com/zws33/bookbingo/issues/42', 42) as never;

      const result = await submitFeedbackHandler(
        authedReq({ type: 'bug', title: 'Broken thing', description: 'Steps to reproduce' }),
        TEST_DEPS,
      );

      assert.equal(result.issueUrl, 'https://github.com/zws33/bookbingo/issues/42');
      assert.equal(result.issueNumber, 42);
    });

    it('sends the correct labels for a bug report', async () => {
      const fetchMock = makeFetchOk('https://github.com/issues/1', 1);
      globalThis.fetch = fetchMock as never;

      await submitFeedbackHandler(
        authedReq({ type: 'bug', title: 'A title', description: 'A description' }),
        TEST_DEPS,
      );

      const [, init] = fetchMock.mock.calls[0]!.arguments;
      const body = JSON.parse(init.body!) as {
        labels: string[];
      };
      assert.deepEqual(body.labels, ['user-feedback', 'bug']);
    });

    it('sends the correct labels for a feature request', async () => {
      const fetchMock = makeFetchOk('https://github.com/issues/2', 2);
      globalThis.fetch = fetchMock as never;

      await submitFeedbackHandler(
        authedReq({ type: 'feature', title: 'New feature', description: 'Please add this' }),
        TEST_DEPS,
      );

      const [, init] = fetchMock.mock.calls[0]!.arguments;
      const body = JSON.parse(init.body!) as {
        labels: string[];
      };
      assert.deepEqual(body.labels, ['user-feedback', 'enhancement']);
    });

    it('trims title and description before sending', async () => {
      const fetchMock = makeFetchOk('https://github.com/issues/3', 3);
      globalThis.fetch = fetchMock as never;

      await submitFeedbackHandler(
        authedReq({ type: 'bug', title: '  whitespace  ', description: '  spaces  ' }),
        TEST_DEPS,
      );

      const [, init] = fetchMock.mock.calls[0]!.arguments;
      const body = JSON.parse(init.body!) as {
        title: string;
        body: string;
      };
      assert.equal(body.title, 'whitespace');
      assert.equal(body.body, 'spaces');
    });

    it('throws internal error when GitHub API returns a non-OK response', async () => {
      globalThis.fetch = makeFetchFail(422, '{"message":"Validation Failed"}') as never;

      await assert.rejects(
        () =>
          submitFeedbackHandler(
            authedReq({ type: 'bug', title: 'A title', description: 'A description' }),
            TEST_DEPS,
          ),
        (err: HttpsErrorLike) => {
          assert.equal(err.code, 'internal');
          return true;
        },
      );
    });

    it('does not leak the GitHub error body in the thrown error', async () => {
      const secretBody = 'PAT is not configured correctly — secret error details';
      globalThis.fetch = makeFetchFail(403, secretBody) as never;

      await assert.rejects(
        () =>
          submitFeedbackHandler(
            authedReq({ type: 'bug', title: 'A title', description: 'A description' }),
            TEST_DEPS,
          ),
        (err: HttpsErrorLike) => {
          assert.equal(err.code, 'internal');
          assert.ok(
            !err.message.includes(secretBody),
            'error message must not contain the raw GitHub response body',
          );
          return true;
        },
      );
    });
  });
});
