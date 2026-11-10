/**
 * Turn what a user typed ("mangadex.org", "https://x.com/path") into an origin
 * ("https://mangadex.org"). Returns null for anything that is not http(s).
 */
export function normalizeOrigin(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.') && url.hostname !== 'localhost' && !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

/**
 * Remove a trailing hash like "-ab39de10" from a slug. The hash must contain a
 * digit so a real word made of a-f letters ("effaced") is left alone.
 */
export function stripHash(slug: string): string {
  const match = /^(.+)-([0-9a-f]{6,10})$/.exec(slug);
  if (match && /\d/.test(match[2])) return match[1];
  return slug;
}

export function mangaId(origin: string, slug: string): string {
  return `${hostOf(origin)}::${slug}`;
}

export function parseChapterNumber(text: string): number | null {
  const n = Number.parseFloat(text);
  return Number.isFinite(n) ? n : null;
}

/** 12 → "12", 10.5 → "10.5" */
export function formatChapter(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

export function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Heuristic detector to check if a URL/domain or page title represents a manga/comic website.
 */
export function isMangaWebsite(url?: string, title?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();

    // Common non-manga websites
    const nonManga = [
      'google.com', 'youtube.com', 'github.com', 'facebook.com', 'twitter.com', 'x.com',
      'instagram.com', 'reddit.com', 'wikipedia.org', 'linkedin.com', 'amazon.com', 'netflix.com',
      'apple.com', 'microsoft.com', 'bing.com', 'yahoo.com', 'spotify.com', 'twitch.tv',
      'stackoverflow.com', 'medium.com', 'gitlab.com', 'figma.com', 'notion.so'
    ];
    if (nonManga.some((domain) => host === domain || host.endsWith(`.${domain}`))) return false;

    // Domain keywords
    const mangaHostRegex = /(manga|manhwa|manhua|comic|scan|komik|toon|raw|read|otaku|doujin|bato)/i;
    if (mangaHostRegex.test(host)) return true;

    // URL path keywords
    const path = parsed.pathname.toLowerCase();
    const mangaPathRegex = /\/(manga|manhwa|manhua|comic|comics|series|chapter|ch-|read|komik|webtoon)\b/i;
    if (mangaPathRegex.test(path)) return true;

    // Page title keywords
    if (title) {
      const mangaTitleRegex = /(chapter|ch\.|manga|manhwa|manhua|comic|komik|read online|webtoon|scanlation)/i;
      if (mangaTitleRegex.test(title)) return true;
    }

    return false;
  } catch {
    return false;
  }
}
