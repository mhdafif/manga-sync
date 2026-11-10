import React, { useEffect, useRef, useState } from 'react';
import { BellOff, ExternalLink, Pin, Search, X } from 'lucide-react';
import { downloadBackup, importBackupFile } from '../../core/backupIo';
import { sortMangas, timeAgo } from '../../core/logic';
import { send } from '../../core/messages';
import { requestSite } from '../../core/sites';
import { getState, onStateChange } from '../../core/storage';
import { applyTheme, watchSystemTheme } from '../../core/theme';
import { STATUS_LABEL, type AppState, type FabPositionSetting, type ThemeSetting } from '../../core/types';
import { hostOf, normalizeOrigin } from '../../core/url';

export default function OptionsApp() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [newSiteInput, setNewSiteInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [mangaSearch, setMangaSearch] = useState('');
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void getState().then(setAppState);
    return onStateChange(setAppState);
  }, []);

  const theme = appState?.settings.theme;
  useEffect(() => {
    if (!theme) return;
    applyTheme(theme);
    return watchSystemTheme(theme);
  }, [theme]);

  const sites = appState?.sites ?? [];
  const mangas = appState ? Object.values(appState.mangas) : [];

  // Get list of unique domains present in manga list
  const domains = Array.from(new Set(mangas.map((m) => hostOf(m.siteOrigin)))).sort();

  // Reset selectedDomain if domain has no manga
  useEffect(() => {
    if (selectedDomain !== 'all' && !domains.includes(selectedDomain)) {
      setSelectedDomain('all');
    }
  }, [domains, selectedDomain]);

  const handleAddSite = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    const origin = normalizeOrigin(newSiteInput);
    if (!origin) {
      setAddError('Please enter a valid website address (e.g. asurascans.com)');
      return;
    }

    if (sites.some((s) => s.origin === origin)) {
      setAddError('This site is already in your subscribed list.');
      return;
    }

    try {
      const granted = await requestSite(origin);
      if (!granted) {
        setAddError('Permission was not granted for this site.');
        return;
      }
      await send({ type: 'SUBSCRIBE_SITE', origin });
      setNewSiteInput('');
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUnsubscribe = async (origin: string) => {
    await send({ type: 'UNSUBSCRIBE_SITE', origin });
  };

  const handleToggleSetting = async (key: 'autoTrack' | 'bgTabFallback' | 'periodicSync' | 'notifications') => {
    if (!appState) return;
    const current = appState.settings[key];
    await send({
      type: 'SET_SETTINGS',
      patch: { [key]: !current },
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

  const handleSetFabPosition = async (pos: FabPositionSetting) => {
    await send({
      type: 'SET_SETTINGS',
      patch: { fabPosition: pos },
    });
  };

  const handleRemoveManga = async (id: string) => {
    await send({ type: 'REMOVE_MANGA', id });
  };

  const cleanSearch = mangaSearch.trim().toLowerCase();
  const filteredMangas = sortMangas(
    mangas.filter((m) => {
      if (selectedDomain !== 'all' && hostOf(m.siteOrigin) !== selectedDomain) return false;
      if (cleanSearch) {
        const title = (m.title || '').toLowerCase();
        const slug = (m.slug || '').toLowerCase();
        if (!title.includes(cleanSearch) && !slug.includes(cleanSearch)) return false;
      }
      return true;
    })
  );

  return (
    <div className="container">
      <h1 className="font-display page-title">Manga Sync Settings</h1>
      <p className="page-subtitle">Manage subscribed domains, reading automation, and your saved manga library.</p>

      <div className="options-stack">
        {/* Subscribed Sites Section */}
        <div className="card sites-section">
          <h2 className="font-display card-title">Subscribed Sites</h2>
          <p className="card-desc">The floating button only appears on sites in this whitelist.</p>

          {sites.length === 0 ? (
            <p style={{ color: 'var(--text-faint)', fontSize: '13px', margin: '16px 0' }}>
              No sites subscribed yet. Add a domain below or subscribe from the popup.
            </p>
          ) : (
            <div className="sites-grid">
              {sites.map((site) => {
                const mangaCount = mangas.filter((m) => m.siteOrigin === site.origin).length;
                const addedDate = new Date(site.addedAt).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });

                return (
                  <div key={site.origin} className="site-item">
                    <div>
                      <a
                        className="site-origin site-link"
                        href={site.origin}
                        target="_blank"
                        rel="noreferrer"
                        title={`Open ${site.origin}`}
                      >
                        <span>{hostOf(site.origin)}</span>
                        <ExternalLink size={12} />
                      </a>
                      <div className="site-meta">
                        adapter: {site.adapterId} · {mangaCount} manga · since {addedDate}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-unsubscribe"
                      onClick={() => void handleUnsubscribe(site.origin)}
                    >
                      Unsubscribe
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <form onSubmit={handleAddSite} className="add-site-form">
            <input
              type="text"
              className="input-text"
              placeholder="e.g. asurascans.com"
              value={newSiteInput}
              onChange={(e) => setNewSiteInput(e.target.value)}
            />
            <button type="submit" className="btn-primary">
              Add site
            </button>
          </form>

          {addError && (
            <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '8px' }}>{addError}</p>
          )}

          <p style={{ color: 'var(--text-faint)', fontSize: '11px', marginTop: '10px' }}>
            Chrome will display a permission prompt when adding a new domain.
          </p>
        </div>

        {/* Section 2: My Manga Library - Dedicated 1 Full Row */}
        <div className="card library-section">
          <h2 className="font-display card-title">My Manga Library</h2>
          <p className="card-desc">Filter by site source and view reading progress.</p>

            {/* Search by title */}
            <div className="options-search-box">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search manga by title…"
                value={mangaSearch}
                onChange={(e) => setMangaSearch(e.target.value)}
              />
              {mangaSearch && (
                <button
                  type="button"
                  className="btn-search-clear"
                  onClick={() => setMangaSearch('')}
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Domain filter chips */}
            <div className="chips-row">
              <button
                type="button"
                className={`chip ${selectedDomain === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedDomain('all')}
              >
                <span>All</span>
                <span className="chip-badge">{mangas.length}</span>
              </button>
              {domains.map((dom) => {
                const count = mangas.filter((m) => hostOf(m.siteOrigin) === dom).length;
                return (
                  <button
                    key={dom}
                    type="button"
                    className={`chip ${selectedDomain === dom ? 'active' : ''}`}
                    onClick={() => setSelectedDomain(dom)}
                  >
                    <span>{dom}</span>
                    <span className="chip-badge">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Manga table */}
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th className="th-title">Title</th>
                    {selectedDomain === 'all' && <th className="th-domain">Domain</th>}
                    <th className="th-status">Status</th>
                    <th className="th-read">Read</th>
                    <th className="th-latest">Latest</th>
                    <th className="th-action"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMangas.length === 0 ? (
                    <tr>
                      <td colSpan={selectedDomain === 'all' ? 6 : 5} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-faint)' }}>
                        No manga in this filter.
                      </td>
                    </tr>
                  ) : (
                    filteredMangas.map((m) => (
                      <tr key={m.id}>
                        <td className="manga-col-title">
                          {m.pinned && <Pin size={14} className="col-pin-icon" fill="currentColor" />}
                          {m.muted && <BellOff size={14} className="col-muted-icon" aria-label="Muted" />}
                          <a
                            className="title-link"
                            href={m.seriesUrl}
                            target="_blank"
                            rel="noreferrer"
                            title={`${m.title} — open series page`}
                          >
                            {m.title}
                          </a>
                        </td>
                        {selectedDomain === 'all' && (
                          <td className="col-domain">{hostOf(m.siteOrigin)}</td>
                        )}
                        <td className="col-status">
                          <span className="status-pill">{STATUS_LABEL[m.status]}</span>
                        </td>
                        <td className="col-read">
                          <div className="col-ch-num">{m.lastReadChapter ?? '—'}</div>
                          {m.lastReadAt && (
                            <div className="col-ch-time">
                              {timeAgo(m.lastReadAt)}
                            </div>
                          )}
                        </td>
                        <td className="col-latest">
                          <div className="col-ch-num">{m.latestChapter ?? '—'}</div>
                          {(m.lastUpdatedAt || m.lastSyncedAt) && (
                            <div className="col-ch-time">
                              {timeAgo(m.lastUpdatedAt || m.lastSyncedAt)}
                            </div>
                          )}
                        </td>
                        <td className="col-action">
                          <button
                            type="button"
                            className="btn-remove-link"
                            onClick={() => void handleRemoveManga(m.id)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        {/* Section 3: Preferences */}
        <div className="card preferences-section">
          <h2 className="font-display card-title">Preferences</h2>
          <p className="card-desc">Configure automation and background sync behavior.</p>

          <div className="settings-grid">
            <div className="setting-item">
              <span className="setting-label">Auto-track chapter progress when reading</span>
              <button
                type="button"
                className={`switch ${appState?.settings.autoTrack !== false ? 'on' : ''}`}
                onClick={() => void handleToggleSetting('autoTrack')}
                aria-label="Toggle auto-track progress"
              />
            </div>

            <div className="setting-item">
              <span className="setting-label">Fallback to background tab if direct fetch is blocked</span>
              <button
                type="button"
                className={`switch ${appState?.settings.bgTabFallback !== false ? 'on' : ''}`}
                onClick={() => void handleToggleSetting('bgTabFallback')}
                aria-label="Toggle background tab fallback"
              />
            </div>

            <div className="setting-item">
              <div>
                <span className="setting-label">Floating button position</span>
                <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '2px' }}>
                  Position of the reading progress button on manga sites
                </div>
              </div>
              <select
                className="select-interval-options"
                value={appState?.settings.fabPosition || 'draggable'}
                onChange={(e) => void handleSetFabPosition(e.target.value as FabPositionSetting)}
              >
                <option value="draggable">Draggable (Free)</option>
                <option value="bottom-right">Bottom Right corner</option>
                <option value="bottom-left">Bottom Left corner</option>
                <option value="top-right">Top Right corner</option>
                <option value="top-left">Top Left corner</option>
              </select>
            </div>

            <div className="setting-item">
              <div>
                <span className="setting-label">Periodic background sync</span>
                <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '2px' }}>
                  Automatically checks for new chapters in background
                </div>
              </div>
              <button
                type="button"
                className={`switch ${appState?.settings.periodicSync ? 'on' : ''}`}
                onClick={() => void handleToggleSetting('periodicSync')}
                aria-label="Toggle periodic background sync"
              />
            </div>

            <div className="setting-item">
              <div>
                <span className="setting-label">Desktop notifications</span>
                <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '2px' }}>
                  {appState?.settings.periodicSync
                    ? 'Notify when a new chapter is found'
                    : 'Needs periodic background sync'}
                </div>
              </div>
              <button
                type="button"
                className={`switch ${appState?.settings.notifications ? 'on' : ''}`}
                onClick={() => void handleToggleSetting('notifications')}
                aria-label="Toggle desktop notifications"
              />
            </div>

            <div className="setting-item">
              <span className="setting-label">Theme</span>
              <select
                className="select-interval-options"
                value={appState?.settings.theme || 'system'}
                onChange={(e) => void handleSetTheme(e.target.value as ThemeSetting)}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>

            <div className="setting-item">
              <div>
                <span className="setting-label">Backup</span>
                <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '2px' }}>
                  {backupNotice ?? 'Export your library to a file, or import one'}
                </div>
              </div>
              <div className="backup-buttons">
                <button type="button" className="btn-backup" onClick={() => appState && downloadBackup(appState)}>
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
            </div>

            {appState?.settings.periodicSync && (
              <div className="setting-item">
                <span className="setting-label">Sync frequency</span>
                <select
                  className="select-interval-options"
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
      </div>
    </div>
  );
}
