interface LicenseResult {
  input: string;
  spdx: string;
  tier: 1 | 2 | 3 | 4;
  tierLabel: "Safe" | "Caution" | "Restricted" | "Blocked";
  label: string;
  copyCode: boolean;
  adaptCode: boolean;
  useAsDep: boolean;
  attributionRequired: boolean;
  risk: "Low" | "Medium" | "High" | "Critical" | "Unknown";
  notes: string;
}

interface LicenseEntry {
  tier: 1 | 2 | 3 | 4;
  label: string;
  copyCode: boolean;
  adaptCode: boolean;
  useAsDep: boolean;
  attributionRequired: boolean;
  risk: LicenseResult["risk"];
  notes: string;
}

const LICENSE_DB: Record<string, LicenseEntry> = {
  MIT: { tier: 1, label: "✅ Safe", copyCode: true, adaptCode: true, useAsDep: true, attributionRequired: false, risk: "Low", notes: "Most permissive. Attribution preferred but not legally required." },
  ISC: { tier: 1, label: "✅ Safe", copyCode: true, adaptCode: true, useAsDep: true, attributionRequired: false, risk: "Low", notes: "Functionally equivalent to MIT." },
  "0BSD": { tier: 1, label: "✅ Safe", copyCode: true, adaptCode: true, useAsDep: true, attributionRequired: false, risk: "Low", notes: "Zero-clause BSD. No requirements at all." },
  UNLICENSE: { tier: 1, label: "✅ Safe", copyCode: true, adaptCode: true, useAsDep: true, attributionRequired: false, risk: "Low", notes: "Public domain dedication." },
  "CC0-1.0": { tier: 1, label: "✅ Safe", copyCode: true, adaptCode: true, useAsDep: true, attributionRequired: false, risk: "Low", notes: "Creative Commons public domain." },
  WTFPL: { tier: 1, label: "✅ Safe", copyCode: true, adaptCode: true, useAsDep: true, attributionRequired: false, risk: "Low", notes: "No restrictions." },
  "APACHE-2.0": { tier: 1, label: "✅ Safe", copyCode: true, adaptCode: true, useAsDep: true, attributionRequired: true, risk: "Low", notes: "Requires NOTICE file preservation. Includes patent grant — preferred in patent-heavy domains." },
  "BSD-2-CLAUSE": { tier: 1, label: "✅ Safe", copyCode: true, adaptCode: true, useAsDep: true, attributionRequired: true, risk: "Low", notes: "Preserve copyright notice." },
  "BSD-3-CLAUSE": { tier: 1, label: "✅ Safe", copyCode: true, adaptCode: true, useAsDep: true, attributionRequired: true, risk: "Low", notes: "Preserve notice. No endorsement without permission." },
  ZLIB: { tier: 1, label: "✅ Safe", copyCode: true, adaptCode: true, useAsDep: true, attributionRequired: true, risk: "Low", notes: "Preserve notice in documentation." },
  "ARTISTIC-2.0": { tier: 1, label: "✅ Safe", copyCode: true, adaptCode: true, useAsDep: true, attributionRequired: true, risk: "Low", notes: "Permissive with modification notice." },
  "MPL-2.0": { tier: 2, label: "⚠️ Caution", copyCode: false, adaptCode: true, useAsDep: true, attributionRequired: true, risk: "Medium", notes: "File-level copyleft. Keep MPL code in separate files. OK as npm dep." },
  "LGPL-2.1": { tier: 2, label: "⚠️ Caution", copyCode: false, adaptCode: false, useAsDep: true, attributionRequired: true, risk: "Medium", notes: "Dynamic link (npm dep) is OK. Do not vendor/embed source." },
  "LGPL-3.0": { tier: 2, label: "⚠️ Caution", copyCode: false, adaptCode: false, useAsDep: true, attributionRequired: true, risk: "Medium", notes: "Same as LGPL-2.1. Dynamic link only." },
  "EPL-2.0": { tier: 2, label: "⚠️ Caution", copyCode: false, adaptCode: false, useAsDep: true, attributionRequired: true, risk: "Medium", notes: "File-level copyleft. Rare in JS ecosystem." },
  "GPL-2.0": { tier: 3, label: "🚫 Restricted", copyCode: false, adaptCode: false, useAsDep: false, attributionRequired: false, risk: "High", notes: "Viral copyleft. Inspiration only. Using as npm dep makes your project GPL." },
  "GPL-2.0-ONLY": { tier: 3, label: "🚫 Restricted", copyCode: false, adaptCode: false, useAsDep: false, attributionRequired: false, risk: "High", notes: "GPL-2.0 only — incompatible with GPL-3.0 and Apache-2.0." },
  "GPL-3.0": { tier: 3, label: "🚫 Restricted", copyCode: false, adaptCode: false, useAsDep: false, attributionRequired: false, risk: "High", notes: "Viral copyleft with patent clause. Inspiration only." },
  "GPL-3.0-ONLY": { tier: 3, label: "🚫 Restricted", copyCode: false, adaptCode: false, useAsDep: false, attributionRequired: false, risk: "High", notes: "GPL-3.0 only. Inspiration only." },
  "AGPL-3.0": { tier: 4, label: "❌ Blocked", copyCode: false, adaptCode: false, useAsDep: false, attributionRequired: false, risk: "Critical", notes: "Network-use triggers copyleft. NEVER use in any SaaS or networked product." },
  "AGPL-3.0-ONLY": { tier: 4, label: "❌ Blocked", copyCode: false, adaptCode: false, useAsDep: false, attributionRequired: false, risk: "Critical", notes: "Same as AGPL-3.0." },
  "SSPL-1.1": { tier: 4, label: "❌ Blocked", copyCode: false, adaptCode: false, useAsDep: false, attributionRequired: false, risk: "Critical", notes: "Running as SaaS triggers copyleft of entire stack." },
  "BUSL-1.1": { tier: 4, label: "❌ Blocked", copyCode: false, adaptCode: false, useAsDep: false, attributionRequired: false, risk: "Critical", notes: "Business Source License. Not open-source. Commercial use restricted." },
  ELV2: { tier: 4, label: "❌ Blocked", copyCode: false, adaptCode: false, useAsDep: false, attributionRequired: false, risk: "Critical", notes: "Elastic License 2.0. Prohibits competitive SaaS." },
  PROPRIETARY: { tier: 4, label: "❌ Blocked", copyCode: false, adaptCode: false, useAsDep: false, attributionRequired: false, risk: "Critical", notes: "All rights reserved. No reuse." },
  UNKNOWN: { tier: 4, label: "❓ Unknown", copyCode: false, adaptCode: false, useAsDep: false, attributionRequired: false, risk: "Unknown", notes: "No license found. Treat as proprietary until verified." },
};

