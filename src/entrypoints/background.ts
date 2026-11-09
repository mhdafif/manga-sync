import { browser } from 'wxt/browser';
import { applyProgress, countUpdates } from '../core/logic';
import type { Msg, Reply } from '../core/messages';
import { getState, mutate } from '../core/storage';
import { subscribeSite, syncContentScripts, unsubscribeSite } from '../core/sites';
import { syncAll, syncOne } from '../core/sync';
import { mangaId, titleFromSlug } from '../core/url';

async function handle(msg: Msg): Promise<Reply> {
  switch (msg.type) {
    case 'SUBSCRIBE_SITE':
      await subscribeSite(msg.origin);
      return { ok: true };

    case 'UNSUBSCRIBE_SITE':
      await unsubscribeSite(msg.origin);
      return { ok: true };

    case 'ADD_MANGA': {
      const { page } = msg;
      const id = mangaId(msg.origin, page.slug);
      const added = await mutate((s) => {
        if (s.mangas[id]) return false;
        s.mangas[id] = {
          id,
          siteOrigin: msg.origin,
          slug: page.slug,
          title: (page.kind === 'series' ? page.title : page.title) || titleFromSlug(page.slug),
          coverUrl: page.kind === 'series' ? page.coverUrl : undefined,
          seriesUrl: page.seriesUrl,
          status: msg.status,
          pinned: false,
          lastReadChapter: page.kind === 'chapter' ? page.chapter : null,
          lastReadUrl: page.kind === 'chapter' ? msg.url : undefined,
          latestChapter: null,
          addedAt: Date.now(),
        };
        return true;
      });
      // Fill in title, cover and latest chapter without making the caller wait.
      if (added) void syncOne(id);
      return { ok: true };
    }

    case 'UPDATE_PROGRESS':
      await mutate((s) => {
        const m = s.mangas[msg.id];
        if (m) applyProgress(m, msg.chapter, msg.url);
      });
      return { ok: true };

    case 'PAGE_SEEN':
      // The hash in a series URL can change, so keep the newest one.
      await mutate((s) => {
        const m = s.mangas[msg.id];
        if (m && m.seriesUrl !== msg.seriesUrl) m.seriesUrl = msg.seriesUrl;
      });
      return { ok: true };

    case 'PATCH_MANGA':
      await mutate((s) => {
        const m = s.mangas[msg.id];
        if (!m) return;
        if (msg.patch.status) m.status = msg.patch.status;
        if (msg.patch.pinned !== undefined) m.pinned = msg.patch.pinned;
      });
      return { ok: true };

    case 'REMOVE_MANGA':
      await mutate((s) => {
        delete s.mangas[msg.id];
      });
      return { ok: true };

    case 'SET_SETTINGS':
      await mutate((s) => {
        s.settings = { ...s.settings, ...msg.patch };
      });
      return { ok: true };

    case 'SYNC_ONE':
      await syncOne(msg.id);
      return { ok: true };

    case 'SYNC_ALL':
      await syncAll();
      return { ok: true };

    case 'OPEN_OPTIONS':
      await browser.runtime.openOptionsPage();
      return { ok: true };
  }
}

async function updateBadge(): Promise<void> {
  const { mangas } = await getState();
  const n = countUpdates(Object.values(mangas));
  await browser.action.setBadgeText({ text: n > 0 ? String(n) : '' });
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
    handle(msg)
      .then(sendResponse)
      .catch((e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true; // keep the channel open for the async reply
  });

  browser.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') void updateBadge();
  });

  browser.runtime.onInstalled.addListener(() => void syncContentScripts());
  browser.runtime.onStartup.addListener(() => void syncContentScripts());

  void browser.action.setBadgeBackgroundColor({ color: '#7c3aed' });
  void updateBadge();
});
