import Anthropic from '@anthropic-ai/sdk';

export async function complete(
  system: string,
  messages: { role: string; content: string }[],
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system,
    messages: messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  });

  const block = response.content[0];
  if (block && block.type === 'text') {
    return block.text;
  }

  throw new Error('Unexpected response format from Anthropic API');
}
