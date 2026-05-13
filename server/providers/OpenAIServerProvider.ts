import OpenAI from 'openai';

export async function complete(
  system: string,
  messages: { role: string; content: string }[],
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o';

  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: system },
      ...messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (content) {
    return content;
  }

  throw new Error('Unexpected response format from OpenAI API');
}
