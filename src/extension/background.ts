import type { ExtensionMessage, ContentScriptMessage } from '../clipbounce/messages';
import type { SourceRecord, ExtractedContent, BundleSynthesisResult, ProviderConfig } from '../clipbounce/types';
import { normalizeUrl, isUnsupportedBrowserUrl, parseUrlsFromText } from '../utils/url';
import { createSourceRecord, queryCurrentTab, queryAllTabs, querySelectedTabs } from '../clipbounce/capture/tabCapture';
import { normalizeText, isTooSmall } from '../clipbounce/extraction/normalizeText';
import { updateSources, saveResult, clearSession } from '../clipbounce/storage/sessionStore';
import { loadSettings } from '../clipbounce/storage/settingsStore';
import { synthesizeBundle } from '../clipbounce/synthesis/bundleSynthesizer';
import { getRemoteProvider } from '../clipbounce/synthesis/providers';

let pendingSources: SourceRecord[] = [];
let providerConfig: ProviderConfig = { mode: 'mock', backendUrl: 'http://localhost:8787' };

const CONCURRENCY_LIMIT = 3;

async function injectAndExtract(tabId: number, timeoutMs = 8000): Promise<ExtractedContent | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));

  const extract = (async () => {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['contentScript.js'],
      });
    } catch {
      return null;
    }

    await delay(100);

    try {
      const response = await chrome.tabs.sendMessage<ContentScriptMessage, ExtractedContent>(
        tabId,
        { type: 'EXTRACT' },
      );
      return response;
    } catch {
      return null;
    }
  })();

  return Promise.race([extract, timeout]);
}

async function injectAndExtractWithFallback(tabId: number, timeoutMs = 8000): Promise<ExtractedContent | null> {
  const fastFallback = (async () => {
    await delay(200);
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const text = document.body?.innerText || '';
          return {
            title: document.title || '',
            url: location.href,
            text,
            headings: Array.from(document.querySelectorAll('h1,h2,h3')).map((h) => h.textContent || ''),
            charCount: text.length,
          };
        },
      });
      if (result?.result && result.result.text.length > 100) {
        return result.result as ExtractedContent;
      }
    } catch {
      // fallback failed, allow main extraction to proceed
    }
    return null;
  })();

  const readableExtract = injectAndExtract(tabId, timeoutMs);

  return Promise.race([readableExtract, fastFallback]);
}

async function extractTabContent(tabId: number, source: SourceRecord): Promise<void> {
  source.extractionStartedAt = new Date().toISOString();

  const content = await injectAndExtractWithFallback(tabId);

  source.extractionFinishedAt = new Date().toISOString();
  source.extractionDurationMs = new Date(source.extractionFinishedAt).getTime() - new Date(source.extractionStartedAt).getTime();

  if (content) {
    const clean = normalizeText(content.text);
    source.rawText = content.text;
    source.cleanText = clean;
    source.charCount = clean.length;
    source.title = content.title || source.title;

    if (isTooSmall(clean)) {
      source.status = 'failed';
      source.error = `Page content is too short or empty (${clean.length} chars).`;
    } else if (clean.length < 500) {
      source.status = 'partial';
      source.error = 'Weak extraction: under 500 characters.';
    } else {
      source.status = 'ready';
    }
  } else {
    const now = new Date().toISOString();
    source.extractionFinishedAt = now;
    if (source.extractionStartedAt) {
      source.extractionDurationMs = new Date(now).getTime() - new Date(source.extractionStartedAt).getTime();
    }
    source.status = 'failed';
    source.error = source.extractionDurationMs && source.extractionDurationMs >= 8000
      ? 'Extraction timed out after 8s.'
      : 'Could not inject content script or extract text from this page.';
  }
}

function createSkippedSource(url: string, title: string | undefined, method: 'all_tabs' | 'selected_tabs'): SourceRecord {
  const source = createSourceRecord(url, title, method);
  source.status = 'skipped';
  source.error = 'Unsupported browser page';
  return source;
}

