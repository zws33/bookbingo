# Architectural Decisions

One entry per decision. Read this file first, then open the relevant file for full context.

| File | Decision summary |
|------|-----------------|
| [adr-system-structure.md](adr-system-structure.md) | Use `docs/decisions/` with topic-named files over MADR; migrate to MADR at ~15 decisions |
| [animation-duration-ownership.md](animation-duration-ownership.md) | Export JS constant from component module to couple CSS transition duration with React cleanup timer; revisit when a second animated component needs the same pattern |
| [ui-primitives-architecture.md](ui-primitives-architecture.md) | One `components/ui/` layer for both Radix headless wrappers and plain presentational primitives; reject `primitives/` vs `ui/` split until ~20 components; records deviations from the archived Radix/refactor plans |
| [book-identity-and-deduplication.md](book-identity-and-deduplication.md) | **Resolved:** book identity is a deterministic, hash-derived doc ID — `hash("openLibrary:"+workKey)` for catalog books, `hash("manual:"+normTitle+"|"+normAuthor)` for manual (conservative normalization). Dedup becomes `getDoc`, not a query; closes the #7 race. `externalIds` demoted to a provenance map-of-objects. Supersedes `BOOK_DATA_MODEL.md`'s query-based dedup. **Implemented & deployed (staging + prod, 2026-06-22).** |
| [tbr-reading-payload-unification.md](tbr-reading-payload-unification.md) | **Proposed:** TBR and Reading embed the same `ScoringInput` payload (`{tiles, isFreebie}`) in per-collection envelopes; `plannedTiles→tiles`, `+isFreebie`, `notes` removed. Keep two collections (Model X), reject merge-under-`status` (Model Y). Promotion becomes a payload copy; freebie validated at plan time with union(readings, TBR) scope; identity locked on edit. Supersedes `TBR_PLAN.md §2/§6`. Implementation plan: `FORM_AND_DIALOG_UNIFICATION.md`. |
