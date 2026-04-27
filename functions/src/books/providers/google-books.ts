import { 
  BookProvider, 
  BookSearchResult, 
  BookEnrichmentResult 
} from '../types.js';

interface GoogleBooksItem {
  id: string;
  volumeInfo: {
    title: string;
    authors?: string[];
    imageLinks?: {
      thumbnail?: string;
    };
    publishedDate?: string;
    pageCount?: number;
    categories?: string[];
    language?: string;
    industryIdentifiers?: Array<{
      type: string;
      identifier: string;
    }>;
  };
}

interface GoogleBooksResponse {
  items?: GoogleBooksItem[];
}

export class GoogleBooksProvider implements BookProvider {
  private readonly baseUrl = 'https://www.googleapis.com/books/v1/volumes';

  async search(query: string): Promise<BookSearchResult[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('maxResults', '10');
    url.searchParams.set('printType', 'books');

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Google Books API search failed: ${response.statusText}`);
    }

    const data = await response.json() as GoogleBooksResponse;
    const items = data.items || [];

    return items.map((item) => ({
      externalId: item.id,
      title: item.volumeInfo.title,
      author: (item.volumeInfo.authors || []).join(', '),
      thumbnailUrl: item.volumeInfo.imageLinks?.thumbnail || null,
      publishedDate: item.volumeInfo.publishedDate || null,
    }));
  }

  async lookup(externalId: string): Promise<BookEnrichmentResult> {
    const response = await fetch(`${this.baseUrl}/${externalId}`);
    if (!response.ok) {
      throw new Error(`Google Books API lookup failed: ${response.statusText}`);
    }

    const item = await response.json() as GoogleBooksItem;
    const info = item.volumeInfo;

    return {
      externalId: item.id,
      title: info.title,
      author: (info.authors || []).join(', '),
      metadata: {
        pageCount: info.pageCount || null,
        publishedDate: info.publishedDate || null,
        categories: info.categories || [],
        language: info.language || null,
        isbn: this.extractIsbn(info.industryIdentifiers),
        thumbnailUrl: info.imageLinks?.thumbnail || null,
      },
    };
  }

  private extractIsbn(identifiers?: Array<{ type: string; identifier: string }>): string | null {
    if (!identifiers) return null;
    const isbn13 = identifiers.find(id => id.type === 'ISBN_13');
    if (isbn13) return isbn13.identifier;
    const isbn10 = identifiers.find(id => id.type === 'ISBN_10');
    if (isbn10) return isbn10.identifier;
    return null;
  }
}
