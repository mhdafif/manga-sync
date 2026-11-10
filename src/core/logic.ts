import { SYNCABLE, type Manga, type Status } from './types';

/** A manga has an update when it is still being followed and a newer chapter exists. */
export function hasUpdate(m: Manga): boolean {
  if (m.status === 'dropped' || m.status === 'completed') return false;
  if (m.latestChapter === null) return false;
  return m.latestChapter > (m.lastReadChapter ?? 0);
}

/** How many chapters are waiting. */
export function newCount(m: Manga): number {
  if (!hasUpdate(m)) return 0;
  return Math.max(1, Math.floor(m.latestChapter! - (m.lastReadChapter ?? 0)));
}

export function countUpdates(mangas: Manga[]): number {
  return mangas.filter(hasUpdate).length;
}

/**
 * Count how many manga currently in the 'reading' category have new chapters.
 * Used specifically for the extension icon badge.
 */
export function countReadingUpdates(mangas: Manga[]): number {
  return mangas.filter((m) => m.status === 'reading' && hasUpdate(m)).length;
}

export function isSyncable(m: Manga): boolean {
  return SYNCABLE.includes(m.status);
}

/**
 * Progress only moves forward, so opening an old chapter never lowers it.
 * `force` is for an explicit "set my progress to this" action.
 */
export function applyProgress(m: Manga, chapter: number, url: string, force = false): boolean {
  if (!force && m.lastReadChapter !== null && chapter < m.lastReadChapter) return false;
  const changed = m.lastReadChapter !== chapter || m.lastReadUrl !== url;
  m.lastReadChapter = chapter;
  m.lastReadUrl = url;
  m.lastReadAt = Date.now();
  return changed;
}

/** Format timestamp into human-readable relative time (e.g. "5m ago", "2h ago", "3d ago"). */
export function timeAgo(timestamp?: number): string {
  if (!timestamp) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  const diffYear = Math.floor(diffDay / 365);
  return `${diffYear}y ago`;
}

const STATUS_RANK: Record<Status, number> = { reading: 0, plan: 1, completed: 2, dropped: 3 };

/** pinned → has update → status → most recently added. */
export function compareMangas(a: Manga, b: Manga): number {
  return (
    Number(b.pinned) - Number(a.pinned) ||
    Number(hasUpdate(b)) - Number(hasUpdate(a)) ||
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    b.addedAt - a.addedAt
  );
}

export function sortMangas(mangas: Manga[]): Manga[] {
  return [...mangas].sort(compareMangas);
}

export interface MangaGroup {
  /** Host, e.g. "asurascans.com" */
  domain: string;
  items: Manga[];
  updates: number;
}

/** Group by domain: most updates first, then alphabetical. Items keep their order. */
export function groupByDomain(mangas: Manga[], hostOf: (origin: string) => string): MangaGroup[] {
  const map = new Map<string, Manga[]>();
  for (const m of mangas) {
    const domain = hostOf(m.siteOrigin);
    const list = map.get(domain);
    if (list) list.push(m);
    else map.set(domain, [m]);
  }
  return [...map.entries()]
    .map(([domain, items]) => ({ domain, items, updates: countUpdates(items) }))
    .sort((a, b) => b.updates - a.updates || a.domain.localeCompare(b.domain));
}