const ALIASES: Record<string, string> = {
  "MIT LICENSE": "MIT",
  EXPAT: "MIT",
  "APACHE 2": "APACHE-2.0",
  "APACHE 2.0": "APACHE-2.0",
  "APACHE-2": "APACHE-2.0",
  APACHE2: "APACHE-2.0",
  BSD: "BSD-3-CLAUSE",
  BSD2: "BSD-2-CLAUSE",
  BSD3: "BSD-3-CLAUSE",
  "BSD 2": "BSD-2-CLAUSE",
  "BSD 3": "BSD-3-CLAUSE",
  "BSD 2-CLAUSE": "BSD-2-CLAUSE",
  "BSD 3-CLAUSE": "BSD-3-CLAUSE",
  "ISC LICENSE": "ISC",
  MOZILLA: "MPL-2.0",
  "MOZILLA PUBLIC LICENSE 2.0": "MPL-2.0",
  "GNU GPL": "GPL-3.0",
  "GNU GPL V2": "GPL-2.0",
  "GNU GPL V3": "GPL-3.0",
  "GNU GENERAL PUBLIC LICENSE V2": "GPL-2.0",
  "GNU GENERAL PUBLIC LICENSE V3": "GPL-3.0",
  "GNU AGPL": "AGPL-3.0",
  "AFFERO GPL": "AGPL-3.0",
  "GNU AFFERO GENERAL PUBLIC LICENSE": "AGPL-3.0",
  UNLICENSED: "UNKNOWN",
  NONE: "UNKNOWN",
  "": "UNKNOWN",
};

