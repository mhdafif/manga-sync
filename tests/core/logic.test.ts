import { describe, expect, it } from 'vitest';
import { applyProgress, countReadingUpdates, countUpdates, groupByDomain, hasUpdate, isSyncable, newCount, sortMangas } from '../../src/core/logic';
import type { Manga } from '../../src/core/types';

function createManga(overrides: Partial<Manga> = {}): Manga {
  return {
    id: 'asurascans.com::nano-machine',
    siteOrigin: 'https://asurascans.com',
    slug: 'nano-machine',
    title: 'Nano Machine',
    seriesUrl: 'https://asurascans.com/comics/nano-machine',
    status: 'reading',
    pinned: false,
    lastReadChapter: 10,
    latestChapter: 15,
    addedAt: 1000,
    ...overrides,
  };
}

describe('core/logic', () => {
  it('detects updates only for active manga with higher latestChapter', () => {
    const readingWithUpdate = createManga({ status: 'reading', lastReadChapter: 10, latestChapter: 15 });
    expect(hasUpdate(readingWithUpdate)).toBe(true);
    expect(newCount(readingWithUpdate)).toBe(5);

    const planWithUpdate = createManga({ status: 'plan', lastReadChapter: null, latestChapter: 5 });
    expect(hasUpdate(planWithUpdate)).toBe(true);
    expect(newCount(planWithUpdate)).toBe(5);

    const completed = createManga({ status: 'completed', lastReadChapter: 10, latestChapter: 15 });
    expect(hasUpdate(completed)).toBe(false);

    const dropped = createManga({ status: 'dropped', lastReadChapter: 10, latestChapter: 15 });
    expect(hasUpdate(dropped)).toBe(false);

    const upToDate = createManga({ status: 'reading', lastReadChapter: 15, latestChapter: 15 });
    expect(hasUpdate(upToDate)).toBe(false);
  });

  it('counts updates only for reading category with countReadingUpdates', () => {
    const readingWithUpdate1 = createManga({ id: 'r1', status: 'reading', lastReadChapter: 10, latestChapter: 15 });
    const readingWithUpdate2 = createManga({ id: 'r2', status: 'reading', lastReadChapter: 20, latestChapter: 22 });
    const readingUpToDate = createManga({ id: 'r3', status: 'reading', lastReadChapter: 10, latestChapter: 10 });
    const planWithUpdate = createManga({ id: 'p1', status: 'plan', lastReadChapter: null, latestChapter: 5 });
    const completedWithUpdate = createManga({ id: 'c1', status: 'completed', lastReadChapter: 5, latestChapter: 10 });
    const droppedWithUpdate = createManga({ id: 'd1', status: 'dropped', lastReadChapter: 5, latestChapter: 10 });

    const list = [
      readingWithUpdate1,
      readingWithUpdate2,
      readingUpToDate,
      planWithUpdate,
      completedWithUpdate,
      droppedWithUpdate,
    ];

    // countUpdates includes reading + plan
    expect(countUpdates(list)).toBe(3);

    // countReadingUpdates only includes status === 'reading' with new chapters
    expect(countReadingUpdates(list)).toBe(2);
  });

  it('checks syncable status (reading and plan only)', () => {
    expect(isSyncable(createManga({ status: 'reading' }))).toBe(true);
    expect(isSyncable(createManga({ status: 'plan' }))).toBe(true);
    expect(isSyncable(createManga({ status: 'completed' }))).toBe(false);
    expect(isSyncable(createManga({ status: 'dropped' }))).toBe(false);
  });

  it('applies progress and ensures progress only increases unless forced', () => {
    const m = createManga({ lastReadChapter: 10, lastReadUrl: 'ch-10' });
    
    // Higher chapter updates progress
    const forward = applyProgress(m, 12, 'ch-12');
    expect(forward).toBe(true);
    expect(m.lastReadChapter).toBe(12);
    expect(m.lastReadUrl).toBe('ch-12');

    // Lower chapter does NOT revert progress
    const backward = applyProgress(m, 5, 'ch-5');
    expect(backward).toBe(false);
    expect(m.lastReadChapter).toBe(12);

    // Forced update allows setting lower chapter
    const forced = applyProgress(m, 5, 'ch-5', true);
    expect(forced).toBe(true);
    expect(m.lastReadChapter).toBe(5);
  });

  it('sorts mangas: pinned first, then hasUpdate, then status rank, then addedAt', () => {
    const m1 = createManga({ id: '1', title: 'Normal Reading', pinned: false, lastReadChapter: 10, latestChapter: 10, status: 'reading', addedAt: 100 });
    const m2 = createManga({ id: '2', title: 'With Update', pinned: false, lastReadChapter: 10, latestChapter: 20, status: 'reading', addedAt: 200 });
    const m3 = createManga({ id: '3', title: 'Pinned Manga', pinned: true, lastReadChapter: 10, latestChapter: 10, status: 'reading', addedAt: 50 });
    const m4 = createManga({ id: '4', title: 'Completed', pinned: false, status: 'completed', addedAt: 300 });

    const sorted = sortMangas([m1, m2, m3, m4]);
    expect(sorted.map(m => m.id)).toEqual(['3', '2', '1', '4']);
  });

  it('groups mangas by domain and counts updates per group', () => {
    const m1 = createManga({ id: '1', siteOrigin: 'https://asurascans.com', lastReadChapter: 10, latestChapter: 20 });
    const m2 = createManga({ id: '2', siteOrigin: 'https://mangadex.org', lastReadChapter: 10, latestChapter: 10 });
    const m3 = createManga({ id: '3', siteOrigin: 'https://mangadex.org', lastReadChapter: 10, latestChapter: 15 });

    const groups = groupByDomain([m1, m2, m3], (origin) => new URL(origin).host);
    expect(groups.length).toBe(2);
    // mangadex.org and asurascans.com each have 1 update, but sorted by updates then domain
    expect(groups.map(g => g.domain).sort()).toEqual(['asurascans.com', 'mangadex.org']);
  });

  it('separates pinned mangas above domain groups', () => {
    const p1 = createManga({ id: 'p1', title: 'Pinned Asura', pinned: true, siteOrigin: 'https://asurascans.com' });
    const u1 = createManga({ id: 'u1', title: 'Unpinned Asura', pinned: false, siteOrigin: 'https://asurascans.com' });
    const u2 = createManga({ id: 'u2', title: 'Unpinned MangaDex', pinned: false, siteOrigin: 'https://mangadex.org' });

    const all = [p1, u1, u2];
    const pinned = all.filter((m) => m.pinned);
    const unpinned = all.filter((m) => !m.pinned);
    const domainGroups = groupByDomain(unpinned, (origin) => new URL(origin).host);

    expect(pinned.length).toBe(1);
    expect(pinned[0].id).toBe('p1');
    expect(domainGroups.length).toBe(2);
    expect(domainGroups.some((g) => g.items.some((m) => m.id === 'p1'))).toBe(false);
  });
});
