---
name: abel-doc-maintenance
description: Use when updating Abel project docs, CLAUDE.md, visual north star, visual gaps, component system notes, Graphify notes, or skill documentation.
---

# Abel Doc Maintenance Skill

## Purpose

Keep Abel's instructions, docs, and skills clean, non-duplicative, and useful.

## Rules

- Keep `CLAUDE.md` short.
- Put permanent project behavior in `CLAUDE.md`.
- Put visual canon in `docs/ABEL_VISUAL_NORTHSTAR.md`.
- Put current problems in `docs/ABEL_VISUAL_GAPS.md`.
- Put reusable primitives in `docs/ABEL_COMPONENT_SYSTEM.md`.
- Put Graphify outputs/usage notes in `docs/ABEL_GRAPHIFY.md`.
- Put repeatable workflows in `.claude/skills/*/SKILL.md`.

## Process

1. Identify duplicated instructions.
2. Keep the shortest always-loaded version in `CLAUDE.md`.
3. Move long guidance into docs.
4. Move repeatable procedures into skills.
5. Preserve Graphify safety rules.
6. Do not add broad vague rules.
7. Prefer specific trigger descriptions for skills.
8. Summarize what moved and why.

## Do not

- Put full Graphify reports in `CLAUDE.md`.
- Put long visual manifestos in `CLAUDE.md`.
- Create many overlapping skills.
- Run Graphify.
- Re-extract images.
