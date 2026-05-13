import type { SourceMiniSummary, SourceRecord, PromptSpec } from '../types';
import { simpleHash } from '../../utils/hash';
import { getProvider } from './providers';

const summaryCache = new Map<string, SourceMiniSummary>();

function makeCacheKey(source: SourceRecord, prompt: PromptSpec, providerName?: string): string {
  const contentHash = simpleHash((source.cleanText || '').slice(0, 500));
  const promptHash = simpleHash(prompt.userPrompt + prompt.mode + (providerName || ''));
  return `${source.id}:${contentHash}:${promptHash}`;
}

export async function summarizeSource(
  source: SourceRecord,
  prompt: PromptSpec,
  providerName?: string,
): Promise<SourceMiniSummary> {
  const cacheKey = makeCacheKey(source, prompt, providerName);
  const cached = summaryCache.get(cacheKey);
  if (cached) return cached;

  const provider = getProvider(providerName);
  const result = await provider.summarizeSource({ source, prompt });
  summaryCache.set(cacheKey, result);
  return result;
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
