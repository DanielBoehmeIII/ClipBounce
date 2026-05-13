export type SourceCaptureMethod =
  | "current_tab"
  | "all_tabs"
  | "pasted_url"
  | "highlighted_link"
  | "selected_text";

export type SourceStatus = "pending" | "extracting" | "ready" | "failed";

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
