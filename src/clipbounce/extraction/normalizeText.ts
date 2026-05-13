const REPEATED_LINE_LIMIT = 5;

export function normalizeText(text: string): string {
  let result = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  const lines = result.split('\n');
  const deduped: string[] = [];
  let repeatCount = 0;
  let lastLine = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === lastLine) {
      repeatCount++;
      if (repeatCount >= REPEATED_LINE_LIMIT) continue;
    } else {
      repeatCount = 0;
    }
    deduped.push(line);
    lastLine = trimmed;
  }

  result = deduped.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
}

export function isTooSmall(text: string, minChars = 50): boolean {
  return text.trim().length < minChars;
}
