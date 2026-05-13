import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env') });

import { complete as anthropicComplete } from './providers/AnthropicServerProvider.js';
import { complete as openaiComplete } from './providers/OpenAIServerProvider.js';

const app = express();
const PORT = parseInt(process.env.PORT || '8787', 10);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.post('/api/complete', async (req, res) => {
  try {
    const { system, messages } = req.body;

    if (!system || !messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'Missing required fields: system, messages' });
      return;
    }

    let result: string;

    if (process.env.ANTHROPIC_API_KEY) {
      result = await anthropicComplete(system, messages);
    } else if (process.env.OPENAI_API_KEY) {
      result = await openaiComplete(system, messages);
    } else {
      res.status(500).json({
        error: 'No API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env',
      });
      return;
    }

    res.json({ content: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[clipbounce-server] /api/complete error:', message);
    res.status(500).json({ error: message });
  }
});

app.get('/api/health', (_req, res) => {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  res.json({
    status: 'ok',
    provider: hasAnthropic ? 'anthropic' : hasOpenAI ? 'openai' : 'none',
    message: hasAnthropic || hasOpenAI
      ? 'AI provider configured'
      : 'No API key set — set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env',
  });
});

app.listen(PORT, () => {
  console.log(`[clipbounce-server] Listening on http://localhost:${PORT}`);
  if (process.env.ANTHROPIC_API_KEY) {
    console.log(`[clipbounce-server] Using Anthropic provider`);
  } else if (process.env.OPENAI_API_KEY) {
    console.log(`[clipbounce-server] Using OpenAI provider`);
  } else {
    console.warn('[clipbounce-server] WARNING: No API key set. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env');
  }
});
