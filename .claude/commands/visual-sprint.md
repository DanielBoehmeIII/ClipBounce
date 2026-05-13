# Visual Sprint

Use the `visual-mcp-sprint` skill.

This is a rendered UI iteration task, not a blind code-editing task.

Process:

1. Inspect the relevant source files.
2. Start or use the local dev server.
3. Use Playwright MCP to open the rendered app.
4. Capture/inspect the current page.
5. Compare the actual render against the reference source/images.
6. Choose one focused change.
7. Edit code.
8. Run build/typecheck/lint.
9. Use Playwright MCP again to inspect the changed page.
10. Report before/after observations.

Rules:
- Do not modify `reference-code`.
- Do not add `reference-code` to git.
- Do not remove existing Abel functionality.
- Do not make cosmetic micro-edits if the task requires replacing a bad implementation.
- Preserve Abel app integration.
- Use Base44 for visual tree direction.
- Use Emergent for tree interaction behavior.
- Run a real visual check after edits.
