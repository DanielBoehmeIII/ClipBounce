# Atlas Sprint

Run a fast Base44-style visual iteration loop for Abel.

Use this process:

1. Inspect the current Abel Atlas files:
   - src/components/abel/AtlasTree.tsx
   - src/components/abel/AtlasTree.css
   - src/pages/QuestsPage.tsx
   - src/pages/QuestsPage.css

2. Inspect reference behavior/code only if useful:
   - reference-code/neural-atlas-organized/src/components/atlas/SkillTreeCanvas.jsx
   - reference-code/neural-atlas-organized/src/components/atlas/TreeWires.jsx
   - reference-code/neural-atlas-organized/src/components/atlas/SkillNode.jsx
   - reference-code/neural-atlas-organized/src/pages/Atlas.jsx
   - reference-code/neural-atlas-organized/src/index.css

3. Pick ONE high-impact improvement only.

Good sprint targets:
- wire density
- decorative filaments
- central spine richness
- node rim/anchor treatment
- root stardust cluster
- lower-half visual density
- selected-node emphasis
- reduced glow / more atmospheric detail

4. Implement the smallest safe change.

5. Preserve all existing Abel functionality:
- do not remove quest filtering
- do not replace QuestsPage
- do not break selectedNodeId / onNodeSelect
- do not break keyboard accessibility
- do not break reduced motion
- do not remove theme support
- do not modify reference-code
- do not add dependencies unless explicitly approved

6. Run the available build/typecheck/lint command from package.json.

7. Report:
- what changed
- which reference behavior inspired it
- what files changed
- what existing behavior was preserved
- what the next sprint should target