function isDuplicate(url: string): boolean {
  const normalized = normalizeUrl(url);
  if (!normalized) return true;
  return pendingSources.some((s) => {
    const existing = normalizeUrl(s.url);
    return existing === normalized;
  });
}

function createPendingSources(
  tabs: { id: number; url: string; title?: string }[],
  method: 'all_tabs' | 'selected_tabs',
): SourceRecord[] {
  const newSources: SourceRecord[] = [];

  for (const tab of tabs) {
    if (!tab.url) continue;

    if (isUnsupportedBrowserUrl(tab.url)) {
      const source = createSkippedSource(tab.url, tab.title, method);
      pendingSources.push(source);
      newSources.push(source);
      continue;
    }

    const normalized = normalizeUrl(tab.url);
    if (!normalized) continue;
    if (isDuplicate(normalized)) continue;

    const source = createSourceRecord(normalized, tab.title, method);
    source.status = 'extracting';
    source.url = normalized;
    pendingSources.push(source);
    newSources.push(source);
  }

  return newSources;
}

async function extractWithConcurrency(
  sources: SourceRecord[],
  tabs: { id: number; url: string; title?: string }[],
): Promise<void> {
  const queue = [...sources];
  const inProgress = new Set<Promise<void>>();

  let finished = 0;
  const total = queue.length;

  async function processOne(source: SourceRecord): Promise<void> {
    const tab = tabs.find(t => normalizeUrl(t.url || '') === source.url);
    if (tab && tab.id) {
      await extractTabContent(tab.id, source);
    } else {
      source.status = 'failed';
      source.error = 'Tab no longer available.';
    }
    finished++;
    await updateSources(pendingSources);
  }

  while (queue.length > 0 || inProgress.size > 0) {
    while (queue.length > 0 && inProgress.size < CONCURRENCY_LIMIT) {
      const source = queue.shift()!;
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

async function handleCaptureCurrentTab(): Promise<SourceRecord[]> {
  const tab = await queryCurrentTab();
  if (!tab) return [];

  const source = createSourceRecord(tab.url, tab.title, 'current_tab');
  source.status = 'extracting';
  pendingSources.push(source);
  await updateSources(pendingSources);

  await extractTabContent(tab.id, source);
  await updateSources(pendingSources);
  return [source];
}

async function handleCaptureAllTabs(): Promise<SourceRecord[]> {
  const tabs = await queryAllTabs();
  const newSources = createPendingSources(tabs, 'all_tabs');
  if (newSources.length === 0) return newSources;

  await updateSources(pendingSources);

  const extracting = newSources.filter(s => s.status === 'extracting');
  await extractWithConcurrency(extracting, tabs);

  await updateSources(pendingSources);
  return newSources;
}

async function handleCaptureSelectedTabs(): Promise<SourceRecord[]> {
  const tabs = await querySelectedTabs();
  const newSources = createPendingSources(tabs, 'selected_tabs');
  if (newSources.length === 0) return newSources;

  await updateSources(pendingSources);

  const extracting = newSources.filter(s => s.status === 'extracting');
  await extractWithConcurrency(extracting, tabs);

  await updateSources(pendingSources);
  return newSources;
}

async function handleCapturePastedUrls(urlText: string): Promise<SourceRecord[]> {
  const urls = parseUrlsFromText(urlText);
  const newSources: SourceRecord[] = [];

  for (const url of urls) {
    if (isDuplicate(url)) continue;

    const source = createSourceRecord(url, undefined, 'pasted_url');
    source.status = 'extracting';
    pendingSources.push(source);
    newSources.push(source);
  }

  if (newSources.length === 0) return newSources;
  await updateSources(pendingSources);

  await Promise.allSettled(
    newSources.map(async (source) => {
      source.extractionStartedAt = new Date().toISOString();
      try {
        const response = await fetch(source.url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) {
          source.status = 'failed';
          source.error = `Server returned HTTP ${response.status}. Open in a tab and use Add Current Tab.`;
          return;
        }

        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const title = doc.title?.trim() || undefined;
        const text = doc.body?.textContent?.trim() || '';

        if (isTooSmall(text)) {
          source.status = 'failed';
          source.error = 'Fetched content is too short or empty. Open in a tab and use Add Current Tab.';
          return;
        }

        const clean = normalizeText(text);
        source.rawText = text;
        source.cleanText = clean;
        source.charCount = clean.length;
        source.title = title;

        if (clean.length < 500) {
          source.status = 'partial';
          source.error = 'Weak extraction: under 500 characters.';
        } else {
          source.status = 'ready';
        }
      } catch (err) {
        source.status = 'failed';
        const msg = err instanceof Error ? err.message : 'Unknown error';
        if (/Failed to fetch|NetworkError|Load failed|Network request failed|abort|timeout/i.test(msg)) {
          source.error = 'Could not fetch this URL directly. Open it in a tab and use Add Current Tab.';
        } else {
          source.error = msg;
        }
      } finally {
        source.extractionFinishedAt = new Date().toISOString();
        if (source.extractionStartedAt) {
          source.extractionDurationMs = new Date(source.extractionFinishedAt).getTime() - new Date(source.extractionStartedAt).getTime();
        }
      }
    }),
  );

  await updateSources(pendingSources);
  return newSources;
}

function formatSynthesisError(msg: string): string {
  if (/Failed to fetch|NetworkError|Network request failed|Load failed|abort|TypeError.*fetch/i.test(msg)) {
    return 'Local backend is not reachable at the configured URL. Switch to Mock mode or start the backend.';
  }
  if (/401|authentication_error|invalid x-api-key|missing api key|unauthorized|paid api key|mock\/local/i.test(msg)) {
    return 'Paid API key is missing or invalid. Switch to Mock/local mode or set a valid key.';
  }
  return msg;
}

async function handleGenerateSynthesis(
  sources: SourceRecord[],
  prompt: string,
): Promise<BundleSynthesisResult> {
  return synthesizeBundle(sources, prompt, providerConfig);
}

chrome.runtime.onMessage.addListener((
  message: ExtensionMessage,
  _sender,
  sendResponse,
) => {
  (async () => {
    try {
      switch (message.type) {
        case 'CAPTURE_CURRENT_TAB': {
          const sources = await handleCaptureCurrentTab();
          sendResponse({ type: 'CAPTURE_TABS_RESULT', sources });
          break;
        }
        case 'CAPTURE_ALL_TABS': {
          const sources = await handleCaptureAllTabs();
          sendResponse({ type: 'CAPTURE_TABS_RESULT', sources });
          break;
        }
        case 'CAPTURE_SELECTED_TABS': {
          const sources = await handleCaptureSelectedTabs();
          sendResponse({ type: 'CAPTURE_TABS_RESULT', sources });
          break;
        }
        case 'CAPTURE_PASTED_URLS': {
          const sources = await handleCapturePastedUrls(message.urlText);
          sendResponse({ type: 'CAPTURE_TABS_RESULT', sources });
          break;
        }
        case 'GENERATE_SYNTHESIS': {
          const config = await loadSettings();
          providerConfig = config;
          getRemoteProvider().setBackendUrl(config.backendUrl);
          try {
            const result = await handleGenerateSynthesis(message.sources, message.prompt);
            await saveResult(result);
            sendResponse({ type: 'SYNTHESIS_COMPLETE', result });
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            sendResponse({ type: 'SYNTHESIS_ERROR', error: formatSynthesisError(msg) });
          }
          break;
        }
        case 'PING': {
          sendResponse({ type: 'PONG' });
          break;
        }
        default:
          sendResponse({ type: 'SYNTHESIS_ERROR', error: 'Unknown message type' });
      }
    } catch (err) {
      sendResponse({
        type: 'SYNTHESIS_ERROR',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  })();

  return true;
});

loadSettings().then((config) => {
  providerConfig = config;
  getRemoteProvider().setBackendUrl(config.backendUrl);
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
