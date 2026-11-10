import React, { useEffect, useState } from 'react';
import { Pin, Search, Trash2, X } from 'lucide-react';
import { sortMangas } from '../../core/logic';
import { send } from '../../core/messages';
import { requestSite } from '../../core/sites';
import { getState, onStateChange } from '../../core/storage';
import { STATUS_LABEL, type AppState } from '../../core/types';
import { hostOf, normalizeOrigin } from '../../core/url';

export default function OptionsApp() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [newSiteInput, setNewSiteInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [mangaSearch, setMangaSearch] = useState('');

  useEffect(() => {
    void getState().then(setAppState);
    return onStateChange(setAppState);
  }, []);

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

  const handleToggleSetting = async (key: 'autoTrack' | 'bgTabFallback') => {
    if (!appState) return;
    const current = appState.settings[key];
    await send({
      type: 'SET_SETTINGS',
      patch: { [key]: !current },
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

      <div className="grid-layout">
        {/* Left Column: Subscribed Sites */}
        <div>
          <div className="card">
            <h2 className="font-display card-title">Subscribed Sites</h2>
            <p className="card-desc">The floating button only appears on sites in this whitelist.</p>

            {sites.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: '13px', margin: '16px 0' }}>
                No sites subscribed yet. Add a domain below or subscribe from the popup.
              </p>
            ) : (
              <div>
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
                        <div className="site-origin">{hostOf(site.origin)}</div>
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

            <p style={{ color: '#9ca3af', fontSize: '11px', marginTop: '10px' }}>
              Chrome will display a permission prompt when adding a new domain.
            </p>
          </div>
        </div>

        {/* Right Column: Manga Library */}
        <div>
          <div className="card">
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
                    <th>Title</th>
                    {selectedDomain === 'all' && <th>Domain</th>}
                    <th>Status</th>
                    <th>Read</th>
                    <th>Latest</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMangas.length === 0 ? (
                    <tr>
                      <td colSpan={selectedDomain === 'all' ? 6 : 5} style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af' }}>
                        No manga in this filter.
                      </td>
                    </tr>
                  ) : (
                    filteredMangas.map((m) => (
                      <tr key={m.id}>
                        <td className="manga-col-title">
                          {m.pinned && <Pin size={12} color="#7c3aed" fill="#7c3aed" />}
                          <span title={m.title}>{m.title}</span>
                        </td>
                        {selectedDomain === 'all' && (
                          <td style={{ color: '#6b7280', fontSize: '12px' }}>{hostOf(m.siteOrigin)}</td>
                        )}
                        <td>
                          <span className="status-pill">{STATUS_LABEL[m.status]}</span>
                        </td>
                        <td>{m.lastReadChapter ?? '—'}</td>
                        <td>{m.latestChapter ?? '—'}</td>
                        <td style={{ textAlign: 'right' }}>
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
        </div>

        {/* Full-width bottom card: Automation & Reading Settings */}
        <div className="card settings-section">
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
          </div>
        </div>
      </div>
    </div>
  );
}
