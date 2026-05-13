const NPM_REGISTRY = "https://registry.npmjs.org";
const PYPI_API = "https://pypi.org/pypi";

interface PackageResult {
  name: string;
  version: string;
  description: string | null;
  license: string | null;
  licenseNormalized: string | null;
  homepage: string | null;
  repository: string | null;
  weeklyDownloads: number | null;
  lastPublished: string | null;
  maintainers: string[];
  keywords: string[];
  dependencies: Record<string, string> | null;
  devDependencies: Record<string, string> | null;
  dependencyCount: number;
  devDependencyCount: number;
  registry: string;
}

function normalizeNpmLicense(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    return (obj.type as string) || null;
  }
  return null;
}

async function fetchNpmPackage(name: string, includeDeps: boolean): Promise<PackageResult> {
  const url = `${NPM_REGISTRY}/${encodeURIComponent(name)}/latest`;
  const res = await fetch(url, {
    headers: { "User-Agent": "theib-mcp/0.1.0" },
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`npm package not found: ${name}`);
    }
    throw new Error(`npm registry error ${res.status}: ${res.statusText}`);
  }

  const data = (await res.json()) as Record<string, unknown>;

  // Fetch download stats separately
  let weeklyDownloads: number | null = null;
  try {
    const statsUrl = `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`;
    const statsRes = await fetch(statsUrl, {
      headers: { "User-Agent": "theib-mcp/0.1.0" },
    });
    if (statsRes.ok) {
      const stats = (await statsRes.json()) as Record<string, unknown>;
      weeklyDownloads = stats.downloads as number | null;
    }
  } catch {
    // Downloads are optional
  }

  const deps = (data.dependencies as Record<string, string> | null) || null;
  const devDeps = (data.devDependencies as Record<string, string> | null) || null;
  const repoData = data.repository as Record<string, unknown> | string | null;
  const repository =
    typeof repoData === "string"
      ? repoData
      : repoData
      ? (repoData.url as string | null)
      : null;

  const maintainers = (data.maintainers as Array<Record<string, unknown>> | null)
    ?.map((m) => m.name as string)
    .filter(Boolean) ?? [];

  const licenseRaw = normalizeNpmLicense(data.license);

  return {
    name: data.name as string,
    version: data.version as string,
    description: (data.description as string | null) || null,
    license: licenseRaw,
    licenseNormalized: licenseRaw?.replace(/ OR /gi, " | ") ?? null,
    homepage: (data.homepage as string | null) || null,
    repository: repository?.replace(/^git\+/, "").replace(/\.git$/, "") || null,
    weeklyDownloads,
    lastPublished: null, // not in latest endpoint
    maintainers,
    keywords: (data.keywords as string[]) || [],
    dependencies: includeDeps ? deps : null,
    devDependencies: null,
    dependencyCount: deps ? Object.keys(deps).length : 0,
    devDependencyCount: devDeps ? Object.keys(devDeps).length : 0,
    registry: "npm",
  };
}

async function fetchPypiPackage(name: string, includeDeps: boolean): Promise<PackageResult> {
  const url = `${PYPI_API}/${encodeURIComponent(name)}/json`;
  const res = await fetch(url, {
    headers: { "User-Agent": "theib-mcp/0.1.0" },
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`PyPI package not found: ${name}`);
    }
    throw new Error(`PyPI API error ${res.status}: ${res.statusText}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const info = data.info as Record<string, unknown>;

  // Extract license from classifiers if the license field is vague
  let license = (info.license as string | null) || null;
  const classifiers = (info.classifiers as string[]) || [];
  if (!license || license.toLowerCase() === "unknown") {
    for (const c of classifiers) {
      if (c.startsWith("License ::")) {
        const parts = c.split(" :: ");
        if (parts.length >= 3) {
          license = parts[parts.length - 1];
          break;
        }
      }
    }
  }

  // Extract requires (dependencies)
  const requires = (info.requires_dist as string[] | null) || [];

  // Get latest version release info
  const releases = data.releases as Record<string, unknown[]>;
  const latestVersion = info.version as string;
  const versionReleases = releases[latestVersion] || [];
  const latestRelease = versionReleases[versionReleases.length - 1] as Record<string, unknown>;
  const lastPublished = latestRelease
    ? ((latestRelease.upload_time as string) || "").slice(0, 10)
    : null;

  const projectUrls = (info.project_urls as Record<string, string> | null) || {};
  const repository =
    projectUrls["Source"] ||
    projectUrls["Repository"] ||
    projectUrls["Source Code"] ||
    projectUrls["GitHub"] ||
    null;

  return {
    name: info.name as string,
    version: latestVersion,
    description: (info.summary as string | null) || null,
    license,
    licenseNormalized: license,
    homepage: (info.home_page as string | null) || null,
    repository: repository || null,
    weeklyDownloads: null, // PyPI doesn't expose this directly
    lastPublished,
    maintainers: info.author ? [info.author as string] : [],
    keywords: ((info.keywords as string | null) || "").split(/[,\s]+/).filter(Boolean),
    dependencies: includeDeps
      ? Object.fromEntries(requires.map((r) => [r.split(/[><=!\[]/)[0].trim(), r]))
      : null,
    devDependencies: null,
    dependencyCount: requires.length,
    devDependencyCount: 0,
    registry: "pypi",
  };
}

export async function packageSearch(
  name: string,
  registry: string,
  includeDeps: boolean
): Promise<PackageResult> {
  if (!name?.trim()) {
    throw new Error("name parameter is required");
  }

  switch (registry) {
    case "npm":
      return fetchNpmPackage(name.trim(), includeDeps);
    case "pypi":
      return fetchPypiPackage(name.trim(), includeDeps);
    default:
      throw new Error(`Unknown registry: ${registry}. Use 'npm' or 'pypi'.`);
  }
}
