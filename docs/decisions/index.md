# Architectural Decisions

One entry per decision. Read this file first, then open the relevant file for full context.

| File | Decision summary |
|------|-----------------|
| [adr-system-structure.md](adr-system-structure.md) | Use `docs/decisions/` with topic-named files over MADR; migrate to MADR at ~15 decisions |
| [animation-duration-ownership.md](animation-duration-ownership.md) | Export JS constant from component module to couple CSS transition duration with React cleanup timer; revisit when a second animated component needs the same pattern |
| [ui-primitives-architecture.md](ui-primitives-architecture.md) | One `components/ui/` layer for both Radix headless wrappers and plain presentational primitives; reject `primitives/` vs `ui/` split until ~20 components; records deviations from the archived Radix/refactor plans |
| [book-identity-and-deduplication.md](book-identity-and-deduplication.md) | `externalId`-only identity is currently unreachable (no backfill, manual entry still live); shipped a `readCount>0` orphan filter for #27, deferred the #7 deterministic-ID fix; open question: must every book have an Open Library match? |
