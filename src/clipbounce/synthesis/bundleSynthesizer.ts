import type { BundleSynthesisResult, SourceRecord, PromptSpec, ProviderConfig, ChunkBudget, ChunkNode } from '../types';
import { compilePromptSpec, buildChunkFormattedSources } from './promptCompiler';
import { summarizeAllSources } from './sourceSummarizer';
import { getProviderForConfig } from './providers';
import { chunkText, selectChunksForBudget } from './textChunker';

const CHUNK_BUDGET = 25_000;

export async function synthesizeBundle(
  sources: SourceRecord[],
  userPrompt: string,
  config?: ProviderConfig,
): Promise<BundleSynthesisResult> {
  const spec = compilePromptSpec(userPrompt);
  const provider = config ? getProviderForConfig(config) : getProviderForConfig({ mode: 'mock', backendUrl: 'http://localhost:8787' });
  const sourceSummaries = await summarizeAllSources(sources, spec, provider.name);

  const readySources = sources.filter(s => s.status === 'ready');
  const allChunks: ChunkNode[] = [];
  readySources.forEach((s, i) => {
    if (s.cleanText) {
      const chunks = chunkText(s.cleanText, s, i + 1);
      allChunks.push(...chunks);
    }
  });

  const selection = selectChunksForBudget(allChunks, userPrompt, CHUNK_BUDGET);
  const formattedSources = selection.selected.length > 0
    ? buildChunkFormattedSources(selection.selected, sources)
    : undefined;

  const chunkBudget: ChunkBudget | undefined = {
    totalChars: selection.totalChars,
    selectedChars: selection.selectedChars,
    truncated: selection.truncated,
    truncatedChars: selection.truncatedChars,
    totalChunks: selection.totalChunks,
    selectedChunks: selection.selectedChunks,
  };

  const result = await provider.synthesizeBundle({
    prompt: spec,
    sources,
    sourceSummaries,
    formattedSources,
    chunkBudget,
  });

  result.citations = selection.selected.map(chunk => ({
    sourceNumber: chunk.sourceNumber,
    sourceId: chunk.sourceId,
    chunkId: chunk.chunkId,
    headingPath: chunk.headingPath,
  }));

  if (selection.truncated && !result.synthesis.includes('truncat')) {
    result.synthesis += `\n\n> *${selection.truncatedChars.toLocaleString()} characters were truncated from source content to fit processing limits. ${selection.selectedChunks} of ${selection.totalChunks} chunks were selected.*`;
  }

  return result;
}
