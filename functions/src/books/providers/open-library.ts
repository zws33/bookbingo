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
  authors: z.array(z.object({ author: z.object({ key: z.string() }) })).optional(),
  subjects: z.array(z.string()).optional(),
  covers: z.array(z.number()).optional(),
  first_publish_date: z.string().optional(),
});

const AuthorSchema = z.object({
  name: z.string(),
});

const EditionsSchema = z.object({
  entries: z.array(z.object({ number_of_pages: z.number().optional() })).optional(),
});

export class OpenLibraryProvider implements BookProvider {
  private readonly baseUrl = 'https://openlibrary.org';
  private readonly searchFields = 'key,title,author_name,first_publish_year,cover_i';
  private readonly headers = { 'User-Agent': 'BookBingo/1.0 (zach.smith33@gmail.com)' };
  async search(query: string): Promise<BookSearchResult[]> {
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

    const results: BookSearchResult[] = dto.docs.map((doc) => {
      return {
        externalId: doc.key,
        title: doc.title,
        author: doc.author_name?.[0] ?? '',
        thumbnailUrl: doc.cover_i
          ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
          : null,
        publishedDate: doc.first_publish_year?.toString(10) ?? null,
      };
    });
    return results;
  }

  async lookup(externalId: string): Promise<BookEnrichmentResult> {
    const workRes = await fetch(`${this.baseUrl}${externalId}.json`, { headers: this.headers });
    if (!workRes.ok) {
      throw new Error(`OpenLibrary work lookup failed: ${workRes.statusText}`);
    }
    const work = WorkSchema.parse(await workRes.json());

    const author = await this.fetchAuthorName(work.authors?.[0]?.author?.key);
    const pageCount = await this.fetchPageCount(externalId);
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

  private async fetchAuthorName(authorKey: string | undefined): Promise<string> {
    if (!authorKey) return '';
    const res = await fetch(`${this.baseUrl}${authorKey}.json`, { headers: this.headers });
    if (!res.ok) return '';
    const parsed = AuthorSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.name : '';
  }

  private async fetchPageCount(workKey: string): Promise<number | null> {
    const res = await fetch(`${this.baseUrl}${workKey}/editions.json?limit=1`, { headers: this.headers });
    if (!res.ok) return null;
    const parsed = EditionsSchema.safeParse(await res.json());
    return parsed.success ? (parsed.data.entries?.[0]?.number_of_pages ?? null) : null;
  }
}
