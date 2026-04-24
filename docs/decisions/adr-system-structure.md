# ADR System Structure

**Status:** Active
**Date:** 2026-04-24

## Context

BookBingo had no formal system for recording architectural decisions. As the project increasingly uses agentic coding sessions, ad-hoc rationale buried in planning docs is insufficient — agents arriving cold cannot efficiently find why specific patterns were chosen, and the decision history is lost over time.

Three options were considered:

1. **MADR (`docs/adr/NNNN-title.md`)** — established standard, sequential numbering, strict template (Status / Context / Decision / Consequences). Wide agent recognition due to prevalence in training data. Cost: numbering ceremony adds friction for a project with few decisions; renaming on reorder is annoying.

2. **Inline in CLAUDE.md** — maximum agent discoverability (CLAUDE.md is loaded every session, so decisions are always in context). Cost: CLAUDE.md becomes dual-purpose and grows unbounded; signal-to-noise ratio degrades past ~5 decisions.

3. **`docs/decisions/` with topic-named files and a scannable index** — no numbering, descriptive filenames, one read of `index.md` surfaces all decisions. Agents load only what's relevant. Cost: custom structure, no enforced template, quality depends on discipline.

## Decision

Use Option 3. `docs/decisions/` holds one file per decision, named by topic. `docs/decisions/index.md` is a single-read entry point for agents and humans. CLAUDE.md points to the index under both the Research workflow and Architecture Guidance sections.

Each decision file includes: Status, Context, Options Considered, Decision, Tradeoffs, and When to Revisit.

## Tradeoffs

- Lower ceremony than MADR — appropriate for a solo hobby project
- Not a standard format agents will pattern-match on as readily as MADR
- No sequential numbering means no implicit ordering or cross-reference by ID
- Quality of entries depends on consistent discipline, not enforced tooling

## When to Revisit

Migrate to MADR if:
- The number of decision files exceeds ~15
- Multiple contributors join and would benefit from standardized tooling and sequential IDs

Migration is mechanical: rename files to `NNNN-title.md`, add Date fields, rebuild the index. Content does not need rewriting.
