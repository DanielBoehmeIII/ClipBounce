# ClipBounce

Prompt multiple websites at once. Select sources, ask anything, get a multi-source synthesis.

## Features

- **Workflow Dashboard** — Selection buffer, keyboard controls, pane/tab-group manager, AI groups, macros, and synthesis in one UI
- **Chrome Side Panel** — Press Ctrl+Shift+L (or Cmd+Shift+L on Mac) to open ClipBounce in the side panel for a wider, persistent workspace
- **Tab Selection Buffer** — Visual range bar with keyboard-driven left/right boundary control (Space, Arrow keys)
- **Pane System** — Create named/colored tab groups from your selection; Focus, Release, Archive, or Restore sessions
- **AI Groups** — Smart Group your tabs by domain/content into Research, Development, Writing, Shopping, and more
- **Macros** — One-click workflows: Open Research Set, Build Focus Workspace, Archive Tabs, Restore Session, Summarize Pane, Compare Tabs, Extract Pricing
- **Capture sources** — current tab, all tabs, selected tabs, or paste URLs
- **Extract readable text** — strips nav/ads/footers, collapses whitespace
- **Multi-source synthesis** — AI-powered answers grounded in your sources
- **Provider options**:
  - **Mock** (default) — fake structured output, no backend needed, no API keys
  - **Local Backend** — real AI via the local backend server
    - Anthropic Claude (paid API key required)
    - OpenAI GPT (paid API key required)
    - **Local LLM** — free, no paid API key needed (LM Studio / Ollama)
- **Source numbering** — each source gets a number; synthesis references sources by number
- **Export** — copy synthesis text, copy full report, download Markdown
- **Prompt presets** — summary, comparison, extraction, unique ideas, study notes

## Architecture

```
src/
  extension/
    background.ts        — service worker: capture, injection, synthesis orchestration
    contentScript.ts     — injected per-tab: page text extraction via DOMParser
    popup/               — React workflow UI (Vite-built, 750px)
    sidepanel/           — Chrome side panel React app (same dashboard, persistent)
  clipbounce/
    types.ts             — shared type definitions
    messages.ts          — extension message types
    capture/tabCapture.ts— tab querying and source record creation
    extraction/          — readable text extraction, normalization
    synthesis/           — prompt compiler, summarizer, bundle synthesizer
    synthesis/providers/ — AIProvider interface, MockProvider, RemoteProvider
    storage/             — sessionStore (chrome.storage.session), settingsStore (chrome.storage.sync)
  utils/
    url.ts, hash.ts      — URL normalization, ID generation
server/                  — local backend for real AI synthesis
  index.ts               — Express server
  providers/             — AnthropicServerProvider, OpenAIServerProvider, OpenAICompatibleLocalProvider
  .env.example           — environment variable template
```

## Quick Start

### Step 1: Build the extension

```bash
npm install
npm run build
```

Output goes to `dist/`.

### Step 2: Load in Chrome

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Load unpacked → select `dist/`

### Step 3: Use Mock Mode (no server, no API keys, no LM Studio)

The extension defaults to **Mock Provider** mode. You can try all features immediately:

- **Capture tabs** — Current Tab, All Tabs, Selected Tabs, pasted URLs
- **Generate synthesis** — pick a preset or type your own prompt
- **Export** — copy synthesis, copy report, download Markdown

Mock mode uses template-based fake output — no server, no API keys, no LM Studio needed.
A **Mock** badge appears in the popup header. The settings panel shows the current mode.

**This is the recommended first path. Do not set up a server until capture works.**

### Step 4 (optional): Run the local backend for real AI synthesis

Only do this after you have verified capture works in Mock mode.

You have three options:

#### Option A: Ollama or LM Studio (free, local, no paid API key)

ClipBounce can use any OpenAI-compatible local server.

> **Model recommendations for fast local inference:**
>
> - **Small models (fastest):** `llama3.2:3b`, `qwen2.5:7b`, `phi4:14b`, `mistral:7b`
> - **Medium models (balanced):** `llama3.1:8b`, `qwen2.5:14b`, `gemma2:9b`
> - **Giant models (slow — avoid for MVP):** `qwen3-vl:235b-cloud`, `llama3:70b`, `mixtral:8x22b`
>
> Start with 1–2 tabs and a small model. Large vision models like `qwen3-vl:235b-cloud` will be very slow since ClipBounce sends text content only.

