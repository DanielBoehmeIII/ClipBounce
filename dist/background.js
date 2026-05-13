// src/utils/url.ts
var UNSUPPORTED_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "edge://",
  "brave://",
  "about:",
  "devtools://",
  "view-source:",
  "about:blank",
  "chrome.google.com/webstore"
];
var TRAILING_PUNCTUATION = /[.,;:!?)]+$/;
function normalizeUrl(input) {
  let url = input.trim();
  if (!url) return null;
  url = url.replace(TRAILING_PUNCTUATION, "");
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    const normalized = u.href;
    if (normalized === "https://" || normalized === "http://") return null;
    return normalized;
  } catch {
    return null;
  }
}
function parseUrlsFromText(text) {
  const items = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const item of items) {
    const url = normalizeUrl(item);
    if (url && !seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  }
  return result;
}
function isUnsupportedBrowserUrl(url) {
  const lower = url.toLowerCase();
  return UNSUPPORTED_PREFIXES.some((prefix) => lower.startsWith(prefix));
}
function getDomain(url) {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// src/utils/hash.ts
function generateId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

// src/clipbounce/capture/tabCapture.ts
function createSourceRecord(url, title, method) {
  return {
    id: generateId(),
    url,
    title: title || void 0,
    domain: getDomain(url),
    captureMethod: method,
    status: "pending",
    capturedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function queryCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id || !tab.url) return null;
  if (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) return null;
  return { id: tab.id, url: tab.url, title: tab.title };
}
async function queryAllTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.filter((t) => t.id && t.url).map((t) => ({ id: t.id, url: t.url, title: t.title }));
}
async function querySelectedTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true, highlighted: true });
  return tabs.filter((t) => t.id && t.url).map((t) => ({ id: t.id, url: t.url, title: t.title }));
}

// src/clipbounce/extraction/normalizeText.ts
var REPEATED_LINE_LIMIT = 5;
function normalizeText(text) {
  let result = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\t/g, " ").replace(/[ \t]{2,}/g, " ").trim();
  const lines = result.split("\n");
  const deduped = [];
  let repeatCount = 0;
  let lastLine = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === lastLine) {
      repeatCount++;
      if (repeatCount >= REPEATED_LINE_LIMIT) continue;
    } else {
      repeatCount = 0;
    }
    deduped.push(line);
    lastLine = trimmed;
  }
  result = deduped.join("\n");
  result = result.replace(/\n{3,}/g, "\n\n");
  return result;
}
function isTooSmall(text, minChars = 50) {
  return text.trim().length < minChars;
}

// src/clipbounce/storage/sessionStore.ts
var SESSION_KEY = "clipbounce_session";
async function loadSession() {
  const result = await chrome.storage.session.get(SESSION_KEY);
  return result[SESSION_KEY] || { sources: [], lastResult: null };
}
async function saveSession(data) {
  await chrome.storage.session.set({ [SESSION_KEY]: data });
}
async function updateSources(sources) {
  const session = await loadSession();
  session.sources = sources;
  await saveSession(session);
}
async function saveResult(result) {
  const session = await loadSession();
  session.lastResult = result;
  await saveSession(session);
}

// src/clipbounce/storage/settingsStore.ts
var SETTINGS_KEY = "clipbounce_settings";
var DEFAULT_SETTINGS = {
  mode: "mock",
  backendUrl: "http://localhost:8787"
};
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    return result[SETTINGS_KEY] || DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// src/clipbounce/synthesis/promptCompiler.ts
var MODE_KEYWORDS = {
  comparison: ["compare", "versus", "vs", "differences", "contrast", "similarities"],
  extraction: ["extract", "pricing", "table", "features", "list", "details", "specs"],
  study_guide: ["study", "notes", "quiz", "learn", "flashcard", "summarize for a beginner"],
  research_brief: ["research", "brief", "analyze", "overview", "deep dive", "literature"],
  summary: ["summarize", "summary", "tl;dr", "overview"],
  custom: []
};
function inferMode(prompt) {
  const lower = prompt.toLowerCase();
  for (const [mode, keywords] of Object.entries(MODE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return mode;
    }
  }
  return "summary";
}
function inferLength(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes("short") || lower.includes("brief") || lower.includes("tl;dr")) return "short";
  if (lower.includes("detailed") || lower.includes("comprehensive") || lower.includes("in-depth")) return "long";
  return "medium";
}
function compilePromptSpec(userPrompt) {
  return {
    userPrompt,
    mode: inferMode(userPrompt),
    citeSources: true,
    removeDuplicates: true,
    maxOutputLength: inferLength(userPrompt)
  };
}
function buildChunkFormattedSources(chunks, sources) {
  const groups = /* @__PURE__ */ new Map();
  for (const chunk of chunks) {
    if (!groups.has(chunk.sourceNumber)) groups.set(chunk.sourceNumber, []);
    groups.get(chunk.sourceNumber).push(chunk);
  }
  const lines = [];
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => a - b);
  for (const sourceNum of sortedKeys) {
    const sourceChunks = groups.get(sourceNum);
    const src = sources.find((s) => s.id === sourceChunks[0].sourceId);
    lines.push(`[Source ${sourceNum}] ${src?.title || "Untitled"}`);
    lines.push(`URL: ${sourceChunks[0].url}`);
    lines.push(`Domain: ${src?.domain || getDomain(sourceChunks[0].url)}`);
    lines.push("");
    for (const chunk of sourceChunks) {
      const headingStr = chunk.headingPath.length > 0 ? ` (${chunk.headingPath.join(" > ")})` : "";
      lines.push(`[${chunk.chunkId}]${headingStr}`);
      lines.push(chunk.content);
      lines.push("");
    }
  }
  return lines.join("\n");
}

