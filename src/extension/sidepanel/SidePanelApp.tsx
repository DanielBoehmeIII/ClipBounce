import { useState, useCallback, useEffect, useRef } from 'react';
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
import './SidePanel.css';

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

const DEFAULT_PROMPT = 'Summarize these sources for a beginner.';

const SINGLE_TAB_PROMPT = 'Summarize this page for a beginner.';

const AUTO_CREATE_CHIPS = [
  'Market analysis',
  'Design system',
  'Content strategy',
  'React performance',
];

export default function SidePanelApp() {
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [status, setStatus] = useState<AppStatus>('idle');
  const [prompt, setPrompt] = useState('');
  const [urlText, setUrlText] = useState('');
  const [result, setResult] = useState<BundleSynthesisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'none' | 'synthesis' | 'report'>('none');
  const [progressMessage, setProgressMessage] = useState('');
  const resultRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

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
  const [boundaryPulse, setBoundaryPulse] = useState<'left' | 'right' | null>(null);

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

  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const promptTextRef = useRef(prompt);
  promptTextRef.current = prompt;
  const bufferRef = useRef(buffer);
  bufferRef.current = buffer;
  const windowTabsRef = useRef(windowTabs);
  windowTabsRef.current = windowTabs;

  const generateWithPrompt = useCallback(async (srcs: SourceRecord[], pr: string) => {
    if (srcs.length === 0 || !pr.trim()) return;
    setStatus('generating');
    setError(null);
    setResult(null);
    setProgressMessage('Analyzing sources and generating synthesis...');
    try {
      const resp = await sendMessageRef.current({
        type: 'GENERATE_SYNTHESIS',
        sources: srcs,
        prompt: pr.trim(),
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
  }, []);

  const sendMessageRef = useRef<(msg: ExtensionMessage) => Promise<any>>(async () => {});
  const sendMessage = useCallback(async (msg: ExtensionMessage): Promise<any> => {
    return chrome.runtime.sendMessage(msg);
  }, []);
  sendMessageRef.current = sendMessage;

  const captureBufferedTabs = useCallback(async (): Promise<boolean> => {
    const buf = bufferRef.current;
    if (!buf) return false;
    const count = getBufferedTabCount(buf);
    const msg: ExtensionMessage = count === 1
      ? { type: 'CAPTURE_CURRENT_TAB' }
      : { type: 'CAPTURE_SELECTED_TABS' };
    try {
      setStatus('capturing');
      setProgressMessage('Capturing...');
      const resp = await sendMessageRef.current(msg);
      if (resp.type === 'CAPTURE_TABS_RESULT' && resp.sources) {
        setSources(prev => {
          const existing = new Set(prev.map(s => s.url));
          const newOnes = resp.sources.filter((s: SourceRecord) => !existing.has(s.url));
          return [...prev, ...newOnes];
        });
        return resp.sources.length > 0;
      }
    } catch {}
    setStatus('idle');
    setProgressMessage('');
    return false;
  }, [sendMessage]);

  const handleEnterKey = useCallback(async () => {
    if (sources.length === 0) {
      await captureBufferedTabs();
    }
    promptRef.current?.focus();
  }, [sources, captureBufferedTabs]);

  const handlePromptEnter = useCallback(() => {
    const currentSources = sourcesRef.current;
    if (currentSources.length === 0) {
      setError('No sources captured. Press Enter in the main view first.');
      return;
    }
    const p = (promptTextRef.current || '').trim() || DEFAULT_PROMPT;
    generateWithPrompt(currentSources, p);
  }, []);

  const handleGenerateShortcut = useCallback(async () => {
    let currentSources = sourcesRef.current;
    if (currentSources.length === 0) {
      const captured = await captureBufferedTabs();
      if (!captured) return;
      currentSources = sourcesRef.current;
      if (currentSources.length === 0) return;
    }
    const p = (promptTextRef.current || '').trim() || DEFAULT_PROMPT;
    generateWithPrompt(currentSources, p);
  }, [captureBufferedTabs]);

  const handleEscape = useCallback(() => {
    if (showSettings) { setShowSettings(false); return; }
    if (confirmArchive) { setConfirmArchive(null); return; }
    if (showSessions) { setShowSessions(false); return; }
    if (document.activeElement?.tagName.toLowerCase() === 'textarea') {
      (document.activeElement as HTMLElement).blur();
    }
  }, [showSettings, confirmArchive, showSessions]);

  const handleEnterKeyRef = useRef(handleEnterKey);
  handleEnterKeyRef.current = handleEnterKey;
  const handleGenerateShortcutRef = useRef(handleGenerateShortcut);
  handleGenerateShortcutRef.current = handleGenerateShortcut;
  const handlePromptEnterRef = useRef(handlePromptEnter);
  handlePromptEnterRef.current = handlePromptEnter;
  const handleEscapeRef = useRef(handleEscape);
  handleEscapeRef.current = handleEscape;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const buf = bufferRef.current;

      if (isInputFocused()) {
        const tag = document.activeElement?.tagName.toLowerCase();
        if (tag === 'textarea' && e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          handlePromptEnterRef.current();
        }
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        if (!buf) return;
        const next = toggleBoundary(buf);
        setBuffer(next);
        setBoundaryPulse(next.activeBoundary);
        setTimeout(() => setBoundaryPulse(null), 400);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (!buf) return;
        const next = buf.activeBoundary === 'left' ? growLeft(buf) : shrinkRight(buf);
        setBuffer(next);
        applyHighlightToChrome(next.windowId, next.leftIndex, next.rightIndex, windowTabsRef.current);
        setBoundaryPulse(next.activeBoundary);
        setTimeout(() => setBoundaryPulse(null), 400);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (!buf) return;
        const next = buf.activeBoundary === 'right' ? growRight(buf) : shrinkLeft(buf);
        setBuffer(next);
        applyHighlightToChrome(next.windowId, next.leftIndex, next.rightIndex, windowTabsRef.current);
        setBoundaryPulse(next.activeBoundary);
        setTimeout(() => setBoundaryPulse(null), 400);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleCreatePane();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleReleaseCurrentPane();
      } else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleEnterKeyRef.current();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleGenerateShortcutRef.current();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleEscapeRef.current();
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        handleSmartGroup();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleGenerateShortcutRef.current();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const currentProviderLabel = providerMode === 'mock' ? 'Mock' : 'Local Backend';

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

  const handleCreatePane = useCallback(async () => {
    if (!buffer || getBufferedTabCount(buffer) === 0) return;
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
    const title = paneTitle || `Pane ${getBufferedTabCount(buffer)} tabs`;
    const pane = await createPane(title, paneColor, buffer, allTabs, winId);
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

  const handlePresetClick = useCallback(async (presetPrompt: string) => {
    let currentSources = sourcesRef.current;
    if (currentSources.length === 0) {
      const captured = await captureBufferedTabs();
      if (!captured) return;
      currentSources = sourcesRef.current;
    }
    setPrompt(presetPrompt);
  }, [captureBufferedTabs]);

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
      try {
        await chrome.tabs.remove(tab.id);
      } catch {}
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
    let currentSources = sources;
    if (currentSources.length === 0) {
      await captureBufferedTabs();
      currentSources = sourcesRef.current;
      if (currentSources.length === 0) return;
    }
    const p = prompt.trim() || DEFAULT_PROMPT;
    generateWithPrompt(currentSources, p);
  }, [sources, prompt, captureBufferedTabs, generateWithPrompt]);

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

  const readyCount = sources.filter((s) => s.status === 'ready').length;
  const bufferedCount = buffer ? getBufferedTabCount(buffer) : 0;
  const rangeLabel = buffer ? getBufferedRangeLabel(buffer) : '';

  return (
    <div className="sp-app">

      {/* HEADER */}
      <header className="sp-header">
        <div className="sp-header-top">
          <div className="sp-header-left">
            <h1 className="sp-title">ClipBounce</h1>
            <span className="sp-provider-badge">{currentProviderLabel}</span>
          </div>
          <div className="sp-header-actions">
            <kbd className="sp-kbd">Ctrl+Shift+L</kbd>
            <span className="sp-badge" onClick={() => toggleSection('settings')} title="Settings">
              {showSettings ? '\u2715' : '\u2699'}
            </span>
          </div>
        </div>
      </header>

      {/* SETTINGS */}
      {showSettings && (
        <section className="sp-section sp-settings">
          <h3 className="sp-section-label">Provider Settings</h3>
          <div className="sp-settings-row">
            <label className="sp-settings-label">Mode</label>
            <select className="sp-settings-select" value={providerMode} onChange={(e) => handleModeChange(e.target.value as ProviderMode)}>
              <option value="mock">Mock (no backend)</option>
              <option value="local">Local Backend</option>
            </select>
          </div>
          {providerMode === 'local' && (
            <>
              <div className="sp-settings-row">
                <label className="sp-settings-label">Backend URL</label>
                <input className="sp-settings-input" type="text" value={backendUrl} onChange={(e) => handleUrlChange(e.target.value)} placeholder="http://localhost:8787" />
              </div>
              <div className="sp-settings-row">
                <label className="sp-settings-label">Fast Mode</label>
                <label className="sp-toggle">
                  <input type="checkbox" checked={fastMode} onChange={handleFastModeChange} />
                  <span className="sp-toggle-slider" />
                </label>
                <span className="sp-toggle-label">{fastMode ? 'On' : 'Off'}</span>
              </div>
              {fastMode && <p className="sp-settings-hint">Fast Mode: reduced context, one-pass synthesis.</p>}
              <div className="sp-settings-row">
                <button className="sp-btn sp-btn-sm" onClick={testConnection} disabled={connectionStatus === 'testing'}>
                  {connectionStatus === 'testing' ? 'Testing...' : 'Test'}
                </button>
                {connectionStatus === 'ok' && <span className="sp-conn-ok">{connectionMsg}</span>}
                {connectionStatus === 'fail' && <span className="sp-conn-fail">{connectionMsg}</span>}
              </div>
            </>
          )}
          {providerMode === 'mock' && <p className="sp-settings-hint">Mock mode: all outputs simulated. Switch to Local Backend for real AI.</p>}
        </section>
      )}

      {/* MACRO MESSAGE */}
      {macroMsg && <div className="sp-macro-msg">{macroMsg}</div>}

      {/* CONFIRM ARCHIVE */}
      {confirmArchive && (
        <div className="sp-confirm">
          <p>Archive {confirmArchive.length} tabs?</p>
          <div className="sp-confirm-actions">
            <button className="sp-btn sp-btn-primary sp-btn-sm" onClick={handleConfirmArchive}>Confirm</button>
            <button className="sp-btn sp-btn-sm" onClick={() => setConfirmArchive(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* SAVED SESSIONS */}
      {showSessions && (
        <div className="sp-sessions">
          <div className="sp-sessions-header">
            <span>Saved Sessions</span>
            <button className="sp-btn-icon" onClick={() => setShowSessions(false)}>&times;</button>
          </div>
          {savedSessions.length === 0 ? (
            <p className="sp-text-muted">No saved sessions found.</p>
          ) : (
            savedSessions.map(s => (
              <div key={s.id} className="sp-session-item">
                <span className="sp-session-title">{s.title} ({s.tabIds.length} tabs)</span>
                <button className="sp-btn sp-btn-sm" onClick={() => handleRestorePane(s)}>Restore</button>
              </div>
            ))
          )}
        </div>
      )}

      {/* SECTION: SELECTION */}
      <section className="sp-section">
        <div className="sp-section-header" onClick={() => toggleSection('selection')}>
          <h2 className="sp-section-label">SELECTION</h2>
          <span className="sp-section-toggle">{collapsed.has('selection') ? '\u25B6' : '\u25BC'}</span>
        </div>
        {!collapsed.has('selection') && (
          <div className="sp-section-body">
            <div className="sp-sel-metrics">
              <div className="sp-sel-metric">
                <span className="sp-sel-metric-value">{bufferedCount}</span>
                <span className="sp-sel-metric-label">Buffer</span>
              </div>
              <div className="sp-sel-metric">
                <span className="sp-sel-metric-value" style={{ fontSize: '0.65rem', fontWeight: 500, color: 'var(--sp-text-dim)' }}>{rangeLabel}</span>
                <span className="sp-sel-metric-label">Range</span>
              </div>
              <div className="sp-sel-metric">
                <span className="sp-sel-metric-value">{buffer?.totalTabs || 0}</span>
                <span className="sp-sel-metric-label">Total</span>
              </div>
              <div className="sp-sel-boundary">
                <span className={`sp-sel-boundary-pill ${buffer?.activeBoundary === 'left' ? 'sp-sel-boundary-active' : ''} ${boundaryPulse === 'left' ? 'sp-sel-boundary-pulse' : ''}`}>LEFT</span>
                <span className="sp-sel-boundary-divider">&nbsp;/&nbsp;</span>
                <span className={`sp-sel-boundary-pill ${buffer?.activeBoundary === 'right' ? 'sp-sel-boundary-active' : ''} ${boundaryPulse === 'right' ? 'sp-sel-boundary-pulse' : ''}`}>RIGHT</span>
              </div>
            </div>
            {buffer && (
              <div className="sp-range-bar">
                <div className="sp-range-track">
                  <div
                    className="sp-range-fill"
                    style={{
                      left: `${(buffer.leftIndex / buffer.totalTabs) * 100}%`,
                      width: `${((buffer.rightIndex - buffer.leftIndex + 1) / buffer.totalTabs) * 100}%`,
                    }}
                  />
                  <div className="sp-range-boundary sp-range-left" style={{ left: `${(buffer.leftIndex / buffer.totalTabs) * 100}%` }}>
                    <div className={`sp-boundary-marker ${buffer.activeBoundary === 'left' ? 'sp-boundary-active' : ''}`} />
                  </div>
                  <div className="sp-range-boundary sp-range-right" style={{ left: `${((buffer.rightIndex + 1) / buffer.totalTabs) * 100}%` }}>
                    <div className={`sp-boundary-marker ${buffer.activeBoundary === 'right' ? 'sp-boundary-active' : ''}`} />
                  </div>
                </div>
              </div>
            )}
            <div className="sp-sel-hints">
              <span className="sp-sel-hint"><kbd className="sp-kbd sp-kbd-sm">Space</kbd> toggle boundary</span>
              <span className="sp-sel-hint"><kbd className="sp-kbd sp-kbd-sm">&larr;</kbd> <kbd className="sp-kbd sp-kbd-sm">&rarr;</kbd> adjust range</span>
            </div>
            <div className="sp-btn-row">
              <button className="sp-btn sp-btn-secondary" onClick={addCurrentTab} disabled={status === 'capturing'}>+ Current</button>
              <button className="sp-btn sp-btn-secondary" onClick={addSelectedTabs} disabled={status === 'capturing'}>+ Selected</button>
              <button className="sp-btn sp-btn-secondary" onClick={addAllTabs} disabled={status === 'capturing'}>+ All</button>
              <button className="sp-btn sp-btn-ghost" onClick={clearSources} disabled={sources.length === 0}>Clear</button>
            </div>
          </div>
        )}
      </section>

      {/* SECTION: KEYBOARD */}
      <section className="sp-section">
        <div className="sp-section-header" onClick={() => toggleSection('keyboard')}>
          <h2 className="sp-section-label">KEYBOARD</h2>
          <span className="sp-section-toggle">{collapsed.has('keyboard') ? '\u25B6' : '\u25BC'}</span>
        </div>
        {!collapsed.has('keyboard') && (
          <div className="sp-section-body">
            <div className="sp-keyboard-grid">
              <div className="sp-key-item"><kbd className="sp-kbd">Enter</kbd> Capture &amp; focus prompt</div>
              <div className="sp-key-item"><kbd className="sp-kbd">Enter</kbd><span className="sp-key-sub">in prompt</span> Generate</div>
              <div className="sp-key-item"><kbd className="sp-kbd">&#8984; Enter</kbd> Generate from anywhere</div>
              <div className="sp-key-item"><kbd className="sp-kbd">&larr;</kbd><kbd className="sp-kbd">&rarr;</kbd> Adjust range</div>
              <div className="sp-key-item"><kbd className="sp-kbd">Space</kbd> Toggle boundary</div>
              <div className="sp-key-item"><kbd className="sp-kbd">&uarr;</kbd> Create pane</div>
              <div className="sp-key-item"><kbd className="sp-kbd">&darr;</kbd> Release pane</div>
              <div className="sp-key-item"><kbd className="sp-kbd">G</kbd> Smart Group</div>
              <div className="sp-key-item"><kbd className="sp-kbd">S</kbd> Quick summarize</div>
              <div className="sp-key-item"><kbd className="sp-kbd">Esc</kbd> Close / blur / cancel</div>
            </div>
          </div>
        )}
      </section>

      {/* SECTION: PANE */}
      <section className="sp-section">
        <div className="sp-section-header" onClick={() => toggleSection('pane')}>
          <h2 className="sp-section-label">PANE</h2>
          <span className="sp-section-toggle">{collapsed.has('pane') ? '\u25B6' : '\u25BC'}</span>
        </div>
        {!collapsed.has('pane') && (
          <div className="sp-section-body">
            <div className="sp-pane-create-row">
              <input className="sp-input" placeholder="Pane title (optional)" value={paneTitle} onChange={(e) => setPaneTitle(e.target.value)} />
              <select className="sp-select" value={paneColor} onChange={(e) => setPaneColor(e.target.value as PaneColor)}>
                {PANE_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <button className="sp-btn sp-btn-primary" onClick={handleCreatePane} disabled={!buffer || bufferedCount === 0}>
                Create
              </button>
            </div>
            <div className="sp-pane-actions-row">
              {currentPane && (
                <>
                  <span className="sp-pane-label">Active: {currentPane.title} ({currentPane.tabIds.length} tabs)</span>
                  <button className="sp-btn sp-btn-sm" onClick={() => handleFocusPane(currentPane.id)}>Focus</button>
                  <button className="sp-btn sp-btn-sm" onClick={() => handleReleasePane(currentPane.id)}>Release</button>
                  <button className="sp-btn sp-btn-sm" onClick={() => handleArchivePane(currentPane.id)}>Archive</button>
                </>
              )}
            </div>
            <p className="sp-text-muted sp-text-xs">Layout: Tab Group {tabGroupsAvailable() ? '\u2713' : '\u2014'}</p>
          </div>
        )}
      </section>

      {/* SECTION: AI GROUPS */}
      <section className="sp-section">
        <div className="sp-section-header" onClick={() => toggleSection('ai-groups')}>
          <h2 className="sp-section-label">AI GROUPS</h2>
          <span className="sp-section-toggle">{collapsed.has('ai-groups') ? '\u25B6' : '\u25BC'}</span>
        </div>
        {!collapsed.has('ai-groups') && (
          <div className="sp-section-body">
            <div className="sp-btn-row">
              <button className="sp-btn sp-btn-primary" onClick={handleSmartGroup} disabled={smartGrouping || windowTabs.length === 0}>
                {smartGrouping ? 'Grouping...' : 'Smart Group'}
              </button>
              <button className="sp-btn" onClick={handleAISmartGroup} disabled={smartGrouping || windowTabs.length === 0}>
                AI Smart Group
              </button>
            </div>
            {groupSuggestions.length > 0 && (
              <div className="sp-group-cards">
                {groupSuggestions.map(g => (
                  <div key={g.title} className={`sp-group-card sp-group-${g.color}`}>
                    <div className="sp-group-card-color" />
                    <span className="sp-group-card-title">{g.title}</span>
                    <span className="sp-group-card-count">{g.tabCount} tabs</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* SECTION: AUTO CREATE */}
      <section className="sp-section">
        <div className="sp-section-header" onClick={() => toggleSection('auto-create')}>
          <h2 className="sp-section-label">AUTO CREATE</h2>
          <span className="sp-section-toggle">{collapsed.has('auto-create') ? '\u25B6' : '\u25BC'}</span>
        </div>
        {!collapsed.has('auto-create') && (
          <div className="sp-section-body">
            <p className="sp-text-muted sp-text-xs">Describe what you need and ClipBounce will build the tab workflow.</p>
            <div className="sp-chip-row">
              {AUTO_CREATE_CHIPS.map(chip => (
                <button key={chip} className="sp-chip" onClick={() => handleAutoCreateChip(chip)}>{chip}</button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* SECTION: MACROS */}
      <section className="sp-section">
        <div className="sp-section-header" onClick={() => toggleSection('macros')}>
          <h2 className="sp-section-label">MACROS</h2>
          <span className="sp-section-toggle">{collapsed.has('macros') ? '\u25B6' : '\u25BC'}</span>
        </div>
        {!collapsed.has('macros') && (
          <div className="sp-section-body">
            <div className="sp-macro-grid">
              {MACROS.map(m => (
                <div key={m.id} className="sp-macro-card" onClick={() => handleRunMacro(m.id)}>
                  <span className="sp-macro-icon">{m.icon || '\u2699'}</span>
                  <div className="sp-macro-info">
                    <span className="sp-macro-title">{m.title}</span>
                    <span className="sp-macro-desc">{m.description}</span>
                  </div>
                  <button className="sp-btn sp-btn-sm sp-btn-primary">Run</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* PROGRESS */}
      {progressMessage && status !== 'generating' && (
        <div className="sp-progress"><span className="sp-spinner" /><span>{progressMessage}</span></div>
      )}

      {/* URL INPUT */}
      <section className="sp-section">
        <div className="sp-section-header">
          <h2 className="sp-section-label">URLS</h2>
        </div>
        <div className="sp-section-body">
          <div className="sp-url-row">
            <textarea className="sp-textarea" placeholder="Paste URLs..." value={urlText} onChange={(e) => setUrlText(e.target.value)} rows={2} />
            <button className="sp-btn sp-btn-sm" onClick={addPastedUrls} disabled={status === 'capturing' || !urlText.trim()}>Add</button>
          </div>
        </div>
      </section>

      {/* EMPTY STATE */}
      {sources.length === 0 && status === 'idle' && !result && !error && (
        <div className="sp-empty-state">
          <p className="sp-empty-title">No sources captured yet</p>
          <p className="sp-empty-hint">Press <kbd className="sp-kbd sp-kbd-sm">Enter</kbd> to use the active tab, or highlight tabs and press <kbd className="sp-kbd sp-kbd-sm">Enter</kbd> to build a range.</p>
          <p className="sp-empty-hint">Or click <strong>+ Current</strong> to add the active tab manually.</p>
        </div>
      )}

      {/* SOURCES (existing) */}
      {sources.length > 0 && (
        <section className="sp-section">
          <div className="sp-section-header">
            <h2 className="sp-section-label">Sources ({sources.length})</h2>
            <span className="sp-source-summary">{getBatchSummary(sources)}</span>
          </div>
          <div className="sp-section-body">
            {providerMode === 'local' && sources.filter(s => s.status === 'ready').length > 3 && (
              <div className="sp-warning">Local mode with 3+ sources may be slow.</div>
            )}
            <div className="sp-source-list">
              {sources.map((source, idx) => (
                <div key={source.id} className={`sp-source-card sp-source-${source.status}`}>
                  <div className="sp-source-header">
                    <span className={`sp-source-num ${source.status === 'ready' ? 'sp-source-num-ready' : ''}`}>{idx + 1}</span>
                    <span className={`sp-dot sp-dot-${source.status}`} />
                    <span className="sp-source-domain">{source.domain || source.url}</span>
                    <button className="sp-btn-icon" onClick={() => removeSource(source.id)}>&times;</button>
                  </div>
                  <div className="sp-source-url">{source.url}</div>
                  {source.title && <div className="sp-source-title">{source.title}</div>}
                  {source.status === 'failed' && source.error && <div className="sp-source-err">{source.error}</div>}
                  {source.domain && (source.domain.includes('google.com') || source.domain.includes('docs.google.com')) && source.status === 'partial' && (
                    <div className="sp-source-notice">Google Docs content may be partial. Select text in the document or export/copy for best results.</div>
                  )}
                  {source.domain && (source.domain.includes('chatgpt.com') || source.domain.includes('chat.openai.com')) && (
                    <div className="sp-source-notice">This page may block extraction. Try copying selected text or using a normal webpage.</div>
                  )}
                  {(source.status === 'ready' || source.status === 'partial') && source.charCount !== undefined && (
                    <>
                      <div className="sp-char-bar"><div className="sp-char-fill" style={{ width: Math.min(100, (source.charCount / 5000) * 100) + '%' }} /></div>
                      <div className="sp-char-row">
                        <span className="sp-char-count">{source.charCount.toLocaleString()} chars</span>
                        {source.status === 'partial' && <span className="sp-weak-badge">Partial</span>}
                        {source.extractionDurationMs != null && source.extractionDurationMs >= 0 && <span className="sp-timing">{(source.extractionDurationMs / 1000).toFixed(1)}s</span>}
                      </div>
                      {source.cleanText && (
                        <button className="sp-text-toggle" onClick={() => toggleExpandedText(source.id)}>
                          {expandedText.has(source.id) ? 'Hide' : 'View'} extracted text
                        </button>
                      )}
                      {expandedText.has(source.id) && source.cleanText && (
                        <pre className="sp-extracted">{source.cleanText.slice(0, 2000)}{source.cleanText.length > 2000 ? '\n...' : ''}</pre>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* PROMPT + GENERATE (existing) */}
      <section className="sp-section sp-synthesis-section">
        <div className="sp-section-header">
          <h2 className="sp-section-label">SYNTHESIS</h2>
        </div>
        <div className="sp-section-body">
          <textarea
            ref={promptRef}
            className="sp-textarea sp-prompt"
            placeholder={sources.length === 0 ? 'Press Enter to use the active tab, or highlight tabs to build a range.' : sources.length === 1 ? SINGLE_TAB_PROMPT : 'Ask ClipBounce what to do with these tabs\u2026'}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                generate();
              } else if (e.key === 'Escape') {
                (e.target as HTMLElement).blur();
              }
            }}
          />
          {sources.length > 0 && (
            <div className="sp-presets">
              {PRESETS.map(p => (
                <button key={p.label} className="sp-preset-btn" onClick={() => handlePresetClick(p.prompt)}>{p.label}</button>
              ))}
            </div>
          )}
          <div className="sp-generate-row">
            <button className="sp-btn sp-btn-generate" onClick={generate} disabled={status === 'generating'}>
              {status === 'generating' ? 'Generating...' : 'Generate'}
            </button>
            <span className="sp-gen-hint"><kbd className="sp-kbd sp-kbd-sm">&#8984;Enter</kbd> to generate</span>
          </div>
        </div>
      </section>

      {/* GENERATION PROGRESS */}
      {status === 'generating' && (
        <div className="sp-progress">
          <span className="sp-spinner" />
          <span>{progressMessage}</span>
          {status === 'generating' && <span className="sp-timer">{elapsedSeconds}s</span>}
        </div>
      )}
      {status === 'generating' && providerMode === 'local' && !fastMode && (
        <div className="sp-tip">Local models may take 30\u201390s. Enable Fast Mode in settings.</div>
      )}

      {/* ERROR */}
      {error && <div className="sp-error"><strong>Error:</strong> {error}</div>}

      {/* RESULT (existing) */}
      {result && (
        <div className="sp-section sp-result-section" ref={resultRef}>
          <div className="sp-section-header">
            <h2 className="sp-section-label">Synthesis Result</h2>
            <div className="sp-result-actions">
              <button className="sp-btn sp-btn-sm" onClick={copySynthesis}>{copied === 'synthesis' ? 'Copied!' : 'Copy'}</button>
              <button className="sp-btn sp-btn-sm" onClick={copyFullReport}>{copied === 'report' ? 'Copied!' : 'Report'}</button>
              <button className="sp-btn sp-btn-sm" onClick={downloadMarkdown}>MD</button>
            </div>
          </div>
          <div className="sp-section-body">
            <div className="sp-result-meta">
              {result.successfulSourceCount} source{result.successfulSourceCount !== 1 ? 's' : ''} analyzed
              {result.failedSourceCount > 0 && `, ${result.failedSourceCount} failed`}
              {' \u00b7 '}{currentProviderLabel}
              {result.chunkBudget && (
                <>{' \u00b7 '}{result.chunkBudget.selectedChunks} chunk{result.chunkBudget.selectedChunks !== 1 ? 's' : ''} loaded</>
              )}
            </div>
            <div className="sp-synthesis">{renderSynthesis(result.synthesis)}</div>

            <h3 className="sp-subsection-title">Per-Source Summaries</h3>
            {result.sourceSummaries.map((summary) => {
              const srcIdx = result.sourceSummaries.indexOf(summary) + 1;
              return (
                <div key={summary.sourceId} className="sp-summary-card">
                  <div className="sp-summary-title">
                    <span className="sp-summary-num">{srcIdx}</span>
                    {summary.title || summary.url}
                  </div>
                  <p className="sp-summary-text">{summary.summary}</p>
                  {summary.keyPoints.length > 0 && (
                    <ul className="sp-key-points">{summary.keyPoints.map((kp, i) => <li key={i}>{kp}</li>)}</ul>
                  )}
                </div>
              );
            })}

            {result.failures.length > 0 && (
              <div className="sp-failures">
                <h3 className="sp-subsection-title">Failed Sources</h3>
                {result.failures.map((f, i) => (
                  <div key={i} className="sp-failure-item"><span>{f.url}</span><span className="sp-failure-reason">{f.reason}</span></div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div className="sp-footer">
        <span className="sp-text-muted">Tip: Press Ctrl+Shift+L anytime to open ClipBounce</span>
      </div>
    </div>
  );
}

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

function renderSynthesis(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listKey = 0;

  function flushList() {
    if (listItems.length > 0) {
      elements.push(<ul key={`ul-${listKey++}`} className="sp-synth-list">{listItems}</ul>);
      listItems = [];
    }
  }

  lines.forEach((line, i) => {
    if (line.startsWith('## ')) {
      flushList();
      elements.push(<h2 key={`h2-${i}`} className="sp-synth-h2">{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      flushList();
      elements.push(<h3 key={`h3-${i}`} className="sp-synth-h3">{line.slice(4)}</h3>);
    } else if (line.startsWith('- ')) {
      listItems.push(<li key={`li-${i}`}>{line.slice(2)}</li>);
    } else if (line.trim() === '' && listItems.length > 0) {
      flushList();
    } else if (line.trim()) {
      flushList();
      elements.push(<p key={`p-${i}`} className="sp-synth-p">{line}</p>);
    }
  });

  flushList();
  return elements;
}
