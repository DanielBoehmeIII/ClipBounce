export type SourceCaptureMethod =
  | "current_tab"
  | "all_tabs"
  | "selected_tabs"
  | "pasted_url"
  | "highlighted_link"
  | "selected_text";

export type SourceStatus = "pending" | "extracting" | "ready" | "failed" | "partial" | "skipped";

export type SourceRecord = {
  id: string;
  url: string;
  title?: string;
  domain?: string;
  captureMethod: SourceCaptureMethod;
  status: SourceStatus;
  error?: string;
  rawText?: string;
  cleanText?: string;
  charCount?: number;
  capturedAt: string;
  extractionStartedAt?: string;
  extractionFinishedAt?: string;
  extractionDurationMs?: number;
};

export type PromptMode =
  | "summary"
  | "comparison"
  | "extraction"
  | "study_guide"
  | "research_brief"
  | "custom";

export type PromptSpec = {
  userPrompt: string;
  mode: PromptMode;
  citeSources: boolean;
  removeDuplicates: boolean;
  maxOutputLength: "short" | "medium" | "long";
};

export type SourceMiniSummary = {
  sourceId: string;
  title?: string;
  url: string;
  summary: string;
  keyPoints: string[];
  usefulQuotes?: string[];
};

export type ChunkNode = {
  chunkId: string;
  sourceId: string;
  sourceNumber: number;
  title?: string;
  url: string;
  headingPath: string[];
  content: string;
  charCount: number;
  index: number;
};

export type ChunkBudget = {
  totalChars: number;
  selectedChars: number;
  truncated: boolean;
  truncatedChars: number;
  totalChunks: number;
  selectedChunks: number;
};

export type BundleSynthesisResult = {
  prompt: string;
  sourceCount: number;
  successfulSourceCount: number;
  failedSourceCount: number;
  sourceSummaries: SourceMiniSummary[];
  synthesis: string;
  repeatedIdeas?: string[];
  uniqueIdeas?: string[];
  failures: { url: string; reason: string }[];
  generatedAt: string;
  citations?: { sourceNumber: number; sourceId: string; chunkId?: string; headingPath?: string[] }[];
  chunkBudget?: ChunkBudget;
};

export type ProviderMode = "mock" | "local";

export type ProviderConfig = {
  mode: ProviderMode;
  backendUrl: string;
  fastMode?: boolean;
};

export type ExtractedContent = {
  title: string;
  url: string;
  text: string;
  headings: string[];
  charCount: number;
};

export type TabInfo = {
  id: number;
  index: number;
  windowId: number;
  url: string;
  title: string;
  domain: string;
  highlighted: boolean;
  active: boolean;
};

export type TabBufferState = {
  windowId: number;
  leftIndex: number;
  rightIndex: number;
  activeBoundary: 'left' | 'right';
  totalTabs: number;
};

export type PaneColor = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange';

export type TabPane = {
  id: string;
  title: string;
  windowId: number;
  tabIds: number[];
  tabUrls: string[];
  tabTitles: string[];
  chromeGroupId?: number;
  color?: PaneColor;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'released' | 'archived';
};

export type MacroCategory = 'research' | 'focus' | 'cleanup' | 'synthesis' | 'session';

export type MacroDefinition = {
  id: string;
  title: string;
  description: string;
  icon?: string;
  category: MacroCategory;
  requiresSources?: boolean;
};

export type MacroContext = {
  buffer: TabBufferState | null;
  panes: TabPane[];
  sources: SourceRecord[];
  windowTabs: TabInfo[];
};

export type TabGroupSuggestion = {
  title: string;
  color: PaneColor;
  tabIds: number[];
  tabCount: number;
};
