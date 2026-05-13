import type { AIProvider } from './AIProvider';
import type { SourceRecord, PromptSpec, SourceMiniSummary, BundleSynthesisResult, ChunkBudget } from '../../types';
import { getDomain } from '../../../utils/url';

const MOCK_SUMMARIES = [
  'This source discusses the core topic from a foundational perspective, introducing key concepts and terminology.',
  'This source provides practical examples and case studies that illustrate the main ideas in real-world contexts.',
  'This source offers a critical analysis, examining strengths, weaknesses, and open questions in the field.',
  'This source focuses on historical context and evolution of the subject, tracing how understanding has developed.',
  'This source presents recent developments and cutting-edge research, highlighting emerging trends.',
  'This source takes a comparative approach, examining different viewpoints and synthesizing them into a balanced overview.',
  'This source dives deep into technical details, providing specifications, data, and methodology.',
  'This source addresses common misconceptions and clarifies nuanced aspects of the topic.',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function summarizeTitle(title: string | undefined): string {
  if (!title) return 'an unnamed source';
  if (title.length > 60) return title.slice(0, 60) + '...';
  return title;
}

export class MockProvider implements AIProvider {
  name = 'Mock Provider';

  async summarizeSource(input: {
    source: SourceRecord;
    prompt: PromptSpec;
  }): Promise<SourceMiniSummary> {
    const { source, prompt } = input;
    await delay(300 + Math.random() * 400);

    const textPreview = source.cleanText
      ? source.cleanText.slice(0, 200).replace(/\n/g, ' ')
      : '[no text extracted]';

    return {
      sourceId: source.id,
      title: source.title,
      url: source.url,
      summary: `${pick(MOCK_SUMMARIES)} Based on the extracted content: "${textPreview}..."`,
      keyPoints: [
        `Introduced key framework or concept relevant to "${prompt.userPrompt}"`,
        `Provided supporting evidence and examples`,
        `Connected broader themes to specific findings`,
      ],
      usefulQuotes: [
        `[Excerpt from ${summarizeTitle(source.title)}]`,
      ],
    };
  }

  async synthesizeBundle(input: {
    prompt: PromptSpec;
    sources: SourceRecord[];
    sourceSummaries: SourceMiniSummary[];
    formattedSources?: string;
    chunkBudget?: ChunkBudget;
  }): Promise<BundleSynthesisResult> {
    const { prompt, sources, sourceSummaries, chunkBudget } = input;
    await delay(500 + Math.random() * 1000);

    const readySources = sources.filter((s) => s.status === 'ready');
    const failedSources = sources.filter((s) => s.status === 'failed');

    const synthesis = generateMockSynthesis(prompt, readySources, failedSources, chunkBudget);
    const repeated = [
      'All sources emphasize the importance of understanding foundational concepts before diving into specifics.',
      'Multiple sources highlight the role of practical application in reinforcing theoretical knowledge.',
    ];
    const unique = readySources.map(
      (s) => `${s.title || getDomain(s.url)} contributes a distinct perspective: ${pick(MOCK_SUMMARIES).toLowerCase()}`,
    );

    return {
      prompt: prompt.userPrompt,
      sourceCount: sources.length,
      successfulSourceCount: readySources.length,
      failedSourceCount: failedSources.length,
      sourceSummaries,
      synthesis,
      repeatedIdeas: repeated,
      uniqueIdeas: unique,
      failures: failedSources.map((s) => ({
        url: s.url,
        reason: s.error || 'Unknown error',
      })),
      generatedAt: new Date().toISOString(),
      chunkBudget,
    };
  }
}

function generateMockSynthesis(
  prompt: PromptSpec,
  ready: SourceRecord[],
  failed: SourceRecord[],
  chunkBudget?: ChunkBudget,
): string {
  const parts: string[] = [];

  parts.push('## Synthesis\n');
  parts.push(
    `Based on ${ready.length} source${ready.length !== 1 ? 's' : ''} analyzed for your request: "${
      prompt.userPrompt
    }"`,
  );
  parts.push('');

  parts.push('### Key Findings');
  parts.push('');
  parts.push(
    'Across the analyzed sources, several consistent patterns emerge. The material collectively suggests that this topic spans multiple dimensions, from foundational principles to advanced applications. The sources provide complementary perspectives that together form a comprehensive picture.',
  );
  parts.push('');

  ready.forEach((source, i) => {
    parts.push(`**Source ${i + 1}: ${source.title || getDomain(source.url)}**`);
    parts.push(
      `This source contributes unique insights related to your query. Its content reinforces the overall consensus while adding specific details in its area of focus.`,
    );
    parts.push('');
  });

  parts.push('### Cross-Source Analysis');
  parts.push('');
  parts.push(
    'The main ideas appear consistently across multiple sources, suggesting strong consensus on the core principles. Each source adds unique granularity, with particular strengths in different sub-areas of the topic.',
  );
  parts.push('');
  parts.push('### Recommendations');
  parts.push('');
  parts.push(
    'For a deeper understanding, explore the specific sources most relevant to your particular interest area. The sources collectively provide a solid foundation for further investigation.',
  );

  if (chunkBudget?.truncated) {
    parts.push('');
    parts.push(`> *Note: ${chunkBudget.truncatedChars.toLocaleString()} characters were truncated from source content to fit the processing budget. ${chunkBudget.selectedChunks} of ${chunkBudget.totalChunks} total chunks were included.*`);
  }

  if (failed.length > 0) {
    parts.push('');
    parts.push('### Failed Sources');
    parts.push('');
    failed.forEach((s) => {
      parts.push(`- ${s.url}: ${s.error || 'Could not access content'}`);
    });
  }

  return parts.join('\n');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
