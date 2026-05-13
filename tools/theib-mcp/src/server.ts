import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { githubSearch } from "./github_search.js";
import { packageSearch } from "./package_search.js";
import { docsCrawler } from "./docs_crawler.js";
import { licenseChecker } from "./license_checker.js";

const TOOLS: Tool[] = [
  {
    name: "theib_github_search",
    description:
      "Search GitHub for repositories, code snippets, or topics relevant to a feature you want to implement. Returns repo metadata including license, stars, last push date, and description. Use this during Theib research runs to find open-source implementations.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "GitHub search query. Supports syntax like: stars:>100 language:typescript topic:graph-visualization",
        },
        type: {
          type: "string",
          enum: ["repositories", "code", "topics"],
          default: "repositories",
          description: "What to search: repositories, code snippets, or GitHub topics",
        },
        sort: {
          type: "string",
          enum: ["stars", "updated", "forks", "best-match"],
          default: "stars",
          description: "Sort order for results",
        },
        per_page: {
          type: "number",
          minimum: 1,
          maximum: 30,
          default: 10,
          description: "Number of results to return (max 30)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "theib_package_search",
    description:
      "Fetch metadata for an npm or PyPI package including license, version, description, weekly downloads, homepage, and repository URL. Use this to evaluate a package as a Theib source.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Package name (exact, e.g. 'd3-force', 'zustand', 'networkx')",
        },
        registry: {
          type: "string",
          enum: ["npm", "pypi"],
          default: "npm",
          description: "Package registry to search",
        },
        include_deps: {
          type: "boolean",
          default: false,
          description: "Include the package's dependency list in the response",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "theib_docs_crawler",
    description:
      "Fetch a documentation page, README, or blog post and return structured content. Useful for extracting API surface, usage examples, and architecture descriptions from Theib sources.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to fetch (documentation page, GitHub README, blog post, npm package page)",
        },
        extract: {
          type: "string",
          enum: ["full", "headings", "code-blocks", "summary"],
          default: "full",
          description:
            "What to extract: 'full' = cleaned text, 'headings' = outline only, 'code-blocks' = only code examples, 'summary' = first paragraph + headings",
        },
        max_length: {
          type: "number",
          default: 8000,
          minimum: 500,
          maximum: 40000,
          description: "Maximum characters to return",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "theib_license_checker",
    description:
      "Classify a software license and return Theib's safe-use guidance: whether code can be copied, adapted, used as a dependency, and what attribution is required. Can accept a license string, an npm package name, or a PyPI package name.",
    inputSchema: {
      type: "object",
      properties: {
        license: {
          type: "string",
          description: "License string to classify (SPDX identifier or common name, e.g. 'MIT', 'GPL-3.0', 'Apache-2.0')",
        },
        npm_package: {
          type: "string",
          description: "npm package name — license will be fetched from the registry",
        },
        pypi_package: {
          type: "string",
          description: "PyPI package name — license will be fetched from the registry",
        },
      },
    },
  },
];

const server = new Server(
  { name: "theib-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      case "theib_github_search":
        result = await githubSearch(
          args?.query as string,
          (args?.type as string) || "repositories",
          (args?.sort as string) || "stars",
          Number(args?.per_page ?? 10)
        );
        break;

      case "theib_package_search":
        result = await packageSearch(
          args?.name as string,
          (args?.registry as string) || "npm",
          Boolean(args?.include_deps ?? false)
        );
        break;

      case "theib_docs_crawler":
        result = await docsCrawler(
          args?.url as string,
          (args?.extract as string) || "full",
          Number(args?.max_length ?? 8000)
        );
        break;

      case "theib_license_checker":
        result = await licenseChecker({
          license: args?.license as string | undefined,
          npmPackage: args?.npm_package as string | undefined,
          pypiPackage: args?.pypi_package as string | undefined,
        });
        break;

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error in ${name}: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Theib MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
