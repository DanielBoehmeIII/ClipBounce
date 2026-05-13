import type { AIProvider } from './AIProvider';
import type { SourceRecord, PromptSpec, SourceMiniSummary, BundleSynthesisResult, ChunkBudget } from '../../types';
import { getDomain } from '../../../utils/url';

export class RemoteProvider implements AIProvider {
  name = 'Remote Provider';
  private _backendUrl: string;

  constructor(backendUrl: string) {
    this._backendUrl = backendUrl;
  }

  get backendUrl(): string {
    return this._backendUrl;
  }

  setBackendUrl(url: string): void {
    this._backendUrl = url;
  }

  async summarizeSource(input: {
    source: SourceRecord;
    prompt: PromptSpec;
  }): Promise<SourceMiniSummary> {
    const { source } = input;

    const system =
      'You are a source summarizer. Summarize the given web page content concisely. ' +
      'Respond with JSON only: { "summary": "2-3 sentence summary", "keyPoints": ["point1","point2","point3"], "usefulQuotes": ["quote1"] }';

    const userContent = `Title: ${source.title || 'Untitled'}
URL: ${source.url}
Domain: ${source.domain || 'unknown'}
Content:
${(source.cleanText || '').slice(0, 8000)}`;

    const response = await this.callAPI(system, userContent);

    try {
      const parsed = JSON.parse(response);
      return {
        sourceId: source.id,
        title: source.title,
        url: source.url,
        summary: parsed.summary || response.slice(0, 500),
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
        usefulQuotes: Array.isArray(parsed.usefulQuotes) ? parsed.usefulQuotes : undefined,
      };
    } catch {
      return {
        sourceId: source.id,
        title: source.title,
        url: source.url,
        summary: response.slice(0, 500),
        keyPoints: [],
      };
    }
  }

  async synthesizeBundle(input: {
    prompt: PromptSpec;
    sources: SourceRecord[];
    sourceSummaries: SourceMiniSummary[];
    formattedSources?: string;
    chunkBudget?: ChunkBudget;
  }): Promise<BundleSynthesisResult> {
    const { prompt, sources, sourceSummaries, formattedSources, chunkBudget } = input;

    const readySources = sources.filter((s) => s.status === 'ready');
    const failedSources = sources.filter((s) => s.status === 'failed');

    const sourceBlocks = formattedSources || sources.map((s, i) => {
      const idx = i + 1;
      if (s.status === 'ready') {
        return `[${idx}] ${s.title || 'Untitled'}
URL: ${s.url}
Domain: ${s.domain || 'unknown'}
Content:
${(s.cleanText || '').slice(0, 4000)}`;
      }
      return `[${idx}] ${s.title || 'Untitled'}
URL: ${s.url}
Domain: ${s.domain || 'unknown'}
Status: ${s.status}${s.error ? ' - ' + s.error : ''}
[Content not accessible]`;
    }).join('\n\n---\n\n');

    const summaryBlocks = sourceSummaries.map((s) => {
      const srcIdx = sources.findIndex((src) => src.id === s.sourceId) + 1;
      return `[${srcIdx}] ${s.title || s.url}
Summary: ${s.summary}
Key points: ${s.keyPoints.join(', ')}`;
    }).join('\n\n');

    const system =
      'You are ClipBounce, a multi-source web synthesis engine. ' +
      'Answer ONLY from the provided sources below. ' +
      'Do not use any external knowledge or make up information. ' +
      'If the sources do not contain enough information to answer, say so clearly.';

    const chunkInstruction = formattedSources
      ? 'When citing, use the chunk notation [sourceNumber.chunkNumber] (e.g., [1.2], [2.1]) for specific subsections, or [sourceNumber] (e.g., [1], [2]) for an entire source. Distinguish direct evidence (explicitly stated) from inference (your reasoning). Label inferences with "(inferred)".'
      : 'Reference sources by their number like [1], [2], etc. in your answer.';

    const budgetNote = chunkBudget?.truncated
      ? `\nNote: Some source content was truncated to fit processing limits (${chunkBudget.truncatedChars.toLocaleString()} chars omitted). ${chunkBudget.selectedChunks} of ${chunkBudget.totalChunks} total chunks were selected.`
      : '';

    const userContent = `User request: ${prompt.userPrompt}

Sources:
${sourceBlocks}

Per-source summaries:
${summaryBlocks}${budgetNote}

Instructions:
1. Synthesize an answer using ONLY the provided sources.
2. ${chunkInstruction}
3. Clearly separate repeated ideas (found in multiple sources) from unique ideas (found in only one source).
4. If some source content is not accessible (marked "[Content not accessible]"), mention it.
5. If the user's request cannot be answered from the sources, say so.

Return your response in this format:

## Synthesis
<your synthesized answer with inline references like [1], [1.2], [2]>

## Repeated Ideas
- <idea> (mentioned in [1], [2], [3])
- <idea> (mentioned in [2], [4])

## Unique Ideas
- <idea> (unique to [1])
- <idea> (unique to [3])

## Source Notes
<brief assessment of each source's coverage and relevance>`;

    const response = await this.callAPI(system, userContent);

    return {
      prompt: prompt.userPrompt,
      sourceCount: sources.length,
      successfulSourceCount: readySources.length,
      failedSourceCount: failedSources.length,
      sourceSummaries,
      synthesis: response,
      failures: failedSources.map((s) => ({
        url: s.url,
        reason: s.error || 'Unknown error',
      })),
      generatedAt: new Date().toISOString(),
      chunkBudget,
    };
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const resp = await fetch(`${this._backendUrl}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const data = await resp.json();
        return { ok: true, message: data.status || 'Connected' };
      }
      return { ok: false, message: `HTTP ${resp.status}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Connection failed' };
    }
  }

  private async callAPI(system: string, userContent: string): Promise<string> {
    const resp = await fetch(`${this._backendUrl}/api/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: AbortSignal.timeout(90000),
    });

    if (!resp.ok) {
      const text = await resp.text();
      const status = resp.status;
      const lower = text.toLowerCase();

      if (
        status === 401 ||
        lower.includes('authentication_error') ||
        lower.includes('invalid x-api-key') ||
        lower.includes('missing api key') ||
        lower.includes('unauthorized') ||
        lower.includes('paid api key') ||
        lower.includes('mock/local')
      ) {
        throw new Error('Paid API key is missing or invalid. Switch to Mock/local mode or set a valid key.');
      }

      if (
        status === 503 ||
        lower.includes('cannot reach') ||
        lower.includes('econnrefused') ||
        lower.includes('lm studio')
      ) {
        throw new Error('Local LLM is not reachable. Make sure LM Studio is running with a model loaded.');
      }

      throw new Error(`Backend error (${status}): ${text.slice(0, 200)}`);
    }

    const data = await resp.json();
    if (!data.content && typeof data.content !== 'string') {
      throw new Error('Backend returned invalid response: missing content');
    }
    return data.content;
  }
}
