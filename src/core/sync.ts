import { getAdapter } from '../adapters';
import { fetchSeriesHtml, fetchViaTab } from './fetch';
import { isSyncable, shouldSyncManga } from './logic';
import { getState, mutate } from './storage';
import type { SeriesData } from './types';
import { titleFromSlug } from './url';

const RECENT_CHAPTERS = 20;
const DOMAIN_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown if 429 or challenge
const domainCooldowns = new Map<string, number>();

export function isDomainInCooldown(origin: string): boolean {
  const until = domainCooldowns.get(origin);
  if (!until) return false;
  if (Date.now() > until) {
    domainCooldowns.delete(origin);
    return false;
  }
  return true;
}

export function setDomainCooldown(origin: string): void {
  domainCooldowns.set(origin, Date.now() + DOMAIN_COOLDOWN_MS);
}

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

  if (isDomainInCooldown(manga.siteOrigin)) {
    return mutate((s): NewChapter | null => {
      const cur = s.mangas[id];
      if (cur) cur.syncError = 'Site temporarily rate-limited; paused to protect your IP';
      return null;
    });
  }

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

  if (error && /429|bot check|rate limit|too many requests/i.test(error)) {
    setDomainCooldown(manga.siteOrigin);
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

let activeSyncAllPromise: Promise<NewChapter[]> | null = null;

/** Sync every manga that is Reading or Plan. Requests to the same domain are throttled sequentially to avoid rate limits. */
export async function syncAll(): Promise<NewChapter[]> {
  if (activeSyncAllPromise) {
    return activeSyncAllPromise;
  }

  activeSyncAllPromise = (async () => {
    await mutate((s) => {
      s.isSyncing = true;
    });

    try {
      const { mangas, settings } = await getState();
      const minDays = settings.syncMinDaysSinceUpdate ?? 3;
      const now = Date.now();
      const syncable = Object.values(mangas).filter((m) => shouldSyncManga(m, minDays, now));
      if (syncable.length === 0) return [];

      // Group manga by domain origin
      const byOrigin = new Map<string, typeof syncable>();
      for (const m of syncable) {
        const list = byOrigin.get(m.siteOrigin) ?? [];
        list.push(m);
        byOrigin.set(m.siteOrigin, list);
      }

      const found: NewChapter[] = [];
      const originEntries = [...byOrigin.entries()];

      // Process different domains in parallel (max 2 at once), but manga belonging to
      // the SAME domain are processed strictly sequentially with a polite delay (1500ms).
      await runPool(originEntries, 2, async ([origin, originMangas]) => {
        for (let i = 0; i < originMangas.length; i++) {
          const m = originMangas[i];
          if (isDomainInCooldown(origin)) {
            // Abort further requests to this domain during this sync run if rate limited
            break;
          }
          const news = await syncOne(m.id);
          if (news) found.push(news);

          // Polite delay between consecutive requests to the SAME domain
          if (i < originMangas.length - 1 && !isDomainInCooldown(origin)) {
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
      });

      return found;
    } finally {
      await mutate((s) => {
        s.isSyncing = false;
        s.lastSyncAllAt = Date.now();
      });
      activeSyncAllPromise = null;
    }
  })();

  return activeSyncAllPromise;
}
