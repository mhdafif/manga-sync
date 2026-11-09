import { describe, expect, it } from 'vitest';
import { formatChapter, hostOf, mangaId, normalizeOrigin, parseChapterNumber, stripHash, titleFromSlug } from '../../src/core/url';

describe('core/url', () => {
  it('normalizes origins correctly', () => {
    expect(normalizeOrigin('asurascans.com')).toBe('https://asurascans.com');
    expect(normalizeOrigin('https://asurascans.com/comics/nano')).toBe('https://asurascans.com');
    expect(normalizeOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeOrigin('invalid://bad')).toBeNull();
    expect(normalizeOrigin('')).toBeNull();
  });

  it('extracts host from origin', () => {
    expect(hostOf('https://asurascans.com')).toBe('asurascans.com');
    expect(hostOf('http://sub.domain.org:8080')).toBe('sub.domain.org:8080');
  });

  it('strips hash suffixes from slugs', () => {
    expect(stripHash('nano-machine-ab39de10')).toBe('nano-machine');
    expect(stripHash('nano-machine-f212c582')).toBe('nano-machine');
    // Slug ending with real word or short text without hex digits should not be stripped
    expect(stripHash('solo-leveling')).toBe('solo-leveling');
    expect(stripHash('chapter-one')).toBe('chapter-one');
  });

  it('builds canonical manga ID from origin and slug', () => {
    expect(mangaId('https://asurascans.com', 'nano-machine')).toBe('asurascans.com::nano-machine');
  });

  it('parses chapter numbers including decimals', () => {
    expect(parseChapterNumber('12')).toBe(12);
    expect(parseChapterNumber('12.5')).toBe(12.5);
    expect(parseChapterNumber('100.1')).toBe(100.1);
    expect(parseChapterNumber('invalid')).toBeNull();
  });

  it('formats chapter numbers', () => {
    expect(formatChapter(12)).toBe('12');
    expect(formatChapter(12.5)).toBe('12.5');
  });

  it('generates readable title from slug', () => {
    expect(titleFromSlug('nano-machine')).toBe('Nano Machine');
    expect(titleFromSlug('solo-leveling-ragnarok')).toBe('Solo Leveling Ragnarok');
  });
});
