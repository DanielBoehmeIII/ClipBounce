---
name: visual-mcp-sprint
description: Use when making visual/UI changes that require Claude Code to inspect the rendered Abel app through Playwright MCP before and after editing. Especially useful for Atlas, QuestsPage, tree visuals, node/wire interactions, and reference-fidelity work.
---

# Visual MCP Sprint Skill

## Purpose

Use Playwright MCP so Claude Code edits based on the actual rendered UI, not just the source code.

This skill exists because visual work must follow this loop:

1. inspect code
2. run/open the app
3. visually inspect the rendered page
4. compare against reference-code/reference images
5. make one focused change
6. inspect again
7. build/check

## Required behavior

For visual tasks, do not edit blindly.

Before editing:
- start the app if needed
- use Playwright MCP to open the relevant local page
- capture or inspect the rendered page
- identify the actual visual gap from the current render

After editing:
- run build/typecheck/lint as appropriate
- use Playwright MCP again to inspect the changed rendered page
- report whether the visual result improved

## Default Abel visual sources

Use these as read-only references when relevant:

- `reference-code/neural-atlas-organized`
- `reference-code/Abel-Extension`
- `reference-img`
- Graphify reports if present

Do not modify `reference-code`.

## Visual editing rules

Do not make tiny decorative changes when the user is asking for replacement-level visual work.

For Atlas/Quest tree work:
- Base44 wins for visual appearance
- Emergent wins for tree interaction behavior
- Abel wins only for app integration, quest data, routing, and surrounding UI

Do not preserve Abel's current tree renderer if it is visually wrong.

Preserve:
- routes
- quest list/filtering/stats
- selected node integration
- reduced motion
- keyboard/accessibility behavior
- theme compatibility where possible

Do not preserve:
- old tree visual style
- old node rendering
- old wire rendering
- old atmosphere/spine/starfield if it is worse than the references

## MCP usage expectations

Use Playwright MCP for:
- navigation
- screenshots
- hover/click testing
- drag testing
- checking node highlighting behavior
- checking visual before/after state
- verifying page did not disappear/break

Keep MCP usage focused. Do not wander through the app unnecessarily.

## Sprint structure

Each sprint should do one meaningful target:

Good targets:
- replace tree renderer
- implement connected wire highlighting
- improve node visual fidelity
- port Base44-style wires
- port Emergent-style node dragging
- add pan/zoom/reset
- verify visual regression after a change

Bad targets:
- "make it better"
- endless glow tuning
- polishing old broken visuals
- touching unrelated pages

## Output format

Before editing, report:

1. Rendered-page observation
2. Reference comparison
3. Planned change
4. Files to modify

After editing, report:

1. Files changed
2. Build result
3. MCP visual check result
4. What still looks wrong
5. Next best sprint
