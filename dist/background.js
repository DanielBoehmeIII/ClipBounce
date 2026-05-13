// src/utils/url.ts
function getDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href;
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
  return tabs.filter((t) => t.id && t.url && !t.url.startsWith("chrome://") && !t.url.startsWith("chrome-extension://")).map((t) => ({ id: t.id, url: t.url, title: t.title }));
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
    const { prompt, sources, sourceSummaries } = input;
    await delay(500 + Math.random() * 1e3);
    const readySources = sources.filter((s) => s.status === "ready");
    const failedSources = sources.filter((s) => s.status === "failed");
    const synthesis = generateMockSynthesis(prompt, readySources, failedSources);
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
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
};
function generateMockSynthesis(prompt, ready, failed) {
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
    const { prompt, sources, sourceSummaries } = input;
    const readySources = sources.filter((s) => s.status === "ready");
    const failedSources = sources.filter((s) => s.status === "failed");
    const sourceBlocks = sources.map((s, i) => {
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
    const userContent = `User request: ${prompt.userPrompt}

Sources:
${sourceBlocks}

Per-source summaries:
${summaryBlocks}

Instructions:
1. Synthesize an answer using ONLY the provided sources.
2. Reference sources by their number like [1], [2], etc. in your answer.
3. Clearly separate repeated ideas (found in multiple sources) from unique ideas (found in only one source).
4. If some source content is not accessible (marked "[Content not accessible]"), mention it.
5. If the user's request cannot be answered from the sources, say so.

Return your response in this format:

## Synthesis
<your synthesized answer with inline references like [1], [2]>

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
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async testConnection() {
    try {
      const resp = await fetch(`${this._backendUrl}/api/health`, {
        signal: AbortSignal.timeout(5e3)
      });
      if (resp.ok) {
        const data = await resp.json();
        return { ok: true, message: data.status || "Connected" };
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
      throw new Error(`Backend error (${resp.status}): ${text.slice(0, 300)}`);
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

// src/clipbounce/synthesis/bundleSynthesizer.ts
async function synthesizeBundle(sources, userPrompt, config) {
  const spec = compilePromptSpec(userPrompt);
  const provider = config ? getProviderForConfig(config) : getProviderForConfig({ mode: "mock", backendUrl: "http://localhost:8787" });
  const sourceSummaries = await summarizeAllSources(sources, spec, provider.name);
  const result = await provider.synthesizeBundle({
    prompt: spec,
    sources,
    sourceSummaries
  });
  return result;
}

// src/extension/background.ts
var pendingSources = [];
var providerConfig = { mode: "mock", backendUrl: "http://localhost:8787" };
async function injectAndExtract(tabId) {
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
}
async function handleCaptureCurrentTab() {
  const tab = await queryCurrentTab();
  if (!tab) return [];
  const source = createSourceRecord(tab.url, tab.title, "current_tab");
  source.status = "extracting";
  pendingSources.push(source);
  await updateSources(pendingSources);
  const content = await injectAndExtract(tab.id);
  if (content) {
    const clean = normalizeText(content.text);
    if (isTooSmall(clean)) {
      source.status = "failed";
      source.error = "Page content is too short or empty.";
    } else {
      source.status = "ready";
      source.title = content.title || source.title;
      source.rawText = content.text;
      source.cleanText = clean;
      source.charCount = clean.length;
    }
  } else {
    source.status = "failed";
    source.error = "Could not inject content script or extract text.";
  }
  await updateSources(pendingSources);
  return [source];
}
async function handleCaptureAllTabs() {
  const tabs = await queryAllTabs();
  const newSources = [];
  for (const tab of tabs) {
    const existing = pendingSources.find((s) => normalizeUrl(s.url) === normalizeUrl(tab.url));
    if (existing) continue;
    const source = createSourceRecord(tab.url, tab.title, "all_tabs");
    source.status = "extracting";
    pendingSources.push(source);
    newSources.push(source);
    const content = await injectAndExtract(tab.id);
    if (content) {
      const clean = normalizeText(content.text);
      if (isTooSmall(clean)) {
        source.status = "failed";
        source.error = "Page content is too short or empty.";
      } else {
        source.status = "ready";
        source.title = content.title || source.title;
        source.rawText = content.text;
        source.cleanText = clean;
        source.charCount = clean.length;
      }
    } else {
      source.status = "failed";
      source.error = "Could not inject content script or extract text.";
    }
  }
  await updateSources(pendingSources);
  return newSources;
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
        case "GENERATE_SYNTHESIS": {
          const config = await loadSettings();
          providerConfig = config;
          getRemoteProvider().setBackendUrl(config.backendUrl);
          const result = await handleGenerateSynthesis(message.sources, message.prompt);
          await saveResult(result);
          sendResponse({ type: "SYNTHESIS_COMPLETE", result });
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
