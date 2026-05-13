---
name: abel-visual-redesign
description: Use when redesigning Abel UI pages toward the cinematic visual universe, especially MainPage, GraphPage, ExhibitionPage, FocusPage, EggHatchPage, SkillWebPage, ArchivePage, SettingsPage, or orbital navigation systems.
---

# Abel Visual Redesign Skill

## Purpose

Move Abel from "mystical styled app" to "finished visual universe."

## Read first

Read these if they exist:

- `CLAUDE.md`
- `docs/ABEL_VISUAL_NORTHSTAR.md`
- `docs/ABEL_VISUAL_GAPS.md`
- `docs/ABEL_COMPONENT_SYSTEM.md`
- `docs/ABEL_GRAPHIFY.md`
- `graphify-out-code/GRAPH_REPORT.md`
- `graphify-out-default-references/GRAPH_REPORT.md`

Do not run Graphify. Use existing reports only.

## Process

1. Inspect the relevant page, components, styles, and routes.
2. Identify the page fantasy:
   - portal
   - intelligence graph
   - museum exhibition
   - focus chamber
   - archive chamber
   - reward artifact
   - orbital atlas
3. Strengthen composition before styling.
4. Ensure the page has one dominant hero object or field.
5. Use orbital navigation/central-hero composition when appropriate.
6. Add or preserve non-WebGL fallback monuments.
7. Improve readability without making the page generic.
8. Extract reusable primitives only when they reduce duplication or improve consistency.
9. Preserve existing routing, state, and interactions.
10. Run build/typecheck/lint if available.

## Visual rules

Prefer:

- cinematic spatial composition
- editorial serif typography
- precise sans micro-labels
- glass/crystal/monolith materiality
- celestial/orbital linework
- dark neutral atmosphere
- restrained cyan/violet/gold accents
- readable labels
- strong selected states

Avoid:

- generic SaaS cards
- tiny dim labels
- random glow without composition
- cyberpunk overload
- weak empty centers
- flat SVG logos pretending to be hero objects
- pages that depend entirely on WebGL to feel complete

## Output

Summarize:

- files changed
- what visually improved
- what functionality was preserved
- validation run
- remaining visual gaps