**Ollama:**

```bash
ollama pull llama3:8
ollama run llama3:8
```

```bash
cd server
cp .env.example .env
```

Edit `server/.env` — uncomment and fill in:

```
AI_PROVIDER=local
LOCAL_LLM_BASE_URL=http://localhost:11434/v1
LOCAL_LLM_MODEL=llama3:8
LOCAL_LLM_API_KEY=ollama
PORT=8787
```

Then:

```bash
npm install
npm run dev
```

1. Click the gear icon (⚙) in the extension popup
2. Change Provider Mode to **Local Backend**
3. Click **Test Connection** to verify

#### Option B: Paid Anthropic API key

```bash
cd server
cp .env.example .env
```

Edit `server/.env` — uncomment and set:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

Then:

```bash
npm install
npm run dev
```

#### Option C: Paid OpenAI API key

```bash
cd server
cp .env.example .env
```

Edit `server/.env` — uncomment and set:

```env
OPENAI_API_KEY=sk-...
```

Then:

```bash
npm install
npm run dev
```

### Switching the extension to Local Backend mode

For all server options (A, B, or C):

1. Click the gear icon (⚙) in the popup header
2. Change Provider Mode to **Local Backend**
3. Keep default URL `http://localhost:8787`
4. Click **Test Connection** to verify the provider is ready

## Provider Interface

The `AIProvider` interface in `src/clipbounce/synthesis/providers/AIProvider.ts`:

```typescript
interface AIProvider {
  name: string;
  summarizeSource(input: { source: SourceRecord; prompt: PromptSpec }): Promise<SourceMiniSummary>;
  synthesizeBundle(input: { prompt: PromptSpec; sources: SourceRecord[]; sourceSummaries: SourceMiniSummary[] }): Promise<BundleSynthesisResult>;
}
```

Three implementations are provided:

- **MockProvider** — template-based, no API calls
- **RemoteProvider** — sends HTTP requests to the local backend
- **Local LLM** — free, local model via LM Studio/Ollama

Register custom providers in `src/clipbounce/synthesis/providers/index.ts`.

## Server API

### POST `/api/complete`

Call the AI provider with a prompt.

```json
{
  "system": "You are a helpful assistant.",
  "messages": [
    { "role": "user", "content": "Summarize these sources..." }
  ]
}
```

Response:

```json
{
  "content": "Here is the synthesis..."
}
```

### GET `/api/health`

Check server status and configured provider readiness.

```json
{
  "status": "ok",
  "configured": true,
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "ready": true,
  "message": "Anthropic provider configured."
}
```

For local LLM mode (not yet tested):

```json
{
  "status": "ok",
  "configured": true,
  "provider": "local",
  "model": "mistral-7b-instruct-v0.2",
  "baseURL": "http://localhost:1234/v1",
  "ready": false,
  "message": "Local LLM provider configured. Use /api/health/check to test connectivity."
}
```

### GET `/api/health/check`

Actively tests the configured provider. For local LLM, this calls the LM Studio `/models` endpoint.

```json
{
  "status": "ok",
  "configured": true,
  "provider": "local",
  "model": "mistral-7b-instruct-v0.2",
  "baseURL": "http://localhost:1234/v1",
  "ready": true,
  "availableModels": ["mistral-7b-instruct-v0.2"],
  "message": "Local LLM ready: mistral-7b-instruct-v0.2"
}
```

### POST `/api/complete` error responses

Errors return structured JSON with status codes:

| Status | Code | Meaning |
|--------|------|---------|
| 400 | `NO_PROVIDER` | No provider configured or bad config |
| 400 | `BAD_REQUEST` | Missing required fields |
| 401 | `AUTH_INVALID` | Invalid paid API key |
| 503 | `LOCAL_LLM_UNREACHABLE` | LM Studio not running |
| 503 | `LOCAL_MODEL_MISSING` | Model not loaded on LM Studio |
| 500 | `UNKNOWN` | Unexpected error |

