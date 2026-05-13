import type { SourceRecord, BundleSynthesisResult } from '../types';

const SESSION_KEY = 'clipbounce_session';

export type GenerationStatus = {
  stage: string;
  message: string;
  sourceCount?: number;
  chunkCount?: number;
  charCount?: number;
  timestamp: number;
};

type SessionData = {
  sources: SourceRecord[];
  lastResult: BundleSynthesisResult | null;
  generationStatus?: GenerationStatus | null;
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

export async function setGenerationStatus(status: GenerationStatus | null): Promise<void> {
  const session = await loadSession();
  session.generationStatus = status;
  await saveSession(session);
}

export async function getGenerationStatus(): Promise<GenerationStatus | null> {
  const session = await loadSession();
  return session.generationStatus || null;
}

export async function clearSession(): Promise<void> {
  await chrome.storage.session.remove(SESSION_KEY);
}
