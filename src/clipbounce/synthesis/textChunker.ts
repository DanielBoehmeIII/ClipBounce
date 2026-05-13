import type { ChunkNode, SourceRecord } from '../types';

const DEFAULT_MAX_CHUNK_SIZE = 3000;
const DEFAULT_MIN_CHUNK_SIZE = 100;

function makeChunk(
  content: string,
  source: SourceRecord,
  sourceNumber: number,
  headingPath: string[],
  index: number,
): ChunkNode {
  return {
    chunkId: `${sourceNumber}.${index + 1}`,
    sourceId: source.id,
    sourceNumber,
    title: source.title,
    url: source.url,
    headingPath,
    content,
    charCount: content.length,
    index,
  };
}

export function chunkText(
  text: string,
  source: SourceRecord,
  sourceNumber: number,
  options?: { maxChunkSize?: number; minChunkSize?: number },
): ChunkNode[] {
  const maxSize = options?.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE;
  const minSize = options?.minChunkSize ?? DEFAULT_MIN_CHUNK_SIZE;
  const chunks: ChunkNode[] = [];
  let chunkIndex = 0;

  const blocks = text.split(/\n\n+/);
  let currentContent = '';
  let currentHeadings: string[] = [];

  function flushCurrent() {
    if (!currentContent) return;
    const chunk = makeChunk(currentContent.trim(), source, sourceNumber, [...currentHeadings], chunkIndex++);
    if (chunk.charCount >= minSize || chunks.length === 0) {
      chunks.push(chunk);
    } else if (chunks.length > 0) {
      const last = chunks[chunks.length - 1];
      if (last.charCount + chunk.charCount <= maxSize) {
        chunks[chunks.length - 1] = makeChunk(
          last.content + '\n\n' + chunk.content,
          source,
          sourceNumber,
          last.headingPath,
          last.index,
        );
      }
    }
    currentContent = '';
  }

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const headingMatch = trimmed.match(/^(#{2,4})\s+(.+)$/m);
    if (headingMatch && trimmed === headingMatch[0]) {
      flushCurrent();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      while (currentHeadings.length > 0) {
        const last = currentHeadings[currentHeadings.length - 1];
        const lastLevel = parseInt(last.charAt(1));
        if (level <= lastLevel) {
          currentHeadings.pop();
        } else {
          break;
        }
      }
      currentHeadings.push(`h${level}: ${headingText}`);
      currentContent = trimmed;
    } else {
      if (!currentContent) {
        currentContent = trimmed;
      } else if (currentContent.length + trimmed.length + 2 > maxSize) {
        flushCurrent();
        currentContent = trimmed;
        if (trimmed.length > maxSize) {
          flushCurrent();
          chunks.push(makeChunk(
            trimmed.slice(0, maxSize),
            source,
            sourceNumber,
            [...currentHeadings],
            chunkIndex++,
          ));
          currentContent = '';
        }
      } else {
        currentContent += '\n\n' + trimmed;
      }
    }
  }

  flushCurrent();

  if (chunks.length === 0 && text.trim()) {
    chunks.push(makeChunk(
      text.trim().slice(0, maxSize),
      source,
      sourceNumber,
      [],
      0,
    ));
  }

  return chunks;
}

export function selectChunksForBudget(
  chunks: ChunkNode[],
  userPrompt: string,
  budget: number,
): {
  selected: ChunkNode[];
  truncated: boolean;
  truncatedChars: number;
  totalChars: number;
  selectedChars: number;
  totalChunks: number;
  selectedChunks: number;
} {
  if (chunks.length === 0) {
    return { selected: [], truncated: false, truncatedChars: 0, totalChars: 0, selectedChars: 0, totalChunks: 0, selectedChunks: 0 };
  }

  const totalChars = chunks.reduce((sum, c) => sum + c.charCount, 0);
  if (totalChars <= budget) {
    return { selected: chunks, truncated: false, truncatedChars: 0, totalChars, selectedChars: totalChars, totalChunks: chunks.length, selectedChunks: chunks.length };
  }

  const promptLower = userPrompt.toLowerCase();
  const promptWords = new Set(promptLower.split(/\s+/).filter(w => w.length > 3));

  const scored = chunks.map(chunk => {
    let score = 0;
    for (const h of chunk.headingPath) {
      const hLower = h.toLowerCase();
      for (const word of promptWords) {
        if (hLower.includes(word)) score += 2;
      }
    }
    const contentLower = chunk.content.toLowerCase();
    for (const word of promptWords) {
      if (contentLower.includes(word)) score += 1;
    }
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score || a.chunk.index - b.chunk.index);

  const selected: ChunkNode[] = [];
  let selectedChars = 0;

  for (const { chunk } of scored) {
    if (selectedChars + chunk.charCount <= budget) {
      selected.push(chunk);
      selectedChars += chunk.charCount;
    }
  }

  selected.sort((a, b) => a.sourceNumber - b.sourceNumber || a.index - b.index);

  const truncatedChars = totalChars - selectedChars;

  return { selected, truncated: true, truncatedChars, totalChars, selectedChars, totalChunks: chunks.length, selectedChunks: selected.length };
}
