---
name: atlas-tree-art-direction
description: Use when modifying the Abel AtlasTree, QuestsPage Atlas chamber, SVG tree visuals, mystical constellation-tree styling, node/edge atmosphere, or visual fidelity against the Atlas of Being reference image.
---

# Atlas Tree Art Direction Skill

## Purpose

Guide all visual and implementation work on Abel's AtlasTree so it moves toward the reference image: a mystical, sacred, monochrome constellation-tree / living map of being.

This skill applies to:

- `src/components/abel/AtlasTree.tsx`
- `src/components/abel/AtlasTree.css`
- Atlas-related sections of `QuestsPage.tsx`
- Atlas-related sections of `QuestsPage.css`
- Any SVG, CSS, animation, atmosphere, node, edge, or chamber work for the Atlas tree
- Primary visual reference: `reference-img/new/default/quests.png`

## Non-negotiable constraints

Do not change the tree's organization unless explicitly asked.

Do not:

- change the layout algorithm
- reposition the tree structure
- resize lower/leaf nodes smaller
- make the hierarchy more diagrammatic
- add zoom/pan
- add dependencies
- redesign QuestsPage structure
- break quest filtering
- break selectedNodeId / onNodeSelect behavior
- break keyboard accessibility
- break reduced-motion support

The current organization is acceptable. Focus on art direction unless the user explicitly asks for behavior or layout changes.

## Visual target

The Atlas should feel like:

- mystical
- sacred
- celestial
- soft
- smoky
- poetic
- atmospheric
- hand-composed
- moonlit
- quietly magical

It should resemble a spiritual constellation-tree or living map of being.

It should not feel like:

- a graph library
- a neon skill tree
- a SaaS dashboard
- a cyberpunk network map
- a glossy UI widget
- a game tech tree
- a node diagram
- a set of circles with SVG glow filters

## Reference direction

The strongest reference qualities are:

- mostly monochrome pearl / silver / ivory light
- fine mist and dust
- delicate branching filaments
- tiny constellation sparks
- soft celestial orbs
- glowing spiritual spine
- subtle sacred geometry
- atmospheric depth
- restrained UI
- elegance over spectacle

The reference does not rely on large simple radial glow circles. It relies on faint layered atmosphere, branch lace, dust, and luminous points.

## Palette rules

Prefer:

- pearl
- ivory
- silver
- moonlit gray
- faint lavender-gray
- smoky violet
- soft white

Avoid:

- saturated cyan
- saturated magenta
- saturated green
- obvious rainbow branch coloring
- cyberpunk neon
- bright category colors

Branch colors may exist only as extremely subtle ghost tints. The tree itself should read mostly monochrome.

## Node art rules

Nodes should feel like celestial presences, not buttons.

Do:

- make nodes matte, smoky, and luminous
- use soft aura
- use restrained rim light
- use subtle internal glow
- preserve current node sizes
- keep leaf/lower nodes visually comparable in size to current version

Do not:

- use glossy highlights
- use lens-reflection dots
- use shiny glass/marble/button effects
- use black polished cores
- use obvious concentric glow discs
- use giant circular halos behind every node
- make nodes look like UI buttons
- make lower nodes smaller

A node's emphasis should come from aura, brightness, opacity, and relation state, not from shiny material rendering.

## Aura and glow rules

The current problem to avoid:
large simple circular glow fields behind nodes.

Prefer:

- irregular mist
- broken haze
- faint dust clusters
- subtle grain
- small constellation sparks
- soft feathering
- low-opacity atmospheric bloom

Avoid:

- huge uniform circles
- obvious radial-gradient discs
- bullseye halos
- stacked transparent circles
- glow that is brighter than the node itself

The aura should feel woven into the atmosphere, not stamped behind the node.

## Edge and branch rules

Edges should feel like luminous branches, veins, roots, or water-light filaments.

Do:

- keep paths thin and delicate
- use layered atmospheric lines
- use pearl/silver light
- add faint branchlets and micro-filaments
- make related branches feel softly lit from within

Do not:

- make edges chunky
- make paths look like graph connectors
- overuse saturated gradients
- make selected paths look like neon wires

## Atmosphere rules

The Atlas chamber should feel like a sacred space.

Use:

- fine dust
- static star specks
- subtle mist
- faint constellation lace
- a central spiritual spine
- low-opacity grain/noise
- soft vignette

Avoid:

- heavy UI panels
- busy particles
- obvious animation loops
- bright decorative clutter
- effects that overpower the tree

## Interaction rules

Selection should feel magical but restrained.

Selected node:

- strongest presence
- softly illuminated
- not shiny

Related ancestors/descendants:

- visibly connected
- gently brighter
- branch feels alive

Unrelated nodes:

- ghosted but still beautiful
- readable on hover/focus
- not completely gone

Hover/focus:

- tactile but subtle
- no browser-default ugly focus ring
- preserve accessibility

## Motion rules

Motion should be slow, subtle, and optional.

Allowed:

- soft pulse
- shimmer on related branches
- gentle draw-in
- subtle opacity transitions

Do not:

- create chaotic motion
- animate everything
- add distracting particles
- ignore prefers-reduced-motion

Under `prefers-reduced-motion`:

- no pulsing
- no shimmer
- no animateMotion
- no draw-in animation
- static final state only

## Implementation approach

Before editing, identify whether the requested change is:

1. layout/structure
2. behavior/integration
3. art direction
4. node treatment
5. edge treatment
6. atmosphere/chamber treatment

If the user is discussing visual similarity to the reference, default to art direction only.

When improving art direction:

- make the smallest scoped change that improves fidelity
- avoid rewriting the whole component
- preserve existing clean architecture
- keep build clean
- do not add dependencies

## Acceptance criteria

A good AtlasTree change should satisfy:

- It feels closer to the reference image.
- It is less graph-like.
- It is less cyberpunk.
- It is less glossy.
- It is more mystical, smoky, pearlescent, and atmospheric.
- It preserves current layout and node sizing unless explicitly asked.
- It preserves all quest navigation behavior.
- It preserves accessibility.
- It preserves reduced-motion behavior.
- The build remains clean.
