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
};

export type ExtractedContent = {
  title: string;
  url: string;
  text: string;
  headings: string[];
  charCount: number;
};
