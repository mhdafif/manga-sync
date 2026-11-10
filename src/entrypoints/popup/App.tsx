import React, { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { ArrowLeft, Check, ChevronDown, ExternalLink, MoreVertical, Pin, RefreshCw, Settings, Trash2 } from 'lucide-react';
import { countUpdates, groupByDomain, hasUpdate, newCount, sortMangas } from '../../core/logic';
import { send } from '../../core/messages';
import { requestSite } from '../../core/sites';
import { getState, onStateChange } from '../../core/storage';
import { STATUSES, STATUS_LABEL, type AppState, type Manga, type Status } from '../../core/types';
import { hostOf, normalizeOrigin } from '../../core/url';

export default function PopupApp() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [activeOrigin, setActiveOrigin] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [onlyUpdates, setOnlyUpdates] = useState(false);
  const [groupBySite, setGroupBySite] = useState(true);
  const [collapsedSites, setCollapsedSites] = useState<Record<string, boolean>>({});
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
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

  const handleTogglePref = async (key: 'autoTrack' | 'bgTabFallback') => {
    if (!appState) return;
    await send({
      type: 'SET_SETTINGS',
      patch: { [key]: !appState.settings[key] },
    });
  };

  // Filter manga list
  const filteredMangas = sortMangas(
    mangas.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (onlyUpdates && !hasUpdate(m)) return false;
      return true;
    })
  );

  const getStatusCount = (st: 'all' | Status) => {
    if (st === 'all') return mangas.length;
    return mangas.filter((m) => m.status === st).length;
  };

  // Render individual manga item card
  const renderMangaCard = (m: Manga, showDomain: boolean) => {
    const isUpdated = hasUpdate(m);
    const chaptersWaiting = newCount(m);
    const domain = hostOf(m.siteOrigin);
    const firstLetter = m.title ? m.title.charAt(0).toUpperCase() : 'M';

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

        {activeMenuId === m.id && (
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
        )}
      </div>
    );
  };

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

  const domainGroups = groupBySite ? groupByDomain(filteredMangas, hostOf) : [];

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

      {/* Active site banner */}
      {activeOrigin ? (
        <div className="site-banner">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="site-label">Active site</div>
            <div className="site-host">{hostOf(activeOrigin)}</div>
          </div>
          {isCurrentSubscribed ? (
            <div className="btn-subscribed">
              <Check size={14} />
              <span>Subscribed</span>
            </div>
          ) : (
            <button type="button" className="btn-subscribe" onClick={handleSubscribeSite}>
              Subscribe site
            </button>
          )}
        </div>
      ) : (
        <div className="site-banner">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="site-label">Active site</div>
            <div className="site-host" style={{ color: '#6b7280', fontWeight: 400 }}>
              Open a manga site to subscribe
            </div>
          </div>
        </div>
      )}

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

      {/* Filter check options */}
      <div className="filter-options">
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

      {/* Manga list */}
      <div className="manga-list">
        {filteredMangas.length === 0 ? (
          <div className="empty-state">
            {totalTracked === 0
              ? 'No manga tracked yet. Visit a manga page and click "+ Add manga"!'
              : 'No manga matches the selected filter.'}
          </div>
        ) : groupBySite ? (
          domainGroups.map((group) => {
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
                  <div className="group-items">
                    {group.items.map((m) => renderMangaCard(m, false))}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          filteredMangas.map((m) => renderMangaCard(m, true))
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
