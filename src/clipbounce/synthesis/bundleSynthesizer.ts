import type { BundleSynthesisResult, SourceRecord, PromptSpec, SourceMiniSummary } from '../types';
import { compilePromptSpec } from './promptCompiler';
import { summarizeAllSources } from './sourceSummarizer';
import { getProvider } from './providers';

export async function synthesizeBundle(
  sources: SourceRecord[],
  userPrompt: string,
  providerName?: string,
): Promise<BundleSynthesisResult> {
  const spec = compilePromptSpec(userPrompt);
  const sourceSummaries = await summarizeAllSources(sources, spec, providerName);

  const provider = getProvider(providerName);
  const result = await provider.synthesizeBundle({
    prompt: spec,
    sources,
    sourceSummaries,
  });

  return result;
}
