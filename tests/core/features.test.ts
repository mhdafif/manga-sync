import { describe, expect, it } from 'vitest';
import { buildBackup, mergeMangas, missingSites, parseBackup } from '../../src/core/backup';
import { applyBulkAction, countReadingUpdates, markAsRead, nextChapter, sortMangas } from '../../src/core/logic';
import { emptyState } from '../../src/core/storage';
import type { Manga } from '../../src/core/types';

function manga(overrides: Partial<Manga> = {}): Manga {
  return {
    id: 'a.com::one',
    siteOrigin: 'https://a.com',
    slug: 'one',
    title: 'One',
    seriesUrl: 'https://a.com/one',
    status: 'reading',
    pinned: false,
    lastReadChapter: 10,
    latestChapter: 15,
    latestChapterUrl: 'https://a.com/one/15',
    addedAt: 1000,
    ...overrides,
  };
}

describe('mark as read and bulk actions', () => {
  it('moves progress to the latest chapter', () => {
    const m = manga();
    expect(markAsRead(m)).toBe(true);
    expect(m.lastReadChapter).toBe(15);
    expect(m.lastReadUrl).toBe('https://a.com/one/15');
    expect(markAsRead(m)).toBe(false);
  });

  it('applies status, pin and mute actions', () => {
    const m = manga();
    applyBulkAction(m, { kind: 'status', status: 'dropped' });
    applyBulkAction(m, { kind: 'pin', value: true });
    applyBulkAction(m, { kind: 'mute', value: true });
    expect(m).toMatchObject({ status: 'dropped', pinned: true, muted: true });
  });

  it('leaves muted manga out of the badge count', () => {
    expect(countReadingUpdates([manga(), manga({ id: 'b', muted: true })])).toBe(1);
  });
});

describe('nextChapter', () => {
  const recent = [12, 13, 14, 15].map((n) => ({ number: n, url: `https://a.com/one/${n}` }));

  it('finds the first chapter after the last read one', () => {
    expect(nextChapter(manga({ lastReadChapter: 13, recentChapters: recent }))?.number).toBe(14);
  });

  it('is null when nothing newer is known', () => {
    expect(nextChapter(manga({ lastReadChapter: 15, recentChapters: recent }))).toBeNull();
    expect(nextChapter(manga())).toBeNull();
  });
});

describe('sortMangas', () => {
  const a = manga({ id: 'a', title: 'Bravo', lastReadAt: 5, lastReadChapter: 1, latestChapter: 2 });
  const b = manga({ id: 'b', title: 'Alpha', lastReadAt: 9, lastReadChapter: 1, latestChapter: 9 });
  const c = manga({ id: 'c', title: 'Charlie', pinned: true, lastReadAt: 1, lastReadChapter: 1, latestChapter: 1 });

  it('sorts by title and keeps pinned first', () => {
    expect(sortMangas([a, b, c], 'title').map((m) => m.id)).toEqual(['c', 'b', 'a']);
  });

  it('sorts by recently read', () => {
    expect(sortMangas([a, b], 'read').map((m) => m.id)).toEqual(['b', 'a']);
  });

  it('sorts by most new chapters', () => {
    expect(sortMangas([a, b], 'new').map((m) => m.id)).toEqual(['b', 'a']);
  });
});

describe('backup', () => {
  it('round-trips through JSON', () => {
    const state = emptyState();
    state.mangas['a.com::one'] = manga();
    const parsed = parseBackup(JSON.stringify(buildBackup(state)));
    expect(parsed.mangas).toHaveLength(1);
    expect(parsed.mangas[0].title).toBe('One');
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('nope')).toThrow(/JSON/);
    expect(() => parseBackup('{"hello":1}')).toThrow(/backup/);
  });

  it('adds new manga and keeps the furthest progress on conflicts', () => {
    const existing = { 'a.com::one': manga({ lastReadChapter: 10, lastReadAt: 100 }) };
    const result = mergeMangas(existing, [
      manga({ lastReadChapter: 14, lastReadAt: 200 }),
      manga({ id: 'a.com::two', slug: 'two' }),
    ]);
    expect(result).toEqual({ added: 1, updated: 1 });
    expect(existing['a.com::one'].lastReadChapter).toBe(14);

    const older = mergeMangas(existing, [manga({ lastReadChapter: 3, lastReadAt: 50 })]);
    expect(older.updated).toBe(0);
    expect(existing['a.com::one'].lastReadChapter).toBe(14);
  });

  it('lists sites that still need a subscription', () => {
    expect(missingSites([manga(), manga({ id: 'x', siteOrigin: 'https://b.com' })], ['https://a.com'])).toEqual([
      'https://b.com',
    ]);
  });
});
