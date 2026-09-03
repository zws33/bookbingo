# BookBingo — Firestore Schema

Context for an AI agent reasoning about this database. BookBingo is a reading-bingo
tracker: users log books they've read, tag each with bingo "tiles" (categories), and
earn a score rewarding both volume and variety.

Backend is **Google Cloud Firestore** (native mode). All timestamps are Firestore
`Timestamp` values written with `serverTimestamp()` unless noted. IDs are document IDs
(the key), not stored as a field except where a `Reading`/`Book`/`TBREntry` also carries
a redundant `id` field in application code.

## Collection map

```text
/books/{bookId}                        shared book catalog (one doc per unique book)
/users/{userId}                        user profile
/users/{userId}/readings/{readingId}   a user's completed readings (subcollection)
/users/{userId}/tbr/{tbrId}            a user's to-be-read list (subcollection)
```

There is a **collection group** named `readings` spanning every user's subcollection,
queried for the cross-user leaderboard.

Bingo tiles (categories) are **not** stored in Firestore. They are a fixed app-side
constant list of ~49 tiles with IDs like `t01`…`t43` and `m01`…`m06`. Readings reference
tiles by these string IDs.

## `/books/{bookId}` — shared book catalog

One document per unique book, shared across all users. Multiple users reference the same
book through their readings.

`bookId` is **deterministic**, a hash of the book's identity (not random):

- Catalog book: `hash("openLibrary:" + openLibraryWorkKey)`
- Manual book: `hash("manual:" + normalizedTitle + "|" + normalizedAuthor)`

This makes dedup a point read on the computed ID rather than a query; concurrent creates
of the same book converge on one document.

| Field         | Type          | Notes                                                         |
| ------------- | ------------- | ------------------------------------------------------------- |
| `title`       | string        |                                                               |
| `author`      | string        |                                                               |
| `createdBy`   | string        | UID of first adder; may be `"system-migration"`               |
| `createdAt`   | Timestamp     |                                                               |
| `metadata`    | map \| absent | see below; absent for bare manual entries                     |
| `externalIds` | map \| absent | provenance only, keyed by provider; absent for manual entries |

`metadata` map:

| Field           | Type           |
| --------------- | -------------- |
| `pageCount`     | number \| null |
| `publishedDate` | string \| null |
| `categories`    | string[]       |
| `language`      | string \| null |
| `isbn`          | string \| null |
| `thumbnailUrl`  | string \| null |

`externalIds` is `{ openLibrary?: { key: string, enrichedAt: Timestamp } }`. `key` is the
Open Library Work key, e.g. `/works/OL166894W`. This is provenance, **not** a dedup key —
identity is the deterministic document ID.

## `/users/{userId}` — user profile

`userId` is the Firebase Auth UID.

| Field       | Type           | Notes                              |
| ----------- | -------------- | ---------------------------------- |
| `name`      | string         | display name, defaults to `"User"` |
| `photoURL`  | string \| null |                                    |
| `updatedAt` | Timestamp      |                                    |

Written with `{ merge: true }` on each sign-in.

## `/users/{userId}/readings/{readingId}` — completed readings

A user's log of a book they've read, with the tiles they claimed for it. This is the only
data that contributes to scoring.

| Field        | Type                | Notes                                      |
| ------------ | ------------------- | ------------------------------------------ |
| `bookId`     | string              | references `/books/{bookId}`               |
| `tiles`      | string[]            | claimed tile IDs; max 3 unless `isFreebie` |
| `isFreebie`  | boolean             | freebie readings may claim unlimited tiles |
| `readAt`     | Timestamp           | when the user read the book                |
| `createdAt`  | Timestamp           |                                            |
| `updatedAt`  | Timestamp \| absent |                                            |
| `bookTitle`  | string \| absent    | legacy denormalized field (migration)      |
| `bookAuthor` | string \| absent    | legacy denormalized field (migration)      |

## `/users/{userId}/tbr/{tbrId}` — to-be-read list

Books the user plans to read. **Never** contributes to scoring — only `readings` do.

| Field          | Type                | Notes                           |
| -------------- | ------------------- | ------------------------------- |
| `bookId`       | string              | references `/books/{bookId}`    |
| `plannedTiles` | string[]            | tiles the user intends to claim |
| `notes`        | string \| absent    | optional personal note          |
| `addedAt`      | Timestamp           |                                 |
| `updatedAt`    | Timestamp \| absent |                                 |

## Access rules (summary)

All access requires an authenticated user (`request.auth != null`).

- `/books`: any signed-in user may read and create. Update only by the doc's `createdBy`
  (or if `createdBy == "system-migration"`).
- `/users/{userId}`: anyone signed in may read; only the owner (`uid == userId`) may write.
- `/users/{userId}/readings`: anyone signed in may read (needed for the leaderboard); only
  the owner may write.
- `/users/{userId}/tbr`: only the owner may read or write (private).
- Collection-group `readings` reads are allowed for any signed-in user.

## Scoring (application logic, not stored)

Scores are computed client-side/in functions from a user's readings, not persisted as
documents. Each unique tile with ≥1 book gives 1 variety point; repeat books in a tile add
harmonic diminishing-returns volume points; a balance factor can scale by evenness of
distribution. Tiles come from the fixed app constant list.
