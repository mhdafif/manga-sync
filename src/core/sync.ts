import { getAdapter } from '../adapters';
import { fetchSeriesHtml, fetchViaTab } from './fetch';
import { isSyncable } from './logic';
import { getState, mutate } from './storage';
import type { SeriesData } from './types';
import { titleFromSlug } from './url';

async function readSeries(url: string, html: string): Promise<SeriesData> {
  const data = getAdapter(new URL(url)).parseSeries(html, url);
  if (!data.latest) throw new Error('No chapters found on the page');
  return data;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Check one manga for its latest chapter and save the result. */
export async function syncOne(id: string): Promise<void> {
  const state = await getState();
  const manga = state.mangas[id];
  if (!manga) return;

  let data: SeriesData | null = null;
  let error: string | undefined;

  if (!state.sites.some((s) => s.origin === manga.siteOrigin)) {
    error = 'This site is no longer subscribed';
  } else {
    try {
      data = await readSeries(manga.seriesUrl, await fetchSeriesHtml(manga.seriesUrl));
    } catch (e) {
      error = message(e);
      if (state.settings.bgTabFallback) {
        try {
          data = await readSeries(manga.seriesUrl, await fetchViaTab(manga.seriesUrl));
          error = undefined;
        } catch (e2) {
          error = message(e2);
        }
      }
    }
  }

  await mutate((s) => {
    const cur = s.mangas[id];
    if (!cur) return;
    cur.lastSyncedAt = Date.now();
    if (!data || error) {
      cur.syncError = error ?? 'Sync failed';
      return;
    }
    cur.syncError = undefined;
    // A title built from the slug is only a placeholder until the first sync.
    if (data.title && (cur.title === titleFromSlug(cur.slug) || !cur.title)) cur.title = data.title;
    if (data.coverUrl) cur.coverUrl = data.coverUrl;
    if (data.canonicalUrl) cur.seriesUrl = data.canonicalUrl;
    const newLatest = data.latest!.number;
    if (cur.latestChapter !== newLatest) {
      cur.latestChapter = newLatest;
      cur.lastUpdatedAt = Date.now();
    } else if (!cur.lastUpdatedAt) {
      cur.lastUpdatedAt = cur.addedAt;
    }
    cur.latestChapterUrl = data.latest!.url;
  });
}

/** Run `worker` over `items`, at most `limit` at a time. */
export async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item).catch(() => undefined);
    }
  });
  await Promise.all(lanes);
}

/** Sync every manga that is Reading or Plan, three at a time. */
export async function syncAll(): Promise<void> {
  const { mangas } = await getState();
  const ids = Object.values(mangas)
    .filter(isSyncable)
    .map((m) => m.id);
  await runPool(ids, 3, syncOne);
  await mutate((s) => {
    s.lastSyncAllAt = Date.now();
  });
}
