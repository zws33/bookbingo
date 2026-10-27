# Challenge Model

The durable rules for the challenge container, independent of storage.

## Entities and relationships

1. A challenge scopes its tag vocabulary, its membership, and every reading and TBR entry counted under it. `tags`, `memberships`, `readings` and `tbr_entries` all carry `challenge_id`.
2. `books` and `users` are global. A book knows nothing about how it is used; a user exists before any membership.
3. The same book read for two challenges is two `readings` rows. A reading counts toward exactly one challenge and is never shared.
4. A tag association exists only on a reading (`reading_tags`) or a TBR entry (`tbr_entry_tags`). The aggregate book-to-tag relation is derived on demand, never stored.
5. TBR entries are challenge-scoped. `promoteTBREntry` takes no challenge argument, because the entry already names one.
6. `readings` and `tbr_entries` each hold a composite foreign key to `memberships (challenge_id, user_id)`. Neither row can exist for someone who was never a member.
7. `reading_tags` and `tbr_entry_tags` carry `challenge_id` so both foreign keys terminate on the same challenge. A tag from another challenge's vocabulary cannot be attached.
8. Tag references are `on delete restrict`. Deleting a tag cannot silently drop history and rewrite scores.
9. Tag labels are unique per challenge, case-insensitively (`tags_challenge_label_idx`).

## Configuration

10. `tag_cap` is a column on `challenges`, not a constant in `functions/src/domain/`.
11. A freebie is the cap's one exemption, one per member per challenge, enforced by the partial unique index `readings_one_freebie_idx`.
12. The tag vocabulary is per-challenge. `TILES` in `domain/constants.ts` becomes seed data for one challenge, not a global catalog.
13. "Tag" is the domain and storage noun; "tile" is client presentation. Scoring reads tag ids as opaque strings and never consults the catalog. The wire keeps `tile`: `BoardConfig.tiles[].id` is a `tags.id` uuid and `.name` is `tags.label`.

## Roles

14. Three roles, fixed for every challenge: `owner` > `admin` > `member`. No per-challenge permission config.
15. Every role participates. Every active member appears on the leaderboard; there is no spectator role.
16. Only the role is stored. The role-to-permission map is `challenges/permissions.ts`; handlers ask for a permission, never compare role names.
17. `created_by` is informational. It grants nothing.

### Permissions

| Permission                            | owner | admin | member |
| ------------------------------------- | ----- | ----- | ------ |
| Log / edit / delete own readings      | ✓     | ✓     | ✓      |
| View leaderboard, library             | ✓     | ✓     | ✓      |
| Generate / rotate join codes          | ✓     | ✓     |        |
| Remove members                        | ✓     | ✓     |        |
| Edit / delete other players' readings | ✓     | ✓     |        |
| Create / update tags                  | ✓     | ✓     |        |
| Delete tags †                         | ✓     | ✓     |        |
| Edit config (`name`, `tag_cap`)       | ✓     | ✓     |        |
| Change roles                          | ✓     | ✓\*   |        |
| Change status                         | ✓     |       |        |
| Delete challenge                      | ✓     |       |        |

\* An admin may grant at most their own role (rule 19).
† `reading_tags` is `on delete restrict`, so a tag that any reading carries cannot be removed at all until those rows are resolved. The permission therefore only reaches a tag with no history.

### Rank

18. A member acts only on targets of strictly lower rank — removal, role changes, and editing or deleting another player's readings.
19. A member may grant any role up to and including their own.
20. Owners cannot remove or demote other owners. Owner promotion is permanent except by self-demotion or leaving.
21. A challenge always has at least one active owner. The last owner cannot leave or self-demote. Enforced in the same transaction as the write.
22. Ownership transfer is "promote, then leave." There is no dedicated operation.

### Membership lifecycle

23. `status` is `active` | `left` | `removed`. Rows are never deleted.
24. Leaving and removal have the same effect on data: readings are kept and excluded from the leaderboard and library.
25. `left` members may rejoin with a valid code, returning as `member` with their previous readings visible again.
26. `removed` members cannot rejoin. Reinstatement is a direct database write; no callable performs it.
27. A non-`active` membership fails the membership check exactly as a missing one does. The composite foreign key does not encode status, so this is a handler check, not a constraint.

### Join codes

28. Joining is by code only. There is no user-facing challenge identifier; `challenges.id` is an opaque uuid.
29. A code is 8 characters of Crockford base32 (40 bits) from `crypto.randomBytes`. `join_codes.challenge_id` is unique, so a challenge has exactly one live code.
30. Codes are multi-use and never expire. `rotateJoinCode` deletes the old row and inserts the new one in one transaction. There is no revoke without replacement — it would leave a challenge unjoinable. A challenge therefore always has exactly one live code, written with it and removed only by deletion: `getChallenge` returns it to every active member, and an absent one is corrupt state. Rotation stays admin+, so any member may pass the code on but only an admin can invalidate it.
31. `joinChallenge(code)`: missing code → `not-found`, which also covers a rotated-away code; challenge `complete` → `failed-precondition`; membership `removed` → `permission-denied`; `active` → no-op; `left` or absent → `active` `member`.
32. Expiry was considered and dropped. A window short enough to bound a leak also kills codes for anyone opening the group chat a day late, while brute force works in seconds. Rotation bounds a leak on demand, and membership is visible.

### Challenge lifecycle

33. `status` is `draft` → `active` → `complete`, one-way, owners only. The enum is declared in lifecycle order so `status < 'complete'` orders correctly.
34. `draft`: config and tags editable, joining allowed, reading writes rejected.
35. `active`: `tag_cap` and the tag set locked; `name` editable; joining and reading writes allowed.
36. `complete`: readings, membership and config frozen. Deletion still allowed.
37. Nothing in a challenge's subtree is deleted implicitly. Every foreign key reaching it is `on delete restrict`, so deletion removes the memberships, tags and join code by name in one transaction, and a challenge holding readings or TBR entries refuses the delete. Clearing history is an explicit ordered script — `reading_tags`, `readings`, `tbr_entry_tags`, `tbr_entries` — never a repository method.

### Creation

38. Any signed-in user may create a challenge and becomes its sole owner. There is no cap, and creations are not counted.
39. A per-user creation cap was dropped rather than reworked. It existed to bound abuse of `createChallenge`, which is a rate-limiting concern; as a data-model rule it charged a permanent, visible restriction to every honest user for a bound the request layer places better. Nothing in `users` or `challenges` tracks it.

### Superadmin — not implemented

40. There is no superadmin. The role ladder is `owner` > `admin` > `member` and nothing sits above it.
41. The operations it was the only holder of — demoting or removing an owner, reinstating a `removed` member — have no caller. They are direct database writes.
42. If it returns it is a Firebase Auth custom claim read from the verified token, not a membership row and not a database read, so it stays absent from leaderboards and from the last-owner count (rule 21).
43. A development and operator tool if reintroduced. Nothing else may depend on it.

### Private now, public later

44. All challenges are private. Reads require an `active` membership.
45. Read handlers check `challenge.read` against the actor's role, inline. A non-member — including a `left` or `removed` one — gets `not-found` on every path, worded identically to a missing challenge, so a probe cannot confirm a challenge exists; `forbidden` is only for a member whose role lacks the permission. Going public later relaxes that check in each read handler; there is no shared guard to change in one place.
46. Leaderboard and library payloads expose `name` and an opaque user id. `users` stores no email, so there is nothing to leak.
47. Going public is a per-challenge opt-in, never a migration. Existing readings were logged under "private."
48. If added, `visibility` (who may read) and `join_policy` (how you join) are separate columns. Deferred.
