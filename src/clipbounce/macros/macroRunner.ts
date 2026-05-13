import type { TabBufferState, TabPane, TabInfo, SourceRecord } from '../types';
import { createPane, loadPanes, restorePane } from '../panes/paneManager';
import { getBufferedTabCount } from '../tabs/tabBuffer';

export type MacroResult = {
  success: boolean;
  message: string;
  action?: 'create-pane' | 'release-pane' | 'add-sources' | 'set-prompt' | 'confirm-archive' | 'show-sessions';
  data?: unknown;
};

type MacroRunParams = {
  buffer: TabBufferState | null;
  tabs: TabInfo[];
  windowId: number;
  sources: SourceRecord[];
  setSources: (fn: (prev: SourceRecord[]) => SourceRecord[]) => void;
  setPrompt: (p: string) => void;
  triggerCapture: (msg: { type: string; urlText?: string }) => Promise<void>;
};

async function runOpenResearchSet(params: MacroRunParams): Promise<MacroResult> {
  const { buffer, tabs, windowId } = params;
  if (!buffer || getBufferedTabCount(buffer) === 0) {
    return { success: false, message: 'No tabs highlighted. Select tabs first.' };
  }

  const pane = await createPane('Research', 'blue', buffer, tabs, windowId);
  if (!pane) {
    return { success: false, message: 'Could not create research pane.' };
  }

  const tabIds = pane.tabIds;
  const tabUrls = await getTabUrls(tabIds);

  return {
    success: true,
    message: `Research pane created with ${tabUrls.length} tabs.`,
    action: 'set-prompt',
    data: `Create a research brief from these sources:\n${tabUrls.map(u => '- ' + u).join('\n')}`,
  };
}

async function runBuildFocusWorkspace(params: MacroRunParams): Promise<MacroResult> {
  const { buffer, tabs, windowId } = params;
  if (!buffer || getBufferedTabCount(buffer) === 0) {
    return { success: false, message: 'No tabs highlighted. Select tabs first.' };
  }

  const pane = await createPane('Focus', 'green', buffer, tabs, windowId);
  if (!pane) {
    return { success: false, message: 'Could not create focus workspace.' };
  }

  return {
    success: true,
    message: `Focus workspace created with ${pane.tabIds.length} tabs.`,
    action: 'set-prompt',
    data: 'Summarize what I need to focus on.',
  };
}

async function runArchiveTabs(params: MacroRunParams): Promise<MacroResult> {
  const { buffer, tabs } = params;
  if (!buffer || getBufferedTabCount(buffer) === 0) {
    return { success: false, message: 'No tabs selected to archive.' };
  }

  const bufferedTabs = tabs.filter(
    t => t.index >= buffer.leftIndex && t.index <= buffer.rightIndex,
  );

  return {
    success: true,
    message: `Ready to archive ${bufferedTabs.length} tabs.`,
    action: 'confirm-archive',
    data: bufferedTabs.map(t => ({ id: t.id, url: t.url, title: t.title })),
  };
}

async function runRestoreSession(_params: MacroRunParams): Promise<MacroResult> {
  const panes = await loadPanes();
  const sessions = panes.filter(p => p.status === 'archived' || p.status === 'released');
  if (sessions.length === 0) {
    return { success: false, message: 'No saved sessions found.' };
  }
  return {
    success: true,
    message: `${sessions.length} saved session(s) found.`,
    action: 'show-sessions',
    data: sessions,
  };
}

async function runSummarizePane(params: MacroRunParams): Promise<MacroResult> {
  const { setSources } = params;
  const savedPanes = await loadPanes();
  const activePane = savedPanes.find((p: TabPane) => p.status === 'active');
  if (!activePane) {
    return { success: false, message: 'No active pane found.' };
  }

  for (let i = 0; i < activePane.tabUrls.length; i++) {
    try {
      const tab = await chrome.tabs.query({ url: activePane.tabUrls[i] });
      if (tab.length > 0 && tab[0].id) {
        setSources(prev => {
          if (prev.some(s => s.url === activePane.tabUrls[i])) return prev;
          const source: SourceRecord = {
            id: `pane-${activePane.id}-${i}`,
            url: activePane.tabUrls[i],
            title: activePane.tabTitles[i],
            domain: new URL(activePane.tabUrls[i]).hostname,
            captureMethod: 'selected_tabs',
            status: 'ready',
            capturedAt: new Date().toISOString(),
          };
          return [...prev, source];
        });
      }
    } catch {
      // tab may not be open
    }
  }

  return {
    success: true,
    message: `Added ${activePane.tabIds.length} tabs from pane "${activePane.title}" to sources.`,
    action: 'set-prompt',
    data: 'Summarize this pane and extract the important ideas.',
  };
}

async function runCompareTabs(params: MacroRunParams): Promise<MacroResult> {
  return {
    success: true,
    message: 'Tabs ready for comparison.',
    action: 'set-prompt',
    data: 'Compare these sources. Identify repeated ideas, unique ideas, contradictions, and what matters most.',
  };
}

async function runExtractPricing(params: MacroRunParams): Promise<MacroResult> {
  return {
    success: true,
    message: 'Tabs ready for pricing/feature extraction.',
    action: 'set-prompt',
    data: 'Extract pricing, features, limitations, integrations, and business model details. Make a comparison table.',
  };
}

async function getTabUrls(tabIds: number[]): Promise<string[]> {
  const urls: string[] = [];
  for (const id of tabIds) {
    try {
      const tab = await chrome.tabs.get(id);
      if (tab.url) urls.push(tab.url);
    } catch {
      // tab closed
    }
  }
  return urls;
}

type RunnerMap = {
  [key: string]: (params: MacroRunParams) => Promise<MacroResult>;
};

const RUNNERS: RunnerMap = {
  'open-research-set': runOpenResearchSet,
  'build-focus-workspace': runBuildFocusWorkspace,
  'archive-finished-tabs': runArchiveTabs,
  'restore-session': runRestoreSession,
  'summarize-pane': runSummarizePane,
  'compare-tabs': runCompareTabs,
  'extract-pricing': runExtractPricing,
};

export async function runMacro(
  macroId: string,
  params: MacroRunParams,
): Promise<MacroResult> {
  const runner = RUNNERS[macroId];
  if (!runner) {
    return { success: false, message: `Unknown macro: ${macroId}` };
  }
  return runner(params);
}
