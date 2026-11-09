import { escapeRegExp, getCanonical, getHrefs, getMeta, getTitleTag, cleanTitle } from './html';
import { parseChapterNumber, stripHash } from '../core/url';
import type { ChapterInfo, PageInfo, SeriesData, SiteAdapter } from '../core/types';

// /comics/<slug>-<hash>            → series page
// /comics/<slug>-<hash>/chapter/12 → chapter page
const PATH = /^\/comics\/([^/]+)(?:\/chapter\/(\d+(?:\.\d+)?))?\/?$/;

function coverFromHtml(html: string): string | undefined {
  // JSON-LD ComicSeries image, e.g. https://cdn.asurascans.com/.../covers/nano-machine.e31bdb.webp
  const ld = /"image"\s*:\s*"(https?:[^"]*\/covers\/[^"]+)"/.exec(html);
  if (ld) return ld[1].replace(/\\\//g, '/');
  const img = /<img\b[^>]*\ssrc="(https?:[^"]*\/covers\/[^"]+)"/i.exec(html);
  if (img) return img[1];
  return getMeta(html, 'og:image');
}

export const asuraAdapter: SiteAdapter = {
  id: 'asura',

  matches(url) {
    return url.hostname === 'asurascans.com' || url.hostname.endsWith('.asurascans.com');
  },

  detectPage(url, doc): PageInfo {
    const m = PATH.exec(url.pathname);
    if (!m) return { kind: 'other' };
    const slugWithHash = m[1];
    const slug = stripHash(slugWithHash);
    const seriesUrl = `${url.origin}/comics/${slugWithHash}`;
    if (m[2] !== undefined) {
      const chapter = parseChapterNumber(m[2]);
      if (chapter === null) return { kind: 'other' };
      return { kind: 'chapter', slug, chapter, seriesUrl };
    }
    const cover = doc.querySelector<HTMLImageElement>('img[src*="/covers/"]')?.src;
    return {
      kind: 'series',
      slug,
      title: cleanTitle(doc.title) ?? slug,
      coverUrl: cover || doc.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content || undefined,
      seriesUrl,
    };
  },

  parseSeries(html, seriesUrl): SeriesData {
    const base = new URL(seriesUrl);
    const m = /^\/comics\/([^/]+)/.exec(base.pathname);
    const slug = m ? stripHash(m[1]) : '';
    // Only this series: the page also links to other comics' chapters.
    const own = new RegExp(`^/comics/${escapeRegExp(slug)}(?:-[0-9a-f]{6,10})?/chapter/(\\d+(?:\\.\\d+)?)/?$`);

    const byNumber = new Map<number, ChapterInfo>();
    for (const href of getHrefs(html)) {
      let path: string;
      try {
        path = new URL(href, base).pathname;
      } catch {
        continue;
      }
      const hit = own.exec(path);
      if (!hit) continue;
      const number = parseChapterNumber(hit[1]);
      if (number === null || byNumber.has(number)) continue;
      byNumber.set(number, { number, url: new URL(href, base).href });
    }
    const chapters = [...byNumber.values()].sort((a, b) => a.number - b.number);

    return {
      title: cleanTitle(getMeta(html, 'og:title') ?? getTitleTag(html)),
      coverUrl: coverFromHtml(html),
      canonicalUrl: getCanonical(html),
      latest: chapters.length ? chapters[chapters.length - 1] : null,
      chapters,
    };
  },
};