// src/clipbounce/synthesis/providers/MockProvider.ts
var MOCK_SUMMARIES = [
  "This source discusses the core topic from a foundational perspective, introducing key concepts and terminology.",
  "This source provides practical examples and case studies that illustrate the main ideas in real-world contexts.",
  "This source offers a critical analysis, examining strengths, weaknesses, and open questions in the field.",
  "This source focuses on historical context and evolution of the subject, tracing how understanding has developed.",
  "This source presents recent developments and cutting-edge research, highlighting emerging trends.",
  "This source takes a comparative approach, examining different viewpoints and synthesizing them into a balanced overview.",
  "This source dives deep into technical details, providing specifications, data, and methodology.",
  "This source addresses common misconceptions and clarifies nuanced aspects of the topic."
];
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function summarizeTitle(title) {
  if (!title) return "an unnamed source";
  if (title.length > 60) return title.slice(0, 60) + "...";
  return title;
}
var MockProvider = class {
  constructor() {
    this.name = "Mock Provider";
  }
  async summarizeSource(input) {
    const { source, prompt } = input;
    await delay(300 + Math.random() * 400);
    const textPreview = source.cleanText ? source.cleanText.slice(0, 200).replace(/\n/g, " ") : "[no text extracted]";
    return {
      sourceId: source.id,
      title: source.title,
      url: source.url,
      summary: `${pick(MOCK_SUMMARIES)} Based on the extracted content: "${textPreview}..."`,
      keyPoints: [
        `Introduced key framework or concept relevant to "${prompt.userPrompt}"`,
        `Provided supporting evidence and examples`,
        `Connected broader themes to specific findings`
      ],
      usefulQuotes: [
        `[Excerpt from ${summarizeTitle(source.title)}]`
      ]
    };
  }
  async synthesizeBundle(input) {
    const { prompt, sources, sourceSummaries, chunkBudget } = input;
    await delay(500 + Math.random() * 1e3);
    const readySources = sources.filter((s) => s.status === "ready");
    const failedSources = sources.filter((s) => s.status === "failed");
    const synthesis = generateMockSynthesis(prompt, readySources, failedSources, chunkBudget);
    const repeated = [
      "All sources emphasize the importance of understanding foundational concepts before diving into specifics.",
      "Multiple sources highlight the role of practical application in reinforcing theoretical knowledge."
    ];
    const unique = readySources.map(
      (s) => `${s.title || getDomain(s.url)} contributes a distinct perspective: ${pick(MOCK_SUMMARIES).toLowerCase()}`
    );
    return {
      prompt: prompt.userPrompt,
      sourceCount: sources.length,
      successfulSourceCount: readySources.length,
      failedSourceCount: failedSources.length,
      sourceSummaries,
      synthesis,
      repeatedIdeas: repeated,
      uniqueIdeas: unique,
      failures: failedSources.map((s) => ({
        url: s.url,
        reason: s.error || "Unknown error"
      })),
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      chunkBudget
    };
  }
};
function generateMockSynthesis(prompt, ready, failed, chunkBudget) {
  const parts = [];
  parts.push("## Synthesis\n");
  parts.push(
    `Based on ${ready.length} source${ready.length !== 1 ? "s" : ""} analyzed for your request: "${prompt.userPrompt}"`
  );
  parts.push("");
  parts.push("### Key Findings");
  parts.push("");
  parts.push(
    "Across the analyzed sources, several consistent patterns emerge. The material collectively suggests that this topic spans multiple dimensions, from foundational principles to advanced applications. The sources provide complementary perspectives that together form a comprehensive picture."
  );
  parts.push("");
  ready.forEach((source, i) => {
    parts.push(`**Source ${i + 1}: ${source.title || getDomain(source.url)}**`);
    parts.push(
      `This source contributes unique insights related to your query. Its content reinforces the overall consensus while adding specific details in its area of focus.`
    );
    parts.push("");
  });
  parts.push("### Cross-Source Analysis");
  parts.push("");
  parts.push(
    "The main ideas appear consistently across multiple sources, suggesting strong consensus on the core principles. Each source adds unique granularity, with particular strengths in different sub-areas of the topic."
  );
  parts.push("");
  parts.push("### Recommendations");
  parts.push("");
  parts.push(
    "For a deeper understanding, explore the specific sources most relevant to your particular interest area. The sources collectively provide a solid foundation for further investigation."
  );
  if (chunkBudget?.truncated) {
    parts.push("");
    parts.push(`> *Note: ${chunkBudget.truncatedChars.toLocaleString()} characters were truncated from source content to fit the processing budget. ${chunkBudget.selectedChunks} of ${chunkBudget.totalChunks} total chunks were included.*`);
  }
  if (failed.length > 0) {
    parts.push("");
    parts.push("### Failed Sources");
    parts.push("");
    failed.forEach((s) => {
      parts.push(`- ${s.url}: ${s.error || "Could not access content"}`);
    });
  }
  return parts.join("\n");
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/clipbounce/synthesis/providers/RemoteProvider.ts
var RemoteProvider = class {
  constructor(backendUrl) {
    this.name = "Remote Provider";
    this._backendUrl = backendUrl;
  }
  get backendUrl() {
    return this._backendUrl;
  }
  setBackendUrl(url) {
    this._backendUrl = url;
  }
  async summarizeSource(input) {
    const { source } = input;
    const system = 'You are a source summarizer. Summarize the given web page content concisely. Respond with JSON only: { "summary": "2-3 sentence summary", "keyPoints": ["point1","point2","point3"], "usefulQuotes": ["quote1"] }';
    const userContent = `Title: ${source.title || "Untitled"}
URL: ${source.url}
Domain: ${source.domain || "unknown"}
Content:
${(source.cleanText || "").slice(0, 8e3)}`;
    const response = await this.callAPI(system, userContent);
    try {
      const parsed = JSON.parse(response);
      return {
        sourceId: source.id,
        title: source.title,
        url: source.url,
        summary: parsed.summary || response.slice(0, 500),
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
        usefulQuotes: Array.isArray(parsed.usefulQuotes) ? parsed.usefulQuotes : void 0
      };
    } catch {
      return {
        sourceId: source.id,
        title: source.title,
        url: source.url,
        summary: response.slice(0, 500),
        keyPoints: []
      };
    }
  }
  async synthesizeBundle(input) {
    const { prompt, sources, sourceSummaries, formattedSources, chunkBudget } = input;
    const readySources = sources.filter((s) => s.status === "ready");
    const failedSources = sources.filter((s) => s.status === "failed");
    const sourceBlocks = formattedSources || sources.map((s, i) => {
      const idx = i + 1;
      if (s.status === "ready") {
        return `[${idx}] ${s.title || "Untitled"}
URL: ${s.url}
Domain: ${s.domain || "unknown"}
Content:
${(s.cleanText || "").slice(0, 4e3)}`;
      }
      return `[${idx}] ${s.title || "Untitled"}
URL: ${s.url}
Domain: ${s.domain || "unknown"}
Status: ${s.status}${s.error ? " - " + s.error : ""}
[Content not accessible]`;
    }).join("\n\n---\n\n");
    const summaryBlocks = sourceSummaries.map((s) => {
      const srcIdx = sources.findIndex((src) => src.id === s.sourceId) + 1;
      return `[${srcIdx}] ${s.title || s.url}
Summary: ${s.summary}
Key points: ${s.keyPoints.join(", ")}`;
    }).join("\n\n");
    const system = "You are ClipBounce, a multi-source web synthesis engine. Answer ONLY from the provided sources below. Do not use any external knowledge or make up information. If the sources do not contain enough information to answer, say so clearly.";
    const chunkInstruction = formattedSources ? 'When citing, use the chunk notation [sourceNumber.chunkNumber] (e.g., [1.2], [2.1]) for specific subsections, or [sourceNumber] (e.g., [1], [2]) for an entire source. Distinguish direct evidence (explicitly stated) from inference (your reasoning). Label inferences with "(inferred)".' : "Reference sources by their number like [1], [2], etc. in your answer.";
    const budgetNote = chunkBudget?.truncated ? `
Note: Some source content was truncated to fit processing limits (${chunkBudget.truncatedChars.toLocaleString()} chars omitted). ${chunkBudget.selectedChunks} of ${chunkBudget.totalChunks} total chunks were selected.` : "";
    const userContent = `User request: ${prompt.userPrompt}

Sources:
${sourceBlocks}

Per-source summaries:
${summaryBlocks}${budgetNote}

Instructions:
1. Synthesize an answer using ONLY the provided sources.
2. ${chunkInstruction}
3. Clearly separate repeated ideas (found in multiple sources) from unique ideas (found in only one source).
4. If some source content is not accessible (marked "[Content not accessible]"), mention it.
5. If the user's request cannot be answered from the sources, say so.

Return your response in this format:

## Synthesis
<your synthesized answer with inline references like [1], [1.2], [2]>

## Repeated Ideas
- <idea> (mentioned in [1], [2], [3])
- <idea> (mentioned in [2], [4])

## Unique Ideas
- <idea> (unique to [1])
- <idea> (unique to [3])

## Source Notes
<brief assessment of each source's coverage and relevance>`;
    const response = await this.callAPI(system, userContent);
    return {
      prompt: prompt.userPrompt,
      sourceCount: sources.length,
      successfulSourceCount: readySources.length,
      failedSourceCount: failedSources.length,
      sourceSummaries,
      synthesis: response,
      failures: failedSources.map((s) => ({
        url: s.url,
        reason: s.error || "Unknown error"
      })),
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      chunkBudget
    };
  }
  async testConnection() {
    try {
      const resp = await fetch(`${this._backendUrl}/api/health/check`, {
        signal: AbortSignal.timeout(5e3)
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.ready) {
          return { ok: true, message: `${data.provider} \xB7 ${data.model} \xB7 Ready` };
        }
        return { ok: false, message: data.message || "Not ready" };
      }
      return { ok: false, message: `HTTP ${resp.status}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Connection failed" };
    }
  }
  async callAPI(system, userContent) {
    const resp = await fetch(`${this._backendUrl}/api/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system,
        messages: [{ role: "user", content: userContent }]
      }),
      signal: AbortSignal.timeout(9e4)
    });
    if (!resp.ok) {
      const text = await resp.text();
      const status = resp.status;
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      const errorCode = parsed?.error?.code || "";
      const errorMessage = parsed?.error?.message || "";
      const errorDetails = parsed?.error?.details;
      if (status === 401 || errorCode === "AUTH_INVALID" || errorMessage.toLowerCase().includes("api key")) {
        throw new Error("Paid API key is missing or invalid. Switch to Mock/local mode or set a valid key.");
      }
      if (status === 503 || errorCode === "LOCAL_LLM_UNREACHABLE" || errorCode === "LOCAL_MODEL_MISSING") {
        if (errorMessage) {
          throw new Error(errorMessage);
        }
        throw new Error("Local LLM is not reachable. Make sure LM Studio is running with a model loaded.");
      }
      if (status === 400 || errorCode === "NO_PROVIDER" || errorCode === "BAD_REQUEST") {
        if (errorMessage) {
          throw new Error(errorMessage);
        }
        throw new Error("No backend provider is configured. Use Mock mode or configure LM Studio/Anthropic/OpenAI.");
      }
      if (errorMessage) {
        throw new Error(errorMessage);
      }
      throw new Error(`Backend error (${status}): ${text.slice(0, 200)}`);
    }
    const data = await resp.json();
    if (!data.content && typeof data.content !== "string") {
      throw new Error("Backend returned invalid response: missing content");
    }
    return data.content;
  }
};

