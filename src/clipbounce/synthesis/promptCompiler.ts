import type { PromptSpec, PromptMode } from '../types';

const MODE_KEYWORDS: Record<PromptMode, string[]> = {
  comparison: ['compare', 'versus', 'vs', 'differences', 'contrast', 'similarities'],
  extraction: ['extract', 'pricing', 'table', 'features', 'list', 'details', 'specs'],
  study_guide: ['study', 'notes', 'quiz', 'learn', 'flashcard', 'summarize for a beginner'],
  research_brief: ['research', 'brief', 'analyze', 'overview', 'deep dive', 'literature'],
  summary: ['summarize', 'summary', 'tl;dr', 'overview'],
  custom: [],
};

function inferMode(prompt: string): PromptMode {
  const lower = prompt.toLowerCase();
  for (const [mode, keywords] of Object.entries(MODE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return mode as PromptMode;
    }
  }
  return 'summary';
}

function inferLength(prompt: string): 'short' | 'medium' | 'long' {
  const lower = prompt.toLowerCase();
  if (lower.includes('short') || lower.includes('brief') || lower.includes('tl;dr')) return 'short';
  if (lower.includes('detailed') || lower.includes('comprehensive') || lower.includes('in-depth')) return 'long';
  return 'medium';
}

export function compilePromptSpec(userPrompt: string): PromptSpec {
  return {
    userPrompt,
    mode: inferMode(userPrompt),
    citeSources: true,
    removeDuplicates: true,
    maxOutputLength: inferLength(userPrompt),
  };
}

const SYSTEM_PROMPT = `You are ClipBounce, a multi-source web synthesis engine. You answer using only the provided website contents. Your job is to transform a messy bundle of websites into one useful, prompt-specific result. Be concise, source-grounded, and honest about missing information.`;

function modeInstruction(mode: PromptMode): string {
  switch (mode) {
    case 'comparison':
      return 'Focus on comparing and contrasting the sources. Identify similarities and differences.';
    case 'extraction':
      return 'Extract specific data, features, or details requested by the user. Present in a structured format.';
    case 'study_guide':
      return 'Transform the content into study-friendly format. Extract key concepts, definitions, and important points.';
    case 'research_brief':
      return 'Produce a concise research brief covering key findings, methodology mentions, and conclusions.';
    default:
      return 'Provide a clear, balanced summary of the main ideas across all sources.';
  }
}

export function buildModelPrompt(
  userPrompt: string,
  spec: PromptSpec,
  sourceSummaries: string,
): string {
  return `SYSTEM:
${SYSTEM_PROMPT}

USER:
User request:
${userPrompt}

Mode: ${spec.mode}
${modeInstruction(spec.mode)}

Sources:
${sourceSummaries}

Instructions:
1. Identify the overall pattern across the sources.
2. Separate repeated ideas from unique ideas.
3. Prioritize information that directly answers the user request.
4. Do not fabricate details not present in the sources.
5. Mention source titles/domains when useful.
6. If some sources failed, briefly list them at the end.
7. Produce a clean answer in the most appropriate format.

Return:
- Brief answer
- Key takeaways
- Unique details
- Source notes
- Failed/ignored sources, if any`;
}
