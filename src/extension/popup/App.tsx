import { useState, useCallback, useRef } from 'react';
import type { SourceRecord, BundleSynthesisResult } from '../../clipbounce/types';
import type { ExtensionMessage } from '../../clipbounce/messages';
import { getDomain } from '../../utils/url';
import './App.css';

type AppStatus = 'idle' | 'capturing' | 'extracting' | 'generating' | 'complete' | 'error';

const PRESETS = [
  { label: 'Beginner summary', prompt: 'Summarize these websites for a beginner.' },
  { label: 'Compare sources', prompt: 'Compare the main ideas across these sources.' },
  { label: 'Extract pricing', prompt: 'Extract pricing and make a table.' },
  { label: 'Find unique ideas', prompt: 'Tell me what is unique across these links.' },
  { label: 'Study notes', prompt: 'Make study notes from these pages.' },
];

export default function App() {
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [status, setStatus] = useState<AppStatus>('idle');
  const [prompt, setPrompt] = useState('');
  const [urlText, setUrlText] = useState('');
  const [result, setResult] = useState<BundleSynthesisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const sendMessage = useCallback(async (msg: ExtensionMessage): Promise<any> => {
    return chrome.runtime.sendMessage(msg);
  }, []);

  const addCurrentTab = useCallback(async () => {
    setStatus('capturing');
    setError(null);
    const resp = await sendMessage({ type: 'CAPTURE_CURRENT_TAB' });
    if (resp.type === 'CAPTURE_TABS_RESULT') {
      setSources((prev) => [...prev, ...resp.sources]);
    }
    setStatus('idle');
  }, [sendMessage]);

  const addAllTabs = useCallback(async () => {
    setStatus('capturing');
    setError(null);
    const resp = await sendMessage({ type: 'CAPTURE_ALL_TABS' });
    if (resp.type === 'CAPTURE_TABS_RESULT') {
      setSources((prev) => [...prev, ...resp.sources]);
    }
    setStatus('idle');
  }, [sendMessage]);

  const addPastedUrls = useCallback(async () => {
    const urls = urlText
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) return;

    setStatus('capturing');
    setError(null);

    const newSources: SourceRecord[] = urls.map((url) => ({
      id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      url,
      title: undefined,
      domain: getDomain(url),
      captureMethod: 'pasted_url',
      status: 'extracting',
      capturedAt: new Date().toISOString(),
    }));

    setSources((prev) => [...prev, ...newSources]);

    for (const source of newSources) {
      try {
        const resp = await fetch(source.url, { signal: AbortSignal.timeout(10000) });
        const html = await resp.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const text = doc.body?.textContent?.trim() || '';

        if (text.length < 50) {
          source.status = 'failed';
          source.error = 'Content too short or empty.';
        } else {
          const clean = text
            .replace(/\t/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();
          source.status = 'ready';
          source.title = doc.title?.trim() || undefined;
          source.cleanText = clean.slice(0, 50000);
          source.charCount = clean.length;
        }
      } catch (err) {
        source.status = 'failed';
        source.error = err instanceof Error ? err.message : 'Failed to fetch';
      }
    }

    setSources((prev) => [...prev]);
    setUrlText('');
    setStatus('idle');
  }, [urlText]);

  const clearSources = useCallback(() => {
    setSources([]);
    setResult(null);
    setError(null);
  }, []);

  const removeSource = useCallback((id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const generate = useCallback(async () => {
    if (sources.length === 0 || !prompt.trim()) return;

    setStatus('generating');
    setError(null);
    setResult(null);

    try {
      const resp = await sendMessage({
        type: 'GENERATE_SYNTHESIS',
        sources,
        prompt: prompt.trim(),
      });

      if (resp.type === 'SYNTHESIS_COMPLETE') {
        setResult(resp.result);
        setStatus('complete');
        setTimeout(() => {
          resultRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } else {
        throw new Error(resp.error || 'Generation failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStatus('error');
    }
  }, [sources, prompt, sendMessage]);

  const copyResult = useCallback(() => {
    if (!result) return;
    const text = [
      `# ClipBounce Synthesis`,
      `Prompt: ${result.prompt}`,
      '',
      result.synthesis,
      '',
      '---',
      'Source Summaries:',
      ...result.sourceSummaries.map(
        (s, i) =>
          `\n${i + 1}. ${s.title || s.url}\n   ${s.summary}\n   Key points: ${s.keyPoints.join(', ')}`,
      ),
      ...(result.failures.length > 0
        ? ['\nFailed sources:', ...result.failures.map((f) => `- ${f.url}: ${f.reason}`)]
        : []),
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [result]);

  const readyCount = sources.filter((s) => s.status === 'ready').length;

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">ClipBounce</h1>
        <p className="subtitle">Prompt multiple websites at once.</p>
      </header>

      <section className="controls">
        <div className="button-row">
          <button className="btn btn-primary" onClick={addCurrentTab} disabled={status === 'capturing'}>
            + Add Current Tab
          </button>
          <button className="btn btn-secondary" onClick={addAllTabs} disabled={status === 'capturing'}>
            + Add All Tabs
          </button>
          <button className="btn btn-ghost" onClick={clearSources} disabled={sources.length === 0}>
            Clear Sources
          </button>
        </div>
      </section>

      <section className="url-input-section">
        <textarea
          className="textarea url-textarea"
          placeholder="Paste URLs, one per line..."
          value={urlText}
          onChange={(e) => setUrlText(e.target.value)}
          rows={3}
        />
        <button
          className="btn btn-secondary"
          onClick={addPastedUrls}
          disabled={status === 'capturing' || !urlText.trim()}
        >
          Add URLs
        </button>
      </section>

      {sources.length > 0 && (
        <section className="sources-section">
          <h2 className="section-title">
            Sources ({readyCount} ready of {sources.length})
          </h2>
          <div className="source-list">
            {sources.map((source) => (
              <div key={source.id} className={`source-card source-${source.status}`}>
                <div className="source-card-header">
                  <span className={`status-dot status-${source.status}`} />
                  <span className="source-domain">{source.domain || source.url}</span>
                  <button className="btn-icon" onClick={() => removeSource(source.id)} title="Remove source">
                    &times;
                  </button>
                </div>
                <div className="source-url" title={source.url}>
                  {source.url}
                </div>
                {source.title && <div className="source-title">{source.title}</div>}
                {source.status === 'extracting' && <div className="source-status">Extracting...</div>}
                {source.status === 'failed' && source.error && (
                  <div className="source-error">{source.error}</div>
                )}
                {source.status === 'ready' && source.charCount && (
                  <div className="source-chars">{source.charCount.toLocaleString()} chars</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="prompt-section">
        <textarea
          className="textarea prompt-textarea"
          placeholder="Ask ClipBounce what to do with these websites..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
        />
        <div className="presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className="btn btn-preset"
              onClick={() => setPrompt(p.prompt)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <button
        className="btn btn-generate"
        onClick={generate}
        disabled={status === 'generating' || sources.length === 0 || !prompt.trim()}
      >
        {status === 'generating' ? 'Generating...' : 'Generate Synthesis'}
      </button>

      {status === 'generating' && (
        <div className="status-bar">
          <div className="spinner" />
          <span>Analyzing sources and generating synthesis...</span>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div className="result-section" ref={resultRef}>
          <div className="result-header">
            <h2 className="section-title">Synthesis Result</h2>
            <button className="btn btn-secondary" onClick={copyResult}>
              {copied ? 'Copied!' : 'Copy Result'}
            </button>
          </div>

          <div className="result-meta">
            {result.successfulSourceCount} source{result.successfulSourceCount !== 1 ? 's' : ''} analyzed
            {result.failedSourceCount > 0 && `, ${result.failedSourceCount} failed`}
          </div>

          <div className="synthesis-content">{renderSynthesis(result.synthesis)}</div>

          <h3 className="subsection-title">Per-Source Summaries</h3>
          {result.sourceSummaries.map((summary) => (
            <div key={summary.sourceId} className="source-summary-card">
              <div className="summary-source-title">{summary.title || summary.url}</div>
              <p className="summary-text">{summary.summary}</p>
              {summary.keyPoints.length > 0 && (
                <ul className="key-points">
                  {summary.keyPoints.map((kp, i) => (
                    <li key={i}>{kp}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {result.failures.length > 0 && (
            <div className="failures-section">
              <h3 className="subsection-title">Failed Sources</h3>
              {result.failures.map((f, i) => (
                <div key={i} className="failure-item">
                  <span className="failure-url">{f.url}</span>
                  <span className="failure-reason">{f.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function renderSynthesis(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listKey = 0;

  function flushList() {
    if (listItems.length > 0) {
      elements.push(<ul key={`ul-${listKey++}`} className="synth-list">{listItems}</ul>);
      listItems = [];
    }
  }

  lines.forEach((line, i) => {
    if (line.startsWith('## ')) {
      flushList();
      elements.push(<h2 key={`h2-${i}`} className="synth-h2">{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      flushList();
      elements.push(<h3 key={`h3-${i}`} className="synth-h3">{line.slice(4)}</h3>);
    } else if (line.startsWith('- ')) {
      listItems.push(<li key={`li-${i}`}>{line.slice(2)}</li>);
    } else if (line.trim() === '' && listItems.length > 0) {
      flushList();
    } else if (line.trim()) {
      flushList();
      elements.push(<p key={`p-${i}`} className="synth-p">{line}</p>);
    }
  });

  flushList();
  return elements;
}
