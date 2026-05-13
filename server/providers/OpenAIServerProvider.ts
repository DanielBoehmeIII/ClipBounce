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

  try {
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
  } catch (err) {
    if (err instanceof Error) {
      const lower = err.message.toLowerCase();
      if (
        err.message.includes('401') ||
        lower.includes('authentication') ||
        lower.includes('api key') ||
        lower.includes('unauthorized') ||
        lower.includes('invalid')
      ) {
        throw new Error('Paid API key is missing or invalid. Switch to Mock/local mode or set a valid key.');
      }
    }
    throw err;
  }
}
