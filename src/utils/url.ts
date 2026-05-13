const UNSUPPORTED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'brave://',
  'about:',
  'devtools://',
  'view-source:',
  'about:blank',
  'chrome.google.com/webstore',
];

const TRAILING_PUNCTUATION = /[.,;:!?)]+$/;

export function normalizeUrl(input: string): string | null {
  let url = input.trim();
  if (!url) return null;

  url = url.replace(TRAILING_PUNCTUATION, '');

  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    const normalized = u.href;
    if (normalized === 'https://' || normalized === 'http://') return null;
    return normalized;
  } catch {
    return null;
  }
}

export function parseUrlsFromText(text: string): string[] {
  const items = text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const url = normalizeUrl(item);
    if (url && !seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  }

  return result;
}

export function isUnsupportedBrowserUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return UNSUPPORTED_PREFIXES.some(prefix => lower.startsWith(prefix));
}

export function getDomain(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function urlsMatch(a: string, b: string): boolean {
  const na = normalizeUrl(a);
  const nb = normalizeUrl(b);
  if (!na || !nb) return false;
  return na === nb;
}

export function removeDuplicateUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  return urls.filter((url) => {
    const key = normalizeUrl(url);
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