function normalizeLicense(raw: string): string {
  const upper = raw.trim().toUpperCase();

  if (ALIASES[upper]) return ALIASES[upper];
  if (LICENSE_DB[upper]) return upper;

  // Collapse spaces/dashes and retry
  const compact = upper.replace(/[\s\-_]/g, "");
  for (const key of Object.keys(LICENSE_DB)) {
    if (key.replace(/[\s\-_]/g, "") === compact) return key;
  }

  // Partial match heuristics
  if (upper.includes("AGPL")) return "AGPL-3.0";
  if (upper.includes("GPL-3") || upper.includes("GPLV3")) return "GPL-3.0";
  if (upper.includes("GPL-2") || upper.includes("GPLV2")) return "GPL-2.0";
  if (upper.includes("GPL")) return "GPL-3.0";
  if (upper.includes("LGPL-3")) return "LGPL-3.0";
  if (upper.includes("LGPL")) return "LGPL-2.1";
  if (upper.includes("MPL") || upper.includes("MOZILLA")) return "MPL-2.0";
  if (upper.includes("APACHE")) return "APACHE-2.0";
  if (upper.includes("BSD")) return "BSD-3-CLAUSE";
  if (upper.includes("MIT")) return "MIT";
  if (upper.includes("ISC")) return "ISC";

  return "UNKNOWN";
}

function classify(raw: string): LicenseResult {
  const spdx = normalizeLicense(raw);
  const entry = LICENSE_DB[spdx] || LICENSE_DB["UNKNOWN"];

  const tierLabels: Record<number, LicenseResult["tierLabel"]> = {
    1: "Safe", 2: "Caution", 3: "Restricted", 4: "Blocked",
  };

  return {
    input: raw,
    spdx,
    tier: entry.tier,
    tierLabel: tierLabels[entry.tier],
    label: entry.label,
    copyCode: entry.copyCode,
    adaptCode: entry.adaptCode,
    useAsDep: entry.useAsDep,
    attributionRequired: entry.attributionRequired,
    risk: entry.risk,
    notes: entry.notes,
  };
}

async function fetchNpmLicense(packageName: string): Promise<string> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;
  const res = await fetch(url, { headers: { "User-Agent": "theib-mcp/0.1.0" } });
  if (!res.ok) throw new Error(`npm package not found: ${packageName}`);
  const data = (await res.json()) as Record<string, unknown>;
  const lic = data.license;
  if (!lic) return "unknown";
  if (typeof lic === "string") return lic;
  if (typeof lic === "object") return (lic as Record<string, string>).type || "unknown";
  return "unknown";
}

async function fetchPypiLicense(packageName: string): Promise<string> {
  const url = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;
  const res = await fetch(url, { headers: { "User-Agent": "theib-mcp/0.1.0" } });
  if (!res.ok) throw new Error(`PyPI package not found: ${packageName}`);
  const data = (await res.json()) as Record<string, unknown>;
  const info = data.info as Record<string, unknown>;

  // Check license field
  const lic = info.license as string | null;
  if (lic && lic.toLowerCase() !== "unknown" && lic.trim()) return lic;

  // Try classifiers
  const classifiers = (info.classifiers as string[]) || [];
  for (const c of classifiers) {
    if (c.startsWith("License ::")) {
      const parts = c.split(" :: ");
      if (parts.length >= 3) return parts[parts.length - 1];
    }
  }

  return "unknown";
}

export async function licenseChecker({
  license,
  npmPackage,
  pypiPackage,
}: {
  license?: string;
  npmPackage?: string;
  pypiPackage?: string;
}): Promise<LicenseResult> {
  let rawLicense: string;

  if (license !== undefined) {
    rawLicense = license;
  } else if (npmPackage) {
    rawLicense = await fetchNpmLicense(npmPackage);
  } else if (pypiPackage) {
    rawLicense = await fetchPypiLicense(pypiPackage);
  } else {
    throw new Error("Provide one of: license, npm_package, or pypi_package");
  }

  return classify(rawLicense);
}
