import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env') });

import { complete as anthropicComplete } from './providers/AnthropicServerProvider.js';
import { complete as openaiComplete } from './providers/OpenAIServerProvider.js';
import { complete as localComplete } from './providers/OpenAICompatibleLocalProvider.js';

const app = express();
const PORT = parseInt(process.env.PORT || '8787', 10);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

type ProviderInfo = {
  name: string;
  model: string | undefined;
};

function getActiveProvider(): ProviderInfo | null {
  if (process.env.AI_PROVIDER === 'local') {
    return {
      name: 'local',
      model: process.env.LOCAL_LLM_MODEL,
    };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      name: 'anthropic',
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      name: 'openai',
      model: process.env.OPENAI_MODEL || 'gpt-4o',
    };
  }
  return null;
}

async function routeCompletion(
  system: string,
  messages: { role: string; content: string }[],
): Promise<string> {
  if (process.env.AI_PROVIDER === 'local') {
    return localComplete(system, messages);
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropicComplete(system, messages);
  }
  if (process.env.OPENAI_API_KEY) {
    return openaiComplete(system, messages);
  }
  throw new Error(
    'No AI provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or AI_PROVIDER=local with LOCAL_LLM_* vars in .env',
  );
}

app.post('/api/complete', async (req, res) => {
  try {
    const { system, messages } = req.body;

    if (!system || !messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'Missing required fields: system, messages' });
      return;
    }

    const result = await routeCompletion(system, messages);
    res.json({ content: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[clipbounce-server] /api/complete error:', message);

    if (
      message.includes('Paid API key') ||
      message.includes('401') ||
      message.includes('Authentication') ||
      message.includes('api key')
    ) {
      res.status(401).json({ error: message });
    } else if (message.includes('Cannot reach local LLM')) {
      res.status(503).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

app.get('/api/health', (_req, res) => {
  const provider = getActiveProvider();

  if (!provider) {
    res.json({
      status: 'ok',
      provider: 'none',
      message:
        'No AI provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or AI_PROVIDER=local with LOCAL_LLM_* vars in .env',
    });
    return;
  }

  const info: Record<string, string | undefined> = {
    status: 'ok',
    provider: provider.name,
    model: provider.model,
  };

  if (provider.name === 'local') {
    info.baseURL = process.env.LOCAL_LLM_BASE_URL || 'http://localhost:1234/v1';
  }

  info.message = `${provider.name === 'local' ? 'Local LLM' : 'AI'} provider configured`;

  res.json(info);
});

app.listen(PORT, () => {
  const provider = getActiveProvider();
  console.log(`[clipbounce-server] Listening on http://localhost:${PORT}`);

  if (provider) {
    console.log(`[clipbounce-server] Using ${provider.name} provider (model: ${provider.model || 'default'})`);
    if (provider.name === 'local') {
      console.log(`[clipbounce-server]   Base URL: ${process.env.LOCAL_LLM_BASE_URL || 'http://localhost:1234/v1'}`);
    }
  } else {
    console.warn(
      '[clipbounce-server] WARNING: No provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or AI_PROVIDER=local.',
    );
  }
});
