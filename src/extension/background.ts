import type { ExtensionMessage, ContentScriptMessage } from '../clipbounce/messages';
import type { SourceRecord, ExtractedContent, BundleSynthesisResult, ProviderConfig } from '../clipbounce/types';
import { normalizeUrl, removeDuplicateUrls } from '../utils/url';
import { createSourceRecord, queryCurrentTab, queryAllTabs } from '../clipbounce/capture/tabCapture';
import { normalizeText, isTooSmall } from '../clipbounce/extraction/normalizeText';
import { updateSources, saveResult, clearSession } from '../clipbounce/storage/sessionStore';
import { loadSettings } from '../clipbounce/storage/settingsStore';
import { synthesizeBundle } from '../clipbounce/synthesis/bundleSynthesizer';
import { getRemoteProvider } from '../clipbounce/synthesis/providers';

let pendingSources: SourceRecord[] = [];
let providerConfig: ProviderConfig = { mode: 'mock', backendUrl: 'http://localhost:8787' };

async function injectAndExtract(tabId: number): Promise<ExtractedContent | null> {
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
}

async function handleCaptureCurrentTab(): Promise<SourceRecord[]> {
  const tab = await queryCurrentTab();
  if (!tab) return [];

  const source = createSourceRecord(tab.url, tab.title, 'current_tab');
  source.status = 'extracting';
  pendingSources.push(source);
  await updateSources(pendingSources);

  const content = await injectAndExtract(tab.id);
  if (content) {
    const clean = normalizeText(content.text);
    if (isTooSmall(clean)) {
      source.status = 'failed';
      source.error = 'Page content is too short or empty.';
    } else {
      source.status = 'ready';
      source.title = content.title || source.title;
      source.rawText = content.text;
      source.cleanText = clean;
      source.charCount = clean.length;
    }
  } else {
    source.status = 'failed';
    source.error = 'Could not inject content script or extract text.';
  }

  await updateSources(pendingSources);
  return [source];
}

async function handleCaptureAllTabs(): Promise<SourceRecord[]> {
  const tabs = await queryAllTabs();
  const newSources: SourceRecord[] = [];

  for (const tab of tabs) {
    const existing = pendingSources.find((s) => normalizeUrl(s.url) === normalizeUrl(tab.url));
    if (existing) continue;

    const source = createSourceRecord(tab.url, tab.title, 'all_tabs');
    source.status = 'extracting';
    pendingSources.push(source);
    newSources.push(source);

    const content = await injectAndExtract(tab.id);
    if (content) {
      const clean = normalizeText(content.text);
      if (isTooSmall(clean)) {
        source.status = 'failed';
        source.error = 'Page content is too short or empty.';
      } else {
        source.status = 'ready';
        source.title = content.title || source.title;
        source.rawText = content.text;
        source.cleanText = clean;
        source.charCount = clean.length;
      }
    } else {
      source.status = 'failed';
      source.error = 'Could not inject content script or extract text.';
    }
  }

  await updateSources(pendingSources);
  return newSources;
}

async function fetchAndExtractPastedUrls(urls: string[]): Promise<SourceRecord[]> {
  const uniqueUrls = removeDuplicateUrls(urls.map((u) => u.trim()).filter(Boolean));
  const newSources: SourceRecord[] = [];

  for (const url of uniqueUrls) {
    if (pendingSources.some((s) => normalizeUrl(s.url) === normalizeUrl(url))) continue;

    const source = createSourceRecord(url, undefined, 'pasted_url');
    source.status = 'extracting';
    pendingSources.push(source);
    newSources.push(source);

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const html = await response.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const title = doc.title?.trim() || undefined;
      const text = doc.body?.textContent?.trim() || '';

      if (isTooSmall(text)) {
        source.status = 'failed';
        source.error = 'Fetched content is too short or empty.';
      } else {
        const clean = normalizeText(text);
        source.status = 'ready';
        source.title = title;
        source.rawText = text;
        source.cleanText = clean;
        source.charCount = clean.length;
      }
    } catch (err) {
      source.status = 'failed';
      source.error = err instanceof Error ? err.message : 'Failed to fetch URL';
    }
  }

  await updateSources(pendingSources);
  return newSources;
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
        case 'GENERATE_SYNTHESIS': {
          const config = await loadSettings();
          providerConfig = config;
          getRemoteProvider().setBackendUrl(config.backendUrl);
          const result = await handleGenerateSynthesis(message.sources, message.prompt);
          await saveResult(result);
          sendResponse({ type: 'SYNTHESIS_COMPLETE', result });
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
