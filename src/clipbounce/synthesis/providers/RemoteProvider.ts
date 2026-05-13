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
    fastMode?: boolean;
  }): Promise<BundleSynthesisResult> {
    const { prompt, sources, sourceSummaries, formattedSources, chunkBudget, fastMode } = input;

    if (fastMode) {
      return this.synthesizeBundleFast(prompt, sources, formattedSources, chunkBudget);
    }

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

  private async synthesizeBundleFast(
    spec: PromptSpec,
    sources: SourceRecord[],
    formattedSources?: string,
    chunkBudget?: ChunkBudget,
  ): Promise<BundleSynthesisResult> {
    const readySources = sources.filter((s) => s.status === 'ready');
    const failedSources = sources.filter((s) => s.status === 'failed');

    const sourceBlocks = formattedSources || sources.map((s, i) => {
      const idx = i + 1;
      if (s.status === 'ready') {
        return `[${idx}] ${s.title || 'Untitled'}
URL: ${s.url}
Content:
${(s.cleanText || '').slice(0, 2000)}`;
      }
      return `[${idx}] ${s.title || 'Untitled'}
URL: ${s.url}
Status: ${s.status}${s.error ? ' - ' + s.error : ''}
[Content not accessible]`;
    }).join('\n\n---\n\n');

    const budgetNote = chunkBudget?.truncated
      ? `\nNote: Some source content was truncated to fit processing limits (${chunkBudget.truncatedChars.toLocaleString()} chars omitted). ${chunkBudget.selectedChunks} of ${chunkBudget.totalChunks} total chunks were selected.`
      : '';

    const system =
      'You are ClipBounce, a multi-source web synthesis engine. ' +
      'Answer ONLY from the provided sources below. ' +
      'Do not use any external knowledge or make up information.';
    const userContent = `User request: ${spec.userPrompt}

Sources:
${sourceBlocks}${budgetNote}

Instructions:
1. Synthesize an answer using ONLY the provided sources.
2. Reference sources by number like [1], [2].
3. After the synthesis, include brief per-source notes.

Return in this format:

## Synthesis
<answer with [N] citations>

## Source Notes
### Source 1
Summary: <1-2 sentences>
Key points:
- point1
- point2

### Source 2
...`;

    const response = await this.callAPI(system, userContent, 700);

    let synthesisText = response;
    const parsedNotes: { srcIdx: number; summary: string; keyPoints: string[] }[] = [];

    const synthMatch = response.match(/## Synthesis\n([\s\S]*?)(?=\n## |$)/);
    if (synthMatch) {
      synthesisText = synthMatch[1].trim();
    }

    const notesSection = response.match(/## Source Notes\n([\s\S]*?)$/);
    if (notesSection) {
      const blockRegex = /### Source (\d+)\nSummary: (.*?)\nKey points:\n((?:- .*\n?)*)/g;
      let m;
      while ((m = blockRegex.exec(notesSection[1])) !== null) {
        parsedNotes.push({
          srcIdx: parseInt(m[1]),
          summary: m[2].trim(),
          keyPoints: m[3].split('\n').map(l => l.replace(/^- /, '').trim()).filter(Boolean),
        });
      }
    }

    const sourceSummaries: SourceMiniSummary[] = parsedNotes.length > 0
      ? parsedNotes.map(n => {
          const src = readySources[n.srcIdx - 1];
          return {
            sourceId: src?.id || '',
            title: src?.title,
            url: src?.url || '',
            summary: n.summary || `Referenced in synthesis as source ${n.srcIdx}.`,
            keyPoints: n.keyPoints,
          };
        })
      : readySources.map((s, i) => ({
          sourceId: s.id,
          title: s.title,
          url: s.url,
          summary: 'Referenced in synthesis.',
          keyPoints: [],
        }));

    return {
      prompt: spec.userPrompt,
      sourceCount: sources.length,
      successfulSourceCount: readySources.length,
      failedSourceCount: failedSources.length,
      sourceSummaries,
      synthesis: synthesisText,
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
      const resp = await fetch(`${this._backendUrl}/api/health/check`, {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.ready) {
          return { ok: true, message: `${data.provider} · ${data.model} · Ready` };
        }
        return { ok: false, message: data.message || 'Not ready' };
      }
      return { ok: false, message: `HTTP ${resp.status}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Connection failed' };
    }
  }

  private async callAPI(system: string, userContent: string, maxTokens?: number): Promise<string> {
    const body: Record<string, unknown> = {
      system,
      messages: [{ role: 'user', content: userContent }],
    };
    if (maxTokens !== undefined) body.maxTokens = maxTokens;
    const resp = await fetch(`${this._backendUrl}/api/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });

    if (!resp.ok) {
      const text = await resp.text();
      const status = resp.status;

      let parsed: { error?: { code?: string; message?: string; details?: string } } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }

      const errorCode = parsed?.error?.code || '';
      const errorMessage = parsed?.error?.message || '';
      const errorDetails = parsed?.error?.details;

      if (
        status === 401 ||
        errorCode === 'AUTH_INVALID' ||
        errorMessage.toLowerCase().includes('api key')
      ) {
        throw new Error('Paid API key is missing or invalid. Switch to Mock/local mode or set a valid key.');
      }

      if (
        status === 503 ||
        errorCode === 'LOCAL_LLM_UNREACHABLE' ||
        errorCode === 'LOCAL_MODEL_MISSING'
      ) {
        if (errorMessage) {
          throw new Error(errorMessage);
        }
        throw new Error('Local LLM is not reachable. Make sure LM Studio is running with a model loaded.');
      }

      if (
        status === 400 ||
        errorCode === 'NO_PROVIDER' ||
        errorCode === 'BAD_REQUEST'
      ) {
        if (errorMessage) {
          throw new Error(errorMessage);
        }
        throw new Error('No backend provider is configured. Use Mock mode or configure LM Studio/Anthropic/OpenAI.');
      }

      if (errorMessage) {
        throw new Error(errorMessage);
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
