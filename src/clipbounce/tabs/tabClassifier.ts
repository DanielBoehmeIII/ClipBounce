import type { TabInfo, TabGroupSuggestion, PaneColor } from '../types';

type Category = {
  title: string;
  color: PaneColor;
  domains: string[];
  patterns: RegExp[];
};

const CATEGORIES: Category[] = [
  {
    title: 'Research',
    color: 'blue',
    domains: [
      'scholar.google.com', 'wikipedia.org', 'arxiv.org', 'pubmed.ncbi.nlm.nih.gov',
      'doi.org', 'researchgate.net', 'academia.edu', 'semanticscholar.org',
      'citeseerx.ist.psu.edu', 'jstor.org', 'ieeexplore.ieee.org',
      'sciencedirect.com', 'springer.com', 'tandfonline.com',
    ],
    patterns: [
      /research|paper|article|journal|study|analysis|survey|literature|review|thesis|dissertation/i,
    ],
  },
  {
    title: 'Development',
    color: 'green',
    domains: [
      'github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com',
      'npmjs.com', 'pypi.org', 'crates.io', 'docs.rs',
      'developer.mozilla.org', 'dev.to', 'medium.com',
      'codesandbox.io', 'codepen.io', 'replit.com',
      'vercel.com', 'netlify.com', 'heroku.com',
      'localhost', 'chrome.google.com/webstore',
    ],
    patterns: [
      /github|gitlab|code|api|sdk|library|framework|cli|terminal|docker|k8s|kubernetes|deploy|build|compile|debug|docs\/[\w-]+\/$/i,
    ],
  },
  {
    title: 'Writing',
    color: 'purple',
    domains: [
      'docs.google.com', 'notion.so', 'overleaf.com', 'grammarly.com',
      'medium.com', 'substack.com', 'wordpress.com', 'blogger.com',
    ],
    patterns: [
      /doc|document|write|blog|article|draft|edit|note|notion/i,
    ],
  },
  {
    title: 'Shopping',
    color: 'yellow',
    domains: [
      'amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.co.jp',
      'ebay.com', 'etsy.com', 'walmart.com', 'target.com',
      'bestbuy.com', 'newegg.com', 'aliexpress.com',
      'depop.com', 'poshmark.com', 'mercari.com',
    ],
    patterns: [
      /shop|buy|cart|checkout|price|deal|offer|product|review|rating|compare/i,
    ],
  },
  {
    title: 'Admin',
    color: 'grey',
    domains: [
      'mail.google.com', 'calendar.google.com', 'drive.google.com',
      'outlook.live.com', 'outlook.office.com', 'teams.microsoft.com',
      'slack.com', 'discord.com', 'trello.com', 'asana.com',
      'notion.so', 'confluence.com', 'atlassian.com',
      'admin.google.com', 'console.cloud.google.com',
      'portal.azure.com', 'console.aws.amazon.com',
    ],
    patterns: [
      /admin|dashboard|settings|config|manage|billing|account|profile|inbox|mail/i,
    ],
  },
  {
    title: 'Social',
    color: 'pink',
    domains: [
      'reddit.com', 'twitter.com', 'x.com', 'facebook.com',
      'instagram.com', 'linkedin.com', 'tiktok.com',
      'youtube.com', 'twitch.tv', 'discord.com',
      'pinterest.com', 'tumblr.com',
    ],
    patterns: [
      /social|feed|chat|message|comment|share|follow/i,
    ],
  },
  {
    title: 'Media',
    color: 'cyan',
    domains: [
      'youtube.com', 'vimeo.com', 'netflix.com', 'hulu.com',
      'spotify.com', 'soundcloud.com', 'bandcamp.com',
      'twitch.tv', 'disneyplus.com', 'hbomax.com',
      'peacocktv.com', 'paramountplus.com',
    ],
    patterns: [
      /video|audio|stream|watch|listen|podcast|music|movie|tv|episode|playlist/i,
    ],
  },
  {
    title: 'Docs',
    color: 'orange',
    domains: [
      'docs.google.com', 'drive.google.com',
      'onedrive.live.com', 'dropbox.com',
      'readthedocs.io', 'gitbook.io',
    ],
    patterns: [
      /readme|documentation|guide|tutorial|manual|wiki|faq|reference|spec/i,
    ],
  },
];

function classifyTabByDomain(tab: TabInfo): Category | null {
  const domain = tab.domain.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.domains.some(d => domain.includes(d) || domain === d)) {
      return cat;
    }
  }
  return null;
}

function classifyTabByContent(tab: TabInfo): Category | null {
  const title = (tab.title || '').toLowerCase();
  const url = tab.url.toLowerCase();
  const text = title + ' ' + url;
  for (const cat of CATEGORIES) {
    if (cat.patterns.some(p => p.test(text))) {
      return cat;
    }
  }
  return null;
}

export function classifyTab(tab: TabInfo): Category {
  return classifyTabByDomain(tab) || classifyTabByContent(tab) || {
    title: 'Other',
    color: 'grey',
    domains: [],
    patterns: [],
  };
}

export function smartGroupTabs(
  tabs: TabInfo[],
): TabGroupSuggestion[] {
  const groups = new Map<string, TabGroupSuggestion>();

  for (const tab of tabs) {
    const cat = classifyTab(tab);
    const key = cat.title;
    if (!groups.has(key)) {
      groups.set(key, { title: key, color: cat.color, tabIds: [], tabCount: 0 });
    }
    const group = groups.get(key)!;
    group.tabIds.push(tab.id);
    group.tabCount = group.tabIds.length;
  }

  return Array.from(groups.values()).sort((a, b) => b.tabCount - a.tabCount);
}

export function getCategoryColor(title: string): PaneColor {
  const cat = CATEGORIES.find(c => c.title === title);
  return cat ? cat.color : 'grey';
}
