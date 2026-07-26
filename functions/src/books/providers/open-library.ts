import z from 'zod/v4';
import {
  BookEnrichmentResult,
  BookProvider,
  BookSearchResult,
} from '../types.js';

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
 * Upper bound on cached search queries. This is a memory-leak guard, not a
 * hit-rate optimization — a v2 function instance is long-lived, so an unbounded
 * Map grows for the life of the instance. Entries almost always expire long
 * before the cap is reached, which is why eviction is plain oldest-first rather
 * than LRU.
 */
const DEFAULT_SEARCH_CACHE_MAX_ENTRIES = 200;

interface SearchCacheEntry {
  expiresAt: number;
  /**
   * The in-flight or settled request. Caching the *promise* rather than the
   * resolved value collapses concurrent identical queries onto one fetch —
   * caching values alone would let N callers all miss before the first resolves.
   */
  request: Promise<BookSearchResult[]>;
}

export interface OpenLibraryProviderOptions {
  searchCacheTtlMs?: number;
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

  /**
   * Ephemeral, per-instance search cache. `handler.ts` constructs one provider
   * at module scope, so in production its lifetime is the function instance's —
   * disposable by design, with no invalidation logic. Scoping it to the
   * instance rather than the module keeps it resettable in tests by
   * constructing a fresh provider.
   */
  private readonly searchCache = new Map<string, SearchCacheEntry>();
  private readonly searchCacheTtlMs: number;
  private readonly searchCacheMaxEntries: number;
  private readonly now: () => number;

  constructor(options: OpenLibraryProviderOptions = {}) {
    this.searchCacheTtlMs =
      options.searchCacheTtlMs ?? DEFAULT_SEARCH_CACHE_TTL_MS;
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
        return cached.request;
      }
      this.searchCache.delete(key);
    }

    // The raw query is what actually goes to Open Library; the normalized form
    // is only a cache key. Queries differing solely in case or spacing share an
    // entry, populated by whichever arrived first.
    const request = this.fetchSearch(query);
    this.searchCache.set(key, {
      expiresAt: now + this.searchCacheTtlMs,
      request,
    });
    this.evictOverflow();

    // A failed request must not stay cached for the whole TTL — one transient
    // Open Library error would otherwise blank out a query for ten minutes.
    // Guard the delete so a newer in-flight entry isn't dropped by an older
    // failure. Attaching this handler also marks `request` as handled, so the
    // rejection reaches the caller without an unhandled-rejection warning.
    void request.catch(() => {
      if (this.searchCache.get(key)?.request === request) {
        this.searchCache.delete(key);
      }
    });

    return request;
  }

  async lookup(externalId: string): Promise<BookEnrichmentResult> {
    const workRes = await fetch(`${this.baseUrl}${externalId}.json`, {
      headers: this.headers,
    });
    if (!workRes.ok) {
      throw new Error(`OpenLibrary work lookup failed: ${workRes.statusText}`);
    }
    const work = WorkSchema.parse(await workRes.json());

    // The author and editions lookups are independent — neither reads the
    // other's result — so they run concurrently. Turns the fan-out from three
    // sequential round-trips into one followed by two in parallel.
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

    const response = await fetch(url.toString(), { headers: this.headers });
    if (!response.ok) {
      throw new Error(`OpenLibrary search failed: ${response.statusText}`);
    }
    const json = await response.json();
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

  private async fetchAuthorName(
    authorKey: string | undefined,
  ): Promise<string> {
    if (!authorKey) return '';
    const res = await fetch(`${this.baseUrl}${authorKey}.json`, {
      headers: this.headers,
    });
    if (!res.ok) return '';
    const parsed = AuthorSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.name : '';
  }

  private async fetchPageCount(workKey: string): Promise<number | null> {
    const res = await fetch(`${this.baseUrl}${workKey}/editions.json?limit=1`, {
      headers: this.headers,
    });
    if (!res.ok) return null;
    const parsed = EditionsSchema.safeParse(await res.json());
    return parsed.success
      ? (parsed.data.entries?.[0]?.number_of_pages ?? null)
      : null;
  }
}

/**
 * Cache key normalization: case- and whitespace-insensitive, so "Dune  Herbert"
 * and "dune herbert" share one entry.
 */
function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}