// src/clipbounce/synthesis/providers/index.ts
var _providers = /* @__PURE__ */ new Map();
var _remoteProvider = new RemoteProvider("http://localhost:8787");
function registerDefaultProviders() {
  _providers.set("Mock Provider", new MockProvider());
  _providers.set(_remoteProvider.name, _remoteProvider);
}
registerDefaultProviders();
function getProvider(name) {
  if (name && _providers.has(name)) {
    return _providers.get(name);
  }
  return _providers.get("Mock Provider");
}
function getProviderForConfig(config) {
  if (config.mode === "local") {
    _remoteProvider.setBackendUrl(config.backendUrl);
    return _remoteProvider;
  }
  return _providers.get("Mock Provider");
}
function getRemoteProvider() {
  return _remoteProvider;
}

// src/clipbounce/synthesis/sourceSummarizer.ts
async function summarizeSource(source, prompt, providerName) {
  const provider = getProvider(providerName);
  return provider.summarizeSource({ source, prompt });
}
async function summarizeAllSources(sources, prompt, providerName) {
  const ready = sources.filter((s) => s.status === "ready");
  const results = [];
  for (const source of ready) {
    try {
      const summary = await summarizeSource(source, prompt, providerName);
      results.push(summary);
    } catch (err) {
      results.push({
        sourceId: source.id,
        title: source.title,
        url: source.url,
        summary: "[Failed to summarize this source]",
        keyPoints: []
      });
    }
  }
  return results;
}

