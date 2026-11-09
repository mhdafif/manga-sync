import { escapeRegExp, getCanonical, getHrefs, getMeta, getTitleTag, cleanTitle } from './html';
import { parseChapterNumber, stripHash } from '../core/url';
import type { ChapterInfo, PageInfo, SeriesData, SiteAdapter } from '../core/types';

/**
 * Best-effort adapter for sites without a dedicated one. It looks for URLs that
 * contain "chapter-12", "chapter/12", "ch-12" and so on.
 */
const CHAPTER_SEGMENT = /(?:^|[-_/])(?:chapter|chap|ch)[-_/ ]?(\d+(?:[.-]\d+)?)\/?$/i;
const SERIES_HINT = /\/(?:manga|comic|comics|series|title|titles|webtoon|read|m)\//i;

function numberOf(raw: string): number | null {
  return parseChapterNumber(raw.replace('-', '.'));
}

/** Split a chapter URL path into the series path and the chapter number. */
export function splitChapterPath(pathname: string): { seriesPath: string; chapter: number } | null {
  const trimmed = pathname.replace(/\/+$/, '');
  const m = CHAPTER_SEGMENT.exec(trimmed);
  if (!m) return null;
  const chapter = numberOf(m[1]);
  if (chapter === null) return null;
  // ".../series/chapter-12" or ".../series/chapter/12": the series is what comes before.
  let seriesPath = trimmed.slice(0, m.index);
  seriesPath = seriesPath.replace(/\/(?:chapter|chap|ch)$/i, '');
  if (!seriesPath || seriesPath === '/') return null;
  return { seriesPath, chapter };
}

function lastSegment(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? '';
}

export const genericAdapter: SiteAdapter = {
  id: 'generic',

  matches() {
    return true;
  },

  detectPage(url, doc): PageInfo {
    const split = splitChapterPath(url.pathname);
    if (split) {
      const slug = stripHash(lastSegment(split.seriesPath));
      if (!slug) return { kind: 'other' };
      return {
        kind: 'chapter',
        slug,
        chapter: split.chapter,
        seriesUrl: `${url.origin}${split.seriesPath}`,
      };
    }

    // A series page lists many chapter links and sits under a series-looking path.
    const anchors = [...doc.querySelectorAll<HTMLAnchorElement>('a[href]')];
    const chapterLinks = anchors.filter((a) => {
      try {
        const u = new URL(a.href);
        return u.origin === url.origin && splitChapterPath(u.pathname)?.seriesPath === url.pathname.replace(/\/+$/, '');
      } catch {
        return false;
      }
    });
    if (chapterLinks.length >= 2 || (chapterLinks.length >= 1 && SERIES_HINT.test(url.pathname))) {
      const slug = stripHash(lastSegment(url.pathname));
      if (!slug) return { kind: 'other' };
      return {
        kind: 'series',
        slug,
        title: cleanTitle(doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content || doc.title) ?? slug,
        coverUrl: doc.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content || undefined,
        seriesUrl: `${url.origin}${url.pathname.replace(/\/+$/, '')}`,
      };
    }
    return { kind: 'other' };
  },

  parseSeries(html, seriesUrl): SeriesData {
    const base = new URL(seriesUrl);
    const seriesPath = base.pathname.replace(/\/+$/, '');
    const slug = stripHash(lastSegment(seriesPath));

    const strict: ChapterInfo[] = [];
    const loose: ChapterInfo[] = [];
    for (const href of getHrefs(html)) {
      let u: URL;
      try {
        u = new URL(href, base);
      } catch {
        continue;
      }
      if (u.origin !== base.origin) continue;
      const split = splitChapterPath(u.pathname);
      if (!split) continue;
      const info = { number: split.chapter, url: u.href };
      if (split.seriesPath === seriesPath) strict.push(info);
      else if (slug && new RegExp(escapeRegExp(slug), 'i').test(u.pathname)) loose.push(info);
    }

    const pool = strict.length ? strict : loose;
    const byNumber = new Map<number, ChapterInfo>();
    for (const c of pool) if (!byNumber.has(c.number)) byNumber.set(c.number, c);
    const chapters = [...byNumber.values()].sort((a, b) => a.number - b.number);

    return {
      title: cleanTitle(getMeta(html, 'og:title') ?? getTitleTag(html)),
      coverUrl: getMeta(html, 'og:image'),
      canonicalUrl: getCanonical(html),
      latest: chapters.length ? chapters[chapters.length - 1] : null,
      chapters,
    };
  },
};
