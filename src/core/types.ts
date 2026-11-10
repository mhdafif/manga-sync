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
  /** The newest chapters seen on the last sync (oldest first). Used to find the next chapter. */
  recentChapters?: ChapterInfo[];
  /** Muted manga are left out of the badge count and notifications. */
  muted?: boolean;
  addedAt: number;
}

export type ThemeSetting = 'system' | 'light' | 'dark';

export const SORT_OPTIONS = ['smart', 'updated', 'new', 'read', 'title', 'added'] as const;
export type SortBy = (typeof SORT_OPTIONS)[number];

export const SORT_LABEL: Record<SortBy, string> = {
  smart: 'Smart (updates first)',
  updated: 'Recently updated',
  new: 'Most new chapters',
  read: 'Recently read',
  title: 'Title A–Z',
  added: 'Recently added',
};

/** One change applied to many manga at once. */
export type BulkAction =
  | { kind: 'status'; status: Status }
  | { kind: 'pin'; value: boolean }
  | { kind: 'mute'; value: boolean }
  | { kind: 'markRead' }
  | { kind: 'remove' };

export type FabPositionSetting = 'draggable' | 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface Settings {
  /** Save the chapter being read automatically. */
  autoTrack: boolean;
  /** Open a background tab when a plain fetch is blocked. */
  bgTabFallback: boolean;
  /** Periodic background sync enabled. */
  periodicSync: boolean;
  /** Interval in minutes between periodic background syncs. */
  periodicSyncInterval: number;
  /** Position of floating action button on reading sites. */
  fabPosition: FabPositionSetting;
  /** Desktop notification when periodic sync finds a new chapter. */
  notifications: boolean;
  theme: ThemeSetting;
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
