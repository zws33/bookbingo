import z from 'zod/v4';
import type {
  BookEnrichmentResult,
  BookProvider,
  BookSearchResult,
} from '../types.js';
import { ProviderError } from '../types.js';
import { logEvent, logFailure, logWarning } from '../../observability.js';

const DocSchema = z.object({
  key: z.string(),
  title: z.string(),
  author_name: z.array(z.string()).optional(),
  first_publish_year: z.number().optional(),
  cover_i: z.number().optional(),
});
const SearchResponseSchema = z.object({
  docs: z.array(DocSchema),
});

const WorkSchema = z.object({
  title: z.string(),
  authors: z
    .array(z.object({ author: z.object({ key: z.string() }) }))
    .optional(),
  subjects: z.array(z.string()).optional(),
  covers: z.array(z.number()).optional(),
  first_publish_date: z.string().optional(),
});

const AuthorSchema = z.object({
  name: z.string(),
});

const EditionsSchema = z.object({
  entries: z
    .array(z.object({ number_of_pages: z.number().optional() }))
    .optional(),
});

/** How long a cached search response stays servable. */
const DEFAULT_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * How long an *empty* search response stays servable.
 */
const DEFAULT_EMPTY_SEARCH_CACHE_TTL_MS = 30 * 1000;

/**
 * Upper bound on cached search queries.
 */
const DEFAULT_SEARCH_CACHE_MAX_ENTRIES = 200;

interface SearchCacheEntry {
  /**
   * Written optimistically at insert time with the full TTL, then
   * revised downward if the response turns out to be
   * empty.
   */
  expiresAt: number;
  /**
   * The in-flight or settled request.
   */
  request: Promise<BookSearchResult[]>;
}

export interface OpenLibraryProviderOptions {
  searchCacheTtlMs?: number;
  emptySearchCacheTtlMs?: number;
  searchCacheMaxEntries?: number;
  /** Injectable clock so cache expiry is testable without timer mocking. */
  now?: () => number;
}

export class OpenLibraryProvider implements BookProvider {
  private readonly baseUrl = 'https://openlibrary.org';
  private readonly searchFields =
    'key,title,author_name,first_publish_year,cover_i';
  private readonly headers = {
    'User-Agent': 'BookBingo/1.0 (zach.smith33@gmail.com)',
  };

  private readonly searchCache = new Map<string, SearchCacheEntry>();
  private readonly searchCacheTtlMs: number;
  private readonly emptySearchCacheTtlMs: number;
  private readonly searchCacheMaxEntries: number;
  private readonly now: () => number;

  constructor(options: OpenLibraryProviderOptions = {}) {
    this.searchCacheTtlMs =
      options.searchCacheTtlMs ?? DEFAULT_SEARCH_CACHE_TTL_MS;
    this.emptySearchCacheTtlMs =
      options.emptySearchCacheTtlMs ?? DEFAULT_EMPTY_SEARCH_CACHE_TTL_MS;
    this.searchCacheMaxEntries =
      options.searchCacheMaxEntries ?? DEFAULT_SEARCH_CACHE_MAX_ENTRIES;
    this.now = options.now ?? Date.now;
  }

  async search(query: string): Promise<BookSearchResult[]> {
    const key = normalizeQuery(query);
    const now = this.now();

    const cached = this.searchCache.get(key);
    if (cached) {
      if (cached.expiresAt > now) {
        logEvent('ol.search_cache', { hit: true, size: this.searchCache.size });
        return cached.request;
      }
      this.searchCache.delete(key);
    }

    logEvent('ol.search_cache', { hit: false, size: this.searchCache.size });

    const request = this.fetchSearch(query);
    this.searchCache.set(key, {
      expiresAt: now + this.searchCacheTtlMs,
      request,
    });
    this.evictOverflow();
    this.trackSettlement(key, request);

    return request;
  }

  /**
   * Revises the cache entry for `key` once `request` settles.
   *
   * On rejection: evict. One transient Open Library error must not blank out a
   * query for the whole TTL.
   *
   * On an empty result: shorten the entry's life to `emptySearchCacheTtlMs`.
   *
   * Both paths identity-check the entry first, so a settling request can only
   * ever modify the entry it created — never a newer one that replaced it.
   *
   * Passing an `onRejected` handler here also marks `request` as handled, so
   * the rejection still reaches the caller without an unhandled-rejection
   * warning.
   */
  private trackSettlement(
    key: string,
    request: Promise<BookSearchResult[]>,
  ): void {
    void request.then(
      (results) => {
        const entry = this.searchCache.get(key);
        if (entry?.request !== request) return;

        if (results.length === 0) {
          entry.expiresAt = this.now() + this.emptySearchCacheTtlMs;
        }
      },
      () => {
        if (this.searchCache.get(key)?.request === request) {
          this.searchCache.delete(key);
        }
      },
    );
  }

