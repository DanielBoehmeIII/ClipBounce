import type { BundleSynthesisResult, SourceRecord, PromptSpec, ProviderConfig } from '../types';
import { compilePromptSpec } from './promptCompiler';
import { summarizeAllSources } from './sourceSummarizer';
import { getProviderForConfig } from './providers';

export async function synthesizeBundle(
  sources: SourceRecord[],
  userPrompt: string,
  config?: ProviderConfig,
): Promise<BundleSynthesisResult> {
  const spec = compilePromptSpec(userPrompt);
  const provider = config ? getProviderForConfig(config) : getProviderForConfig({ mode: 'mock', backendUrl: 'http://localhost:8787' });
  const sourceSummaries = await summarizeAllSources(sources, spec, provider.name);

  const result = await provider.synthesizeBundle({
    prompt: spec,
    sources,
    sourceSummaries,
  });

  return result;
}
