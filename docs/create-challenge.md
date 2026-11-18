# Create Challenge

Preliminary requirements for the challenge creation experience. Status: planning. Nothing here is implemented. Written 2026-11-18. Delete this file when the work ships.

## Context

Rule 12 of [challenge-model.md](challenge-model.md) says the tag vocabulary is per-challenge and that `TILES` becomes seed data for one challenge. Neither the seed data nor any bulk write exists: `functions/src/domain/constants.ts` was deleted in 573b4bf and nothing replaced it. `challengesRepo.create` inserts the challenge, the owner membership and the join code only, so every challenge is born with an empty vocabulary. The only write is `createTag`, one label per callable, and no frontend code calls it — `app/web/src/data/tags.ts` does not exist.

A challenge created through the product today therefore cannot be played. `getBoardConfigV2` returns `tiles: []`, no reading can carry a tag, and every score is 0. [scoring-model.md](scoring-model.md) states `N ≥ 2` as a product bound; nothing enforces it, and `setChallengeStatus('active')` will start a challenge with zero tags.

Outcome: an owner can create a challenge, fill its vocabulary from a preset, choose a scoring engine, invite players with the join code, and activate — without a database client.

## Data required to create a challenge

| Field            | Where it lives                                   | Status today                                                             |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| `name`           | `challenges.name`                                | Collected at create                                                      |
| `tagCap`         | `challenges.tag_cap`                             | Collected at create                                                      |
| tag vocabulary   | `tags` rows                                      | **No write path beyond one-at-a-time `createTag`; no preset**            |
| scoring engine   | `challenge_scoring_config.engine`                | **No write path at all — `ScoringConfigRepository` is `getEngine` only** |
| join code        | `join_codes`, written in the create transaction  | Returned by `createChallenge`, **discarded by the UI**                   |
| owner membership | `memberships`, written in the create transaction | Correct                                                                  |
| `status`         | starts `draft`                                   | Correct; activation is the real "go live" step and is unguarded          |

## Decisions

1. **Draft first, then a bulk `setTags`.** `createChallenge` is unchanged except for the engine. A new `setTags({challengeId, labels})` replaces the whole vocabulary in one transaction, gated `draft`-only. Wholesale replace is safe because `draft` rejects reading and TBR writes (rule 34), so no `reading_tags` or `tbr_entry_tags` row can reference a tag being replaced; the `on delete restrict` keys are the backstop if that stops being true.
2. **The recovered 49-label list ships as an editable client-side preset.** It is starting text, not a server-enforced catalog, so it lives in the web app, not in `lib/`. No new workspace package.
3. **Engine chosen at create, editable while `draft`.** `setScoringEngine` is gated on `config.edit` + `statusAllows('configEdit')`, so it locks at `active` for the same reason `tagCap` does — scores already depend on it.
4. **Create stays short; a draft setup checklist finishes the job.** No wizard. The existing routes, the `ChallengeLayout` draft banner and the settings screens absorb the work, and the tag editor is written once and reused by settings.

## Functions work

### `functions/src/tags/`

- `store.ts` — add `replaceAll(challengeId, labels): Promise<Tag[]>`: `delete from tags where challenge_id = $1` then a multi-row insert, in one `inTransaction`. `TAG_ERRORS` already maps `reading_tags_tag_id_challenge_id_fkey` and `tbr_entry_tags_tag_id_challenge_id_fkey` to a caller-facing conflict.
- `schema.ts` — `SetTagsRequestSchema = ChallengeRef.extend({ labels: z.array(TagLabel).min(2).max(MAX_TAGS_PER_CHALLENGE) })`, plus a refinement rejecting case-insensitive duplicates by name. Without it the first collision surfaces as `tags_challenge_label_idx` mid-transaction, which cannot say which label repeated.
- `handler.ts` — `setTags`, running the existing `authorizeWrite(challengeId, uid, 'tag.write')`, which applies membership → permission → `configEdit` in that order.
- `common/limits.ts` — add `MAX_TAGS_PER_CHALLENGE` (200). The vocabulary is read on every scoring call, so it is a cost ceiling like the others there.

### `functions/src/scoring/store.ts`

- Add `setEngine(challengeId, engine)`: insert with `on conflict (challenge_id) do update`. `SCORING_CONFIG_ERRORS` already maps the challenge foreign key.

### `functions/src/challenges/`

