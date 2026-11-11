import { browser } from 'wxt/browser';
import { mergeMangas } from '../core/backup';
import { applyBulkAction, applyProgress, countReadingUpdates } from '../core/logic';
import type { Msg, Reply } from '../core/messages';
import { getState, mutate } from '../core/storage';
import { subscribeSite, syncContentScripts, unsubscribeSite } from '../core/sites';
import { syncAll, syncOne, type NewChapter } from '../core/sync';
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
      const now = Date.now();
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
          lastReadAt: page.kind === 'chapter' ? now : undefined,
          latestChapter: null,
          addedAt: now,
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
        if (msg.patch.muted !== undefined) m.muted = msg.patch.muted;
      });
      return { ok: true };

    case 'REMOVE_MANGA':
      await mutate((s) => {
        delete s.mangas[msg.id];
      });
      return { ok: true };

    case 'BULK_ACTION':
      await mutate((s) => {
        for (const id of msg.ids) {
          const m = s.mangas[id];
          if (!m) continue;
          if (msg.action.kind === 'remove') delete s.mangas[id];
          else applyBulkAction(m, msg.action);
        }
      });
      return { ok: true };

    case 'RESTORE_MANGA':
      await mutate((s) => {
        for (const m of msg.mangas) {
          if (!s.mangas[m.id]) s.mangas[m.id] = m;
        }
      });
      return { ok: true };

    case 'IMPORT_DATA': {
      const result = await mutate((s) => {
        const r = mergeMangas(s.mangas, msg.mangas);
        if (msg.settings) {
          const {
            fabPosition,
            autoTrack,
            bgTabFallback,
            periodicSync,
            periodicSyncInterval,
            syncMinDaysSinceUpdate,
            notifications,
            theme,
          } = msg.settings;
          s.settings = {
            ...s.settings,
            ...(fabPosition && { fabPosition }),
            ...(autoTrack !== undefined && { autoTrack }),
            ...(bgTabFallback !== undefined && { bgTabFallback }),
            ...(periodicSync !== undefined && { periodicSync }),
            ...(periodicSyncInterval !== undefined && { periodicSyncInterval }),
            ...(syncMinDaysSinceUpdate !== undefined && { syncMinDaysSinceUpdate }),
            ...(notifications !== undefined && { notifications }),
            ...(theme && { theme }),
          };
        }
        return r;
      });
      await updatePeriodicSyncAlarm();
      return { ok: true, ...result };
    }

    case 'SET_SETTINGS':
      await mutate((s) => {
        s.settings = { ...s.settings, ...msg.patch };
      });
      await updatePeriodicSyncAlarm();
      return { ok: true };

    case 'SYNC_ONE':
      await syncOne(msg.id);
      return { ok: true };

    case 'SYNC_ALL':
      void syncAll().then(notifyNewChapters);
      return { ok: true };

    case 'OPEN_OPTIONS':
      await browser.tabs.create({ url: browser.runtime.getURL('/options.html') });
      return { ok: true };
  }
}

const ALARM_PERIODIC_SYNC = 'PERIODIC_SYNC';

async function updatePeriodicSyncAlarm(): Promise<void> {
  const { settings } = await getState();
  if (settings.periodicSync) {
    const periodInMinutes = Math.max(15, settings.periodicSyncInterval || 60);
    browser.alarms.create(ALARM_PERIODIC_SYNC, {
      periodInMinutes,
      delayInMinutes: periodInMinutes,
    });
  } else {
    await browser.alarms.clear(ALARM_PERIODIC_SYNC);
  }
}

const NOTIFY_PREFIX = 'chapter|';
const MAX_SINGLE_NOTIFICATIONS = 4;

async function notifyNewChapters(found: NewChapter[]): Promise<void> {
  if (found.length === 0) return;
  const { settings } = await getState();
  if (!settings.notifications) return;
  const iconUrl = browser.runtime.getURL('/icon/128.png');
  if (found.length <= MAX_SINGLE_NOTIFICATIONS) {
    for (const n of found) {
      await browser.notifications.create(`${NOTIFY_PREFIX}${n.url}`, {
        type: 'basic',
        iconUrl,
        title: n.title,
        message: `Chapter ${n.chapter} is out`,
      });
    }
    return;
  }
  const names = found.slice(0, 3).map((n) => n.title).join(', ');
  await browser.notifications.create('summary', {
    type: 'basic',
    iconUrl,
    title: `${found.length} manga have new chapters`,
    message: `${names} and ${found.length - 3} more`,
  });
}

async function updateBadge(): Promise<void> {
  const { mangas } = await getState();
  const n = countReadingUpdates(Object.values(mangas));
  await browser.action.setBadgeText({ text: n > 0 ? String(n) : '' });
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
    handle(msg)
      .then(sendResponse)
      .catch((e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true; // keep the channel open for the async reply
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_PERIODIC_SYNC) {
      void syncAll().then(notifyNewChapters);
    }
  });

  browser.notifications.onClicked.addListener((id) => {
    if (id.startsWith(NOTIFY_PREFIX)) void browser.tabs.create({ url: id.slice(NOTIFY_PREFIX.length) });
    void browser.notifications.clear(id);
  });

  browser.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') void updateBadge();
  });

  // Automatically subscribe site if permissions are granted (e.g. from popup prompt)
  browser.permissions.onAdded?.addListener((perms) => {
    if (perms.origins) {
      for (const originPattern of perms.origins) {
        try {
          const clean = originPattern.replace(/\/\*$/, '');
          const u = new URL(clean);
          void subscribeSite(u.origin);
        } catch {}
      }
    }
  });

  browser.permissions.onRemoved?.addListener((perms) => {
    if (perms.origins) {
      for (const originPattern of perms.origins) {
        try {
          const clean = originPattern.replace(/\/\*$/, '');
          const u = new URL(clean);
          void unsubscribeSite(u.origin);
        } catch {}
      }
    }
  });

  browser.runtime.onInstalled.addListener(() => {
    void mutate((s) => {
      s.isSyncing = false;
    });
    void syncContentScripts();
    void updatePeriodicSyncAlarm();
  });
  browser.runtime.onStartup.addListener(() => {
    void mutate((s) => {
      s.isSyncing = false;
    });
    void syncContentScripts();
    void updatePeriodicSyncAlarm();
  });

  void browser.action.setBadgeBackgroundColor({ color: '#7c3aed' });
  void updateBadge();
  void updatePeriodicSyncAlarm();
});
