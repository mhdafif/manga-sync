import { browser } from 'wxt/browser';
import type { BulkAction, Manga, MangaPage, Settings, Status } from './types';

export type Msg =
  | { type: 'SUBSCRIBE_SITE'; origin: string }
  | { type: 'UNSUBSCRIBE_SITE'; origin: string }
  | { type: 'ADD_MANGA'; origin: string; page: MangaPage; status: Status; url: string }
  | { type: 'UPDATE_PROGRESS'; id: string; chapter: number; url: string }
  | { type: 'PAGE_SEEN'; id: string; seriesUrl: string }
  | { type: 'PATCH_MANGA'; id: string; patch: { status?: Status; pinned?: boolean; muted?: boolean } }
  | { type: 'REMOVE_MANGA'; id: string }
  | { type: 'BULK_ACTION'; ids: string[]; action: BulkAction }
  | { type: 'RESTORE_MANGA'; mangas: Manga[] }
  | { type: 'IMPORT_DATA'; mangas: Manga[]; settings?: Partial<Settings> }
  | { type: 'SET_SETTINGS'; patch: Partial<Settings> }
  | { type: 'SYNC_ONE'; id: string }
  | { type: 'SYNC_ALL' }
  | { type: 'OPEN_OPTIONS' };

export interface Reply {
  ok: boolean;
  error?: string;
  /** Set by IMPORT_DATA. */
  added?: number;
  updated?: number;
}

/** Ask the service worker to do something. It is the only writer of the saved state. */
export async function send(msg: Msg): Promise<Reply> {
  try {
    return ((await browser.runtime.sendMessage(msg)) as Reply | undefined) ?? { ok: false, error: 'No reply' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