  /**
   * Single instrumented exit point to Open Library. Every upstream call goes
   * through here so each one emits an `ol.fetch` event with its status and
   * duration, and so transport failures and error statuses arrive at the
   * handler as one classifiable type.
   */
  private async fetchJson(
    url: string,
    kind: 'search' | 'work' | 'author' | 'editions',
    label: string,
  ): Promise<unknown> {
    const startedAt = Date.now();

    let response: Response;
    try {
      response = await fetch(url, { headers: this.headers });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      logFailure('ol.fetch', error, { kind, url, status: null, durationMs });
      throw new ProviderError(`OpenLibrary ${label} failed: no response`, {
        status: null,
        url,
        cause: error,
      });
    }

    const durationMs = Date.now() - startedAt;
    const status = response.status;

    if (!response.ok) {
      logEvent('ol.fetch', { kind, url, status, durationMs, ok: false });
      throw new ProviderError(
        `OpenLibrary ${label} failed: ${status} ${response.statusText}`,
        { status, url },
      );
    }

    try {
      const body: unknown = await response.json();
      logEvent('ol.fetch', { kind, url, status, durationMs, ok: true });
      return body;
    } catch (error) {
      logFailure('ol.fetch', error, {
        kind,
        url,
        status,
        durationMs,
        ok: false,
        reason: 'malformed-json',
      });
      throw new ProviderError(`OpenLibrary ${label} returned malformed JSON`, {
        status,
        url,
        cause: error,
      });
    }
  }

  async getDetails(externalId: string): Promise<BookEnrichmentResult> {
    const work = WorkSchema.parse(
      await this.fetchJson(
        `${this.baseUrl}${externalId}.json`,
        'work',
        'work lookup',
      ),
    );

    const [author, pageCount] = await Promise.all([
      this.fetchAuthorName(work.authors?.[0]?.author?.key),
      this.fetchPageCount(externalId),
    ]);
    const coverId = work.covers?.[0];

    return {
      externalId,
      title: work.title,
      author,
      metadata: {
        pageCount,
        publishedDate: work.first_publish_date ?? null,
        categories: work.subjects?.slice(0, 5) ?? [],
        language: null,
        isbn: null,
        thumbnailUrl: coverId
          ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
          : null,
      },
    };
  }

  private async fetchSearch(query: string): Promise<BookSearchResult[]> {
    const url = new URL(`${this.baseUrl}/search.json`);
    url.searchParams.set('q', query);
    url.searchParams.set('fields', this.searchFields);
    url.searchParams.set('limit', '10');

    const json = await this.fetchJson(url.toString(), 'search', 'search');
    const dto = SearchResponseSchema.parse(json);

    return dto.docs.map((doc) => ({
      externalId: doc.key,
      title: doc.title,
      author: doc.author_name?.[0] ?? '',
      thumbnailUrl: doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
        : null,
      publishedDate: doc.first_publish_year?.toString(10) ?? null,
    }));
  }

  /** Drop oldest-inserted entries until the cache is back within its cap. */
  private evictOverflow(): void {
    while (this.searchCache.size > this.searchCacheMaxEntries) {
      const oldest = this.searchCache.keys().next();
      if (oldest.done) return;
      this.searchCache.delete(oldest.value);
    }
  }

  /**
   * Author and page count are optional enrichments: a failure degrades the
   * result instead of failing the lookup. Each degradation is logged as
   * `ol.enrichment_degraded`, because silently returning ''/null is otherwise
   * indistinguishable from a book that genuinely has no author or page count.
   */
  private async fetchAuthorName(
    authorKey: string | undefined,
  ): Promise<string> {
    if (!authorKey) return '';
    try {
      const body = await this.fetchJson(
        `${this.baseUrl}${authorKey}.json`,
        'author',
        'author lookup',
      );
      const parsed = AuthorSchema.safeParse(body);
      if (!parsed.success) {
        logEvent('ol.enrichment_degraded', {
          field: 'author',
          authorKey,
          reason: 'schema-mismatch',
        });
        return '';
      }
      return parsed.data.name;
    } catch (error) {
      logWarning('ol.enrichment_degraded', error, {
        field: 'author',
        authorKey,
      });
      return '';
    }
  }

  private async fetchPageCount(workKey: string): Promise<number | null> {
    try {
      const body = await this.fetchJson(
        `${this.baseUrl}${workKey}/editions.json?limit=1`,
        'editions',
        'editions lookup',
      );
      const parsed = EditionsSchema.safeParse(body);
      if (!parsed.success) {
        logEvent('ol.enrichment_degraded', {
          field: 'pageCount',
          workKey,
          reason: 'schema-mismatch',
        });
        return null;
      }
      return parsed.data.entries?.[0]?.number_of_pages ?? null;
    } catch (error) {
      logWarning('ol.enrichment_degraded', error, {
        field: 'pageCount',
        workKey,
      });
      return null;
    }
  }
}

/**
 * Cache key normalization: case- and whitespace-insensitive, so "Dune  Herbert"
 * and "dune herbert" share one entry.
 */
function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}
