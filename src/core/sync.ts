import { getAdapter } from '../adapters';
import { fetchSeriesHtml, fetchViaTab } from './fetch';
import { isSyncable } from './logic';
import { getState, mutate } from './storage';
import type { SeriesData } from './types';
import { titleFromSlug } from './url';

const RECENT_CHAPTERS = 20;

/** A chapter that appeared since the previous sync. */
export interface NewChapter {
  id: string;
  title: string;
  chapter: number;
  url: string;
}

async function readSeries(url: string, html: string): Promise<SeriesData> {
  const data = getAdapter(new URL(url)).parseSeries(html, url);
  if (!data.latest) throw new Error('No chapters found on the page');
  return data;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Check one manga for its latest chapter and save the result. */
export async function syncOne(id: string): Promise<NewChapter | null> {
  const state = await getState();
  const manga = state.mangas[id];
  if (!manga) return null;

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

  return mutate((s): NewChapter | null => {
    const cur = s.mangas[id];
    if (!cur) return null;
    cur.lastSyncedAt = Date.now();
    if (!data || error) {
      cur.syncError = error ?? 'Sync failed';
      return null;
    }
    cur.syncError = undefined;
    // A title built from the slug is only a placeholder until the first sync.
    if (data.title && (cur.title === titleFromSlug(cur.slug) || !cur.title)) cur.title = data.title;
    if (data.coverUrl) cur.coverUrl = data.coverUrl;
    if (data.canonicalUrl) cur.seriesUrl = data.canonicalUrl;
    const previous = cur.latestChapter;
    const newLatest = data.latest!.number;
    if (cur.latestChapter !== newLatest) {
      cur.latestChapter = newLatest;
      cur.lastUpdatedAt = Date.now();
    } else if (!cur.lastUpdatedAt) {
      cur.lastUpdatedAt = cur.addedAt;
    }
    cur.latestChapterUrl = data.latest!.url;
    cur.recentChapters = data.chapters.slice(-RECENT_CHAPTERS).map((c) => ({ number: c.number, url: c.url }));
    if (previous !== null && newLatest > previous && !cur.muted) {
      return { id: cur.id, title: cur.title, chapter: newLatest, url: data.latest!.url };
    }
    return null;
  });
}

/** Run `worker` over `items`, at most `limit` at a time. */
export async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<unknown>): Promise<void> {
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
export async function syncAll(): Promise<NewChapter[]> {
  const { mangas } = await getState();
  const ids = Object.values(mangas)
    .filter(isSyncable)
    .map((m) => m.id);
  const found: NewChapter[] = [];
  await runPool(ids, 3, async (id) => {
    const news = await syncOne(id);
    if (news) found.push(news);
  });
  await mutate((s) => {
    s.lastSyncAllAt = Date.now();
  });
  return found;
}
