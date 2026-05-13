import type { SourceMiniSummary, SourceRecord, PromptSpec } from '../types';
import { getProvider } from './providers';

export async function summarizeSource(
  source: SourceRecord,
  prompt: PromptSpec,
  providerName?: string,
): Promise<SourceMiniSummary> {
  const provider = getProvider(providerName);
  return provider.summarizeSource({ source, prompt });
}

export async function summarizeAllSources(
  sources: SourceRecord[],
  prompt: PromptSpec,
  providerName?: string,
): Promise<SourceMiniSummary[]> {
  const ready = sources.filter((s) => s.status === 'ready');
  const results: SourceMiniSummary[] = [];

  for (const source of ready) {
    try {
      const summary = await summarizeSource(source, prompt, providerName);
      results.push(summary);
    } catch (err) {
      results.push({
        sourceId: source.id,
        title: source.title,
        url: source.url,
        summary: '[Failed to summarize this source]',
        keyPoints: [],
      });
    }
  }

  return results;
}
