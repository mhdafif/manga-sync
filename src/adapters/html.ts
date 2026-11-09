/** Small HTML helpers that work in a service worker (no DOMParser there). */

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export function getTitleTag(html: string): string | undefined {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() || undefined : undefined;
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? decodeEntities(m[2] ?? m[3] ?? '') : undefined;
}

export function getMeta(html: string, key: string): string | undefined {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const k = attr(tag, 'property') ?? attr(tag, 'name');
    if (k && k.toLowerCase() === key.toLowerCase()) {
      const content = attr(tag, 'content');
      if (content) return content.trim();
    }
  }
  return undefined;
}

export function getCanonical(html: string): string | undefined {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (attr(tag, 'rel')?.toLowerCase() === 'canonical') return attr(tag, 'href');
  }
  return undefined;
}

/** Every href value in the document, entity-decoded. */
export function getHrefs(html: string): string[] {
  const out: string[] = [];
  const re = /<a\b[^>]*?\shref\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(decodeEntities(m[2] ?? m[3] ?? ''));
  return out;
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "Nano Machine | Asura Scans" → "Nano Machine" */
export function cleanTitle(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const first = raw.split(/\s+[|•–—-]\s+/)[0]?.trim();
  return first || raw.trim();
}
