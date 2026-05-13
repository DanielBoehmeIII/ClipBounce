interface CrawlResult {
  url: string;
  title: string | null;
  extract: string;
  mode: string;
  truncated: boolean;
  originalLength: number;
  returnedLength: number;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

function stripHtml(html: string): string {
  // Remove script and style blocks entirely
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "");

  // Convert block elements to newlines
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<h([1-6])[^>]*>/gi, (_, level) => "\n" + "#".repeat(parseInt(level)) + " ")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<code[^>]*>/gi, "`")
    .replace(/<\/code>/gi, "`")
    .replace(/<pre[^>]*>/gi, "\n```\n")
    .replace(/<\/pre>/gi, "\n```\n");

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, "");

  // Clean up whitespace
  text = decodeHtmlEntities(text);
  text = text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/^ +/gm, "")
    .trim();

  return text;
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (m) return decodeHtmlEntities(m[1].trim());

  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1) return decodeHtmlEntities(h1[1].trim());

  return null;
}

function extractHeadings(html: string): string {
  const headingRe = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi;
  const lines: string[] = [];
  let match;
  while ((match = headingRe.exec(html)) !== null) {
    const level = parseInt(match[1]);
    const text = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, "").trim());
    if (text) {
      lines.push("#".repeat(level) + " " + text);
    }
  }
  return lines.join("\n");
}

function extractCodeBlocks(html: string): string {
  const preRe = /<pre[^>]*>([\s\S]*?)<\/pre>/gi;
  const codeRe = /<code[^>]*>([\s\S]*?)<\/code>/gi;
  const blocks: string[] = [];

  let match;
  while ((match = preRe.exec(html)) !== null) {
    const code = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, "")).trim();
    if (code && code.length > 20) {
      blocks.push("```\n" + code + "\n```");
    }
  }

  // Inline code blocks not inside pre
  const htmlWithoutPre = html.replace(/<pre[^>]*>[\s\S]*?<\/pre>/gi, "");
  while ((match = codeRe.exec(htmlWithoutPre)) !== null) {
    const code = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, "")).trim();
    if (code && code.length > 30 && code.includes("\n")) {
      blocks.push("```\n" + code + "\n```");
    }
  }

  return blocks.join("\n\n");
}

function extractSummary(html: string, fullText: string): string {
  const title = extractTitle(html);
  const headings = extractHeadings(html);

  // Get first non-empty paragraph
  const paragraphRe = /<p[^>]*>(.*?)<\/p>/is;
  const pMatch = html.match(paragraphRe);
  const firstParagraph = pMatch
    ? decodeHtmlEntities(pMatch[1].replace(/<[^>]+>/g, "").trim())
    : fullText.split("\n\n")[0] || "";

  const parts = [];
  if (title) parts.push(`# ${title}`);
  if (firstParagraph) parts.push(firstParagraph);
  if (headings) parts.push("\n## Structure\n\n" + headings);

  return parts.join("\n\n");
}

function handleGitHubUrl(url: string): string {
  // Convert github.com blob URLs to raw.githubusercontent.com for raw content
  const blobMatch = url.match(
    /^https?:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/(.+)$/
  );
  if (blobMatch) {
    return `https://raw.githubusercontent.com/${blobMatch[1]}/${blobMatch[2]}/${blobMatch[3]}`;
  }
  return url;
}

export async function docsCrawler(
  url: string,
  extractMode: string,
  maxLength: number
): Promise<CrawlResult> {
  if (!url?.trim()) {
    throw new Error("url parameter is required");
  }

  const fetchUrl = handleGitHubUrl(url);
  const isRaw = fetchUrl !== url;

  const res = await fetch(fetchUrl, {
    headers: {
      "User-Agent": "theib-mcp/0.1.0 (implementation research tool)",
      Accept: "text/html,application/xhtml+xml,text/plain,*/*",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type") || "";
  const rawBody = await res.text();

  let title: string | null = null;
  let extracted: string;

  if (isRaw || contentType.includes("text/plain") || !contentType.includes("html")) {
    // Plain text or raw source — return as-is
    title = url.split("/").pop() || null;
    extracted = rawBody;
  } else {
    title = extractTitle(rawBody);
    const fullText = stripHtml(rawBody);

    switch (extractMode) {
      case "headings":
        extracted = extractHeadings(rawBody);
        break;
      case "code-blocks":
        extracted = extractCodeBlocks(rawBody);
        break;
      case "summary":
        extracted = extractSummary(rawBody, fullText);
        break;
      case "full":
      default:
        extracted = fullText;
        break;
    }
  }

  const originalLength = extracted.length;
  const truncated = originalLength > maxLength;
  const returnText = truncated ? extracted.slice(0, maxLength) + "\n\n[... truncated ...]" : extracted;

  return {
    url,
    title,
    extract: returnText,
    mode: extractMode,
    truncated,
    originalLength,
    returnedLength: returnText.length,
  };
}
