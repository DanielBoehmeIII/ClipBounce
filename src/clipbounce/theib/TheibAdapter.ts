/**
 * TheibAdapter - optional integration with Theib (theib-mcp).
 *
 * This adapter is a no-op stub. If Theib is installed and configured,
 * replace these methods with real Theib calls.
 *
 * Theib is not currently a dependency. All features work without it.
 */

import type { TabInfo, TabGroupSuggestion, PaneColor } from '../types';
import { smartGroupTabs } from '../tabs/tabClassifier';

export type TheibStatus = 'unavailable' | 'available' | 'error';

let theibStatus: TheibStatus = 'unavailable';

export function getTheibStatus(): TheibStatus {
  return theibStatus;
}

export async function checkTheibAvailability(): Promise<TheibStatus> {
  // Theib not installed — return unavailable
  theibStatus = 'unavailable';
  return theibStatus;
}

export async function aiClassifyTabs(tabs: TabInfo[]): Promise<TabGroupSuggestion[]> {
  // Fallback to deterministic classifier
  return smartGroupTabs(tabs);
}

export async function aiGenerateMacros(context: string): Promise<{ title: string; description: string }[]> {
  // Stub — return empty array
  return [];
}

export async function aiSummarizeTopics(tabs: TabInfo[]): Promise<string> {
  // Stub — return simple domain-based summary
  const domains = [...new Set(tabs.map(t => t.domain))];
  return `Tabs from: ${domains.join(', ')}`;
}
