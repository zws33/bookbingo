# Open Library API Reference

Facts about Open Library's API that the code cannot state for itself. Everything about _our_ handling of it — the provider, the cache, the schemas, the mapping code — lives in `functions/src/books/providers/open-library.ts`; read that for behavior. Strategy and horizons are in [`OPEN_LIBRARY_DEPENDENCY_ROADMAP.md`](OPEN_LIBRARY_DEPENDENCY_ROADMAP.md).

## Access rules

| Rule                          | Value                                                |
| ----------------------------- | ---------------------------------------------------- |
| Rate limit, unauthenticated   | 1 req/sec                                            |
| Rate limit, with `User-Agent` | 3 req/sec                                            |
| Required header               | `User-Agent: BookBingo/1.0 (zach.smith33@gmail.com)` |

The `User-Agent` is what buys the higher limit. Removing it silently triples our effective latency budget under load rather than erroring.

## Endpoints in use

| Endpoint                                                   | Returns                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| `GET /search.json?q={query}&fields={projection}&limit=10`  | Work-level search results                                                  |
| `GET /works/{olid}.json`                                   | Work metadata — title, subjects, covers, `first_publish_date`, author refs |
| `GET /authors/{olid}.json`                                 | Author name                                                                |
| `GET /works/{olid}/editions.json?limit=1`                  | First edition, for `number_of_pages`                                       |
| `GET https://covers.openlibrary.org/b/id/{cover_id}-M.jpg` | Cover image, medium                                                        |

`search.json` returns **Work-level records by default** — no normalization step is needed to get from a search result to a Work key. This is why Open Library suits this project and a commercial edition-oriented catalog would not; see `decisions/book-identity-and-deduplication.md` for why Work-level identity is the requirement.

## Where the data model fights the API

The `BookMetadata` shape is edition-flavored; Open Library's Work records are not. Three fields cannot be satisfied at the Work level:

| Field       | Why                                                                                                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pageCount` | Not on the Work record. Costs a second request to `/editions.json?limit=1`, and is whatever the first edition happens to report — not authoritative for the copy anyone actually read. |
| `language`  | Edition-specific. Always `null` for catalog books; only manual entry can supply it.                                                                                                    |
| `isbn`      | Edition-specific. Always `null` for catalog books; only manual entry can supply it.                                                                                                    |

This is inherent to tracking works rather than editions, not a gap to close. A book club cares which book was read, not which printing.

## Response quirks worth knowing

- **`subjects` is unbounded.** Some works carry hundreds. The provider caps at the first 5.
- **`author_name` is an array**, and search takes only the first. A book with three authors surfaces one; the rest are dropped, not joined.
- **`authors[].author.key` on a Work is a reference**, not a name — resolving it is the third request in the `lookup` fan-out.
- **Author and edition lookups fail soft.** A non-OK response yields `''` / `null` rather than throwing, so a book with an unresolvable author still enriches. Only the Work fetch is fatal.
- **`first_publish_date` (Work) and `first_publish_year` (search) are different fields** with different formats. `lookup` uses the former, `search` the latter.

## Provider guidance

Open Library asks callers to cache API-backed data, and states that the web APIs suit low-volume real-time lookups while bulk dumps suit large-scale access. The roadmap works through what that implies here; the short version is that `lookup` should be cached hard and `search` should keep hitting the API indefinitely.
