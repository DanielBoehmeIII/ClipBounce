import { useState, useCallback, useRef, useEffect } from 'react';
import type { SourceRecord, BundleSynthesisResult, ProviderMode, TabInfo, TabBufferState, TabPane, PaneColor, TabGroupSuggestion } from '../../clipbounce/types';
import type { ExtensionMessage } from '../../clipbounce/messages';
import { loadSettings, saveSettings } from '../../clipbounce/storage/settingsStore';
import type { GenerationStatus } from '../../clipbounce/storage/sessionStore';
import { createBufferFromTabs, toggleBoundary, growLeft, shrinkLeft, growRight, shrinkRight, getBufferedTabCount, getBufferedRangeLabel, applyHighlightToChrome, isInputFocused } from '../../clipbounce/tabs/tabBuffer';
import { smartGroupTabs } from '../../clipbounce/tabs/tabClassifier';
import { applySmartGroupSuggestions, tabGroupsAvailable } from '../../clipbounce/tabs/tabGroups';
import { loadPanes, createPane, releasePane, archivePane, focusPane, restorePane, deletePane } from '../../clipbounce/panes/paneManager';
import { MACROS } from '../../clipbounce/macros/macroRegistry';
import { runMacro } from '../../clipbounce/macros/macroRunner';
import './App.css';

type AppStatus = 'idle' | 'capturing' | 'generating' | 'complete' | 'error';

const PRESETS = [
  { label: 'Beginner summary', prompt: 'Summarize these websites for a beginner.' },
  { label: 'Compare sources', prompt: 'Compare the main ideas across these sources.' },
  { label: 'Extract pricing', prompt: 'Extract pricing and make a table.' },
  { label: 'Find unique ideas', prompt: 'Tell me what is unique across these links.' },
  { label: 'Study notes', prompt: 'Make study notes from these pages.' },
];

const PANE_COLORS: { label: string; value: PaneColor }[] = [
  { label: 'Blue', value: 'blue' },
  { label: 'Green', value: 'green' },
  { label: 'Purple', value: 'purple' },
  { label: 'Yellow', value: 'yellow' },
  { label: 'Red', value: 'red' },
  { label: 'Orange', value: 'orange' },
  { label: 'Cyan', value: 'cyan' },
  { label: 'Pink', value: 'pink' },
  { label: 'Grey', value: 'grey' },
];

const AUTO_CREATE_CHIPS = [
  'Market analysis',
  'Design system',
  'Content strategy',
  'React performance',
];

