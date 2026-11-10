import { STATUSES, type AppState, type Manga, type Settings } from './types';

export const BACKUP_VERSION = 1;

export interface Backup {
  app: 'manga-sync';
  version: number;
  exportedAt: number;
  mangas: Manga[];
  settings: Partial<Settings>;
  /** Informational only. Sites need a fresh permission grant, so they are not imported. */
  sites: string[];
}

export function buildBackup(state: AppState): Backup {
  return {
    app: 'manga-sync',
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    mangas: Object.values(state.mangas),
    settings: state.settings,
    sites: state.sites.map((s) => s.origin),
  };
}

function isManga(v: unknown): v is Manga {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.siteOrigin === 'string' &&
    typeof m.slug === 'string' &&
    typeof m.title === 'string' &&
    typeof m.seriesUrl === 'string' &&
    typeof m.status === 'string' &&
    (STATUSES as readonly string[]).includes(m.status) &&
    typeof m.addedAt === 'number'
  );
}

/** Parse and validate a backup file. Throws an Error with a readable message. */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON');
  }
  const data = raw as Partial<Backup> | null;
  if (!data || data.app !== 'manga-sync' || !Array.isArray(data.mangas)) {
    throw new Error('This is not a Manga Sync backup file');
  }
  const mangas = data.mangas.filter(isManga).map((m) => ({ ...m, pinned: Boolean(m.pinned) }));
  if (mangas.length === 0 && data.mangas.length > 0) {
    throw new Error('No valid manga found in this backup');
  }
  return {
    app: 'manga-sync',
    version: data.version ?? BACKUP_VERSION,
    exportedAt: data.exportedAt ?? 0,
    mangas,
    settings: data.settings && typeof data.settings === 'object' ? data.settings : {},
    sites: Array.isArray(data.sites) ? data.sites.filter((s): s is string => typeof s === 'string') : [],
  };
}

/** Is `a` further along than `b`? Used to keep the best progress when both sides have the manga. */
function isFurther(a: Manga, b: Manga): boolean {
  const ar = a.lastReadAt ?? 0;
  const br = b.lastReadAt ?? 0;
  if (ar !== br) return ar > br;
  return (a.lastReadChapter ?? 0) > (b.lastReadChapter ?? 0);
}

/** Merge imported manga into `existing`. New ones are added; known ones keep the furthest progress. */
export function mergeMangas(
  existing: Record<string, Manga>,
  imported: Manga[],
): { added: number; updated: number } {
  let added = 0;
  let updated = 0;
  for (const m of imported) {
    const cur = existing[m.id];
    if (!cur) {
      existing[m.id] = m;
      added++;
      continue;
    }
    if (isFurther(m, cur)) {
      cur.lastReadChapter = m.lastReadChapter;
      cur.lastReadUrl = m.lastReadUrl;
      cur.lastReadAt = m.lastReadAt;
      cur.status = m.status;
      cur.pinned = m.pinned;
      cur.muted = m.muted;
      updated++;
    }
  }
  return { added, updated };
}

/** Origins used by manga that are not in the subscribed list, so the user knows what to re-add. */
export function missingSites(mangas: Manga[], subscribed: string[]): string[] {
  return [...new Set(mangas.map((m) => m.siteOrigin))].filter((o) => !subscribed.includes(o));
}
