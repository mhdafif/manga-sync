import type { ThemeSetting } from './types';

const CACHE_KEY = 'manga_sync_theme';

function resolve(theme: ThemeSetting): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

/** Apply the theme to the page. Also remembers it so the next open paints correctly right away. */
export function applyTheme(theme: ThemeSetting): void {
  document.documentElement.dataset.theme = resolve(theme);
  try {
    localStorage.setItem(CACHE_KEY, theme);
  } catch {
    /* storage can be unavailable; the theme still applies for this session */
  }
}

/** Call once before the first render. */
export function applyCachedTheme(): void {
  let theme: ThemeSetting = 'system';
  try {
    const v = localStorage.getItem(CACHE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') theme = v;
  } catch {
    /* ignore */
  }
  applyTheme(theme);
}

/** Keep `system` in sync with the OS. Returns a cleanup function. */
export function watchSystemTheme(theme: ThemeSetting): () => void {
  if (theme !== 'system' || !window.matchMedia) return () => undefined;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = () => applyTheme('system');
  mq.addEventListener('change', listener);
  return () => mq.removeEventListener('change', listener);
}
