import type { ProviderConfig } from '../types';

const SETTINGS_KEY = 'clipbounce_settings';

const DEFAULT_SETTINGS: ProviderConfig = {
  mode: 'mock',
  backendUrl: 'http://localhost:8787',
};

export async function loadSettings(): Promise<ProviderConfig> {
  try {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    return result[SETTINGS_KEY] || DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(config: ProviderConfig): Promise<void> {
  await chrome.storage.sync.set({ [SETTINGS_KEY]: config });
}
