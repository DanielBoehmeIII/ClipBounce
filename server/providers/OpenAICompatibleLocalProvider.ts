import OpenAI from 'openai';

const BASE_URL_DEFAULT = 'http://localhost:1234/v1';

function getConfig() {
  const baseURL = process.env.LOCAL_LLM_BASE_URL || BASE_URL_DEFAULT;
  const model = process.env.LOCAL_LLM_MODEL;
  const apiKey = process.env.LOCAL_LLM_API_KEY || 'lm-studio';
  return { baseURL, model, apiKey };
}

export async function checkHealth(): Promise<{
  reachable: boolean;
  models: string[];
  message: string;
}> {
  const { baseURL } = getConfig();
  try {
    const resp = await fetch(`${baseURL}/models`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      return {
        reachable: false,
        models: [],
        message: `Local LLM server returned HTTP ${resp.status} at ${baseURL}.`,
      };
    }
    const data = await resp.json() as { data?: { id: string }[] };
    const models = (data.data || []).map((m: { id: string }) => m.id);
    return {
      reachable: true,
      models,
      message: `Reachable. Available models: ${models.join(', ') || 'none listed'}.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return {
      reachable: false,
      models: [],
      message: `Local LLM server is not reachable at ${baseURL}. Start LM Studio's local server or switch ClipBounce to Mock mode. (${msg})`,
    };
  }
}

export async function complete(
  system: string,
  messages: { role: string; content: string }[],
): Promise<string> {
  const { baseURL, model, apiKey } = getConfig();

  if (!model || model === 'local-model') {
    throw new Error(
      'LOCAL_LLM_MODEL is not set to a real model. Open LM Studio, load a model, start the server, then set LOCAL_LLM_MODEL to the exact model name.',
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
        err.message.includes('Failed to fetch') ||
        err.message.includes('ENOTFOUND'))
    ) {
      throw new Error(
        `Cannot reach local LLM at ${baseURL}. Make sure LM Studio is running with a model loaded.`,
      );
    }
    if (
      err instanceof Error &&
      (err.message.includes('model_not_found') ||
        err.message.includes('model') && err.message.includes('not found'))
    ) {
      throw new Error(
        `Model '${model}' is not available on the local LLM server at ${baseURL}. Load the model in LM Studio or update LOCAL_LLM_MODEL.`,
      );
    }
    throw err;
  }
}
