import { browser } from 'wxt/browser';
import { getAdapter } from '../adapters';
import { getState, mutate } from './storage';
import { normalizeOrigin } from './url';

/** Ask Chrome for access to one site. Must be called straight from a click. */
export async function requestSite(origin: string): Promise<boolean> {
  return browser.permissions.request({ origins: [`${origin}/*`] });
}

export async function subscribeSite(origin: string): Promise<void> {
  const norm = normalizeOrigin(origin);
  if (!norm) throw new Error('Not a valid web address');
  await mutate((s) => {
    if (s.sites.some((x) => x.origin === norm)) return;
    s.sites.push({ origin: norm, adapterId: getAdapter(new URL(norm)).id, addedAt: Date.now() });
  });
  await syncContentScripts();
  // Pages that are already open do not run registered scripts until they reload.
  const tabs = await browser.tabs.query({ url: `${norm}/*` }).catch(() => []);
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    await browser.scripting
      .executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/content.js'] })
      .catch(() => undefined);
  }
}

export async function unsubscribeSite(origin: string): Promise<void> {
  await mutate((s) => {
    s.sites = s.sites.filter((x) => x.origin !== origin);
  });
  await syncContentScripts();
}

/** Make the registered content scripts match the subscribed sites exactly. */
export async function syncContentScripts(): Promise<void> {
  const { sites } = await getState();
  const registered = await browser.scripting.getRegisteredContentScripts();
  if (registered.length) {
    await browser.scripting.unregisterContentScripts({ ids: registered.map((r) => r.id) });
  }
  const scripts: Parameters<typeof browser.scripting.registerContentScripts>[0] = [];
  for (const site of sites) {
    const allowed = await browser.permissions.contains({ origins: [`${site.origin}/*`] });
    if (!allowed) continue;
    scripts.push({
      id: `site:${site.origin}`,
      matches: [`${site.origin}/*`],
      js: ['content-scripts/content.js'],
      runAt: 'document_idle',
      persistAcrossSessions: true,
    });
  }
  if (scripts.length) await browser.scripting.registerContentScripts(scripts);
}
