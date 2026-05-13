import type { SourceRecord, BundleSynthesisResult } from '../types';

const SESSION_KEY = 'clipbounce_session';

type SessionData = {
  sources: SourceRecord[];
  lastResult: BundleSynthesisResult | null;
};

export async function loadSession(): Promise<SessionData> {
  const result = await chrome.storage.session.get(SESSION_KEY);
  return result[SESSION_KEY] || { sources: [], lastResult: null };
}

export async function saveSession(data: SessionData): Promise<void> {
  await chrome.storage.session.set({ [SESSION_KEY]: data });
}

export async function updateSources(sources: SourceRecord[]): Promise<void> {
  const session = await loadSession();
  session.sources = sources;
  await saveSession(session);
}

export async function saveResult(result: BundleSynthesisResult): Promise<void> {
  const session = await loadSession();
  session.lastResult = result;
  await saveSession(session);
}

export async function clearSession(): Promise<void> {
  await chrome.storage.session.remove(SESSION_KEY);
}
