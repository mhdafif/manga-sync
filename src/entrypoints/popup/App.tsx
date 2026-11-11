import React, { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  ArrowLeft,
  BellOff,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  ExternalLink,
  LayoutGrid,
  LayoutList,
  ListChecks,
  MoreVertical,
  Pin,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { downloadBackup, importBackupFile } from '../../core/backupIo';
import { countUpdates, groupByDomain, hasUpdate, newCount, sortMangas, timeAgo } from '../../core/logic';
import { send } from '../../core/messages';
import { requestSite } from '../../core/sites';
import { getState, onStateChange } from '../../core/storage';
import { applyTheme, watchSystemTheme } from '../../core/theme';
import {
  SORT_LABEL,
  SORT_OPTIONS,
  STATUSES,
  STATUS_LABEL,
  type AppState,
  type BulkAction,
  type FabPositionSetting,
  type Manga,
  type SortBy,
  type Status,
  type ThemeSetting,
} from '../../core/types';
import { hostOf, isMangaWebsite, normalizeOrigin } from '../../core/url';

export default function PopupApp() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [activeOrigin, setActiveOrigin] = useState<string | null>(null);
  const [activeTabInfo, setActiveTabInfo] = useState<{ url?: string; title?: string } | null>(null);
  const [localSyncing, setLocalSyncing] = useState(false);
  const isSyncing = Boolean(appState?.isSyncing || localSyncing);
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyUpdates, setOnlyUpdates] = useState(false);
  const [groupBySite, setGroupBySite] = useState(true);
  const [collapsedSites, setCollapsedSites] = useState<Record<string, boolean>>({});
  const [menuState, setMenuState] = useState<{
    mangaId: string;
    top?: number;
    bottom?: number;
    right: number;
    openUpwards: boolean;
  } | null>(null);
  const [layoutMode, setLayoutMode] = useState<'list' | 'grid'>(() => {
    try {
      return (localStorage.getItem('manga_sync_layout') as 'list' | 'grid') || 'list';
    } catch {
      return 'list';
    }
  });
  const [sortBy, setSortBy] = useState<SortBy>(() => {
    try {
      const v = localStorage.getItem('manga_sync_sort') as SortBy | null;
      return v && (SORT_OPTIONS as readonly string[]).includes(v) ? v : 'smart';
    } catch {
      return 'smart';
    }
  });
  const [filterMenu, setFilterMenu] = useState<{ top: number } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; restore?: Manga[] } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [view, setView] = useState<'main' | 'options'>('main');
  const [newSiteInput, setNewSiteInput] = useState('');
  const [addSiteError, setAddSiteError] = useState<string | null>(null);

  // Load state and subscribe
  useEffect(() => {
    void getState().then(setAppState);
    return onStateChange(setAppState);
  }, []);

  // Check current active tab
  useEffect(() => {
    browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.url) {
        const origin = normalizeOrigin(tab.url);
        setActiveOrigin(origin);
        setActiveTabInfo({ url: tab.url, title: tab.title || '' });
      }
    }).catch(() => undefined);
  }, []);

  // Close menu on click outside
  useEffect(() => {
    const handleClick = () => {
      setMenuState(null);
      setFilterMenu(null);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Apply the saved theme, and follow the OS when set to "system"
  const theme = appState?.settings.theme;
  useEffect(() => {
    if (!theme) return;
    applyTheme(theme);
    return watchSystemTheme(theme);
  }, [theme]);

  const mangas = appState ? Object.values(appState.mangas) : [];
  const totalTracked = mangas.length;
  const totalUpdates = countUpdates(mangas);

  const isCurrentSubscribed = activeOrigin
    ? appState?.sites.some((s) => s.origin === activeOrigin) ?? false
    : false;

  const handleSubscribeSite = async () => {
    if (!activeOrigin) return;
    const ok = await requestSite(activeOrigin);
    if (ok) {
      await send({ type: 'SUBSCRIBE_SITE', origin: activeOrigin });
    }
  };

  const handleSyncAll = async () => {
    if (isSyncing) return;
    setLocalSyncing(true);
    try {
      await send({ type: 'SYNC_ALL' });
    } catch {
      // Ignore if channel was closed on popup dismiss
    } finally {
      setTimeout(() => setLocalSyncing(false), 500);
    }
  };

  const handleOpenUrl = (url?: string) => {
    if (url) {
      void browser.tabs.create({ url });
    }
  };

  const toggleMenu = (e: React.MouseEvent, mId: string) => {
    e.stopPropagation();
    if (menuState?.mangaId === mId) {
      setMenuState(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Menu is ~215px tall. Footer begins around 480px.
    // If rect.bottom + 220 > 470, flip upwards!
    const openUpwards = rect.bottom + 245 > 470;

    let right = window.innerWidth - rect.right;
    if (right < 12) right = 12;
    if (window.innerWidth - right - 170 < 12) {
      right = Math.max(12, window.innerWidth - 170 - 12);
    }

    if (openUpwards) {
      setMenuState({
        mangaId: mId,
        bottom: window.innerHeight - rect.top + 4,
        right,
        openUpwards: true,
      });
    } else {
      setMenuState({
        mangaId: mId,
        top: rect.bottom + 4,
        right,
        openUpwards: false,
      });
    }
  };

  const handleStatusChange = async (id: string, status: Status) => {
    await send({ type: 'PATCH_MANGA', id, patch: { status } });
    setMenuState(null);
  };

  const handleTogglePin = async (id: string, currentPinned: boolean) => {
    await send({ type: 'PATCH_MANGA', id, patch: { pinned: !currentPinned } });
    setMenuState(null);
  };

  const showToast = (message: string, restore?: Manga[]) => {
    window.clearTimeout(toastTimer.current);
    setToast({ message, restore });
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  };

  const handleUndo = async () => {
    if (!toast?.restore) return;
    await send({ type: 'RESTORE_MANGA', mangas: toast.restore });
    window.clearTimeout(toastTimer.current);
    setToast(null);
  };

  const handleRemove = async (id: string) => {
    const target = appState?.mangas[id];
    await send({ type: 'REMOVE_MANGA', id });
    setMenuState(null);
    if (target) showToast(`Removed “${target.title}”`, [target]);
  };

  const handleMarkRead = async (id: string) => {
    await send({ type: 'BULK_ACTION', ids: [id], action: { kind: 'markRead' } });
    setMenuState(null);
  };

  const handleToggleMute = async (id: string, muted: boolean | undefined) => {
    await send({ type: 'PATCH_MANGA', id, patch: { muted: !muted } });
    setMenuState(null);
  };

  // Multi-select
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelectMode = () => {
    setMenuState(null);
    setFilterMenu(null);
    if (selectMode) exitSelectMode();
    else setSelectMode(true);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBulk = async (action: BulkAction) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const removed =
      action.kind === 'remove'
        ? ids.map((id) => appState?.mangas[id]).filter((m): m is Manga => Boolean(m))
        : [];
    await send({ type: 'BULK_ACTION', ids, action });
    exitSelectMode();
    if (action.kind === 'remove' && removed.length > 0) {
      showToast(`Removed ${removed.length} manga`, removed);
    }
  };

  // Filter / sort popover
  const toggleFilterMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuState(null);
    if (filterMenu) {
      setFilterMenu(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setFilterMenu({ top: rect.bottom + 6 });
  };

  const handleSetSort = (value: SortBy) => {
    setSortBy(value);
    try {
      localStorage.setItem('manga_sync_sort', value);
    } catch {}
  };

  const resetFilters = () => {
    setOnlyUpdates(false);
    setGroupBySite(true);
    handleSetSort('smart');
  };

  // Backup
  const handleExport = () => {
    if (appState) downloadBackup(appState);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setBackupNotice(await importBackupFile(file, appState));
    } catch (err) {
      setBackupNotice(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleGroupCollapse = (domain: string) => {
    setCollapsedSites((prev) => ({ ...prev, [domain]: !prev[domain] }));
  };

  const handleAddSiteFromOptions = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddSiteError(null);
    const origin = normalizeOrigin(newSiteInput);
    if (!origin) {
      setAddSiteError('Enter a valid domain (e.g. asurascans.com)');
      return;
    }
    if (appState?.sites.some((s) => s.origin === origin)) {
      setAddSiteError('Site already subscribed');
      return;
    }
    const granted = await requestSite(origin);
    if (!granted) {
      setAddSiteError('Permission was not granted');
      return;
    }
    await send({ type: 'SUBSCRIBE_SITE', origin });
    setNewSiteInput('');
  };

  const handleUnsubscribeFromOptions = async (origin: string) => {
    await send({ type: 'UNSUBSCRIBE_SITE', origin });
  };

  const handleTogglePref = async (key: 'autoTrack' | 'bgTabFallback' | 'periodicSync' | 'notifications') => {
    if (!appState) return;
    await send({
      type: 'SET_SETTINGS',
      patch: { [key]: !appState.settings[key] },
    });
  };

  const handleSetSyncInterval = async (interval: number) => {
    await send({
      type: 'SET_SETTINGS',
      patch: { periodicSyncInterval: interval },
    });
  };

  const handleSetTheme = async (value: ThemeSetting) => {
    await send({ type: 'SET_SETTINGS', patch: { theme: value } });
  };

  const handleSetFabPosition = async (pos: FabPositionSetting) => {
    await send({
      type: 'SET_SETTINGS',
      patch: { fabPosition: pos },
    });
  };

  // Filter manga list
  const cleanQuery = searchQuery.trim().toLowerCase();

  const filteredMangas = sortMangas(
    mangas.filter((m) => {
      if (cleanQuery) {
        const title = (m.title || '').toLowerCase();
        const slug = (m.slug || '').toLowerCase();
        if (!title.includes(cleanQuery) && !slug.includes(cleanQuery)) {
          return false;
        }
      }
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (onlyUpdates && !hasUpdate(m)) return false;
      return true;
    }),
    sortBy,
  );

  const filterCount = (onlyUpdates ? 1 : 0) + (groupBySite ? 0 : 1) + (sortBy !== 'smart' ? 1 : 0);

  const handleSetLayout = (mode: 'list' | 'grid') => {
    setLayoutMode(mode);
    try {
      localStorage.setItem('manga_sync_layout', mode);
    } catch {}
  };

  const isManga = isMangaWebsite(activeTabInfo?.url, activeTabInfo?.title);
  const showSubscribeBanner = Boolean(activeOrigin && !isCurrentSubscribed && isManga);

  const getStatusCount = (st: 'all' | Status) => {
    if (st === 'all') return mangas.length;
    return mangas.filter((m) => m.status === st).length;
  };

  // Render 1-Column (List view) card
  const renderMangaCard = (m: Manga, showDomain: boolean) => {
    const selected = selectedIds.has(m.id);
    const isUpdated = hasUpdate(m);
    const chaptersWaiting = newCount(m);
    const domain = hostOf(m.siteOrigin);
    const firstLetter = m.title ? m.title.charAt(0).toUpperCase() : 'M';
    const timeText = isUpdated && (m.lastUpdatedAt || m.lastSyncedAt)
      ? `Updated ${timeAgo(m.lastUpdatedAt || m.lastSyncedAt)}`
      : m.lastReadAt
      ? `Read ${timeAgo(m.lastReadAt)}`
      : null;

    return (
      <div
        key={m.id}
        className={`manga-card ${selectMode ? 'selectable' : ''} ${selected ? 'selected' : ''}`}
        onClick={selectMode ? () => toggleSelected(m.id) : undefined}
      >
        {selectMode && <span className="select-box">{selected && <Check size={12} strokeWidth={3} />}</span>}
        <div className="manga-cover">
          {m.coverUrl ? <img src={m.coverUrl} alt="" /> : <span>{firstLetter}</span>}
        </div>

        <div className="manga-details">
          <div className="manga-head">
            <h4 className="font-display manga-name">
              <a
                className="title-link"
                href={m.seriesUrl}
                target="_blank"
                rel="noreferrer"
                title={`${m.title} — open series page`}
              >
                {m.title}
              </a>
            </h4>
            {m.muted && <BellOff size={12} className="muted-icon" aria-label="Muted" />}
          </div>

          <div className="manga-sub">
            {showDomain && `${domain} · `}
            {STATUS_LABEL[m.status]}
            {timeText && (
              <>
                <span className="manga-sub-dot">·</span>
                <span className="manga-time-inline" title={timeText}>
                  <Clock size={11} />
                  <span>{timeText}</span>
                </span>
              </>
            )}
          </div>

          <div className="manga-progress">
            <span>
              Read <b>{m.lastReadChapter ?? '—'}</b>
            </span>
            <span style={{ color: 'var(--text-faint)' }}>/</span>
            <span>
              Latest <b>{m.latestChapter ?? '—'}</b>
            </span>
            {isUpdated && <span className="pill-new-manga">+{chaptersWaiting} NEW</span>}
          </div>

          <div className="manga-card-footer">
            <div className="manga-actions">
              <button
                type="button"
                className="btn-read"
                onClick={() => handleOpenUrl(m.lastReadUrl || m.seriesUrl)}
              >
                {m.lastReadChapter ? `Continue Ch ${m.lastReadChapter}` : 'Start reading'}
              </button>
              {isUpdated && m.latestChapterUrl && (
                <button
                  type="button"
                  className="btn-read-outline"
                  onClick={() => handleOpenUrl(m.latestChapterUrl)}
                >
                  Latest Ch {m.latestChapter}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="card-top-actions">
          <button
            type="button"
            className={`btn-pin ${m.pinned ? 'active' : ''}`}
            aria-label={m.pinned ? 'Unpin' : 'Pin to top'}
            title={m.pinned ? 'Unpin' : 'Pin to top'}
            onClick={(e) => {
              e.stopPropagation();
              void handleTogglePin(m.id, m.pinned);
            }}
          >
            <Pin size={15} fill={m.pinned ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            className={`btn-more ${menuState?.mangaId === m.id ? 'active' : ''}`}
            aria-label="More options"
            onClick={(e) => toggleMenu(e, m.id)}
          >
            <MoreVertical size={16} />
          </button>
        </div>
      </div>
    );
  };

  // Render 2-Column (Grid view) card with concise info
  const renderMangaGridCard = (m: Manga, showDomain: boolean) => {
    const selected = selectedIds.has(m.id);
    const isUpdated = hasUpdate(m);
    const chaptersWaiting = newCount(m);
    const domain = hostOf(m.siteOrigin);
    const firstLetter = m.title ? m.title.charAt(0).toUpperCase() : 'M';
    const timeText = isUpdated && (m.lastUpdatedAt || m.lastSyncedAt)
      ? timeAgo(m.lastUpdatedAt || m.lastSyncedAt)
      : m.lastReadAt
      ? timeAgo(m.lastReadAt)
      : null;

    return (
      <div
        key={m.id}
        className={`manga-card-grid ${selectMode ? 'selectable' : ''} ${selected ? 'selected' : ''}`}
        onClick={selectMode ? () => toggleSelected(m.id) : undefined}
      >
        <div className="grid-cover-wrap">
          {m.coverUrl ? (
            <img src={m.coverUrl} alt="" className="grid-cover-img" />
          ) : (
            <div className="grid-cover-placeholder">
              <span>{firstLetter}</span>
            </div>
          )}

          {selectMode && (
            <span className="select-box select-box-grid">{selected && <Check size={12} strokeWidth={3} />}</span>
          )}

          {isUpdated && (
            <div className="grid-badge-new">
              +{chaptersWaiting} NEW
            </div>
          )}

          <button
            type="button"
            className={`btn-pin-grid ${m.pinned ? 'active' : ''}`}
            aria-label={m.pinned ? 'Unpin' : 'Pin to top'}
            title={m.pinned ? 'Unpin' : 'Pin to top'}
            onClick={(e) => {
              e.stopPropagation();
              void handleTogglePin(m.id, m.pinned);
            }}
          >
            <Pin size={12} fill={m.pinned ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            className={`btn-more-grid ${menuState?.mangaId === m.id ? 'active' : ''}`}
            aria-label="More options"
            onClick={(e) => toggleMenu(e, m.id)}
          >
            <MoreVertical size={14} />
          </button>
        </div>

        <div className="grid-card-body">
          <h4 className="font-display grid-manga-title">
            <a
              className="title-link"
              href={m.seriesUrl}
              target="_blank"
              rel="noreferrer"
              title={`${m.title} — open series page`}
            >
              {m.title}
            </a>
          </h4>

          <div className="grid-manga-sub">
            {showDomain && <span className="grid-domain">{domain} · </span>}
            <span>{STATUS_LABEL[m.status]}</span>
            {m.muted && <BellOff size={10} className="muted-icon" aria-label="Muted" />}
          </div>

          <div className="grid-progress-row">
            <span className="grid-progress-text">
              Ch. <b>{m.lastReadChapter ?? '—'}</b> / {m.latestChapter ?? '—'}
            </span>
            {timeText && (
              <span className="grid-time-text" title={timeText}>
                {timeText}
              </span>
            )}
          </div>

          <button
            type="button"
            className="btn-read-grid"
            onClick={() => handleOpenUrl(isUpdated && m.latestChapterUrl ? m.latestChapterUrl : (m.lastReadUrl || m.seriesUrl))}
          >
            {isUpdated && m.latestChapter
              ? `Ch ${m.latestChapter}`
              : m.lastReadChapter
              ? `Continue Ch ${m.lastReadChapter}`
              : 'Read'}
          </button>
        </div>
      </div>
    );
  };

  const renderItem = (m: Manga, showDomain: boolean) =>
    layoutMode === 'grid' ? renderMangaGridCard(m, showDomain) : renderMangaCard(m, showDomain);

  if (view === 'options') {
    return (
      <div className="popup-container">
        <div className="header" style={{ borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn-back"
              onClick={() => setView('main')}
              aria-label="Back to Manga List"
            >
              <ArrowLeft size={18} />
            </button>
            <h2 className="font-display header-title" style={{ fontSize: '18px' }}>
              Settings
            </h2>
          </div>
        </div>

        <div className="options-scroll-body">
          {/* Subscribed Sites Section */}
          <div className="settings-card">
            <h3 className="settings-card-title">
              Subscribed Sites ({appState?.sites.length ?? 0})
            </h3>
            <p className="settings-card-desc">Floating button only appears on these sites.</p>

            {appState?.sites.length === 0 ? (
              <p style={{ color: 'var(--text-faint)', fontSize: '12px', margin: '8px 0' }}>
                No sites subscribed yet.
              </p>
            ) : (
              appState?.sites.map((site) => (
                <div key={site.origin} className="site-list-item">
                  <div>
                    <a
                      className="site-item-domain site-link"
                      href={site.origin}
                      target="_blank"
                      rel="noreferrer"
                      title={`Open ${site.origin}`}
                    >
                      <span>{hostOf(site.origin)}</span>
                      <ExternalLink size={11} />
                    </a>
                    <div className="site-item-sub">adapter: {site.adapterId}</div>
                  </div>
                  <button
                    type="button"
                    className="btn-item-unsub"
                    onClick={() => void handleUnsubscribeFromOptions(site.origin)}
                  >
                    Unsubscribe
                  </button>
                </div>
              ))
            )}

            <form onSubmit={handleAddSiteFromOptions} className="add-site-row">
              <input
                type="text"
                className="input-add-site"
                placeholder="e.g. mangadex.org"
                value={newSiteInput}
                onChange={(e) => setNewSiteInput(e.target.value)}
              />
              <button type="submit" className="btn-add-site">
                Add
              </button>
            </form>
            {addSiteError && (
              <p style={{ color: '#ef4444', fontSize: '11px', marginTop: '6px' }}>{addSiteError}</p>
            )}
          </div>

          {/* Preferences Section */}
          <div className="settings-card">
            <h3 className="settings-card-title">Preferences</h3>
            <p className="settings-card-desc">Automation and sync behavior.</p>

            <div className="pref-row">
              <span className="pref-label">Auto-track reading progress (3s delay)</span>
              <button
                type="button"
                className={`switch-toggle ${appState?.settings.autoTrack !== false ? 'on' : ''}`}
                onClick={() => void handleTogglePref('autoTrack')}
                aria-label="Toggle auto-track progress"
              />
            </div>

            <div className="pref-row">
              <span className="pref-label">Background tab fallback if fetch blocked</span>
              <button
                type="button"
                className={`switch-toggle ${appState?.settings.bgTabFallback !== false ? 'on' : ''}`}
                onClick={() => void handleTogglePref('bgTabFallback')}
                aria-label="Toggle background tab fallback"
              />
            </div>

            <div className="pref-row">
              <div>
                <span className="pref-label">Floating button position</span>
                <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Corner or free draggable</div>
              </div>
              <select
                className="select-interval"
                value={appState?.settings.fabPosition || 'draggable'}
                onChange={(e) => void handleSetFabPosition(e.target.value as FabPositionSetting)}
              >
                <option value="draggable">Draggable (Free)</option>
                <option value="bottom-right">Bottom Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="top-right">Top Right</option>
                <option value="top-left">Top Left</option>
              </select>
            </div>

            <div className="pref-row">
              <div>
                <span className="pref-label">Periodic background sync</span>
                <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Auto-check chapters in background</div>
              </div>
              <button
                type="button"
                className={`switch-toggle ${appState?.settings.periodicSync ? 'on' : ''}`}
                onClick={() => void handleTogglePref('periodicSync')}
                aria-label="Toggle periodic background sync"
              />
            </div>

            <div className="pref-row">
              <div>
                <span className="pref-label">Desktop notifications</span>
                <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
                  {appState?.settings.periodicSync
                    ? 'Notify when a new chapter is found'
                    : 'Needs periodic background sync'}
                </div>
              </div>
              <button
                type="button"
                className={`switch-toggle ${appState?.settings.notifications ? 'on' : ''}`}
                onClick={() => void handleTogglePref('notifications')}
                aria-label="Toggle desktop notifications"
              />
            </div>

            {appState?.settings.periodicSync && (
              <div className="pref-row-sub">
                <span className="pref-sub-label">Frequency:</span>
                <select
                  className="select-interval"
                  value={appState.settings.periodicSyncInterval || 60}
                  onChange={(e) => void handleSetSyncInterval(Number(e.target.value))}
                >
                  <option value={30}>Every 30 minutes</option>
                  <option value={60}>Every 1 hour</option>
                  <option value={180}>Every 3 hours</option>
                  <option value={360}>Every 6 hours</option>
                  <option value={720}>Every 12 hours</option>
                </select>
              </div>
            )}
          </div>

          {/* Appearance & Backup */}
          <div className="settings-card">
            <h3 className="settings-card-title">Appearance</h3>
            <div className="pref-row">
              <span className="pref-label">Theme</span>
              <select
                className="select-interval"
                value={appState?.settings.theme || 'system'}
                onChange={(e) => void handleSetTheme(e.target.value as ThemeSetting)}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
          </div>

          <div className="settings-card">
            <h3 className="settings-card-title">Backup</h3>
            <p className="settings-card-desc">Save your library to a file, or restore it later.</p>
            <div className="backup-row">
              <button type="button" className="btn-backup" onClick={handleExport}>
                Export
              </button>
              <button type="button" className="btn-backup" onClick={() => importInputRef.current?.click()}>
                Import
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => void handleImportFile(e)}
              />
            </div>
            {backupNotice && <p className="backup-notice">{backupNotice}</p>}
          </div>
        </div>

        <div className="popup-footer">
          <span>Manga Sync v0.1.0</span>
          <button
            type="button"
            className="btn-options"
            onClick={() => void send({ type: 'OPEN_OPTIONS' })}
          >
            <span>Open in full tab</span>
            <ExternalLink size={12} />
          </button>
        </div>
      </div>
    );
  }

  const selectedMangas = [...selectedIds].map((id) => appState?.mangas[id]).filter((m): m is Manga => Boolean(m));
  const selectedAllPinned = selectedMangas.length > 0 && selectedMangas.every((m) => m.pinned);
  const selectedAllMuted = selectedMangas.length > 0 && selectedMangas.every((m) => m.muted);

  const pinnedMangas = filteredMangas.filter((m) => m.pinned);
  const unpinnedMangas = filteredMangas.filter((m) => !m.pinned);
  const domainGroups = groupBySite ? groupByDomain(unpinnedMangas, hostOf) : [];
  const pinnedUpdates = countUpdates(pinnedMangas);
  const isPinnedCollapsed = collapsedSites['__pinned__'] ?? false;

  return (
    <div className="popup-container">
      {/* Header */}
      <div className="header">
        <div>
          <h2 className="font-display header-title">Manga Sync</h2>
          <div className="header-meta">
            {totalTracked} manga · {totalUpdates} with new chapters
          </div>
        </div>
        <button
          type="button"
          className="btn-sync-all"
          onClick={handleSyncAll}
          disabled={isSyncing}
          aria-busy={isSyncing}
          title={isSyncing ? 'Syncing chapters in progress…' : 'Sync all manga'}
        >
          <RefreshCw size={14} className={isSyncing ? 'spin' : ''} />
          <span>{isSyncing ? 'Checking…' : 'Sync all'}</span>
        </button>
      </div>

      {/* Active site banner - only shown if on a manga site and not yet subscribed */}
      {showSubscribeBanner && activeOrigin && (
        <div className="site-banner">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="site-label">Manga site detected</div>
            <div className="site-host">{hostOf(activeOrigin)}</div>
          </div>
          <button type="button" className="btn-subscribe" onClick={handleSubscribeSite}>
            Subscribe site
          </button>
        </div>
      )}

      {/* Search by title */}
      <div className="search-box">
        <Search size={14} className="search-icon" />
        <input
          type="text"
          className="search-input"
          placeholder="Search manga by title…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            className="btn-search-clear"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Status tabs */}
      <div className="tabs-row">
        <button
          type="button"
          className={`tab-chip ${statusFilter === 'all' ? 'active' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          <span>All</span>
          <span className="count-pill">{getStatusCount('all')}</span>
        </button>
        {STATUSES.map((st) => (
          <button
            key={st}
            type="button"
            className={`tab-chip ${statusFilter === st ? 'active' : ''}`}
            onClick={() => setStatusFilter(st)}
          >
            <span>{STATUS_LABEL[st]}</span>
            <span className="count-pill">{getStatusCount(st)}</span>
          </button>
        ))}
      </div>

      {/* Filter / sort action, multi-select and layout toggle */}
      <div className="filter-options">
        <div className="filter-actions">
          <button
            type="button"
            className={`btn-filter ${filterMenu ? 'active' : ''} ${filterCount > 0 ? 'has-active' : ''}`}
            onClick={toggleFilterMenu}
            aria-label="Filter and sort"
          >
            <SlidersHorizontal size={14} />
            <span>Filter</span>
            {filterCount > 0 && <span className="filter-count">{filterCount}</span>}
          </button>
          <button
            type="button"
            className={`btn-filter ${selectMode ? 'active' : ''}`}
            onClick={toggleSelectMode}
            aria-label="Select multiple manga"
          >
            <ListChecks size={14} />
            <span>{selectMode ? 'Cancel' : 'Select'}</span>
          </button>
        </div>

        <div className="layout-toggle-group">
          <button
            type="button"
            className={`btn-layout-toggle ${layoutMode === 'list' ? 'active' : ''}`}
            onClick={() => handleSetLayout('list')}
            title="1 Column (List view)"
            aria-label="1 Column view"
          >
            <LayoutList size={14} />
          </button>
          <button
            type="button"
            className={`btn-layout-toggle ${layoutMode === 'grid' ? 'active' : ''}`}
            onClick={() => handleSetLayout('grid')}
            title="2 Columns (Grid view)"
            aria-label="2 Columns view"
          >
            <LayoutGrid size={14} />
          </button>
        </div>
      </div>

      {/* Manga list */}
      <div className="manga-list" onScroll={() => setMenuState(null)}>
        {filteredMangas.length === 0 ? (
          <div className="empty-state">
            {totalTracked === 0 ? (
              'No manga tracked yet. Visit a manga page and click "+ Add manga"!'
            ) : cleanQuery ? (
              <div className="empty-search-state">
                <div>No manga found matching &ldquo;{searchQuery}&rdquo;</div>
                <button
                  type="button"
                  className="btn-clear-search-link"
                  onClick={() => setSearchQuery('')}
                >
                  Clear search
                </button>
              </div>
            ) : (
              'No manga matches the selected filter.'
            )}
          </div>
        ) : groupBySite ? (
          <>
            {/* Pinned grouping above all site groups */}
            {pinnedMangas.length > 0 && (
              <div className="pinned-group-block">
                <button
                  type="button"
                  className="group-header pinned-group-header"
                  onClick={() => toggleGroupCollapse('__pinned__')}
                >
                  <ChevronDown
                    size={16}
                    className={`group-chevron ${isPinnedCollapsed ? 'collapsed' : ''}`}
                  />
                  <div className="group-icon pinned-icon">
                    <Pin size={11} fill="currentColor" />
                  </div>
                  <span className="group-title font-display">Pinned</span>
                  {pinnedUpdates > 0 && (
                    <span className="badge-new-group">{pinnedUpdates} new</span>
                  )}
                  <span className="group-count">{pinnedMangas.length}</span>
                </button>

                {!isPinnedCollapsed && (
                  <div className={layoutMode === 'grid' ? 'group-items-grid' : 'group-items'}>
                    {pinnedMangas.map((m) => renderItem(m, true))}
                  </div>
                )}
              </div>
            )}

            {/* Site domain groups */}
            {domainGroups.map((group) => {
              const isCollapsed = collapsedSites[group.domain] ?? false;
              return (
                <div key={group.domain}>
                  <button
                    type="button"
                    className="group-header"
                    onClick={() => toggleGroupCollapse(group.domain)}
                  >
                    <ChevronDown
                      size={16}
                      className={`group-chevron ${isCollapsed ? 'collapsed' : ''}`}
                    />
                    <div className="group-icon">{group.domain.charAt(0).toUpperCase()}</div>
                    <span className="group-title font-display">{group.domain}</span>
                    {group.updates > 0 && (
                      <span className="badge-new-group">{group.updates} new</span>
                    )}
                    <span className="group-count">{group.items.length}</span>
                  </button>

                  {!isCollapsed && (
                    <div className={layoutMode === 'grid' ? 'group-items-grid' : 'group-items'}>
                      {group.items.map((m) => renderItem(m, false))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        ) : (
          <div className={layoutMode === 'grid' ? 'manga-grid' : 'manga-list-flat'}>
            {filteredMangas.map((m) => renderItem(m, true))}
          </div>
        )}
      </div>

      {/* Footer, or the bulk action bar while selecting */}
      {selectMode ? (
        <div className="bulk-bar">
          <div className="bulk-info">
            <b>{selectedIds.size}</b> selected
            <button
              type="button"
              className="link-btn"
              onClick={() => setSelectedIds(new Set(filteredMangas.map((m) => m.id)))}
            >
              All
            </button>
          </div>
          <div className="bulk-actions">
            <select
              className="bulk-status-select"
              value=""
              disabled={selectedIds.size === 0}
              onChange={(e) => void runBulk({ kind: 'status', status: e.target.value as Status })}
              aria-label="Move selected to status"
            >
              <option value="" disabled>
                Move to…
              </option>
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {STATUS_LABEL[st]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-bulk"
              title="Mark as read"
              disabled={selectedIds.size === 0}
              onClick={() => void runBulk({ kind: 'markRead' })}
            >
              <CheckCheck size={15} />
            </button>
            <button
              type="button"
              className="btn-bulk"
              title={selectedAllPinned ? 'Unpin' : 'Pin'}
              disabled={selectedIds.size === 0}
              onClick={() => void runBulk({ kind: 'pin', value: !selectedAllPinned })}
            >
              <Pin size={15} fill={selectedAllPinned ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              className="btn-bulk"
              title={selectedAllMuted ? 'Unmute' : 'Mute updates'}
              disabled={selectedIds.size === 0}
              onClick={() => void runBulk({ kind: 'mute', value: !selectedAllMuted })}
            >
              <BellOff size={15} />
            </button>
            <button
              type="button"
              className="btn-bulk danger"
              title="Remove"
              disabled={selectedIds.size === 0}
              onClick={() => void runBulk({ kind: 'remove' })}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ) : (
        <div className="popup-footer">
          <span>
            {appState?.lastSyncAllAt
              ? `Last sync: ${new Date(appState.lastSyncAllAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Not synced yet'}
          </span>
          <button type="button" className="btn-options" onClick={() => setView('options')}>
            <Settings size={14} />
            <span>Options</span>
          </button>
        </div>
      )}

      {/* Undo toast */}
      {toast && (
        <div className="toast" role="status">
          <span className="toast-text">{toast.message}</span>
          {toast.restore && (
            <button type="button" className="toast-undo" onClick={() => void handleUndo()}>
              Undo
            </button>
          )}
        </div>
      )}

      {/* Filter & sort popover */}
      {filterMenu && (
        <>
          <div
            className="dropdown-backdrop"
            onClick={(e) => {
              e.stopPropagation();
              setFilterMenu(null);
            }}
          />
          <div className="filter-popover" style={{ top: `${filterMenu.top}px` }} onClick={(e) => e.stopPropagation()}>
            <div className="dropdown-label">Sort by</div>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`dropdown-item ${sortBy === opt ? 'active' : ''}`}
                onClick={() => handleSetSort(opt)}
              >
                <span>{SORT_LABEL[opt]}</span>
                {sortBy === opt && <Check size={14} />}
              </button>
            ))}
            <div className="dropdown-divider" />
            <div className="dropdown-label">Show</div>
            <div className="popover-switch-row">
              <span>Only with updates</span>
              <button
                type="button"
                className={`switch-toggle ${onlyUpdates ? 'on' : ''}`}
                onClick={() => setOnlyUpdates((v) => !v)}
                aria-label="Only with updates"
              />
            </div>
            <div className="popover-switch-row">
              <span>Group by site</span>
              <button
                type="button"
                className={`switch-toggle ${groupBySite ? 'on' : ''}`}
                onClick={() => setGroupBySite((v) => !v)}
                aria-label="Group by site"
              />
            </div>
            {filterCount > 0 && (
              <>
                <div className="dropdown-divider" />
                <button type="button" className="dropdown-item" onClick={resetFilters}>
                  <span>Reset to default</span>
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Fixed Root Dropdown Menu */}
      {menuState && (() => {
        const targetManga = mangas.find((m) => m.id === menuState.mangaId);
        if (!targetManga) return null;
        return (
          <>
            <div
              className="dropdown-backdrop"
              onClick={(e) => {
                e.stopPropagation();
                setMenuState(null);
              }}
            />
            <div
              className={`dropdown-menu fixed-dropdown ${menuState.openUpwards ? 'upwards' : 'downwards'}`}
              style={{
                top: menuState.top !== undefined ? `${menuState.top}px` : 'auto',
                bottom: menuState.bottom !== undefined ? `${menuState.bottom}px` : 'auto',
                right: `${menuState.right}px`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="dropdown-label">Change status</div>
              {STATUSES.map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`dropdown-item ${targetManga.status === st ? 'active' : ''}`}
                  onClick={() => void handleStatusChange(targetManga.id, st)}
                >
                  <span>{STATUS_LABEL[st]}</span>
                  {targetManga.status === st && <Check size={14} />}
                </button>
              ))}
              <div className="dropdown-divider" />
              {hasUpdate(targetManga) && (
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => void handleMarkRead(targetManga.id)}
                >
                  <span>Mark as read</span>
                  <CheckCheck size={14} />
                </button>
              )}
              <button
                type="button"
                className="dropdown-item"
                onClick={() => void handleToggleMute(targetManga.id, targetManga.muted)}
              >
                <span>{targetManga.muted ? 'Unmute updates' : 'Mute updates'}</span>
                <BellOff size={14} />
              </button>
              <button
                type="button"
                className="dropdown-item danger"
                onClick={() => void handleRemove(targetManga.id)}
              >
                <span>Remove</span>
                <Trash2 size={14} />
              </button>
            </div>
          </>
        );
      })()}
    </div>
  );
}
