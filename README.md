# ClipBounce

Prompt multiple websites at once. Select sources, ask anything, get a multi-source synthesis.

## Features

- **Capture sources** — current tab, all tabs, or paste URLs
- **Extract readable text** — strips nav/ads/footers, collapses whitespace
- **Multi-source synthesis** — AI-powered answers grounded in your sources
- **Two provider modes**:
  - **Mock** (default) — fake structured output, no backend needed
  - **Local Backend** — real AI via Anthropic Claude or OpenAI GPT
- **Source numbering** — each source gets a number; synthesis references sources by number
- **Export** — copy synthesis text, copy full report, download Markdown
- **Prompt presets** — summary, comparison, extraction, unique ideas, study notes

## Architecture

```
src/
  extension/
    background.ts        — service worker: capture, injection, synthesis orchestration
    contentScript.ts     — injected per-tab: page text extraction via DOMParser
    popup/               — React UI (Vite-built, 540px)
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
  providers/             — AnthropicServerProvider, OpenAIServerProvider
  .env.example           — API key template
```

## Quick Start

### 1. Build the extension

```bash
npm install
npm run build
```

Output goes to `dist/`.

### 2. Load in Chrome

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Load unpacked → select `dist/`

### 3. Use Mock Mode (no backend)

- The extension defaults to **Mock Provider** mode
- All outputs are simulated — useful for testing the UI and capture flow
- A "Mock" badge appears in the header
- Settings panel shows the current mode

### 4. Run local backend for real AI

```bash
cd server
cp .env.example .env
# Edit .env — set your API key:
#   ANTHROPIC_API_KEY=sk-ant-...
#   or OPENAI_API_KEY=sk-...
npm install
npm run dev
```

The server starts at `http://localhost:8787`.

### 5. Switch to Local Backend in the extension

1. Click the gear icon (⚙) in the popup header
2. Change Provider Mode to "Local Backend"
3. Keep default URL `http://localhost:8787`
4. Click "Test Connection" to verify
5. Now all synthesis uses the real AI provider

## Provider Interface

The `AIProvider` interface in `src/clipbounce/synthesis/providers/AIProvider.ts`:

```typescript
interface AIProvider {
  name: string;
  summarizeSource(input: { source: SourceRecord; prompt: PromptSpec }): Promise<SourceMiniSummary>;
  synthesizeBundle(input: { prompt: PromptSpec; sources: SourceRecord[]; sourceSummaries: SourceMiniSummary[] }): Promise<BundleSynthesisResult>;
}
```

Two implementations are provided:
- **MockProvider** — template-based, no API calls
- **RemoteProvider** — sends HTTP requests to the local backend

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

Check server status and configured provider.

```json
{
  "status": "ok",
  "provider": "anthropic",
  "message": "AI provider configured"
}
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | One of | — | Anthropic API key |
| `OPENAI_API_KEY` | One of | — | OpenAI API key |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-4-20250514` | Anthropic model |
| `OPENAI_MODEL` | No | `gpt-4o` | OpenAI model |
| `PORT` | No | `8787` | Server port |

Anthropic takes precedence if both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are set.

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
- Popup width limited to 540px (Chrome extension constraint)
- No semantic deduplication
- No keyboard shortcuts

## Future Iterations

- Semantic deduplication
- Source clustering / grouping
- Evidence graph with quoted passages
- Saved research capsules
- Chrome built-in Summarizer API
- Side panel for better long-form results
- Streaming synthesis output
