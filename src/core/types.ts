export const STATUSES = ['reading', 'plan', 'completed', 'dropped'] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  reading: 'Reading',
  plan: 'Plan to read',
  completed: 'Completed',
  dropped: 'Dropped',
};

/** Statuses that Sync checks. Completed and dropped manga are skipped. */
export const SYNCABLE: readonly Status[] = ['reading', 'plan'];

export interface Site {
  /** e.g. "https://asurascans.com" */
  origin: string;
  adapterId: string;
  addedAt: number;
}

export interface Manga {
  /** `${host}::${slug without hash}` */
  id: string;
  siteOrigin: string;
  slug: string;
  title: string;
  coverUrl?: string;
  /** Latest known series page URL (the hash in the URL can change). */
  seriesUrl: string;
  status: Status;
  pinned: boolean;
  lastReadChapter: number | null;
  lastReadUrl?: string;
  lastReadAt?: number;
  latestChapter: number | null;
  latestChapterUrl?: string;
  lastUpdatedAt?: number;
  lastSyncedAt?: number;
  syncError?: string;
  addedAt: number;
}

export interface Settings {
  /** Save the chapter being read automatically. */
  autoTrack: boolean;
  /** Open a background tab when a plain fetch is blocked. */
  bgTabFallback: boolean;
  /** Periodic background sync enabled. */
  periodicSync: boolean;
  /** Interval in minutes between periodic background syncs. */
  periodicSyncInterval: number;
}

export interface AppState {
  sites: Site[];
  mangas: Record<string, Manga>;
  settings: Settings;
  lastSyncAllAt?: number;
}

export interface ChapterInfo {
  number: number;
  url: string;
}

export type PageInfo =
  | {
      kind: 'series';
      slug: string;
      title: string;
      coverUrl?: string;
      seriesUrl: string;
    }
  | {
      kind: 'chapter';
      slug: string;
      chapter: number;
      title?: string;
      seriesUrl: string;
    }
  | { kind: 'other' };

export type MangaPage = Exclude<PageInfo, { kind: 'other' }>;

export interface SeriesData {
  title?: string;
  coverUrl?: string;
  canonicalUrl?: string;
  latest: ChapterInfo | null;
  chapters: ChapterInfo[];
}

export interface SiteAdapter {
  id: string;
  matches(url: URL): boolean;
  /** Runs in the content script, on the page that is open. */
  detectPage(url: URL, doc: Document): PageInfo;
  /** Runs in the service worker on fetched HTML (no DOM available). */
  parseSeries(html: string, seriesUrl: string): SeriesData;
}