function getBatchSummary(sources: SourceRecord[]): string {
  const ready = sources.filter(s => s.status === 'ready').length;
  const partial = sources.filter(s => s.status === 'partial').length;
  const failed = sources.filter(s => s.status === 'failed').length;
  const skipped = sources.filter(s => s.status === 'skipped').length;
  const parts: string[] = [];
  if (ready > 0) parts.push(`${ready} ready`);
  if (partial > 0) parts.push(`${partial} partial`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  return parts.join(', ');
}

function formatErrorMessage(err: unknown): string {
  const msg = typeof err === 'string' ? err : (err instanceof Error ? err.message : '');
  if (/Failed to fetch|NetworkError|Network request failed|Load failed|TypeError.*fetch|abort|timeout/i.test(msg)) {
    return 'Local backend is not reachable at the configured URL. Switch to Mock mode or start the backend.';
  }
  if (/401|authentication_error|invalid x-api-key|missing api key|unauthorized|paid api key|mock\/local/i.test(msg)) {
    return 'Paid API key is missing or invalid. Switch to Mock/local mode or set a valid key.';
  }
  return msg || 'An unknown error occurred.';
}

const COLOR_CLASSES: Record<string, string> = {
  blue: 'group-blue',
  green: 'group-green',
  purple: 'group-purple',
  yellow: 'group-yellow',
  grey: 'group-grey',
  pink: 'group-pink',
  cyan: 'group-cyan',
  orange: 'group-orange',
  red: 'group-red',
};

export default function App() {
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [status, setStatus] = useState<AppStatus>('idle');
  const [prompt, setPrompt] = useState('');
  const [urlText, setUrlText] = useState('');
  const [result, setResult] = useState<BundleSynthesisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'none' | 'synthesis' | 'report'>('none');
  const [progressMessage, setProgressMessage] = useState('');
  const resultRef = useRef<HTMLDivElement>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [providerMode, setProviderMode] = useState<ProviderMode>('mock');
  const [backendUrl, setBackendUrl] = useState('http://localhost:8787');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [connectionMsg, setConnectionMsg] = useState('');
  const [expandedText, setExpandedText] = useState<Set<string>>(new Set());
  const [fastMode, setFastMode] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [windowTabs, setWindowTabs] = useState<TabInfo[]>([]);
  const [buffer, setBuffer] = useState<TabBufferState | null>(null);
  const [panes, setPanes] = useState<TabPane[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['pane', 'auto-create', 'macros']));
  const [paneTitle, setPaneTitle] = useState('');
  const [paneColor, setPaneColor] = useState<PaneColor>('blue');
  const [smartGrouping, setSmartGrouping] = useState(false);
  const [groupSuggestions, setGroupSuggestions] = useState<TabGroupSuggestion[]>([]);
  const [macroMsg, setMacroMsg] = useState('');
  const [confirmArchive, setConfirmArchive] = useState<{ id: number; url: string; title: string }[] | null>(null);
  const [savedSessions, setSavedSessions] = useState<TabPane[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const [currentPane, setCurrentPane] = useState<TabPane | null>(null);

  const currentProviderLabel = providerMode === 'mock' ? 'Mock' : 'Local Backend';

  useEffect(() => {
    loadSettings().then((cfg) => {
      setProviderMode(cfg.mode);
      setBackendUrl(cfg.backendUrl);
      setFastMode(cfg.fastMode ?? false);
    });
    initTabsAndPanes();
  }, []);

  useEffect(() => {
    if (status === 'generating') {
      setElapsedSeconds(0);
      const interval = setInterval(() => setElapsedSeconds(prev => prev + 1), 1000);
      return () => clearInterval(interval);
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'generating') return;
    const poll = setInterval(async () => {
      try {
        const session = await chrome.storage.session.get('clipbounce_session');
        const data = session.clipbounce_session as { generationStatus?: GenerationStatus } | undefined;
        if (data?.generationStatus?.message) {
          setProgressMessage(data.generationStatus.message);
        }
      } catch {}
    }, 500);
    return () => clearInterval(poll);
  }, [status]);

  const bufferRef = useRef(buffer);
  bufferRef.current = buffer;
  const windowTabsRef = useRef(windowTabs);
  windowTabsRef.current = windowTabs;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isInputFocused()) return;
      const buf = bufferRef.current;
      if (!buf) return;
      if (e.key === ' ') {
        e.preventDefault();
        const next = toggleBoundary(buf);
        setBuffer(next);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = buf.activeBoundary === 'left' ? growLeft(buf) : shrinkRight(buf);
        setBuffer(next);
        applyHighlightToChrome(next.windowId, next.leftIndex, next.rightIndex, windowTabsRef.current);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = buf.activeBoundary === 'right' ? growRight(buf) : shrinkLeft(buf);
        setBuffer(next);
        applyHighlightToChrome(next.windowId, next.leftIndex, next.rightIndex, windowTabsRef.current);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleCreatePane();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleReleaseCurrentPane();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const sendMessage = useCallback(async (msg: ExtensionMessage): Promise<any> => {
    return chrome.runtime.sendMessage(msg);
  }, []);

  const persistSettings = useCallback(async (mode: ProviderMode, url: string, fast: boolean) => {
    await saveSettings({ mode, backendUrl: url, fastMode: fast });
  }, []);

  const handleModeChange = useCallback((mode: ProviderMode) => {
    setProviderMode(mode);
    persistSettings(mode, backendUrl, fastMode);
  }, [backendUrl, fastMode, persistSettings]);

  const handleUrlChange = useCallback((url: string) => {
    setBackendUrl(url);
    persistSettings(providerMode, url, fastMode);
  }, [providerMode, fastMode, persistSettings]);

  const handleFastModeChange = useCallback(() => {
    const next = !fastMode;
    setFastMode(next);
    persistSettings(providerMode, backendUrl, next);
  }, [providerMode, backendUrl, persistSettings, fastMode]);

  const testConnection = useCallback(async () => {
    setConnectionStatus('testing');
    setConnectionMsg('');
    try {
      const resp = await fetch(`${backendUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const data = await resp.json();
        setConnectionStatus('ok');
        setConnectionMsg(data.status || 'Connected');
      } else {
        setConnectionStatus('fail');
        setConnectionMsg(`HTTP ${resp.status}`);
      }
    } catch (err) {
      setConnectionStatus('fail');
      setConnectionMsg(err instanceof Error ? err.message : 'Connection failed');
    }
  }, [backendUrl]);

  const initTabsAndPanes = useCallback(async () => {
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const allTabs: TabInfo[] = tabs
        .filter(t => t.id && t.url)
        .map(t => ({
          id: t.id!,
          index: t.index,
          windowId: t.windowId,
          url: t.url || '',
          title: t.title || '',
          domain: t.url ? new URL(t.url).hostname : '',
          highlighted: t.highlighted || false,
          active: t.active || false,
        }));
      setWindowTabs(allTabs);

      const winId = tabs[0]?.windowId || 0;
      const buf = createBufferFromTabs(winId, allTabs);
      setBuffer(buf);

      const saved = await loadPanes();
      setPanes(saved);
      const active = saved.find(p => p.status === 'active');
      setCurrentPane(active || null);
    } catch {}
  }, []);

  const handleToggleBoundary = useCallback(() => {
    if (!buffer) return;
    const next = toggleBoundary(buffer);
    setBuffer(next);
  }, [buffer]);

  const handleCreatePane = useCallback(async (skipBufferCheck = false) => {
    if (!buffer || (!skipBufferCheck && getBufferedTabCount(buffer) === 0)) {
      if (!skipBufferCheck) return;
    }
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const allTabs: TabInfo[] = tabs
      .filter(t => t.id && t.url)
      .map(t => ({
        id: t.id!,
        index: t.index,
        windowId: t.windowId,
        url: t.url || '',
        title: t.title || '',
        domain: t.url ? new URL(t.url).hostname : '',
        highlighted: false,
        active: false,
      }));
    const winId = tabs[0]?.windowId || 0;
    const title = paneTitle || `Pane ${getBufferedTabCount(buffer!)} tabs`;
    const pane = await createPane(title, paneColor, buffer!, allTabs, winId);
    if (pane) {
      setPanes(prev => [...prev, pane]);
      setCurrentPane(pane);
      setPaneTitle('');
      setProgressMessage('');
    }
  }, [buffer, paneTitle, paneColor]);

  const handleReleaseCurrentPane = useCallback(async () => {
    if (!currentPane) return;
    const released = await releasePane(currentPane.id);
    if (released) {
      setPanes(prev => prev.map(p => p.id === released.id ? released : p));
      setCurrentPane(null);
    }
  }, [currentPane]);

  const handleReleasePane = useCallback(async (paneId: string) => {
    const released = await releasePane(paneId);
    if (released) {
      setPanes(prev => prev.map(p => p.id === released.id ? released : p));
      if (currentPane?.id === paneId) setCurrentPane(null);
    }
  }, [currentPane]);

  const handleArchivePane = useCallback(async (paneId: string) => {
    const archived = await archivePane(paneId);
    if (archived) {
      setPanes(prev => prev.map(p => p.id === archived.id ? archived : p));
      if (currentPane?.id === paneId) setCurrentPane(null);
    }
  }, [currentPane]);

  const handleFocusPane = useCallback(async (paneId: string) => {
    await focusPane(paneId);
  }, []);

  const handleRestorePane = useCallback(async (pane: TabPane) => {
    const restored = await restorePane(pane);
    if (restored) {
      setPanes(prev => prev.map(p => p.id === restored.id ? restored : p));
      setCurrentPane(restored);
      setShowSessions(false);
      setProgressMessage(`Restored session: ${restored.title}`);
    }
  }, []);

  const handleDeletePane = useCallback(async (paneId: string) => {
    await deletePane(paneId);
    setPanes(prev => prev.filter(p => p.id !== paneId));
    if (currentPane?.id === paneId) setCurrentPane(null);
  }, [currentPane]);

  const handleSmartGroup = useCallback(async () => {
    if (!windowTabs.length) return;
    setSmartGrouping(true);
    try {
      const highlighted = windowTabs.filter(t => t.highlighted);
      const target = highlighted.length > 0 ? highlighted : windowTabs;
      const suggestions = smartGroupTabs(target);
      setGroupSuggestions(suggestions);

      const paneMap = new Map<string, TabPane>();
      for (const p of panes) {
        if (p.status === 'active') paneMap.set(p.title, p);
      }
      const winId = windowTabs[0]?.windowId || 0;
      await applySmartGroupSuggestions(winId, suggestions, paneMap);
      setProgressMessage(`Created ${suggestions.length} groups.`);
    } catch {
      setProgressMessage('Smart grouping failed.');
    }
    setSmartGrouping(false);
  }, [windowTabs, panes]);

  const handleAISmartGroup = useCallback(async () => {
    setSmartGrouping(true);
    try {
      const highlighted = windowTabs.filter(t => t.highlighted);
      const target = highlighted.length > 0 ? highlighted : windowTabs;
      const suggestions = smartGroupTabs(target);
      setGroupSuggestions(suggestions);

      const paneMap = new Map<string, TabPane>();
      for (const p of panes) {
        if (p.status === 'active') paneMap.set(p.title, p);
      }
      const winId = windowTabs[0]?.windowId || 0;
      await applySmartGroupSuggestions(winId, suggestions, paneMap);
      setProgressMessage(`AI groups created (${suggestions.length} groups).`);
    } catch {
      setProgressMessage('AI grouping failed, using deterministic fallback.');
    }
    setSmartGrouping(false);
  }, [windowTabs, panes]);

  const handleAutoCreateChip = useCallback((chip: string) => {
    setPrompt(`Help me with ${chip.toLowerCase()}. `);
  }, []);

  const handleRunMacro = useCallback(async (macroId: string) => {
    setMacroMsg('');
    setConfirmArchive(null);
    setShowSessions(false);

    const setSourcesFn = (fn: (prev: SourceRecord[]) => SourceRecord[]) => {
      setSources(fn);
    };
    const setPromptFn = (p: string) => setPrompt(p);
    const triggerCapture = async () => {};

    const macr = MACROS.find(m => m.id === macroId);
    if (!macr) return;

    const winId = windowTabs[0]?.windowId || 0;
    const result = await runMacro(macroId, {
      buffer,
      tabs: windowTabs,
      windowId: winId,
      sources,
      setSources: setSourcesFn,
      setPrompt: setPromptFn,
      triggerCapture,
    });

    if (!result.success) {
      setMacroMsg(result.message);
      return;
    }

    if (result.action === 'set-prompt' && typeof result.data === 'string') {
      setPrompt(result.data);
      setMacroMsg(result.message);
    } else if (result.action === 'confirm-archive' && result.data) {
      setConfirmArchive(result.data as { id: number; url: string; title: string }[]);
    } else if (result.action === 'show-sessions' && result.data) {
      const sessions = result.data as TabPane[];
      setSavedSessions(sessions);
      setShowSessions(true);
    } else if (result.action === 'create-pane') {
      await initTabsAndPanes();
      setMacroMsg(result.message);
    } else {
      setMacroMsg(result.message);
    }
  }, [buffer, windowTabs, sources, initTabsAndPanes]);

  const handleConfirmArchive = useCallback(async () => {
    if (!confirmArchive) return;
    const archiveKey = `clipbounce_archive_${Date.now()}`;
    await chrome.storage.local.set({ [archiveKey]: confirmArchive });
    for (const tab of confirmArchive) {
      try { await chrome.tabs.remove(tab.id); } catch {}
    }
    setConfirmArchive(null);
    setMacroMsg(`Archived ${confirmArchive.length} tabs.`);
    await initTabsAndPanes();
  }, [confirmArchive, initTabsAndPanes]);

  const toggleSection = useCallback((name: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const openSidePanel = useCallback(async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'PING' });
      if (typeof chrome.sidePanel !== 'undefined' && chrome.sidePanel.open) {
        const win = await chrome.windows.getCurrent();
        if (win.id) {
          await chrome.sidePanel.open({ windowId: win.id });
        }
      }
    } catch {}
  }, []);

  const startCapture = useCallback(async (msg: ExtensionMessage, progress: string, emptyMessage?: string) => {
    setStatus('capturing');
    setProgressMessage(progress);
    setError(null);
    try {
      const resp = await sendMessage(msg);
      if (resp.type === 'CAPTURE_TABS_RESULT' && resp.sources) {
        if (resp.sources.length === 0 && emptyMessage) {
          setError(emptyMessage);
          setStatus('idle');
          setProgressMessage('');
          return;
        }
        const total = resp.sources.length;
        const needsPolling = resp.sources.some((s: SourceRecord) => s.status === 'extracting');
        setSources((prev) => {
          const existing = new Set(prev.map(s => s.url));
          const newOnes = resp.sources.filter((s: SourceRecord) => !existing.has(s.url));
          return [...prev, ...newOnes];
        });
        if (needsPolling) {
          setProgressMessage(`Processing 0 of ${total}...`);
          const poll = setInterval(async () => {
            try {
              const session = await chrome.storage.session.get('clipbounce_session');
              const data = session.clipbounce_session as { sources?: SourceRecord[] } | undefined;
              if (data?.sources) {
                setSources((prev) => {
                  const updated = [...prev];
                  for (const s of data.sources!) {
                    const idx = updated.findIndex((u) => u.url === s.url);
                    if (idx >= 0) updated[idx] = s;
                  }
                  return updated;
                });
                const done = data.sources.filter((s) => s.status !== 'extracting' && s.status !== 'pending').length;
                setProgressMessage(`Processing ${done} of ${total}...`);
                if (done >= total) {
                  clearInterval(poll);
                  setStatus('idle');
                  setProgressMessage('');
                }
              }
            } catch {
              clearInterval(poll);
              setStatus('idle');
              setProgressMessage('');
            }
          }, 300);
          return;
        }
      }
    } catch (err) {
      setError(formatErrorMessage(err));
    }
    setStatus('idle');
    setProgressMessage('');
  }, [sendMessage]);

  const addCurrentTab = useCallback(() => {
    startCapture({ type: 'CAPTURE_CURRENT_TAB' }, 'Adding current tab...');
  }, [startCapture]);

  const addAllTabs = useCallback(() => {
    startCapture({ type: 'CAPTURE_ALL_TABS' }, 'Adding all tabs...');
  }, [startCapture]);

  const addSelectedTabs = useCallback(() => {
    startCapture(
      { type: 'CAPTURE_SELECTED_TABS' },
      'Adding selected tabs...',
      'No highlighted tabs found. Select tabs by holding Ctrl/Cmd and clicking them, then try again.',
    );
  }, [startCapture]);

  const addPastedUrls = useCallback(async () => {
    if (!urlText.trim()) return;
    setStatus('capturing');
    setProgressMessage('Processing pasted URLs...');
    setError(null);
    try {
      const resp = await sendMessage({ type: 'CAPTURE_PASTED_URLS', urlText: urlText.trim() });
      if (resp.type === 'CAPTURE_TABS_RESULT' && resp.sources) {
        setSources((prev) => {
          const existing = new Set(prev.map(s => s.url));
          const newOnes = resp.sources.filter((s: SourceRecord) => !existing.has(s.url));
          return [...prev, ...newOnes];
        });
        setUrlText('');
      }
    } catch (err) {
      setError(formatErrorMessage(err));
    }
    setStatus('idle');
    setProgressMessage('');
  }, [urlText, sendMessage]);

  const clearSources = useCallback(() => {
    setSources([]);
    setResult(null);
    setError(null);
  }, []);

  const removeSource = useCallback((id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const toggleExpandedText = useCallback((id: string) => {
    setExpandedText((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const generate = useCallback(async () => {
    if (sources.length === 0 || !prompt.trim()) return;
    setStatus('generating');
    setError(null);
    setResult(null);
    setProgressMessage('Analyzing sources and generating synthesis...');
    try {
      const resp = await sendMessage({
        type: 'GENERATE_SYNTHESIS',
        sources,
        prompt: prompt.trim(),
      });
      if (resp.type === 'SYNTHESIS_COMPLETE') {
        setResult(resp.result);
        setStatus('complete');
        setTimeout(() => {
          resultRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } else {
        throw new Error(resp.error || 'Generation failed');
      }
    } catch (err) {
      setError(formatErrorMessage(err));
      setStatus('error');
    }
    setProgressMessage('');
  }, [sources, prompt, sendMessage]);

  const copySynthesis = useCallback(() => {
    if (!result) return;
    navigator.clipboard.writeText(result.synthesis).then(() => {
      setCopied('synthesis');
      setTimeout(() => setCopied('none'), 2000);
    });
  }, [result]);

  const copyFullReport = useCallback(() => {
    if (!result) return;
    const text = [
      `# ClipBounce Synthesis Report`,
      `Prompt: ${result.prompt}`,
      `Generated: ${result.generatedAt}`,
      `Provider: ${currentProviderLabel}`,
      '',
      result.synthesis,
      '',
      '---',
      '## Source Summaries',
      ...result.sourceSummaries.map(
        (s, i) => `\n### ${i + 1}. ${s.title || s.url}\n${s.summary}\n\nKey points:\n${s.keyPoints.map((kp) => `- ${kp}`).join('\n')}`,
      ),
      ...(result.failures.length > 0
        ? ['\n## Failed Sources', ...result.failures.map((f) => `- ${f.url}: ${f.reason}`)]
        : []),
    ].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied('report');
      setTimeout(() => setCopied('none'), 2000);
    });
  }, [result, currentProviderLabel]);

  const downloadMarkdown = useCallback(() => {
    if (!result) return;
    const text = [
      `# ClipBounce Synthesis Report`,
      `Prompt: ${result.prompt}`,
      `Generated: ${result.generatedAt}`,
      `Provider: ${currentProviderLabel}`,
      '',
      result.synthesis,
      '',
      '---',
      '## Source Summaries',
      ...result.sourceSummaries.map(
        (s, i) => `\n### ${i + 1}. ${s.title || s.url}\n${s.summary}\n\nKey points:\n${s.keyPoints.map((kp) => `- ${kp}`).join('\n')}`,
      ),
      ...(result.failures.length > 0
        ? ['\n## Failed Sources', ...result.failures.map((f) => `- ${f.url}: ${f.reason}`)]
        : []),
    ].join('\n');
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clipbounce-report-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, currentProviderLabel]);

  const selectedCount = windowTabs.filter(t => t.highlighted).length;
  const bufferedCount = buffer ? getBufferedTabCount(buffer) : 0;
  const rangeLabel = buffer ? getBufferedRangeLabel(buffer) : '';

  return (
    <div className="app">

      {/* HEADER */}
      <header className="header">
        <div className="header-top">
          <h1 className="title">ClipBounce</h1>
          <div className="header-actions">
            <button className="sp-open-btn" onClick={openSidePanel} title="Open in Chrome side panel for more space">
              Open Side Panel
            </button>
            <span className="badge" onClick={() => toggleSection('settings')} title="Settings">
              {showSettings ? '\u2715' : '\u2699'}
            </span>
            <kbd className="kbd">Ctrl+Shift+L</kbd>
          </div>
        </div>
        <p className="subtitle">
          Prompt multiple websites at once.
          <span className="provider-badge">{currentProviderLabel}</span>
        </p>
      </header>

      {/* SETTINGS */}
      {showSettings && (
        <section className="section settings-panel">
          <h3 className="section-label" style={{ marginBottom: 8, color: 'var(--text-dim)' }}>Provider Settings</h3>
          <div className="settings-row">
            <label className="settings-label">Mode</label>
            <select className="settings-select" value={providerMode} onChange={(e) => handleModeChange(e.target.value as ProviderMode)}>
              <option value="mock">Mock (no backend)</option>
              <option value="local">Local Backend</option>
            </select>
          </div>
          {providerMode === 'local' && (
            <>
              <div className="settings-row">
                <label className="settings-label">Backend URL</label>
                <input className="settings-input" type="text" value={backendUrl} onChange={(e) => handleUrlChange(e.target.value)} placeholder="http://localhost:8787" />
              </div>
              <div className="settings-row">
                <label className="settings-label">Fast Mode</label>
                <label className="toggle">
                  <input type="checkbox" checked={fastMode} onChange={handleFastModeChange} />
                  <span className="toggle-slider" />
                </label>
                <span className="toggle-label">{fastMode ? 'On' : 'Off'}</span>
              </div>
              {fastMode && <p className="settings-hint">Fast Mode: reduced context, one-pass synthesis.</p>}
              <div className="settings-row">
                <button className="btn btn-sm" onClick={testConnection} disabled={connectionStatus === 'testing'}>
                  {connectionStatus === 'testing' ? 'Testing...' : 'Test'}
                </button>
                {connectionStatus === 'ok' && <span className="conn-ok">{connectionMsg}</span>}
                {connectionStatus === 'fail' && <span className="conn-fail">{connectionMsg}</span>}
              </div>
            </>
          )}
          {providerMode === 'mock' && <p className="settings-hint">Mock mode: all outputs simulated. Switch to Local Backend for real AI.</p>}
        </section>
      )}

      {/* MACRO MESSAGE */}
      {macroMsg && <div className="macro-msg">{macroMsg}</div>}

      {/* CONFIRM ARCHIVE */}
      {confirmArchive && (
        <div className="confirm">
          <p>Archive {confirmArchive.length} tabs?</p>
          <div className="confirm-actions">
            <button className="btn btn-primary btn-sm" onClick={handleConfirmArchive}>Confirm</button>
            <button className="btn btn-sm" onClick={() => setConfirmArchive(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* SAVED SESSIONS */}
      {showSessions && (
        <div className="sessions">
          <div className="sessions-header">
            <span>Saved Sessions</span>
            <button className="btn-icon" onClick={() => setShowSessions(false)}>&times;</button>
          </div>
          {savedSessions.length === 0 ? (
            <p className="text-muted text-xs">No saved sessions found.</p>
          ) : (
            savedSessions.map(s => (
              <div key={s.id} className="session-item">
                <span className="session-title">{s.title} ({s.tabIds.length} tabs)</span>
                <button className="btn btn-sm" onClick={() => handleRestorePane(s)}>Restore</button>
              </div>
            ))
          )}
        </div>
      )}

      {/* SECTION: SELECTION */}
      <section className="section">
        <div className="section-header" onClick={() => toggleSection('selection')}>
          <h2 className="section-label">SELECTION</h2>
          <span className="section-toggle">{collapsed.has('selection') ? '\u25B6' : '\u25BC'}</span>
        </div>
        {!collapsed.has('selection') && (
          <div className="section-body">
            <div className="stats-row">
              <span className="stat"><strong>Selected:</strong> {selectedCount}</span>
              <span className="stat"><strong>Buffered Range:</strong> {rangeLabel}</span>
              <span className="stat"><strong>Total Tabs:</strong> {buffer?.totalTabs || 0}</span>
            </div>
            <div className="stats-row">
              <span className="stat"><strong>Active boundary:</strong> {buffer?.activeBoundary || 'right'}</span>
              <kbd className="kbd kbd-sm">Space to toggle</kbd>
            </div>
            {buffer && (
              <div className="range-bar">
                <div className="range-track">
                  <div
                    className="range-fill"
                    style={{
                      left: `${(buffer.leftIndex / buffer.totalTabs) * 100}%`,
                      width: `${((buffer.rightIndex - buffer.leftIndex + 1) / buffer.totalTabs) * 100}%`,
                    }}
                  />
                  <div className="range-boundary" style={{ left: `${(buffer.leftIndex / buffer.totalTabs) * 100}%` }}>
                    <div className={`boundary-marker ${buffer.activeBoundary === 'left' ? 'boundary-active' : ''}`} />
                  </div>
                  <div className="range-boundary" style={{ left: `${((buffer.rightIndex + 1) / buffer.totalTabs) * 100}%` }}>
                    <div className={`boundary-marker ${buffer.activeBoundary === 'right' ? 'boundary-active' : ''}`} />
                  </div>
                </div>
              </div>
            )}
            <div className="btn-row">
              <button className="btn btn-primary" onClick={addCurrentTab} disabled={status === 'capturing'}>+ Current</button>
              <button className="btn" onClick={addSelectedTabs} disabled={status === 'capturing'}>+ Selected</button>
              <button className="btn" onClick={addAllTabs} disabled={status === 'capturing'}>+ All</button>
              <button className="btn btn-ghost" onClick={clearSources} disabled={sources.length === 0}>Clear</button>
            </div>
          </div>
        )}
      </section>

      {/* SECTION: KEYBOARD */}
      <section className="section">
        <div className="section-header" onClick={() => toggleSection('keyboard')}>
          <h2 className="section-label">KEYBOARD</h2>
          <span className="section-toggle">{collapsed.has('keyboard') ? '\u25B6' : '\u25BC'}</span>
        </div>
        {!collapsed.has('keyboard') && (
          <div className="section-body">
            <div className="keyboard-grid">
              <div className="key-item"><kbd className="kbd">Space</kbd> Toggle active boundary</div>
              <div className="key-item"><kbd className="kbd">&larr;</kbd> Shrink / Grow left</div>
              <div className="key-item"><kbd className="kbd">&rarr;</kbd> Shrink / Grow right</div>
              <div className="key-item"><kbd className="kbd">&uarr;</kbd> Create pane from highlighted</div>
              <div className="key-item"><kbd className="kbd">&darr;</kbd> Release pane</div>
            </div>
          </div>
        )}
      </section>

      {/* SECTION: PANE */}
      <section className="section">
        <div className="section-header" onClick={() => toggleSection('pane')}>
          <h2 className="section-label">PANE</h2>
          <span className="section-toggle">{collapsed.has('pane') ? '\u25B6' : '\u25BC'}</span>
        </div>
        {!collapsed.has('pane') && (
          <div className="section-body">
            <div className="pane-create-row">
              <input className="input" placeholder="Pane title (optional)" value={paneTitle} onChange={(e) => setPaneTitle(e.target.value)} />
              <select className="select" value={paneColor} onChange={(e) => setPaneColor(e.target.value as PaneColor)}>
                {PANE_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <button className="btn btn-primary" onClick={() => handleCreatePane()} disabled={!buffer || bufferedCount === 0}>
                Create
              </button>
            </div>
            <div className="pane-actions-row">
              {currentPane && (
                <>
                  <span className="pane-label">Active: {currentPane.title} ({currentPane.tabIds.length} tabs)</span>
                  <button className="btn btn-sm" onClick={() => handleFocusPane(currentPane.id)}>Focus</button>
                  <button className="btn btn-sm" onClick={() => handleReleasePane(currentPane.id)}>Release</button>
                  <button className="btn btn-sm" onClick={() => handleArchivePane(currentPane.id)}>Archive</button>
                </>
              )}
            </div>
            <p className="text-muted text-xs">Tab Group API: {tabGroupsAvailable() ? '\u2713' : '\u2014'}</p>

            {/* ALL PANES LIST */}
            {panes.length > 0 && (
              <div className="pane-cards">
                {panes.map(p => (
                  <div key={p.id} className="pane-card">
                    <div className="pane-card-color" style={{ backgroundColor: `var(--${p.color || 'blue'})` }} />
                    <span className="pane-card-title">{p.title}</span>
                    <span className="pane-card-count">{p.tabIds.length} tabs</span>
                    <span className="pane-card-status">{p.status === 'active' ? 'Active' : p.status === 'released' ? 'Released' : 'Archived'}</span>
                    <div className="pane-card-actions">
                      {p.status === 'active' && (
                        <>
                          <button className="btn btn-sm" onClick={() => handleFocusPane(p.id)} title="Focus">Focus</button>
                          <button className="btn btn-sm" onClick={() => handleReleasePane(p.id)} title="Release">Release</button>
                          <button className="btn btn-sm" onClick={() => handleArchivePane(p.id)} title="Archive">Archive</button>
                        </>
                      )}
                      {p.status !== 'active' && (
                        <button className="btn btn-sm" onClick={() => handleRestorePane(p)} title="Restore">Restore</button>
                      )}
                      <button className="btn btn-sm btn-ghost" onClick={() => handleDeletePane(p.id)} title="Delete">&times;</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* SECTION: AI GROUPS */}
      <section className="section">
        <div className="section-header" onClick={() => toggleSection('ai-groups')}>
          <h2 className="section-label">AI GROUPS</h2>
          <span className="section-toggle">{collapsed.has('ai-groups') ? '\u25B6' : '\u25BC'}</span>
        </div>
        {!collapsed.has('ai-groups') && (
          <div className="section-body">
            <div className="btn-row">
              <button className="btn btn-primary" onClick={handleSmartGroup} disabled={smartGrouping || windowTabs.length === 0}>
                {smartGrouping ? 'Grouping...' : 'Smart Group'}
              </button>
              <button className="btn" onClick={handleAISmartGroup} disabled={smartGrouping || windowTabs.length === 0}>
                AI Smart Group
              </button>
            </div>
            {groupSuggestions.length > 0 && (
              <div className="group-cards">
                {groupSuggestions.map(g => (
                  <div key={g.title} className={`group-card ${COLOR_CLASSES[g.color] || 'group-grey'}`}>
                    <div className="group-card-color" />
                    <span className="group-card-title">{g.title}</span>
                    <span className="group-card-count">{g.tabCount} tabs</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* SECTION: AUTO CREATE */}
      <section className="section">
        <div className="section-header" onClick={() => toggleSection('auto-create')}>
          <h2 className="section-label">AUTO CREATE</h2>
          <span className="section-toggle">{collapsed.has('auto-create') ? '\u25B6' : '\u25BC'}</span>
        </div>
        {!collapsed.has('auto-create') && (
          <div className="section-body">
            <p className="text-muted text-xs">Describe what you need and ClipBounce will build the tab workflow.</p>
            <div className="chip-row">
              {AUTO_CREATE_CHIPS.map(chip => (
                <button key={chip} className="chip" onClick={() => handleAutoCreateChip(chip)}>{chip}</button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* SECTION: MACROS */}
      <section className="section">
        <div className="section-header" onClick={() => toggleSection('macros')}>
          <h2 className="section-label">MACROS</h2>
          <span className="section-toggle">{collapsed.has('macros') ? '\u25B6' : '\u25BC'}</span>
        </div>
        {!collapsed.has('macros') && (
          <div className="section-body">
            <div className="macro-grid">
              {MACROS.map(m => (
                <div key={m.id} className="macro-card" onClick={() => handleRunMacro(m.id)}>
                  <span className="macro-icon">{m.icon || '\u2699'}</span>
                  <div className="macro-info">
                    <span className="macro-title">{m.title}</span>
                    <span className="macro-desc">{m.description}</span>
                  </div>
                  <button className="btn btn-sm btn-primary">Run</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* PROGRESS (non-generating) */}
      {progressMessage && status !== 'generating' && (
        <div className="progress"><span className="spinner" /><span>{progressMessage}</span></div>
      )}

      {/* URL INPUT */}
      <section className="section">
        <div className="section-header">
          <h2 className="section-label">URLS</h2>
        </div>
        <div className="section-body">
          <div className="url-row">
            <textarea className="textarea" placeholder="Paste URLs..." value={urlText} onChange={(e) => setUrlText(e.target.value)} rows={2} />
            <button className="btn btn-sm" onClick={addPastedUrls} disabled={status === 'capturing' || !urlText.trim()}>Add</button>
          </div>
        </div>
      </section>

      {/* SOURCES */}
      {sources.length > 0 && (
        <section className="section">
          <div className="section-header">
            <h2 className="section-label">Sources ({sources.length})</h2>
            <span className="source-summary">{getBatchSummary(sources)}</span>
          </div>
          <div className="section-body">
            {providerMode === 'local' && sources.filter(s => s.status === 'ready').length > 3 && (
              <div className="warning">Local mode with 3+ sources may be slow.</div>
            )}
            <div className="source-list">
              {sources.map((source, idx) => (
                <div key={source.id} className={`source-card source-${source.status}`}>
                  <div className="source-header">
                    <span className={`source-num ${source.status === 'ready' ? 'source-num-ready' : ''}`}>{idx + 1}</span>
                    <span className={`dot dot-${source.status}`} />
                    <span className="source-domain">{source.domain || source.url}</span>
                    <button className="btn-icon" onClick={() => removeSource(source.id)}>&times;</button>
                  </div>
                  <div className="source-url">{source.url}</div>
                  {source.title && <div className="source-title">{source.title}</div>}
                  {source.status === 'failed' && source.error && <div className="source-err">{source.error}</div>}
                  {(source.status === 'ready' || source.status === 'partial') && source.charCount !== undefined && (
                    <>
                      <div className="char-bar"><div className="char-fill" style={{ width: Math.min(100, (source.charCount / 5000) * 100) + '%' }} /></div>
                      <div className="char-row">
                        <span className="char-count">{source.charCount.toLocaleString()} chars</span>
                        {source.status === 'partial' && <span className="weak-badge">Partial</span>}
                        {source.extractionDurationMs != null && source.extractionDurationMs >= 0 && <span className="timing">{(source.extractionDurationMs / 1000).toFixed(1)}s</span>}
                      </div>
                      {source.cleanText && (
                        <button className="text-toggle" onClick={() => toggleExpandedText(source.id)}>
                          {expandedText.has(source.id) ? 'Hide' : 'View'} extracted text
                        </button>
                      )}
                      {expandedText.has(source.id) && source.cleanText && (
                        <pre className="extracted">{source.cleanText.slice(0, 2000)}{source.cleanText.length > 2000 ? '\n...' : ''}</pre>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* SYNTHESIS */}
      <section className="section">
        <div className="section-header">
          <h2 className="section-label">SYNTHESIS</h2>
        </div>
        <div className="section-body">
          <textarea className="textarea prompt-textarea" placeholder="Ask ClipBounce what to do with these websites..." value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
          <div className="presets">
            {PRESETS.map(p => (
              <button key={p.label} className="preset-btn" onClick={() => setPrompt(p.prompt)}>{p.label}</button>
            ))}
          </div>
          <button className="btn-generate" onClick={generate} disabled={status === 'generating' || sources.length === 0 || !prompt.trim()}>
            {status === 'generating' ? 'Generating...' : 'Generate Synthesis'}
          </button>
        </div>
      </section>

      {/* GENERATION PROGRESS */}
      {status === 'generating' && (
        <div className="progress">
          <span className="spinner" />
          <span>{progressMessage}</span>
          {status === 'generating' && <span className="timer">{elapsedSeconds}s</span>}
        </div>
      )}
      {status === 'generating' && providerMode === 'local' && !fastMode && (
        <div className="tip">Local models may take 30\u201390s. Enable Fast Mode in settings.</div>
      )}

      {/* ERROR */}
      {error && <div className="error-block"><strong>Error:</strong> {error}</div>}

      {/* RESULT */}
      {result && (
        <div className="section result-section" ref={resultRef}>
          <div className="result-header">
            <h2 className="section-label">Synthesis Result</h2>
            <div className="result-actions">
              <button className="btn btn-sm" onClick={copySynthesis}>{copied === 'synthesis' ? 'Copied!' : 'Copy'}</button>
              <button className="btn btn-sm" onClick={copyFullReport}>{copied === 'report' ? 'Copied!' : 'Report'}</button>
              <button className="btn btn-sm" onClick={downloadMarkdown}>MD</button>
            </div>
          </div>
          <div className="section-body">
            <div className="result-meta">
              {result.successfulSourceCount} source{result.successfulSourceCount !== 1 ? 's' : ''} analyzed
              {result.failedSourceCount > 0 && `, ${result.failedSourceCount} failed`}
              {' \u00b7 '}{currentProviderLabel}
              {result.chunkBudget && (
                <>{' \u00b7 '}{result.chunkBudget.selectedChunks} chunk{result.chunkBudget.selectedChunks !== 1 ? 's' : ''} loaded</>
              )}
            </div>
            <div className="synthesis">{renderSynthesis(result.synthesis)}</div>

            <h3 className="subsection-title">Per-Source Summaries</h3>
            {result.sourceSummaries.map((summary) => {
              const srcIdx = result.sourceSummaries.indexOf(summary) + 1;
              return (
                <div key={summary.sourceId} className="summary-card">
                  <div className="summary-title">
                    <span className="summary-num">{srcIdx}</span>
                    {summary.title || summary.url}
                  </div>
                  <p className="summary-text">{summary.summary}</p>
                  {summary.keyPoints.length > 0 && (
                    <ul className="key-points">{summary.keyPoints.map((kp, i) => <li key={i}>{kp}</li>)}</ul>
                  )}
                </div>
              );
            })}

            {result.failures.length > 0 && (
              <div className="failures">
                <h3 className="subsection-title">Failed Sources</h3>
                {result.failures.map((f, i) => (
                  <div key={i} className="failure-item"><span>{f.url}</span><span className="failure-reason">{f.reason}</span></div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div className="footer">
        <span className="text-muted">Tip: Press Ctrl+Shift+L anytime to open ClipBounce side panel</span>
      </div>
    </div>
  );
}

function renderSynthesis(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listKey = 0;

  function flushList() {
    if (listItems.length > 0) {
      elements.push(<ul key={`ul-${listKey++}`} className="synth-list">{listItems}</ul>);
      listItems = [];
    }
  }

  lines.forEach((line, i) => {
    if (line.startsWith('## ')) {
      flushList();
      elements.push(<h2 key={`h2-${i}`} className="synth-h2">{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      flushList();
      elements.push(<h3 key={`h3-${i}`} className="synth-h3">{line.slice(4)}</h3>);
    } else if (line.startsWith('- ')) {
      listItems.push(<li key={`li-${i}`}>{line.slice(2)}</li>);
    } else if (line.trim() === '' && listItems.length > 0) {
      flushList();
    } else if (line.trim()) {
      flushList();
      elements.push(<p key={`p-${i}`} className="synth-p">{line}</p>);
    }
  });

  flushList();
  return elements;
}
