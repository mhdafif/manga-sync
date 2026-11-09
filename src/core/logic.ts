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
  return changed;
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
