import React, { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  LayoutGrid,
  LayoutList,
  MoreVertical,
  Pin,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import { countUpdates, groupByDomain, hasUpdate, newCount, sortMangas, timeAgo } from '../../core/logic';
import { send } from '../../core/messages';
import { requestSite } from '../../core/sites';
import { getState, onStateChange } from '../../core/storage';
import { STATUSES, STATUS_LABEL, type AppState, type FabPositionSetting, type Manga, type Status } from '../../core/types';
import { hostOf, isMangaWebsite, normalizeOrigin } from '../../core/url';

export default function PopupApp() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [activeOrigin, setActiveOrigin] = useState<string | null>(null);
  const [activeTabInfo, setActiveTabInfo] = useState<{ url?: string; title?: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyUpdates, setOnlyUpdates] = useState(false);
  const [groupBySite, setGroupBySite] = useState(true);
  const [collapsedSites, setCollapsedSites] = useState<Record<string, boolean>>({});
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<'list' | 'grid'>(() => {
    try {
      return (localStorage.getItem('manga_sync_layout') as 'list' | 'grid') || 'list';
    } catch {
      return 'list';
    }
  });
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
    const handleClick = () => setActiveMenuId(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

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
    setSyncing(true);
    await send({ type: 'SYNC_ALL' });
    setTimeout(() => setSyncing(false), 1200);
  };

  const handleOpenUrl = (url?: string) => {
    if (url) {
      void browser.tabs.create({ url });
    }
  };

  const handleStatusChange = async (id: string, status: Status) => {
    await send({ type: 'PATCH_MANGA', id, patch: { status } });
    setActiveMenuId(null);
  };

  const handleTogglePin = async (id: string, currentPinned: boolean) => {
    await send({ type: 'PATCH_MANGA', id, patch: { pinned: !currentPinned } });
    setActiveMenuId(null);
  };

  const handleRemove = async (id: string) => {
    await send({ type: 'REMOVE_MANGA', id });
    setActiveMenuId(null);
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

  const handleTogglePref = async (key: 'autoTrack' | 'bgTabFallback' | 'periodicSync') => {
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
    })
  );

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

  const renderDropdownMenu = (m: Manga) => (
    <div className="dropdown-menu" onClick={(e) => e.stopPropagation()}>
      <div className="dropdown-label">Change status</div>
      {STATUSES.map((st) => (
        <button
          key={st}
          type="button"
          className={`dropdown-item ${m.status === st ? 'active' : ''}`}
          onClick={() => void handleStatusChange(m.id, st)}
        >
          <span>{STATUS_LABEL[st]}</span>
          {m.status === st && <Check size={14} />}
        </button>
      ))}
      <div className="dropdown-divider" />
      <button
        type="button"
        className="dropdown-item"
        onClick={() => void handleTogglePin(m.id, m.pinned)}
      >
        <span>{m.pinned ? 'Unpin' : 'Pin to top'}</span>
        <Pin size={14} />
      </button>
      <button
        type="button"
        className="dropdown-item danger"
        onClick={() => void handleRemove(m.id)}
      >
        <span>Remove</span>
        <Trash2 size={14} />
      </button>
    </div>
  );

  // Render 1-Column (List view) card
  const renderMangaCard = (m: Manga, showDomain: boolean) => {
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
      <div key={m.id} className="manga-card">
        <div className="manga-cover">
          {m.coverUrl ? <img src={m.coverUrl} alt="" /> : <span>{firstLetter}</span>}
        </div>

        <div className="manga-details">
          <div className="manga-head">
            <h4 className="font-display manga-name" title={m.title}>
              {m.title}
            </h4>
            {m.pinned && <Pin size={12} className="pin-icon" fill="currentColor" />}
          </div>

          <div className="manga-sub">
            {showDomain && `${domain} · `}
            {STATUS_LABEL[m.status]}
          </div>

          <div className="manga-progress">
            <span>
              Read <b>{m.lastReadChapter ?? '—'}</b>
            </span>
            <span style={{ color: '#9ca3af' }}>/</span>
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
            {timeText && (
              <span className="manga-time-badge" title={timeText}>
                <Clock size={11} />
                <span>{timeText}</span>
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          className="btn-more"
          aria-label="More options"
          onClick={(e) => {
            e.stopPropagation();
            setActiveMenuId(activeMenuId === m.id ? null : m.id);
          }}
        >
          <MoreVertical size={16} />
        </button>

        {activeMenuId === m.id && renderDropdownMenu(m)}
      </div>
    );
  };

  // Render 2-Column (Grid view) card with concise info
  const renderMangaGridCard = (m: Manga, showDomain: boolean) => {
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
      <div key={m.id} className="manga-card-grid">
        <div className="grid-cover-wrap">
          {m.coverUrl ? (
            <img src={m.coverUrl} alt="" className="grid-cover-img" />
          ) : (
            <div className="grid-cover-placeholder">
              <span>{firstLetter}</span>
            </div>
          )}

          {m.pinned && (
            <div className="grid-badge-pin" title="Pinned">
              <Pin size={10} fill="currentColor" />
            </div>
          )}

          {isUpdated && (
            <div className="grid-badge-new">
              +{chaptersWaiting} NEW
            </div>
          )}

          <button
            type="button"
            className="btn-more-grid"
            aria-label="More options"
            onClick={(e) => {
              e.stopPropagation();
              setActiveMenuId(activeMenuId === m.id ? null : m.id);
            }}
          >
            <MoreVertical size={14} />
          </button>

          {activeMenuId === m.id && renderDropdownMenu(m)}
        </div>

        <div className="grid-card-body">
          <h4 className="font-display grid-manga-title" title={m.title}>
            {m.title}
          </h4>

          <div className="grid-manga-sub">
            {showDomain && <span className="grid-domain">{domain} · </span>}
            <span>{STATUS_LABEL[m.status]}</span>
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
              <p style={{ color: '#9ca3af', fontSize: '12px', margin: '8px 0' }}>
                No sites subscribed yet.
              </p>
            ) : (
              appState?.sites.map((site) => (
                <div key={site.origin} className="site-list-item">
                  <div>
                    <div className="site-item-domain">{hostOf(site.origin)}</div>
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
                <div style={{ fontSize: '11px', color: '#9ca3af' }}>Corner or free draggable</div>
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
                <div style={{ fontSize: '11px', color: '#9ca3af' }}>Auto-check chapters in background</div>
              </div>
              <button
                type="button"
                className={`switch-toggle ${appState?.settings.periodicSync ? 'on' : ''}`}
                onClick={() => void handleTogglePref('periodicSync')}
                aria-label="Toggle periodic background sync"
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
        <button type="button" className="btn-sync-all" onClick={handleSyncAll}>
          <RefreshCw size={14} className={syncing ? 'spin' : ''} />
          <span>{syncing ? 'Checking…' : 'Sync all'}</span>
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

      {/* Filter check options & layout toggle */}
      <div className="filter-options">
        <div className="filter-checkboxes">
          <label className="filter-label">
            <input
              type="checkbox"
              checked={onlyUpdates}
              onChange={(e) => setOnlyUpdates(e.target.checked)}
            />
            <span>Only with updates</span>
          </label>
          <label className="filter-label">
            <input
              type="checkbox"
              checked={groupBySite}
              onChange={(e) => setGroupBySite(e.target.checked)}
            />
            <span>Group by site</span>
          </label>
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
      <div className="manga-list">
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

      {/* Footer */}
      <div className="popup-footer">
        <span>
          {appState?.lastSyncAllAt
            ? `Last sync: ${new Date(appState.lastSyncAllAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'Not synced yet'}
        </span>
        <button
          type="button"
          className="btn-options"
          onClick={() => setView('options')}
        >
          <Settings size={14} />
          <span>Options</span>
        </button>
      </div>
    </div>
  );
}
