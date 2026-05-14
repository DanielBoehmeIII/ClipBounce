import { useState, useEffect } from 'react';
import { loadSettings } from '../../clipbounce/storage/settingsStore';
import type { ProviderMode } from '../../clipbounce/types';
import './App.css';

const BADGE_COLORS: Partial<Record<ProviderMode, string>> = {
  mock: '#374151',
  local: '#1d4a2e',
};

async function openSidePanel(): Promise<void> {
  try {
    if (typeof chrome.sidePanel !== 'undefined' && chrome.sidePanel.open) {
      const win = await chrome.windows.getCurrent();
      if (win.id) await chrome.sidePanel.open({ windowId: win.id });
    }
  } catch {}
  window.close();
}

async function setPendingAction(action: string, prompt?: string): Promise<void> {
  await chrome.storage.session.set({ clipbounce_pending: { action, prompt } });
}

export default function App() {
  const [providerMode, setProviderMode] = useState<ProviderMode>('mock');
  const [prompt, setPrompt] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    loadSettings().then((cfg) => setProviderMode(cfg.mode));
  }, []);

  const badgeLabel = providerMode === 'mock' ? 'Mock' : 'Local';
  const badgeBg = BADGE_COLORS[providerMode] ?? '#374151';

  async function handleAction(action: () => Promise<void>) {
    if (working) return;
    setWorking(true);
    try { await action(); } catch {}
  }

  return (
    <div className="launcher">
      <header className="launcher-header">
        <div className="launcher-header-left">
          <span className="launcher-logo">ClipBounce</span>
          <span className="launcher-badge" style={{ background: badgeBg }}>
            {badgeLabel}
          </span>
        </div>
        <button
          className="launcher-settings-btn"
          title="Open settings in side panel"
          onClick={() => handleAction(async () => {
            await setPendingAction('open-settings');
            await openSidePanel();
          })}
        >
          ⚙
        </button>
      </header>

      <div className="launcher-actions">
        <button
          className="btn-primary"
          disabled={working}
          onClick={() => handleAction(openSidePanel)}
        >
          Open Side Panel
        </button>
        <button
          className="btn-action"
          disabled={working}
          onClick={() => handleAction(async () => {
            await setPendingAction('summarize-current', 'Summarize this page.');
            await openSidePanel();
          })}
        >
          Summarize Current Tab
        </button>
        <button
          className="btn-action"
          disabled={working}
          onClick={() => handleAction(async () => {
            await setPendingAction('summarize-selected', 'Summarize these tabs.');
            await openSidePanel();
          })}
        >
          Summarize Selected Tabs
        </button>
        <button
          className="btn-action"
          disabled={working}
          onClick={() => handleAction(async () => {
            await setPendingAction('smart-group');
            await openSidePanel();
          })}
        >
          Smart Group Tabs
        </button>
      </div>

      <div className="launcher-prompt-row">
        <input
          className="launcher-prompt"
          type="text"
          placeholder="Ask about current tab…"
          value={prompt}
          disabled={working}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const p = prompt.trim();
            handleAction(async () => {
              if (p) await setPendingAction('custom-prompt', p);
              await openSidePanel();
            });
          }}
        />
      </div>

      <footer className="launcher-footer">
        <kbd className="launcher-kbd">Ctrl+Shift+L</kbd>
        <span>· open side panel</span>
      </footer>
    </div>
  );
}
