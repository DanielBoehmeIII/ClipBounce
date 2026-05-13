import OpenAI from 'openai';

export async function complete(
  system: string,
  messages: { role: string; content: string }[],
): Promise<string> {
  const baseURL = process.env.LOCAL_LLM_BASE_URL || 'http://localhost:1234/v1';
  const model = process.env.LOCAL_LLM_MODEL;
  const apiKey = process.env.LOCAL_LLM_API_KEY || 'lm-studio';

  if (!model) {
    throw new Error(
      'LOCAL_LLM_MODEL not set. Add LOCAL_LLM_MODEL=<model-name> to .env (e.g. LOCAL_LLM_MODEL= mistral-7b-instruct-v0.2).',
    );
  }

  const openai = new OpenAI({ apiKey, baseURL });

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

    throw new Error('Unexpected response format from local LLM');
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('connect') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('fetch') ||
        err.message.includes('Failed to fetch'))
    ) {
      throw new Error(
        `Cannot reach local LLM at ${baseURL}. Make sure LM Studio is running with a model loaded.`,
      );
    }
    throw err;
  }
}
