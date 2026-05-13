import type { TabGroupSuggestion, TabPane, PaneColor } from '../types';

const COLOR_MAP: Record<PaneColor, chrome.tabGroups.ColorEnum> = {
  grey: 'grey',
  blue: 'blue',
  red: 'red',
  yellow: 'yellow',
  green: 'green',
  pink: 'pink',
  purple: 'purple',
  cyan: 'cyan',
  orange: 'orange',
};

export function chromeColor(c: PaneColor): chrome.tabGroups.ColorEnum {
  return COLOR_MAP[c] || 'grey';
}

export function tabGroupsAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.tabGroups;
}

export async function createTabGroup(
  windowId: number,
  tabIds: number[],
  title: string,
  color: PaneColor,
): Promise<number | undefined> {
  if (!tabGroupsAvailable() || tabIds.length === 0) return undefined;
  try {
    const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
    await chrome.tabGroups.update(groupId, {
      title,
      color: chromeColor(color),
    });
    return groupId;
  } catch {
    return undefined;
  }
}

export async function releaseTabGroup(groupId: number): Promise<void> {
  if (!tabGroupsAvailable()) return;
  try {
    const tabs = await chrome.tabs.query({ groupId });
    const tabIds = tabs.map(t => t.id!).filter(Boolean);
    if (tabIds.length > 0) {
      await chrome.tabs.ungroup(tabIds);
    }
  } catch {
    // ignore
  }
}

export async function applySmartGroupSuggestions(
  windowId: number,
  suggestions: TabGroupSuggestion[],
  existingPaneMap: Map<string, TabPane>,
): Promise<void> {
  for (const s of suggestions) {
    if (s.tabIds.length === 0) continue;
    try {
      const groupId = await createTabGroup(windowId, s.tabIds, s.title, s.color);
      if (groupId && existingPaneMap.has(s.title)) {
        const pane = existingPaneMap.get(s.title)!;
        pane.chromeGroupId = groupId;
      }
    } catch {
      // skip groups that fail
    }
  }
}

export async function moveTabsToWindow(tabIds: number[]): Promise<number | undefined> {
  try {
    const window = await chrome.windows.create({ tabId: tabIds[0] });
    if (tabIds.length > 1 && window.id) {
      await chrome.tabs.move(tabIds.slice(1), { windowId: window.id, index: -1 });
    }
    return window.id;
  } catch {
    return undefined;
  }
}