// src/clipbounce/synthesis/textChunker.ts
var DEFAULT_MAX_CHUNK_SIZE = 3e3;
var DEFAULT_MIN_CHUNK_SIZE = 100;
function makeChunk(content, source, sourceNumber, headingPath, index) {
  return {
    chunkId: `${sourceNumber}.${index + 1}`,
    sourceId: source.id,
    sourceNumber,
    title: source.title,
    url: source.url,
    headingPath,
    content,
    charCount: content.length,
    index
  };
}
function chunkText(text, source, sourceNumber, options) {
  const maxSize = options?.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE;
  const minSize = options?.minChunkSize ?? DEFAULT_MIN_CHUNK_SIZE;
  const chunks = [];
  let chunkIndex = 0;
  const blocks = text.split(/\n\n+/);
  let currentContent = "";
  let currentHeadings = [];
  function flushCurrent() {
    if (!currentContent) return;
    const chunk = makeChunk(currentContent.trim(), source, sourceNumber, [...currentHeadings], chunkIndex++);
    if (chunk.charCount >= minSize || chunks.length === 0) {
      chunks.push(chunk);
    } else if (chunks.length > 0) {
      const last = chunks[chunks.length - 1];
      if (last.charCount + chunk.charCount <= maxSize) {
        chunks[chunks.length - 1] = makeChunk(
          last.content + "\n\n" + chunk.content,
          source,
          sourceNumber,
          last.headingPath,
          last.index
        );
      }
    }
    currentContent = "";
  }
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const headingMatch = trimmed.match(/^(#{2,4})\s+(.+)$/m);
    if (headingMatch && trimmed === headingMatch[0]) {
      flushCurrent();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      while (currentHeadings.length > 0) {
        const last = currentHeadings[currentHeadings.length - 1];
        const lastLevel = parseInt(last.charAt(1));
        if (level <= lastLevel) {
          currentHeadings.pop();
        } else {
          break;
        }
      }
      currentHeadings.push(`h${level}: ${headingText}`);
      currentContent = trimmed;
    } else {
      if (!currentContent) {
        currentContent = trimmed;
      } else if (currentContent.length + trimmed.length + 2 > maxSize) {
        flushCurrent();
        currentContent = trimmed;
        if (trimmed.length > maxSize) {
          flushCurrent();
          chunks.push(makeChunk(
            trimmed.slice(0, maxSize),
            source,
            sourceNumber,
            [...currentHeadings],
            chunkIndex++
          ));
          currentContent = "";
        }
      } else {
        currentContent += "\n\n" + trimmed;
      }
    }
  }
  flushCurrent();
  if (chunks.length === 0 && text.trim()) {
    chunks.push(makeChunk(
      text.trim().slice(0, maxSize),
      source,
      sourceNumber,
      [],
      0
    ));
  }
  return chunks;
}
function selectChunksForBudget(chunks, userPrompt, budget) {
  if (chunks.length === 0) {
    return { selected: [], truncated: false, truncatedChars: 0, totalChars: 0, selectedChars: 0, totalChunks: 0, selectedChunks: 0 };
  }
  const totalChars = chunks.reduce((sum, c) => sum + c.charCount, 0);
  if (totalChars <= budget) {
    return { selected: chunks, truncated: false, truncatedChars: 0, totalChars, selectedChars: totalChars, totalChunks: chunks.length, selectedChunks: chunks.length };
  }
  const promptLower = userPrompt.toLowerCase();
  const promptWords = new Set(promptLower.split(/\s+/).filter((w) => w.length > 3));
  const scored = chunks.map((chunk) => {
    let score = 0;
    for (const h of chunk.headingPath) {
      const hLower = h.toLowerCase();
      for (const word of promptWords) {
        if (hLower.includes(word)) score += 2;
      }
    }
    const contentLower = chunk.content.toLowerCase();
    for (const word of promptWords) {
      if (contentLower.includes(word)) score += 1;
    }
    return { chunk, score };
  });
  scored.sort((a, b) => b.score - a.score || a.chunk.index - b.chunk.index);
  const selected = [];
  let selectedChars = 0;
  for (const { chunk } of scored) {
    if (selectedChars + chunk.charCount <= budget) {
      selected.push(chunk);
      selectedChars += chunk.charCount;
    }
  }
  selected.sort((a, b) => a.sourceNumber - b.sourceNumber || a.index - b.index);
  const truncatedChars = totalChars - selectedChars;
  return { selected, truncated: true, truncatedChars, totalChars, selectedChars, totalChunks: chunks.length, selectedChunks: selected.length };
}

// src/clipbounce/synthesis/bundleSynthesizer.ts
var CHUNK_BUDGET = 25e3;
async function synthesizeBundle(sources, userPrompt, config) {
  const spec = compilePromptSpec(userPrompt);
  const provider = config ? getProviderForConfig(config) : getProviderForConfig({ mode: "mock", backendUrl: "http://localhost:8787" });
  const sourceSummaries = await summarizeAllSources(sources, spec, provider.name);
  const readySources = sources.filter((s) => s.status === "ready");
  const allChunks = [];
  readySources.forEach((s, i) => {
    if (s.cleanText) {
      const chunks = chunkText(s.cleanText, s, i + 1);
      allChunks.push(...chunks);
    }
  });
  const selection = selectChunksForBudget(allChunks, userPrompt, CHUNK_BUDGET);
  const formattedSources = selection.selected.length > 0 ? buildChunkFormattedSources(selection.selected, sources) : void 0;
  const chunkBudget = {
    totalChars: selection.totalChars,
    selectedChars: selection.selectedChars,
    truncated: selection.truncated,
    truncatedChars: selection.truncatedChars,
    totalChunks: selection.totalChunks,
    selectedChunks: selection.selectedChunks
  };
  const result = await provider.synthesizeBundle({
    prompt: spec,
    sources,
    sourceSummaries,
    formattedSources,
    chunkBudget
  });
  result.citations = selection.selected.map((chunk) => ({
    sourceNumber: chunk.sourceNumber,
    sourceId: chunk.sourceId,
    chunkId: chunk.chunkId,
    headingPath: chunk.headingPath
  }));
  if (selection.truncated && !result.synthesis.includes("truncat")) {
    result.synthesis += `

> *${selection.truncatedChars.toLocaleString()} characters were truncated from source content to fit processing limits. ${selection.selectedChunks} of ${selection.totalChunks} chunks were selected.*`;
  }
  return result;
}

// src/extension/background.ts
var pendingSources = [];
var providerConfig = { mode: "mock", backendUrl: "http://localhost:8787" };
var CONCURRENCY_LIMIT = 3;
async function injectAndExtract(tabId, timeoutMs = 8e3) {
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
  const extract = (async () => {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["contentScript.js"]
      });
    } catch {
      return null;
    }
    await delay2(100);
    try {
      const response = await chrome.tabs.sendMessage(
        tabId,
        { type: "EXTRACT" }
      );
      return response;
    } catch {
      return null;
    }
  })();
  return Promise.race([extract, timeout]);
}
async function injectAndExtractWithFallback(tabId, timeoutMs = 8e3) {
  const fastFallback = (async () => {
    await delay2(200);
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const text = document.body?.innerText || "";
          return {
            title: document.title || "",
            url: location.href,
            text,
            headings: Array.from(document.querySelectorAll("h1,h2,h3")).map((h) => h.textContent || ""),
            charCount: text.length
          };
        }
      });
      if (result?.result && result.result.text.length > 100) {
        return result.result;
      }
    } catch {
    }
    return null;
  })();
  const readableExtract = injectAndExtract(tabId, timeoutMs);
  return Promise.race([readableExtract, fastFallback]);
}
async function extractTabContent(tabId, source) {
  source.extractionStartedAt = (/* @__PURE__ */ new Date()).toISOString();
  const content = await injectAndExtractWithFallback(tabId);
  source.extractionFinishedAt = (/* @__PURE__ */ new Date()).toISOString();
  source.extractionDurationMs = new Date(source.extractionFinishedAt).getTime() - new Date(source.extractionStartedAt).getTime();
  if (content) {
    const clean = normalizeText(content.text);
    source.rawText = content.text;
    source.cleanText = clean;
    source.charCount = clean.length;
    source.title = content.title || source.title;
    if (isTooSmall(clean)) {
      source.status = "failed";
      source.error = `Page content is too short or empty (${clean.length} chars).`;
    } else if (clean.length < 500) {
      source.status = "partial";
      source.error = "Weak extraction: under 500 characters.";
    } else {
      source.status = "ready";
    }
  } else {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    source.extractionFinishedAt = now;
    if (source.extractionStartedAt) {
      source.extractionDurationMs = new Date(now).getTime() - new Date(source.extractionStartedAt).getTime();
    }
    source.status = "failed";
    source.error = source.extractionDurationMs && source.extractionDurationMs >= 8e3 ? "Extraction timed out after 8s." : "Could not inject content script or extract text from this page.";
  }
}
function createSkippedSource(url, title, method) {
  const source = createSourceRecord(url, title, method);
  source.status = "skipped";
  source.error = "Unsupported browser page";
  return source;
}
function isDuplicate(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return true;
  return pendingSources.some((s) => {
    const existing = normalizeUrl(s.url);
    return existing === normalized;
  });
}
function createPendingSources(tabs, method) {
  const newSources = [];
  for (const tab of tabs) {
    if (!tab.url) continue;
    if (isUnsupportedBrowserUrl(tab.url)) {
      const source2 = createSkippedSource(tab.url, tab.title, method);
      pendingSources.push(source2);
      newSources.push(source2);
      continue;
    }
    const normalized = normalizeUrl(tab.url);
    if (!normalized) continue;
    if (isDuplicate(normalized)) continue;
    const source = createSourceRecord(normalized, tab.title, method);
    source.status = "extracting";
    source.url = normalized;
    pendingSources.push(source);
    newSources.push(source);
  }
  return newSources;
}
async function extractWithConcurrency(sources, tabs) {
  const queue = [...sources];
  const inProgress = /* @__PURE__ */ new Set();
  let finished = 0;
  const total = queue.length;
  async function processOne(source) {
    const tab = tabs.find((t) => normalizeUrl(t.url || "") === source.url);
    if (tab && tab.id) {
      await extractTabContent(tab.id, source);
    } else {
      source.status = "failed";
      source.error = "Tab no longer available.";
    }
    finished++;
    await updateSources(pendingSources);
  }
  while (queue.length > 0 || inProgress.size > 0) {
    while (queue.length > 0 && inProgress.size < CONCURRENCY_LIMIT) {
      const source = queue.shift();
      const promise = processOne(source).finally(() => {
        inProgress.delete(promise);
      });
      inProgress.add(promise);
    }
    if (inProgress.size > 0) {
      await Promise.race(inProgress);
    }
  }
}
async function handleCaptureCurrentTab() {
  const tab = await queryCurrentTab();
  if (!tab) return [];
  const source = createSourceRecord(tab.url, tab.title, "current_tab");
  source.status = "extracting";
  pendingSources.push(source);
  await updateSources(pendingSources);
  await extractTabContent(tab.id, source);
  await updateSources(pendingSources);
  return [source];
}
async function handleCaptureAllTabs() {
  const tabs = await queryAllTabs();
  const newSources = createPendingSources(tabs, "all_tabs");
  if (newSources.length === 0) return newSources;
  await updateSources(pendingSources);
  const extracting = newSources.filter((s) => s.status === "extracting");
  await extractWithConcurrency(extracting, tabs);
  await updateSources(pendingSources);
  return newSources;
}
async function handleCaptureSelectedTabs() {
  const tabs = await querySelectedTabs();
  const newSources = createPendingSources(tabs, "selected_tabs");
  if (newSources.length === 0) return newSources;
  await updateSources(pendingSources);
  const extracting = newSources.filter((s) => s.status === "extracting");
  await extractWithConcurrency(extracting, tabs);
  await updateSources(pendingSources);
  return newSources;
}
async function handleCapturePastedUrls(urlText) {
  const urls = parseUrlsFromText(urlText);
  const newSources = [];
  for (const url of urls) {
    if (isDuplicate(url)) continue;
    const source = createSourceRecord(url, void 0, "pasted_url");
    source.status = "extracting";
    pendingSources.push(source);
    newSources.push(source);
  }
  if (newSources.length === 0) return newSources;
  await updateSources(pendingSources);
  await Promise.allSettled(
    newSources.map(async (source) => {
      source.extractionStartedAt = (/* @__PURE__ */ new Date()).toISOString();
      try {
        const response = await fetch(source.url, { signal: AbortSignal.timeout(1e4) });
        if (!response.ok) {
          source.status = "failed";
          source.error = `Server returned HTTP ${response.status}. Open in a tab and use Add Current Tab.`;
          return;
        }
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const title = doc.title?.trim() || void 0;
        const text = doc.body?.textContent?.trim() || "";
        if (isTooSmall(text)) {
          source.status = "failed";
          source.error = "Fetched content is too short or empty. Open in a tab and use Add Current Tab.";
          return;
        }
        const clean = normalizeText(text);
        source.rawText = text;
        source.cleanText = clean;
        source.charCount = clean.length;
        source.title = title;
        if (clean.length < 500) {
          source.status = "partial";
          source.error = "Weak extraction: under 500 characters.";
        } else {
          source.status = "ready";
        }
      } catch (err) {
        source.status = "failed";
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (/Failed to fetch|NetworkError|Load failed|Network request failed|abort|timeout/i.test(msg)) {
          source.error = "Could not fetch this URL directly. Open it in a tab and use Add Current Tab.";
        } else {
          source.error = msg;
        }
      } finally {
        source.extractionFinishedAt = (/* @__PURE__ */ new Date()).toISOString();
        if (source.extractionStartedAt) {
          source.extractionDurationMs = new Date(source.extractionFinishedAt).getTime() - new Date(source.extractionStartedAt).getTime();
        }
      }
    })
  );
  await updateSources(pendingSources);
  return newSources;
}
function formatSynthesisError(msg) {
  if (/Failed to fetch|NetworkError|Network request failed|Load failed|abort|TypeError.*fetch/i.test(msg)) {
    return "Local backend is not reachable at the configured URL. Switch to Mock mode or start the backend.";
  }
  if (/401|authentication_error|invalid x-api-key|missing api key|unauthorized|paid api key|mock\/local/i.test(msg)) {
    return "Paid API key is missing or invalid. Switch to Mock/local mode or set a valid key.";
  }
  return msg;
}
async function handleGenerateSynthesis(sources, prompt) {
  return synthesizeBundle(sources, prompt, providerConfig);
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case "CAPTURE_CURRENT_TAB": {
          const sources = await handleCaptureCurrentTab();
          sendResponse({ type: "CAPTURE_TABS_RESULT", sources });
          break;
        }
        case "CAPTURE_ALL_TABS": {
          const sources = await handleCaptureAllTabs();
          sendResponse({ type: "CAPTURE_TABS_RESULT", sources });
          break;
        }
        case "CAPTURE_SELECTED_TABS": {
          const sources = await handleCaptureSelectedTabs();
          sendResponse({ type: "CAPTURE_TABS_RESULT", sources });
          break;
        }
        case "CAPTURE_PASTED_URLS": {
          const sources = await handleCapturePastedUrls(message.urlText);
          sendResponse({ type: "CAPTURE_TABS_RESULT", sources });
          break;
        }
        case "GENERATE_SYNTHESIS": {
          const config = await loadSettings();
          providerConfig = config;
          getRemoteProvider().setBackendUrl(config.backendUrl);
          try {
            const result = await handleGenerateSynthesis(message.sources, message.prompt);
            await saveResult(result);
            sendResponse({ type: "SYNTHESIS_COMPLETE", result });
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            sendResponse({ type: "SYNTHESIS_ERROR", error: formatSynthesisError(msg) });
          }
          break;
        }
        case "PING": {
          sendResponse({ type: "PONG" });
          break;
        }
        default:
          sendResponse({ type: "SYNTHESIS_ERROR", error: "Unknown message type" });
      }
    } catch (err) {
      sendResponse({
        type: "SYNTHESIS_ERROR",
        error: err instanceof Error ? err.message : "Unknown error"
      });
    }
  })();
  return true;
});
loadSettings().then((config) => {
  providerConfig = config;
  getRemoteProvider().setBackendUrl(config.backendUrl);
});
function delay2(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
