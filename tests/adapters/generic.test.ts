import { describe, expect, it } from 'vitest';
import { genericAdapter, splitChapterPath } from '../../src/adapters/generic';

describe('adapters/generic', () => {
  it('splits chapter path into series path and chapter number', () => {
    expect(splitChapterPath('/manga/solo-leveling/chapter-12')).toEqual({
      seriesPath: '/manga/solo-leveling',
      chapter: 12,
    });
    expect(splitChapterPath('/series/eleceed/ch-50.5')).toEqual({
      seriesPath: '/series/eleceed',
      chapter: 50.5,
    });
    expect(splitChapterPath('/comics/lookism/chapter/400/')).toEqual({
      seriesPath: '/comics/lookism',
      chapter: 400,
    });
    expect(splitChapterPath('/not-a-chapter/')).toBeNull();
  });

  it('parses series HTML with chapter links', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Eleceed - Read Online</title>
          <meta property="og:image" content="https://example.com/eleceed.jpg" />
        </head>
        <body>
          <a href="/series/eleceed/chapter-1">Ch 1</a>
          <a href="/series/eleceed/chapter-2">Ch 2</a>
          <a href="/series/eleceed/chapter-20.5">Ch 20.5</a>
        </body>
      </html>
    `;
    const data = genericAdapter.parseSeries(html, 'https://example.com/series/eleceed');
    expect(data.title).toBe('Eleceed');
    expect(data.coverUrl).toBe('https://example.com/eleceed.jpg');
    expect(data.latest?.number).toBe(20.5);
    expect(data.latest?.url).toBe('https://example.com/series/eleceed/chapter-20.5');
    expect(data.chapters.length).toBe(3);
  });
});
