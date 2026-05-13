import type { SourceRecord, PromptSpec, SourceMiniSummary, BundleSynthesisResult, ChunkBudget } from '../../types';

export interface AIProvider {
  name: string;
  summarizeSource(input: {
    source: SourceRecord;
    prompt: PromptSpec;
  }): Promise<SourceMiniSummary>;

  synthesizeBundle(input: {
    prompt: PromptSpec;
    sources: SourceRecord[];
    sourceSummaries: SourceMiniSummary[];
    formattedSources?: string;
    chunkBudget?: ChunkBudget;
  }): Promise<BundleSynthesisResult>;
}