- `schema.ts` — `CreateChallengeRequestSchema` gains `scoringEngine: EngineSchema.optional()`; new `SetScoringEngineRequestSchema`.
- `permissions.ts` — `canActivate(tagCount, tagCap)`: `tagCount >= 2 && tagCap <= tagCount`. Used twice, as `canTransition` is: a precheck in the handler for a good message, and the authority inside the repository transaction.
- `store.ts` — `setStatus` counts `tags` under its existing row lock and applies `canActivate` when the target is `active`. `remove` already reaches `tags` from this repository, so the precedent holds.
- `handler.ts` — `create` writes the engine through `scoringConfigRepo.setEngine` after `challengesRepo.create` returns, and only when one was supplied. Deliberately not atomic: an absent row resolves to `DEFAULT_ENGINE` inside the scoring repository, so a failure there leaves a legal state the owner can correct while `draft`, and the alternative is the challenges store writing a table the scoring module owns. New handler: `setScoringEngine`. `get` adds `scoringEngine` to `ChallengeDetailDTO` from the `Promise.all` it already runs — not to `ChallengeDTO`, which would force a join into `getChallengesByUserId`.
- `index.ts` — register `setTags` and `setChallengeScoringEngine`; pass `scoringConfigRepo` to `challengeHandlers`.

Tests follow the existing shape: fake-repository handler tests that reject unexpected calls, and `*.db.test.ts` for `replaceAll`, `setEngine` and the activation guard.

## Web work

| File                                             | Change                                                                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/data/tags.ts` _(new)_                       | `listTags`, `setTags`, `createTag`, `updateTag`, `deleteTag` via `createCallable`; response schemas in `types/schemas.ts`         |
| `src/challenge/tagPresets.ts` _(new)_            | The 49 labels recovered from `git show 573b4bf^:functions/src/domain/constants.ts`, as `{ id, name, labels }` presets             |
| `src/components/TagVocabularyEditor.tsx` _(new)_ | Line editor over `labels: string[]`: preset load, add, rename, remove, duplicate and count validation mirroring the server        |
| `src/components/DraftSetupPanel.tsx` _(new)_     | The checklist: vocabulary, tags-per-book, invite code with copy, then Activate. Disabled with the reason when `canActivate` fails |
| `src/pages/CreateChallengePage.tsx`              | Add engine and preset selects; keep it to one submit; route to the draft challenge                                                |
| `src/pages/ChallengeSettingsPage.tsx`            | Mount `TagVocabularyEditor` and the engine select, both draft-only; mount `DraftSetupPanel`                                       |
| `src/challenge/permissions.ts`                   | Mirror `canActivate`; the file already mirrors the server's status and role tables                                                |
| `src/challenge/challengeValidation.ts` _(new)_   | Hoist the name and tag-cap rules duplicated between `CreateChallengePage.tsx:11` and `ChallengeSettingsPage.tsx:24`               |
| `src/lib/queryClient.ts`                         | Add `queryKeys.tags(challengeId)`; invalidate it and `boardConfig` after `setTags`                                                |

Mutations stay imperative (`try`/`catch`/`finally` + `invalidateQueries` + toast), matching every other page. Page tests use `renderInChallenge` with `vi.mock('../data/tags')`.

## Out of scope

`MembersPage.tsx:153-157` stubs role changes and removal with "land with the member callables" — but `setMemberRole` and `removeMember` are both live in `functions/src/index.ts`. That is a frontend-only gap, unrelated to creation, and belongs in its own change.

## Verification

1. `pnpm run verify` and `pnpm --filter @bookbingo/functions test`.
2. `docker compose up -d --wait`, then `pnpm run test:db` for `replaceAll`, `setEngine`, and `setStatus` refusing activation at `tagCount < 2` and at `tagCap > tagCount`.
3. `pnpm --filter @bookbingo/web test` for the editor, the checklist and the create page.
4. End to end against the emulator (`pnpm run emulator:start`, `pnpm --filter @bookbingo/web dev:emulator`): create a challenge with the preset, confirm the checklist shows 49 tags and the join code, activate, open the board and confirm 49 tiles, log a reading at the cap, confirm the leaderboard scores it. Then confirm the vocabulary editor and the engine select are both read-only once `active`.

## Risks

- **Wholesale replace rests on `draft` having no history.** If a later change lets a `draft` challenge hold readings, `setTags` starts failing on the restrict keys rather than corrupting scores — loud, but it would need a diff-based replace at that point.
- **`setTags` ids churn.** Every call issues new `tags.id` values. Harmless while `draft`, and the reason the editor is draft-only.
- **The engine write is not atomic with create.** The absent-row default is what makes it safe.
