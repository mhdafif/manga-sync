import { browser } from 'wxt/browser';
import { getTitleTag } from '../adapters/html';

const CHALLENGE_TITLE = /just a moment|attention required|checking your browser|verify you are human/i;

/** True when the response is a bot-check page instead of the real page. */
export function looksLikeChallenge(status: number, html: string, title = getTitleTag(html) ?? ''): boolean {
  if (CHALLENGE_TITLE.test(title)) return true;
  if ((status === 403 || status === 503) && /cf-chl|cloudflare|__cf_chl/i.test(html.slice(0, 30000))) return true;
  return false;
}

export async function fetchSeriesHtml(url: string): Promise<string> {
  const res = await fetch(url, { credentials: 'include', redirect: 'follow' });
  const html = await res.text();
  if (looksLikeChallenge(res.status, html)) throw new Error('Blocked by a bot check');
  if (res.status === 429) throw new Error('Rate limited by site (HTTP 429)');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return html;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Mutex to ensure at most 1 background tab fallback runs at any given time
let tabFallbackMutex: Promise<void> = Promise.resolve();

/**
 * Fallback for sites that block plain fetches: open the page in a background
 * tab, let it solve its own check, read the HTML, close the tab.
 * Serialized to prevent opening multiple background tabs simultaneously.
 */
export async function fetchViaTab(url: string, timeoutMs = 25000): Promise<string> {
  let release: () => void = () => {};
  const next = new Promise<void>((r) => {
    release = r;
  });
  const prev = tabFallbackMutex;
  tabFallbackMutex = next;
  await prev;

  try {
    const tab = await browser.tabs.create({ url, active: false });
    const tabId = tab.id;
    if (tabId === undefined) throw new Error('Could not open a background tab');
    const deadline = Date.now() + timeoutMs;
    try {
      while (Date.now() < deadline) {
        await sleep(900);
        const current = await browser.tabs.get(tabId);
        if (current.status !== 'complete') continue;
        const [result] = await browser.scripting.executeScript({
          target: { tabId },
          func: () => ({ title: document.title, html: document.documentElement.outerHTML }),
        });
        const page = result?.result as { title: string; html: string } | undefined;
        if (page && !looksLikeChallenge(200, page.html, page.title)) return page.html;
      }
      throw new Error('Timed out (the site may need a captcha, open it manually)');
    } finally {
      await browser.tabs.remove(tabId).catch(() => undefined);
    }
  } finally {
    release();
  }
}
