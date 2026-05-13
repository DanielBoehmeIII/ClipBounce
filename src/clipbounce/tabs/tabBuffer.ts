import type { TabBufferState, TabInfo } from '../types';

export function createBufferFromTabs(
  windowId: number,
  allTabs: TabInfo[],
): TabBufferState {
  const highlighted = allTabs.filter(t => t.highlighted);
  let leftIndex: number;
  let rightIndex: number;

  if (highlighted.length > 0) {
    const indices = highlighted.map(t => t.index);
    leftIndex = Math.min(...indices);
    rightIndex = Math.max(...indices);
  } else {
    const active = allTabs.find(t => t.active);
    leftIndex = active ? active.index : 0;
    rightIndex = leftIndex;
  }

  return {
    windowId,
    leftIndex: Math.max(0, leftIndex),
    rightIndex: Math.min(allTabs.length - 1, rightIndex),
    activeBoundary: 'right',
    totalTabs: allTabs.length,
  };
}

export function toggleBoundary(state: TabBufferState): TabBufferState {
  return {
    ...state,
    activeBoundary: state.activeBoundary === 'left' ? 'right' : 'left',
  };
}

export function growLeft(state: TabBufferState): TabBufferState {
  if (state.activeBoundary !== 'left') return state;
  return {
    ...state,
    leftIndex: Math.max(0, state.leftIndex - 1),
  };
}

export function shrinkLeft(state: TabBufferState): TabBufferState {
  if (state.activeBoundary !== 'left') return state;
  return {
    ...state,
    leftIndex: Math.min(state.rightIndex, state.leftIndex + 1),
  };
}

export function growRight(state: TabBufferState): TabBufferState {
  if (state.activeBoundary !== 'right') return state;
  return {
    ...state,
    rightIndex: Math.min(state.totalTabs - 1, state.rightIndex + 1),
  };
}

export function shrinkRight(state: TabBufferState): TabBufferState {
  if (state.activeBoundary !== 'right') return state;
  return {
    ...state,
    rightIndex: Math.max(state.leftIndex, state.rightIndex - 1),
  };
}

export function getBufferedTabIds(state: TabBufferState): number[] {
  const ids: number[] = [];
  for (let i = state.leftIndex; i <= state.rightIndex; i++) {
    ids.push(i);
  }
  return ids;
}

export function getBufferedTabCount(state: TabBufferState): number {
  return state.rightIndex - state.leftIndex + 1;
}

export function getBufferedRangeLabel(state: TabBufferState): string {
  return `tabs ${state.leftIndex + 1}\u2013${state.rightIndex + 1}`;
}

export async function applyHighlightToChrome(
  windowId: number,
  leftIndex: number,
  rightIndex: number,
  tabs: TabInfo[],
): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.highlight) return;
  const tabIds: number[] = [];
  for (let i = leftIndex; i <= rightIndex; i++) {
    const tab = tabs.find(t => t.index === i);
    if (tab) tabIds.push(tab.id);
  }
  if (tabIds.length === 0) return;
  try {
    await chrome.tabs.highlight({ windowId, tabs: tabIds });
  } catch {
    // silently ignore — may fail if popup/sidepanel context lacks permission
  }
}

export function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    el.getAttribute('contenteditable') === 'true'
  );
}
