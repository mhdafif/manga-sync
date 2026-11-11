import { browser } from 'wxt/browser';
import type { AppState, Settings } from './types';

const KEY = 'state';

export const DEFAULT_SETTINGS: Settings = {
  autoTrack: true,
  bgTabFallback: true,
  periodicSync: false,
  periodicSyncInterval: 60,
  fabPosition: 'draggable',
  notifications: false,
  theme: 'system',
};

export function emptyState(): AppState {
  return { sites: [], mangas: {}, settings: { ...DEFAULT_SETTINGS }, isSyncing: false };
}

export async function getState(): Promise<AppState> {
  const stored = (await browser.storage.local.get(KEY))[KEY] as Partial<AppState> | undefined;
  return {
    sites: stored?.sites ?? [],
    mangas: stored?.mangas ?? {},
    settings: { ...DEFAULT_SETTINGS, ...stored?.settings },
    lastSyncAllAt: stored?.lastSyncAllAt,
    isSyncing: stored?.isSyncing ?? false,
  };
}

// Only the service worker writes, so an in-memory queue is enough to keep
// read-modify-write cycles from overlapping.
let queue: Promise<unknown> = Promise.resolve();

/** Read the state, let `fn` change it in place, save it, return what `fn` returned. */
export function mutate<T>(fn: (state: AppState) => T): Promise<T> {
  const run = queue.then(async () => {
    const state = await getState();
    const result = fn(state);
    await browser.storage.local.set({ [KEY]: state });
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Calls back with the full state whenever it changes. Returns an unsubscribe function. */
export function onStateChange(callback: (state: AppState) => void): () => void {
  const listener = (changes: Record<string, unknown>, area: string) => {
    if (area === 'local' && KEY in changes) void getState().then(callback);
  };
  browser.storage.onChanged.addListener(listener as Parameters<typeof browser.storage.onChanged.addListener>[0]);
  return () => browser.storage.onChanged.removeListener(listener as Parameters<typeof browser.storage.onChanged.addListener>[0]);
}

const POS_KEY = 'fabPos';
export interface FabPos {
  x: number;
  y: number;
}

export async function getFabPos(): Promise<FabPos | null> {
  const v = (await browser.storage.local.get(POS_KEY))[POS_KEY] as FabPos | undefined;
  return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null;
}

export async function setFabPos(pos: FabPos): Promise<void> {
  await browser.storage.local.set({ [POS_KEY]: pos });
}
