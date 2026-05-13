import type { SourceRecord, BundleSynthesisResult, ExtractedContent, TabBufferState, TabPane } from './types';

export type ExtensionMessage =
  | { type: 'CAPTURE_CURRENT_TAB' }
  | { type: 'CAPTURE_ALL_TABS' }
  | { type: 'CAPTURE_SELECTED_TABS' }
  | { type: 'CAPTURE_PASTED_URLS'; urlText: string }
  | { type: 'CAPTURE_TABS_RESULT'; sources: SourceRecord[] }
  | { type: 'EXTRACT_TAB'; tabId: number; sourceId: string }
  | { type: 'EXTRACTED_CONTENT'; sourceId: string; content: ExtractedContent }
  | { type: 'EXTRACT_FAILED'; sourceId: string; error: string }
  | { type: 'GENERATE_SYNTHESIS'; sources: SourceRecord[]; prompt: string }
  | { type: 'SYNTHESIS_COMPLETE'; result: BundleSynthesisResult }
  | { type: 'SYNTHESIS_ERROR'; error: string }
  | { type: 'PING' }
  | { type: 'PONG' };

export type ContentScriptMessage =
  | { type: 'EXTRACT' }
  | { type: 'PING' };

export const OPEN_COMMAND = 'open-clipbounce';
