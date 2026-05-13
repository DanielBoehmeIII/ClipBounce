import type { BundleSynthesisResult, SourceRecord, PromptSpec, ProviderConfig, ChunkBudget, ChunkNode } from '../types';
import { compilePromptSpec, buildChunkFormattedSources } from './promptCompiler';
import { summarizeAllSources } from './sourceSummarizer';
import { getProviderForConfig } from './providers';
import { chunkText, selectChunksForBudget } from './textChunker';
import { simpleHash } from '../../utils/hash';

const CHUNK_BUDGET = 25_000;
const LOCAL_CHUNK_BUDGET = 4_000;
const LOCAL_FAST_CHUNK_BUDGET = 2_500;

const chunkCache = new Map<string, ChunkNode[]>();

function getChunkBudget(config?: ProviderConfig): { budget: number; label: string } {
  if (!config || config.mode !== 'local') return { budget: CHUNK_BUDGET, label: 'standard' };
  if (config.fastMode) return { budget: LOCAL_FAST_CHUNK_BUDGET, label: 'fast' };
  return { budget: LOCAL_CHUNK_BUDGET, label: 'local' };
}

export async function synthesizeBundle(
  sources: SourceRecord[],
  userPrompt: string,
  config?: ProviderConfig,
): Promise<BundleSynthesisResult> {
  const spec = compilePromptSpec(userPrompt);
  const provider = config ? getProviderForConfig(config) : getProviderForConfig({ mode: 'mock', backendUrl: 'http://localhost:8787' });

  const isLocal = config?.mode === 'local';
  const fastMode = config?.fastMode ?? false;
  const singleCall = isLocal || fastMode;

  const sourceSummaries = singleCall
    ? []
    : await summarizeAllSources(sources, spec, provider.name);

  const readySources = sources.filter(s => s.status === 'ready');
  const { budget } = getChunkBudget(config);
  const allChunks: ChunkNode[] = [];
  readySources.forEach((s, i) => {
    if (s.cleanText) {
      const cacheKey = `${s.id}:${simpleHash(s.cleanText.slice(0, 500))}`;
      const cached = chunkCache.get(cacheKey);
      if (cached) {
        allChunks.push(...cached);
      } else {
        const chunks = chunkText(s.cleanText, s, i + 1);
        chunkCache.set(cacheKey, chunks);
        allChunks.push(...chunks);
      }
    }
  });

  const selection = selectChunksForBudget(allChunks, userPrompt, budget);
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
    fastMode: singleCall,
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
