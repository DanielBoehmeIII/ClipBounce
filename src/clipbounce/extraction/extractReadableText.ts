import type { ExtractedContent } from '../types';

const MAX_CHARS = 50_000;

const SELECTOR_REMOVE = [
  'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
  'nav', 'footer', 'header', 'aside',
  'form', 'button',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  '.nav', '.navbar', '.footer', '.sidebar', '.menu',
  '#nav', '#navbar', '#footer', '#sidebar', '#menu',
  '.ad', '.ads', '.advertisement', '.banner-ad',
  '.social-share', '.social-links', '.share-buttons',
  '.cookie-banner', '.cookie-consent', '.popup', '.modal',
  '.comments', '.comment-list', '#comments',
  '[aria-hidden="true"]',
];

function removeElements(doc: Document): void {
  for (const sel of SELECTOR_REMOVE) {
    try {
      const els = doc.querySelectorAll(sel);
      els.forEach((el) => el.remove());
    } catch {
    }
  }
}

function extractHeadings(doc: Document): string[] {
  const headings: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const els = doc.querySelectorAll(`h${i}`);
    els.forEach((el) => {
      const text = el.textContent?.trim();
      if (text) headings.push(`h${i}: ${text}`);
    });
  }
  return headings.slice(0, 50);
}

function getMainText(doc: Document): string {
  const candidates = [
    doc.querySelector('main'),
    doc.querySelector('article'),
    doc.querySelector('[role="main"]'),
    doc.querySelector('.content'),
    doc.querySelector('.post-content'),
    doc.querySelector('.entry-content'),
    doc.querySelector('#content'),
    doc.body,
  ];

  for (const el of candidates) {
    if (el) {
      const text = el.textContent?.trim();
      if (text && text.length > 100) return text;
    }
  }

  return doc.body?.textContent?.trim() || '';
}

function collapseWhitespace(text: string): string {
  return text
    .replace(/\t/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function extractReadableText(doc: Document): ExtractedContent {
  const clone = doc.cloneNode(true) as Document;
  removeElements(clone);

  const title = doc.title?.trim() || '';
  const url = doc.URL || '';
  const headings = extractHeadings(clone);
  let text = getMainText(clone);
  text = collapseWhitespace(text);

  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS) + '\n\n[... content truncated ...]';
  }

  return {
    title,
    url,
    text,
    headings,
    charCount: text.length,
  };
}
