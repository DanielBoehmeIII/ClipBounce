import type { SourceRecord, SourceCaptureMethod } from '../types';
import { getDomain } from '../../utils/url';
import { generateId } from '../../utils/hash';

export function createSourceRecord(
  url: string,
  title: string | undefined,
  method: SourceCaptureMethod
): SourceRecord {
  return {
    id: generateId(),
    url,
    title: title || undefined,
    domain: getDomain(url),
    captureMethod: method,
    status: 'pending',
    capturedAt: new Date().toISOString(),
  };
}

export async function queryCurrentTab(): Promise<{ id: number; url: string; title?: string } | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id || !tab.url) return null;
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return null;
  return { id: tab.id, url: tab.url, title: tab.title };
}

export async function queryAllTabs(): Promise<{ id: number; url: string; title?: string }[]> {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((t) => t.id && t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'))
    .map((t) => ({ id: t.id!, url: t.url!, title: t.title }));
}
