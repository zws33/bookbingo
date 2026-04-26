# Architectural Decisions

One entry per decision. Read this file first, then open the relevant file for full context.

| File | Decision summary |
|------|-----------------|
| [adr-system-structure.md](adr-system-structure.md) | Use `docs/decisions/` with topic-named files over MADR; migrate to MADR at ~15 decisions |
| [animation-duration-ownership.md](animation-duration-ownership.md) | Export JS constant from component module to couple CSS transition duration with React cleanup timer; revisit when a second animated component needs the same pattern |
