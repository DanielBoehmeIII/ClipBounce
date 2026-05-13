# Theib MCP Server

A local Model Context Protocol server that gives Claude Code direct access to GitHub search, npm/PyPI package metadata, documentation crawling, and license verification — all tuned for Theib implementation scouting runs.

## Tools Exposed

| Tool | Description |
|------|-------------|
| `theib_github_search` | Search GitHub for repos, code, and topics |
| `theib_package_search` | Fetch npm/PyPI package metadata and license |
| `theib_docs_crawler` | Fetch and structure a documentation page |
| `theib_license_checker` | Classify a license string or fetch from a package |

## Prerequisites

- Node.js 18+
- npm 9+
- Optional: `GITHUB_TOKEN` env var (unauthenticated GitHub API is limited to 60 req/hour)

## Install

```bash
cd tools/theib-mcp
npm install
npm run build
```

## Register with Claude Code

Add to your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "theib": {
      "command": "node",
      "args": ["/absolute/path/to/tools/theib-mcp/dist/server.js"],
      "env": {
        "GITHUB_TOKEN": "your_token_here"
      }
    }
  }
}
```

Or use the CLI to add it:

```bash
claude mcp add theib node /absolute/path/to/tools/theib-mcp/dist/server.js
```

## Development

```bash
npm run dev     # runs with ts-node for live reload
npm run build   # compile to dist/
npm run lint    # eslint check
```

## Tool Reference

### `theib_github_search`

Search GitHub for repositories or code.

**Parameters:**
- `query` (string, required) — Search query. Supports GitHub search syntax: `stars:>100 language:typescript`
- `type` (enum, default: `"repositories"`) — `"repositories"` | `"code"` | `"topics"`
- `sort` (enum, default: `"stars"`) — `"stars"` | `"updated"` | `"forks"` | `"best-match"`
- `per_page` (number, default: 10, max: 30) — Results per page

**Example:**
```json
{
  "query": "force-directed graph typescript stars:>200",
  "type": "repositories",
  "sort": "stars",
  "per_page": 10
}
```

**Returns:** Array of repo summaries with name, URL, stars, language, license, last push, description, topics.

---

### `theib_package_search`

Fetch package metadata from npm or PyPI.

**Parameters:**
- `name` (string, required) — Package name
- `registry` (enum, default: `"npm"`) — `"npm"` | `"pypi"`
- `include_deps` (boolean, default: false) — Include dependency list

**Example:**
```json
{
  "name": "d3-force",
  "registry": "npm",
  "include_deps": true
}
```

**Returns:** Package metadata including version, license, description, homepage, weekly downloads, dependency count, repository URL.

---

### `theib_docs_crawler`

Fetch a documentation page and return structured content.

**Parameters:**
- `url` (string, required) — URL to fetch
- `extract` (enum, default: `"full"`) — `"full"` | `"headings"` | `"code-blocks"` | `"summary"`
- `max_length` (number, default: 8000) — Maximum characters to return

**Example:**
```json
{
  "url": "https://d3js.org/d3-force",
  "extract": "headings"
}
```

**Returns:** Structured content from the page. For `"headings"`: outline only. For `"code-blocks"`: only code examples. For `"summary"`: first paragraph + all headings. For `"full"`: cleaned full text up to max_length.

---

### `theib_license_checker`

Classify a license string or fetch and classify a package's license.

**Parameters:**
- `license` (string, optional) — License SPDX identifier or common name
- `npm_package` (string, optional) — npm package name to fetch license from
- `pypi_package` (string, optional) — PyPI package name to fetch license from

Provide exactly one of the three parameters.

**Example:**
```json
{ "npm_package": "react-force-graph" }
```

**Returns:**
```json
{
  "input": "MIT",
  "spdx": "MIT",
  "tier": 1,
  "label": "Safe",
  "copy_code": true,
  "adapt_code": true,
  "use_as_dep": true,
  "attribution_required": false,
  "risk": "Low",
  "notes": "Most permissive. Attribution preferred but not required."
}
```

## Environment Variables

| Variable | Required | Description |
|----------|---------|-------------|
| `GITHUB_TOKEN` | Recommended | GitHub Personal Access Token. Without it, GitHub API is rate-limited to 60 req/hour. Create at github.com/settings/tokens (no special scopes needed for public repos). |

## Architecture

```
src/
  server.ts          — MCP server entry point, tool registration
  github_search.ts   — GitHub Search API wrapper
  package_search.ts  — npm registry + PyPI API wrapper
  docs_crawler.ts    — HTTP fetch + HTML → markdown extractor
  license_checker.ts — License classifier (synced with scripts/license_classifier.py)
```

The server uses stdio transport (standard MCP pattern) so Claude Code spawns it as a subprocess.

## Troubleshooting

**"GitHub rate limit exceeded"**: Set `GITHUB_TOKEN` in the MCP server env config.

**"Tool not found"**: Run `npm run build` and verify the `dist/server.js` path in settings.json.

**"Cannot find module"**: Run `npm install` in `tools/theib-mcp/`.

**Server crashes silently**: Check stderr output — Claude Code surfaces MCP server stderr in the debug log. Run `node dist/server.js` directly to see startup errors.
