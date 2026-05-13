const GITHUB_API = "https://api.github.com";

function getHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "theib-mcp/0.1.0",
  };
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }
  return headers;
}

async function fetchGitHub(path: string): Promise<unknown> {
  const res = await fetch(`${GITHUB_API}${path}`, { headers: getHeaders() });
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error(
        `GitHub rate limit exceeded. Set GITHUB_TOKEN environment variable to increase limits.`
      );
    }
    throw new Error(`GitHub API error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

interface RepoResult {
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  license: string | null;
  lastPush: string;
  daysSinceLastPush: number;
  isStale: boolean;
  topics: string[];
  openIssues: number;
  defaultBranch: string;
  hasWiki: boolean;
  homepage: string | null;
  archived: boolean;
}

interface CodeResult {
  name: string;
  path: string;
  repoName: string;
  repoUrl: string;
  repoLicense: string | null;
  fileUrl: string;
  score: number;
}

interface TopicResult {
  name: string;
  displayName: string | null;
  description: string | null;
  shortDescription: string | null;
  repositoryCount: number;
  createdAt: string;
  featured: boolean;
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function formatRepo(item: Record<string, unknown>): RepoResult {
  const days = daysSince((item.pushed_at as string) || (item.updated_at as string) || "");
  const licenseData = item.license as Record<string, string> | null;
  return {
    name: item.name as string,
    fullName: item.full_name as string,
    url: item.html_url as string,
    description: item.description as string | null,
    stars: item.stargazers_count as number,
    forks: item.forks_count as number,
    language: item.language as string | null,
    license: licenseData?.spdx_id || licenseData?.name || null,
    lastPush: ((item.pushed_at as string) || "").slice(0, 10),
    daysSinceLastPush: days,
    isStale: days > 548,
    topics: (item.topics as string[]) || [],
    openIssues: item.open_issues_count as number,
    defaultBranch: item.default_branch as string,
    hasWiki: item.has_wiki as boolean,
    homepage: item.homepage as string | null,
    archived: item.archived as boolean,
  };
}

async function searchRepositories(
  query: string,
  sort: string,
  perPage: number
): Promise<{ total: number; items: RepoResult[] }> {
  const encoded = encodeURIComponent(query);
  const data = (await fetchGitHub(
    `/search/repositories?q=${encoded}&sort=${sort}&per_page=${perPage}`
  )) as { total_count: number; items: Record<string, unknown>[] };

  return {
    total: data.total_count,
    items: data.items.map(formatRepo),
  };
}

async function searchCode(
  query: string,
  perPage: number
): Promise<{ total: number; items: CodeResult[] }> {
  const encoded = encodeURIComponent(query);
  const data = (await fetchGitHub(
    `/search/code?q=${encoded}&per_page=${perPage}`
  )) as { total_count: number; items: Record<string, unknown>[] };

  return {
    total: data.total_count,
    items: data.items.map((item) => {
      const repo = item.repository as Record<string, unknown>;
      const licenseData = repo?.license as Record<string, string> | null;
      return {
        name: item.name as string,
        path: item.path as string,
        repoName: repo?.full_name as string,
        repoUrl: (repo?.html_url as string) || "",
        repoLicense: licenseData?.spdx_id || licenseData?.name || null,
        fileUrl: item.html_url as string,
        score: item.score as number,
      };
    }),
  };
}

async function searchTopics(
  query: string,
  perPage: number
): Promise<{ total: number; items: TopicResult[] }> {
  const encoded = encodeURIComponent(query);
  const data = (await fetchGitHub(
    `/search/topics?q=${encoded}&per_page=${perPage}`
  )) as { total_count: number; items: Record<string, unknown>[] };

  return {
    total: data.total_count,
    items: data.items.map((item) => ({
      name: item.name as string,
      displayName: item.display_name as string | null,
      description: item.description as string | null,
      shortDescription: item.short_description as string | null,
      repositoryCount: item.repository_count as number,
      createdAt: (item.created_at as string) || "",
      featured: item.featured as boolean,
    })),
  };
}

export async function githubSearch(
  query: string,
  type: string,
  sort: string,
  perPage: number
): Promise<unknown> {
  if (!query?.trim()) {
    throw new Error("query parameter is required");
  }

  const clampedPerPage = Math.min(Math.max(perPage, 1), 30);

  switch (type) {
    case "repositories":
      return searchRepositories(query, sort, clampedPerPage);
    case "code":
      return searchCode(query, clampedPerPage);
    case "topics":
      return searchTopics(query, clampedPerPage);
    default:
      throw new Error(`Unknown search type: ${type}. Use 'repositories', 'code', or 'topics'.`);
  }
}
