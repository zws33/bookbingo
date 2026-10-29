import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { bookHandlers, OPEN_LIBRARY } from './postgresHandler.js';
import type { BookRepository, NewBook } from './postgresStore.js';
import { ProviderError, type BookProvider } from './types.js';

const AUTH = { uid: 'user-1', token: {}, rawToken: 'test' };

const WORK_KEY = '/works/OL123W';

const unexpected = (name: string) => () =>
  Promise.reject(new Error(`unexpected ${name} call`));

function fakeBookRepo(overrides: Partial<BookRepository> = {}): BookRepository {
  return {
    getByIds: unexpected('getByIds'),
    findByExternalRef: unexpected('findByExternalRef'),
    createIfAbsent: unexpected('createIfAbsent'),
    ...overrides,
  };
}

function fakeProvider(overrides: Partial<BookProvider> = {}): BookProvider {
  return {
    search: unexpected('search'),
    getDetails: unexpected('getDetails'),
    ...overrides,
  } as BookProvider;
}

const DETAILS = {
  externalId: WORK_KEY,
  title: '  Piranesi  ',
  author: '  Susanna Clarke  ',
  thumbnailUrl: 'https://covers.example/1.jpg',
  pageCount: 272,
  publishedDate: '2020',
  categories: ['Fantasy'],
  language: 'eng',
  isbn: '9781635575637',
};

const handlers = (
  books: Partial<BookRepository> = {},
  provider: Partial<BookProvider> = {},
) => bookHandlers(fakeBookRepo(books), fakeProvider(provider));

function makeRequest(
  auth: typeof AUTH | undefined,
  data: unknown,
): CallableRequest<unknown> {
  return {
    auth,
    data,
    rawRequest: {} as unknown as CallableRequest<unknown>['rawRequest'],
    acceptsStreaming: false,
  } as CallableRequest<unknown>;
}

const wrote = (sink: { book?: NewBook; refs?: unknown }) => ({
  createIfAbsent: (book: NewBook, refs?: unknown) => {
    sink.book = book;
    sink.refs = refs;
    return Promise.resolve({ bookId: book.id, created: true });
  },
});

describe('bookHandlers.fetchDetails', () => {
  test('requires a signed-in caller', async () => {
    await assert.rejects(
      handlers().fetchDetails(makeRequest(undefined, { externalId: WORK_KEY })),
      { code: 'unauthenticated' },
    );
  });

  test('returns the trimmed book with its cover and no metadata', async () => {
    const sink: { book?: NewBook; refs?: unknown } = {};
    const book = await handlers(wrote(sink), {
      getDetails: () => Promise.resolve(DETAILS),
    }).fetchDetails(makeRequest(AUTH, { externalId: WORK_KEY }));

    assert.equal(book.title, 'Piranesi');
    assert.equal(book.author, 'Susanna Clarke');
    assert.equal(book.thumbnailUrl, 'https://covers.example/1.jpg');
    assert.match(book.id, /^[0-9a-f]{32}$/);
    assert.deepEqual(Object.keys(book).sort(), [
      'author',
      'id',
      'thumbnailUrl',
      'title',
    ]);
  });

  test('attributes a provider book to nobody', async () => {
    const sink: { book?: NewBook; refs?: unknown } = {};
    await handlers(wrote(sink), {
      getDetails: () => Promise.resolve(DETAILS),
    }).fetchDetails(makeRequest(AUTH, { externalId: WORK_KEY }));

    assert.equal(sink.book?.createdBy, null);
  });

  test('writes the work key as an external ref', async () => {
    const sink: { book?: NewBook; refs?: unknown } = {};
    await handlers(wrote(sink), {
      getDetails: () => Promise.resolve(DETAILS),
    }).fetchDetails(makeRequest(AUTH, { externalId: WORK_KEY }));

    assert.deepEqual(sink.refs, [
      { source: OPEN_LIBRARY, externalId: WORK_KEY, details: {} },
    ]);
  });

  test('maps a 404 to not-found', async () => {
    await assert.rejects(
      handlers(
        {},
        {
          getDetails: () =>
            Promise.reject(
              new ProviderError('gone', { status: 404, url: 'https://x' }),
            ),
        },
      ).fetchDetails(makeRequest(AUTH, { externalId: WORK_KEY })),
      { code: 'not-found' },
    );
  });

  for (const status of [500, 503, 429] as const) {
    test(`maps a ${status} to unavailable`, async () => {
      await assert.rejects(
        handlers(
          {},
          {
            getDetails: () =>
              Promise.reject(
                new ProviderError('down', { status, url: 'https://x' }),
              ),
          },
        ).fetchDetails(makeRequest(AUTH, { externalId: WORK_KEY })),
        { code: 'unavailable' },
      );
    });
  }

  test('withholds a write failure from the caller', async () => {
    await assert.rejects(
      handlers(
        { createIfAbsent: () => Promise.reject(new Error('unique violation')) },
        { getDetails: () => Promise.resolve(DETAILS) },
      ).fetchDetails(makeRequest(AUTH, { externalId: WORK_KEY })),
      { code: 'internal', message: 'Failed to create book.' },
    );
  });
});

describe('bookHandlers.createManual', () => {
  const MANUAL = {
    title: 'Piranesi',
    author: 'Susanna Clarke',
    thumbnailUrl: null,
  };

  test('requires a signed-in caller', async () => {
    await assert.rejects(
      handlers().createManual(makeRequest(undefined, MANUAL)),
      { code: 'unauthenticated' },
    );
  });

  test('accepts no metadata fields', async () => {
    await assert.rejects(
      handlers().createManual(
        makeRequest(AUTH, { title: 'A', author: 'B', metadata: {} }),
      ),
      /thumbnailUrl/,
    );
  });

  test('attributes a manual book to its creator', async () => {
    const sink: { book?: NewBook; refs?: unknown } = {};
    const book = await handlers(wrote(sink)).createManual(
      makeRequest(AUTH, MANUAL),
    );

    assert.equal(sink.book?.createdBy, AUTH.uid);
    assert.equal(sink.refs, undefined);
    assert.equal(book.title, 'Piranesi');
    assert.equal(book.thumbnailUrl, null);
  });

  test('keeps a cover when one is given', async () => {
    const sink: { book?: NewBook; refs?: unknown } = {};
    const book = await handlers(wrote(sink)).createManual(
      makeRequest(AUTH, {
        ...MANUAL,
        thumbnailUrl: 'https://covers.example/2.jpg',
      }),
    );

    assert.equal(book.thumbnailUrl, 'https://covers.example/2.jpg');
  });

  for (const field of ['title', 'author'] as const) {
    test(`rejects a punctuation-only ${field}`, async () => {
      await assert.rejects(
        handlers().createManual(
          makeRequest(AUTH, { ...MANUAL, [field]: '!!!' }),
        ),
        {
          code: 'invalid-argument',
          message:
            'Title and author must contain at least one letter or digit.',
        },
      );
    });
  }

  test('derives the same id for the same title and author', async () => {
    const first: { book?: NewBook; refs?: unknown } = {};
    const second: { book?: NewBook; refs?: unknown } = {};
    await handlers(wrote(first)).createManual(makeRequest(AUTH, MANUAL));
    await handlers(wrote(second)).createManual(
      makeRequest(AUTH, { ...MANUAL, title: '  Piranesi  ' }),
    );

    assert.equal(first.book?.id, second.book?.id);
  });
});
