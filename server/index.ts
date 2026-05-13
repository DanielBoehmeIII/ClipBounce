import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env') });

import { complete as anthropicComplete } from './providers/AnthropicServerProvider.js';
import { complete as openaiComplete } from './providers/OpenAIServerProvider.js';
import { complete as localComplete, checkHealth as localCheckHealth } from './providers/OpenAICompatibleLocalProvider.js';

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

function getProviderReadiness(): {
  configured: boolean;
  provider: string | null;
  model: string | null;
  baseURL?: string;
  ready: boolean;
  message: string;
} {
  const provider = getActiveProvider();

  if (!provider) {
    return {
      configured: false,
      provider: null,
      model: null,
      ready: false,
      message: 'No provider configured. Use Mock mode or configure LM Studio/Anthropic/OpenAI.',
    };
  }

  if (provider.name === 'local') {
    const baseURL = process.env.LOCAL_LLM_BASE_URL || 'http://localhost:1234/v1';
    const model = provider.model;

    if (!model || model === 'local-model') {
      return {
        configured: true,
        provider: 'local',
        model: model || null,
        baseURL,
        ready: false,
        message: `LOCAL_LLM_MODEL is not set to a real model. Open LM Studio, load a model, start the server, then set LOCAL_LLM_MODEL to the exact model name.`,
      };
    }

    return {
      configured: true,
      provider: 'local',
      model,
      baseURL,
      ready: false,
      message: 'Local LLM provider configured. Use /api/health/check to test connectivity.',
    };
  }

  return {
    configured: true,
    provider: provider.name,
    model: provider.model || null,
    ready: true,
    message: `${provider.name === 'anthropic' ? 'Anthropic' : 'OpenAI'} provider configured.`,
  };
}

function structuredError(code: string, message: string, details?: string) {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
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
      res.status(400).json(structuredError('BAD_REQUEST', 'Missing required fields: system, messages'));
      return;
    }

    const result = await routeCompletion(system, messages);
    res.json({ content: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[clipbounce-server] /api/complete error:', message);

    if (
      message.includes('LOCAL_LLM_MODEL') ||
      message.includes('No AI provider configured')
    ) {
      res.status(400).json(structuredError('NO_PROVIDER', message));
    } else if (
      message.includes('Paid API key') ||
      message.includes('401') ||
      message.includes('Authentication') ||
      message.includes('api key') ||
      message.includes('Incorrect API key')
    ) {
      res.status(401).json(structuredError('AUTH_INVALID', message));
    } else if (
      message.includes('Cannot reach local LLM') ||
      message.includes('not reachable')
    ) {
      const baseURL = process.env.LOCAL_LLM_BASE_URL || 'http://localhost:1234/v1';
      res.status(503).json(structuredError(
        'LOCAL_LLM_UNREACHABLE',
        `Local LLM server is not reachable at ${baseURL}. Start LM Studio's local server or switch ClipBounce to Mock mode.`,
        message,
      ));
    } else if (
      message.includes('not available on the local LLM server')
    ) {
      res.status(503).json(structuredError('LOCAL_MODEL_MISSING', message));
    } else {
      res.status(500).json(structuredError('UNKNOWN', message));
    }
  }
});

app.get('/api/health', (_req, res) => {
  const readiness = getProviderReadiness();
  res.json({
    status: 'ok',
    ...readiness,
  });
});

app.get('/api/health/check', async (_req, res) => {
  const provider = getActiveProvider();

  if (!provider) {
    res.json({
      status: 'ok',
      configured: false,
      provider: null,
      model: null,
      ready: false,
      message: 'No provider configured. Use Mock mode or configure LM Studio/Anthropic/OpenAI.',
    });
    return;
  }

  if (provider.name !== 'local') {
    res.json({
      status: 'ok',
      configured: true,
      provider: provider.name,
      model: provider.model || null,
      ready: true,
      message: `${provider.name === 'anthropic' ? 'Anthropic' : 'OpenAI'} provider configured.`,
    });
    return;
  }

  const model = provider.model;
  if (!model || model === 'local-model') {
    res.json({
      status: 'ok',
      configured: true,
      provider: 'local',
      model: model || null,
      baseURL: process.env.LOCAL_LLM_BASE_URL || 'http://localhost:1234/v1',
      ready: false,
      message: 'LOCAL_LLM_MODEL is not set to a real model. Open LM Studio, load a model, start the server, then set LOCAL_LLM_MODEL to the exact model name.',
    });
    return;
  }

  const health = await localCheckHealth();

  if (!health.reachable) {
    res.json({
      status: 'ok',
      configured: true,
      provider: 'local',
      model,
      baseURL: process.env.LOCAL_LLM_BASE_URL || 'http://localhost:1234/v1',
      ready: false,
      message: health.message,
    });
    return;
  }

  const modelAvailable = health.models.some(
    (m) => m === model || m.endsWith('/' + model),
  );

  res.json({
    status: 'ok',
    configured: true,
    provider: 'local',
    model,
    baseURL: process.env.LOCAL_LLM_BASE_URL || 'http://localhost:1234/v1',
    ready: modelAvailable,
    availableModels: health.models,
    message: modelAvailable
      ? `Local LLM ready: ${model}`
      : `Local LLM server is reachable, but model '${model}' is not available. Load the model in LM Studio or update LOCAL_LLM_MODEL. Available: ${health.models.join(', ') || 'none'}.`,
  });
});

app.listen(PORT, () => {
  const provider = getActiveProvider();
  const readiness = getProviderReadiness();
  console.log(`[clipbounce-server] Listening on http://localhost:${PORT}`);

  if (!readiness.configured) {
    console.warn('[clipbounce-server] WARNING: No provider configured.');
    console.warn('[clipbounce-server]   The extension works in Mock mode without a server.');
    console.warn('[clipbounce-server]   To use real AI synthesis, configure .env:');
    console.warn('[clipbounce-server]     Option A (free): Set AI_PROVIDER=local + LOCAL_LLM_* vars (LM Studio)');
    console.warn('[clipbounce-server]     Option B (paid): Set ANTHROPIC_API_KEY or OPENAI_API_KEY');
    return;
  }

  if (provider) {
    console.log(`[clipbounce-server] Using ${provider.name} provider (model: ${provider.model || 'default'})`);
    if (provider.name === 'local') {
      const baseURL = process.env.LOCAL_LLM_BASE_URL || 'http://localhost:1234/v1';
      console.log(`[clipbounce-server]   Base URL: ${baseURL}`);

      if (!provider.model || provider.model === 'local-model') {
        console.warn('[clipbounce-server] WARNING: LOCAL_LLM_MODEL is not set to a real model.');
        console.warn('[clipbounce-server]   Open LM Studio, load a model, start the server,');
        console.warn('[clipbounce-server]   then set LOCAL_LLM_MODEL to the exact model name.');
      }
    }
  }
});
