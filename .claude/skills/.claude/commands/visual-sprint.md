# Visual Sprint

You are running a fast Abel visual iteration loop.

Use this process:

1. Inspect the current target files.
2. Inspect relevant reference-code only if helpful:
   - reference-code/neural-atlas-organized
   - reference-code/Abel-Extension
3. Compare the current Abel implementation against the target reference/art direction.
4. Choose ONE high-impact visual improvement.
5. Implement the smallest code/CSS change that moves Abel closer.
6. Run the project build/typecheck/lint command available in package.json.
7. Summarize:
   - what changed
   - what visual gap it targets
   - what was preserved
   - what should be next

Rules:
- Do not remove existing Abel functionality.
- Do not replace Abel with the reference app.
- Do not modify reference-code.
- Do not add dependencies unless absolutely necessary.
- Do not change layout unless explicitly asked.
- Prefer targeted edits over rewrites.
- Keep build clean.

For Atlas work:
- Preserve dynamic tree data.
- Preserve selectedNodeId/onNodeSelect behavior.
- Preserve quest filtering.
- Preserve keyboard accessibility.
- Preserve reduced motion.
- Improve visual fidelity incrementally.
