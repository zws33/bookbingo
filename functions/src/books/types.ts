export type ProviderBookDetails = {
  externalId: string;
  title: string;
  author: string;
  pageCount: number | null;
  publishedDate: string | null;
  categories: string[];
  language: string | null;
  isbn: string | null;
  thumbnailUrl: string | null;
};

export type ProviderSearchResult = {
  externalId: string;
  title: string;
  author: string;
  thumbnailUrl: string | null;
  publishedDate: string | null;
};
/**
 * A failed upstream provider call, carrying enough to classify it without the
 * handler knowing which provider threw.
 *
 * `status` is the upstream HTTP status, or `null` when the request never got a
 * response (DNS, connect timeout, reset socket).
 */
export class ProviderError extends Error {
  readonly status: number | null;
  readonly url: string;

  constructor(
    message: string,
    options: { status: number | null; url: string; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = 'ProviderError';
    this.status = options.status;
    this.url = options.url;
  }
}

export interface BookProvider {
  search(query: string): Promise<ProviderSearchResult[]>;
  getDetails(externalId: string): Promise<ProviderBookDetails>;
}
