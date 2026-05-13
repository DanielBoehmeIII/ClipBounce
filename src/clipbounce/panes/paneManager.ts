import type { TabPane, TabBufferState, TabInfo, PaneColor } from '../types';
import { generateId } from '../../utils/hash';
import { createTabGroup, releaseTabGroup } from '../tabs/tabGroups';

const PANE_STORAGE_KEY = 'clipbounce_panes';

export async function loadPanes(): Promise<TabPane[]> {
  try {
    const result = await chrome.storage.local.get(PANE_STORAGE_KEY);
    return result[PANE_STORAGE_KEY] || [];
  } catch {
    return [];
  }
}

export async function savePanes(panes: TabPane[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [PANE_STORAGE_KEY]: panes });
  } catch {
    // silently fail
  }
}

export async function createPane(
  title: string,
  color: PaneColor,
  buffer: TabBufferState,
  tabs: TabInfo[],
  windowId: number,
): Promise<TabPane | null> {
  const bufferedTabs = tabs.filter(
    t => t.windowId === windowId && t.index >= buffer.leftIndex && t.index <= buffer.rightIndex,
  );

  if (bufferedTabs.length === 0) return null;

  const tabIds = bufferedTabs.map(t => t.id);
  const pane: TabPane = {
    id: generateId(),
    title: title || `Pane ${bufferedTabs.length} tabs`,
    windowId,
    tabIds,
    tabUrls: bufferedTabs.map(t => t.url),
    tabTitles: bufferedTabs.map(t => t.title),
    color,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'active',
  };

  const groupId = await createTabGroup(windowId, tabIds, pane.title, color);
  pane.chromeGroupId = groupId;

  const panes = await loadPanes();
  panes.push(pane);
  await savePanes(panes);

  return pane;
}

export async function releasePane(paneId: string): Promise<TabPane | null> {
  const panes = await loadPanes();
  const pane = panes.find(p => p.id === paneId);
  if (!pane) return null;

  if (pane.chromeGroupId) {
    await releaseTabGroup(pane.chromeGroupId);
  }

  pane.status = 'released';
  pane.chromeGroupId = undefined;
  pane.updatedAt = new Date().toISOString();
  await savePanes(panes);

  return pane;
}

export async function archivePane(paneId: string): Promise<TabPane | null> {
  const panes = await loadPanes();
  const pane = panes.find(p => p.id === paneId);
  if (!pane) return null;

  if (pane.status === 'active' && pane.chromeGroupId) {
    await releaseTabGroup(pane.chromeGroupId);
  }

  pane.status = 'archived';
  pane.chromeGroupId = undefined;
  pane.updatedAt = new Date().toISOString();
  await savePanes(panes);

  return pane;
}

export async function deletePane(paneId: string): Promise<void> {
  const panes = await loadPanes();
  const pane = panes.find(p => p.id === paneId);
  if (pane?.chromeGroupId) {
    await releaseTabGroup(pane.chromeGroupId);
  }
  const filtered = panes.filter(p => p.id !== paneId);
  await savePanes(filtered);
}

export async function focusPane(paneId: string): Promise<void> {
  const panes = await loadPanes();
  const pane = panes.find(p => p.id === paneId);
  if (!pane || pane.tabIds.length === 0) return;

  try {
    await chrome.tabs.update(pane.tabIds[0], { active: true });
    await chrome.windows.update(pane.windowId, { focused: true });
  } catch {
    // tab or window may have been closed
  }
}

export async function restorePane(pane: TabPane): Promise<TabPane | null> {
  const openTabs: number[] = [];

  for (let i = 0; i < pane.tabUrls.length; i++) {
    try {
      const tab = await chrome.tabs.create({ url: pane.tabUrls[i], active: i === 0 });
      openTabs.push(tab.id!);
    } catch {
      continue;
    }
  }

  if (openTabs.length === 0) return null;

  const groupId = await createTabGroup(pane.windowId, openTabs, pane.title, pane.color || 'blue');
  const restored: TabPane = {
    ...pane,
    tabIds: openTabs,
    chromeGroupId: groupId,
    status: 'active',
    updatedAt: new Date().toISOString(),
  };

  const panes = await loadPanes();
  const idx = panes.findIndex(p => p.id === pane.id);
  if (idx >= 0) {
    panes[idx] = restored;
  } else {
    panes.push(restored);
  }
  await savePanes(panes);

  return restored;
}
