import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { asuraAdapter } from '../../src/adapters/asura';

describe('adapters/asura', () => {
  it('matches asurascans.com domains', () => {
    expect(asuraAdapter.matches(new URL('https://asurascans.com'))).toBe(true);
    expect(asuraAdapter.matches(new URL('https://sub.asurascans.com/test'))).toBe(true);
    expect(asuraAdapter.matches(new URL('https://example.com'))).toBe(false);
  });

  it('parses series HTML fixture correctly', () => {
    const fixturePath = resolve(__dirname, '../fixtures/asura-series.html');
    const html = readFileSync(fixturePath, 'utf8');
    const seriesUrl = 'https://asurascans.com/comics/nano-machine-f212c582';

    const result = asuraAdapter.parseSeries(html, seriesUrl);
    expect(result.title).toBe('Nano Machine');
    expect(result.canonicalUrl).toBe('https://asurascans.com/comics/nano-machine-f212c582');
    expect(result.coverUrl).toBe('https://cdn.asurascans.com/asura-images/covers/nano-machine.e31bdb.webp');
    expect(result.latest).not.toBeNull();
    expect(result.latest?.number).toBe(337);
    expect(result.latest?.url).toBe('https://asurascans.com/comics/nano-machine-f212c582/chapter/337');
    expect(result.chapters.length).toBeGreaterThan(0);
  });

  it('detects page info from URL in mock DOM', () => {
    const mockDoc = {
      title: 'Nano Machine | Asura Scans',
      querySelector: () => null,
    } as unknown as Document;

    const seriesUrl = new URL('https://asurascans.com/comics/nano-machine-ab39de10');
    const seriesPage = asuraAdapter.detectPage(seriesUrl, mockDoc);
    expect(seriesPage.kind).toBe('series');
    if (seriesPage.kind === 'series') {
      expect(seriesPage.slug).toBe('nano-machine');
      expect(seriesPage.title).toBe('Nano Machine');
    }

    const chapterUrl = new URL('https://asurascans.com/comics/nano-machine-ab39de10/chapter/12');
    const chapterPage = asuraAdapter.detectPage(chapterUrl, mockDoc);
    expect(chapterPage.kind).toBe('chapter');
    if (chapterPage.kind === 'chapter') {
      expect(chapterPage.slug).toBe('nano-machine');
      expect(chapterPage.chapter).toBe(12);
    }

    const homeUrl = new URL('https://asurascans.com/');
    expect(asuraAdapter.detectPage(homeUrl, mockDoc).kind).toBe('other');
  });
});
