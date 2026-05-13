---
name: abel-screenshot-audit
description: Use when reviewing Abel screenshots against reference images, identifying visual gaps, weak composition, clipping, unreadable labels, empty centers, or missing hero objects.
---

# Abel Screenshot Audit Skill

## Purpose

Evaluate Abel screenshots ruthlessly against the visual north star and reference graph.

## Read first

Read these if they exist:

- `CLAUDE.md`
- `docs/ABEL_VISUAL_NORTHSTAR.md`
- `docs/ABEL_VISUAL_GAPS.md`
- `docs/ABEL_GRAPHIFY.md`
- `graphify-out-default-references/GRAPH_REPORT.md`

Do not run Graphify. Use existing reports only.

## Audit checklist

For each screenshot, answer:

1. Does the page have a dominant focal object or field?
2. Does it feel cinematic, or just like an app with effects?
3. Is the typography integrated into the scene?
4. Are labels readable?
5. Is there clipping, overflow, or bottom-bar collision?
6. Does the page still work visually if WebGL is absent?
7. Are panels purposeful or generic?
8. Does the page have its own fantasy/metaphor?
9. Is orbital navigation being used structurally or only decoratively?
10. What is the one highest-leverage fix?

## Output format

Return:

1. Overall diagnosis
2. Page-by-page gap list
3. Top 5 urgent fixes
4. Suggested implementation order
5. Exact next Claude Code prompt

Be direct. Do not flatter the work.
