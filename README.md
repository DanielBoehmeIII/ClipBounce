# ClipBounce

Prompt multiple websites at once. Select sources, ask anything, get a multi-source synthesis.

## MVP (v0.1)

First iteration — working pipeline with mock AI provider.

### Features

- Capture current tab, all tabs, or paste URLs
- Extract readable text (navigation/footer removed, whitespace collapsed)
- Prompt presets (summary, comparison, extraction, study notes)
- Mock AI provider returns structured multi-source synthesis
- Failed sources shown explicitly

### Architecture

```
src/
  extension/
    background.ts        — service worker: capture, injection, synthesis orchestration
    contentScript.ts     — injected per-tab: page text extraction via DOMParser
    popup/               — React UI (Vite-built)
  clipbounce/
    types.ts             — shared type definitions
    messages.ts          — extension message types
    capture/tabCapture.ts— tab querying and source record creation
    extraction/          — readable text extraction, normalization
    synthesis/           — prompt compiler, summarizer, bundle synthesizer
    synthesis/providers/ — AIProvider interface, MockProvider
    storage/sessionStore.ts
  utils/
    url.ts, hash.ts      — URL normalization, ID generation
```

### Build

```bash
npm install
npm run build
```

Output goes to `dist/`. Load in Chrome:
1. Open `chrome://extensions`
2. Enable Developer Mode
3. Load unpacked → select `dist/`

### Provider Interface

The `AIProvider` interface in `src/clipbounce/synthesis/providers/AIProvider.ts` defines:

- `summarizeSource(input) → SourceMiniSummary`
- `synthesizeBundle(input) → BundleSynthesisResult`

Register new providers in `providers/index.ts`. The MockProvider returns structured fake data — replace with Anthropic, OpenAI, or local model calls.

### What's Mocked

- Source summarization returns template-based content, not real AI
- Bundle synthesis produces structured but fake output
- Pasted URL fetching uses background fetch + DOMParser (may fail on CORS-restricted pages)

### Known Limitations

- External URL fetch limited by CORS/robots.txt
- No semantic deduplication
- No persistent history between sessions
- No export (copy-to-clipboard only)
- Popup width limited to 520px
- No keyboard shortcuts

### Next Iteration

- Real AI provider (Anthropic/OpenAI)
- Semantic deduplication
- Source clustering
- Evidence graph
- Export to Markdown/Notion
- Saved research capsules
- Local model support
- Chrome built-in Summarizer API
