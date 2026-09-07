# Observability — book enrichment flow

Structured events emitted by `enrichBook` and the Open Library provider. Every event
carries an `event` field holding its name; query on that, never on the message text.

Helpers live in `functions/src/observability.ts`. Client events go through
`log.event` / `log.error` in `lib/util`.

## Events

| Event                         | Severity     | Emitted by                      | Key fields                                                                                                                                   |
| ----------------------------- | ------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `enrich.search`               | INFO / ERROR | `books/handler.ts`              | `uid`, `outcome`, `resultCount`, `durationMs`                                                                                                |
| `enrich.lookup`               | INFO / ERROR | `books/handler.ts`              | `uid`, `externalId`, `outcome`, `stage`, `bookId`, `bookCreated`, `hasAuthor`, `hasPageCount`, `durationMs`, `upstreamStatus`, `upstreamUrl` |
| `ol.fetch`                    | INFO / ERROR | `providers/open-library.ts`     | `kind` (`search`\|`work`\|`author`\|`editions`), `url`, `status`, `durationMs`, `ok`                                                         |
| `ol.search_cache`             | INFO         | `providers/open-library.ts`     | `hit`, `size`                                                                                                                                |
| `ol.enrichment_degraded`      | INFO / WARN  | `providers/open-library.ts`     | `field` (`author`\|`pageCount`), `reason`                                                                                                    |
| `book_search` / `book_lookup` | —            | `app/web/src/lib/bookSearch.ts` | `result_count`, `duration_ms`, `external_id`                                                                                                 |
| `book_enrich_error`           | —            | `app/web/src/lib/bookSearch.ts` | `action`, `code` (e.g. `functions/unavailable`), `duration_ms`                                                                               |

`stage` on a failed `enrich.lookup` says which half broke: `provider` (Open Library) or
`firestore` (the book write).

Failure events add the fields from `describeError`: `errorName`, `errorMessage`, `stack`,
and — when the throw has a `cause` — `causeName`, `causeMessage`, `causeCode`. `causeCode`
is the field that names a transport failure (`UND_ERR_CONNECT_TIMEOUT`, `ECONNRESET`);
`fetch`'s own message is always the useless "fetch failed".

## Error classification

`toHttpsError` in `books/handler.ts` maps upstream failures to callable codes. The client
sees the code, never the upstream error text.

| Upstream                                     | Callable code | Meaning to the caller  |
| -------------------------------------------- | ------------- | ---------------------- |
| 404                                          | `not-found`   | Stop; the work is gone |
| 429, 5xx, no response                        | `unavailable` | Retryable              |
| Other 4xx, parse failure, non-provider throw | `internal`    | Our bug                |

## Queries

Failed lookups, most recent first:

```
gcloud logging read 'jsonPayload.event="enrich.lookup" AND jsonPayload.outcome="error"' \
  --project bookbingo-staging --limit 20 \
  --format="value(timestamp,jsonPayload.stage,jsonPayload.upstreamStatus,jsonPayload.causeCode,jsonPayload.errorMessage)"
```

Every upstream call for one work key:

```
gcloud logging read 'jsonPayload.event="ol.fetch" AND jsonPayload.url:"OL455403W"' \
  --project bookbingo-staging --limit 20 \
  --format="value(timestamp,jsonPayload.kind,jsonPayload.status,jsonPayload.durationMs)"
```

Substitute `--project bookbingo-3fdb1` for prod.

## Log-based metrics

`durationMs` and `status` are numbers so counter and distribution metrics can be built on
them directly in Log Explorer → Create metric. The three worth having:

1. Counter on `jsonPayload.event="enrich.lookup" AND jsonPayload.outcome="error"`, labelled
   by `stage` — separates our bugs from Open Library's bad days.
2. Distribution on `ol.fetch` `durationMs`, labelled by `kind` — catches upstream slowdown
   before it becomes timeouts.
3. Counter on `ol.enrichment_degraded` — books saving with no author or page count is
   silent data loss otherwise.