```json
{
  "error": {
    "code": "LOCAL_LLM_UNREACHABLE",
    "message": "Local LLM server is not reachable at http://localhost:1234/v1. Start LM Studio's local server or switch ClipBounce to Mock mode.",
    "details": "Cannot reach local LLM at http://localhost:1234/v1..."
  }
}
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | For Anthropic mode | — | Anthropic API key |
| `OPENAI_API_KEY` | For OpenAI mode | — | OpenAI API key |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-4-20250514` | Anthropic model |
| `OPENAI_MODEL` | No | `gpt-4o` | OpenAI model |
| `AI_PROVIDER` | For local mode | — | Set to `local` for LM Studio/Ollama |
| `LOCAL_LLM_BASE_URL` | For local mode | `http://localhost:1234/v1` | Local LLM endpoint |
| `LOCAL_LLM_MODEL` | **Required for local mode** | — | Exact model name loaded in LM Studio (e.g. `mistral-7b-instruct-v0.2`) |
| `LOCAL_LLM_API_KEY` | No | `lm-studio` | API key for local endpoint |
| `LOCAL_LLM_MAX_INPUT_CHARS` | No | `4000` | Max source chars sent to local model (reduce for speed) |
| `LOCAL_LLM_MAX_CHUNKS` | No | `3` | Max chunks selected for local model |
| `LOCAL_LLM_MAX_OUTPUT_TOKENS` | No | `700` | Max output tokens for local model |
| `PORT` | No | `8787` | Server port |

Provider selection priority:

1. `AI_PROVIDER=local` → uses the local LLM (no paid API key needed)
2. `ANTHROPIC_API_KEY` is set → uses Anthropic Claude
3. `OPENAI_API_KEY` is set → uses OpenAI GPT
4. None → returns a structured error guiding you to configure a provider

**Note:** The extension itself defaults to **Mock mode** (no server needed).
The server only handles real AI synthesis — the extension works without it.

## Local Optimization

ClipBounce includes several features to speed up local/Ollama inference:

- **Provider-aware budgets:** Local mode sends ~4000 chars of source content (vs 25,000 for paid providers). Adjust via `LOCAL_LLM_MAX_INPUT_CHARS` in `server/.env`.
- **Fast Mode:** A toggle in the extension settings panel. Reduces context further (~2500 chars), skips per-source summarization, and uses a single model call for final synthesis. Enable when you need quick results.
- **One-call synthesis:** In local/Fast Mode, ClipBounce sends all source content in one prompt instead of making separate summarization calls per source, halving the number of model invocations.
- **Caching:** Extracted text and per-source summaries are cached in memory, so re-running with the same sources skips redundant work.
- **Progress UI:** A timer and stage messages show real-time progress during generation.

## Prompt Reference

The prompt compiler in `promptCompiler.ts` auto-detects intent mode based on keywords:

| Mode | Triggers |
|---|---|
| `summary` | summariz, summary, tl;dr, overview |
| `comparison` | compare, versus, vs, differences, contrast |
| `extraction` | extract, pricing, table, features, list, specs |
| `study_guide` | study, notes, quiz, learn, flashcard |
| `research_brief` | research, brief, analyze, deep dive |

The RemoteProvider sends a detailed prompt that:

- Includes full source content with `[N]` source numbers
- Instructs the model to answer **only from provided sources**
- Separates **repeated ideas** from **unique ideas**
- Mentions **inaccessible sources**
- Requires source references by number

## Export Options

| Action | What it copies |
|---|---|
| **Copy Synthesis** | Just the synthesis section |
| **Copy Report** | Synthesis + prompt + source summaries + failures |
| **Download MD** | Full report as a `.md` file |

## Known Limitations

- External URL fetch is limited by CORS/robots.txt
- Pasted URL fetch runs in the popup (not background) — may fail for some sites
- No persistent history between sessions (beyond current result)
- RemoteProvider makes separate API calls for each source summary + one final synthesis call (cost scales with number of sources)
- Large source texts are truncated at ~4000 chars per source for API calls
- Popup width limited to 750px (Chrome extension constraint)
- Side panel may require manual pinning on first use — right-click the extension icon and select "Open side panel" if Ctrl+Shift+L does not work
- No semantic deduplication

## Future Iterations

- Semantic deduplication
- Source clustering / grouping
- Evidence graph with quoted passages
- Saved research capsules
- Chrome built-in Summarizer API
- Streaming synthesis output
