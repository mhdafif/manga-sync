import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, ExternalLink, Loader2, Pin, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { getAdapter } from '../../adapters';
import { applyProgress, hasUpdate, newCount } from '../../core/logic';
import { send } from '../../core/messages';
import { getFabPos, getState, onStateChange, setFabPos } from '../../core/storage';
import { STATUSES, STATUS_LABEL, type AppState, type PageInfo, type Status } from '../../core/types';
import { mangaId } from '../../core/url';

export default function ContentApp() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [url, setUrl] = useState(() => window.location.href);
  const [panelOpen, setPanelOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<Status>('reading');
  const [progressNotice, setProgressNotice] = useState<string | null>(null);

  // Position state (default bottom-right)
  const [pos, setPos] = useState<{ right: number; bottom: number }>({ right: 24, bottom: 24 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initRight: number; initBottom: number }>({
    startX: 0,
    startY: 0,
    initRight: 24,
    initBottom: 24,
  });
  const hasMovedRef = useRef(false);

  // Listen to storage state changes
  useEffect(() => {
    void getState().then(setAppState);
    return onStateChange(setAppState);
  }, []);

  // Restore saved FAB position
  useEffect(() => {
    void getFabPos().then((saved) => {
      if (saved) {
        setPos({ right: saved.x, bottom: saved.y });
      }
    });
  }, []);

  // Detect SPA URL changes
  useEffect(() => {
    const handleUrlChange = () => {
      if (window.location.href !== url) {
        setUrl(window.location.href);
      }
    };

    window.addEventListener('popstate', handleUrlChange);

    // Monkey-patch history
    const origPushState = history.pushState;
    const origReplaceState = history.replaceState;
    history.pushState = function (...args) {
      origPushState.apply(this, args);
      handleUrlChange();
    };
    history.replaceState = function (...args) {
      origReplaceState.apply(this, args);
      handleUrlChange();
    };

    // Polling fallback
    const interval = setInterval(handleUrlChange, 1000);

    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      history.pushState = origPushState;
      history.replaceState = origReplaceState;
      clearInterval(interval);
    };
  }, [url]);

  // Page detection
  const currentUrlObj = new URL(url);
  const adapter = getAdapter(currentUrlObj);
  const pageInfo: PageInfo = adapter.detectPage(currentUrlObj, document);

  const origin = window.location.origin;
  const isSiteSubscribed = appState?.sites.some((s) => s.origin === origin) ?? false;

  const currentMangaId = pageInfo.kind !== 'other' ? mangaId(origin, pageInfo.slug) : null;
  const manga = currentMangaId && appState?.mangas ? appState.mangas[currentMangaId] : null;

  // Auto-track chapter after 3 seconds
  useEffect(() => {
    if (!appState || !manga || pageInfo.kind !== 'chapter' || !currentMangaId) return;
    if (appState.settings.autoTrack === false) return;

    const chapterNum = pageInfo.chapter;
    const currentHref = window.location.href;

    // Check if chapter is already marked as read
    if (manga.lastReadChapter !== null && manga.lastReadChapter >= chapterNum) {
      setProgressNotice(`Chapter ${chapterNum} already saved`);
      return;
    }

    setProgressNotice(`Saving chapter ${chapterNum} in 3s...`);

    const timer = setTimeout(async () => {
      if (window.location.href === currentHref) {
        await send({
          type: 'UPDATE_PROGRESS',
          id: currentMangaId,
          chapter: chapterNum,
          url: currentHref,
        });
        setProgressNotice(`Progress saved at Chapter ${chapterNum}`);
      }
    }, 3000);

    return () => {
      clearTimeout(timer);
    };
  }, [url, currentMangaId, manga?.id, pageInfo.kind]);

  // Keep latest canonical URL updated on series page visit
  useEffect(() => {
    if (manga && pageInfo.kind === 'series' && currentMangaId) {
      if (manga.seriesUrl !== pageInfo.seriesUrl) {
        void send({
          type: 'PAGE_SEEN',
          id: currentMangaId,
          seriesUrl: pageInfo.seriesUrl,
        });
      }
    }
  }, [url, currentMangaId, pageInfo.kind]);

  // If site is not subscribed, don't show the FAB
  if (!isSiteSubscribed) {
    return null;
  }

  // Dragging logic
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initRight: pos.right,
      initBottom: pos.bottom,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = moveEvent.clientX - dragStartRef.current.startX;
      const dy = moveEvent.clientY - dragStartRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMovedRef.current = true;
      }
      const newRight = Math.max(12, Math.min(window.innerWidth - 60, dragStartRef.current.initRight - dx));
      const newBottom = Math.max(12, Math.min(window.innerHeight - 60, dragStartRef.current.initBottom - dy));
      setPos({ right: newRight, bottom: newBottom });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (hasMovedRef.current) {
        setFabPos({ x: pos.right, y: pos.bottom }).catch(() => undefined);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleFabClick = () => {
    if (!hasMovedRef.current) {
      setPanelOpen((prev) => !prev);
    }
  };

  // Actions
  const handleAddManga = async () => {
    if (pageInfo.kind === 'other') return;
    await send({
      type: 'ADD_MANGA',
      origin,
      page: pageInfo,
      status: selectedStatus,
      url: window.location.href,
    });
    setPanelOpen(true);
  };

  const handleStatusChange = async (newStatus: Status) => {
    if (!currentMangaId) return;
    setSelectedStatus(newStatus);
    await send({
      type: 'PATCH_MANGA',
      id: currentMangaId,
      patch: { status: newStatus },
    });
  };

  const handleTogglePin = async () => {
    if (!currentMangaId || !manga) return;
    await send({
      type: 'PATCH_MANGA',
      id: currentMangaId,
      patch: { pinned: !manga.pinned },
    });
  };

  const handleRemove = async () => {
    if (!currentMangaId) return;
    await send({ type: 'REMOVE_MANGA', id: currentMangaId });
    setPanelOpen(false);
  };

  const handleSync = async () => {
    if (!currentMangaId) return;
    setSyncing(true);
    await send({ type: 'SYNC_ONE', id: currentMangaId });
    setTimeout(() => setSyncing(false), 800);
  };

  // Render FAB button styling based on state
  const isMangaInList = Boolean(manga);
  const isUpdated = manga ? hasUpdate(manga) : false;
  const newChapters = manga ? newCount(manga) : 0;

  let fabClass = 'fab-btn fab--other';
  let fabContent: React.ReactNode = (
    <>
      <BookOpen size={18} />
      <span>Manga Sync</span>
    </>
  );

  if (isMangaInList && manga) {
    fabClass = 'fab-btn fab--in';
    fabContent = (
      <>
        <span className="badge-dot" />
        <span>Ch {manga.lastReadChapter ?? '—'}</span>
        {isUpdated && <span className="badge-new">+{newChapters}</span>}
      </>
    );
  } else if (pageInfo.kind !== 'other') {
    fabClass = 'fab-btn fab--add';
    fabContent = (
      <>
        <Plus size={18} />
        <span>Add manga</span>
      </>
    );
  }

  // Cover image / fallback
  const renderCover = () => {
    const coverUrl = manga?.coverUrl || (pageInfo.kind === 'series' ? pageInfo.coverUrl : undefined);
    const titleText = manga?.title || (pageInfo.kind !== 'other' ? pageInfo.title : '');
    const firstLetter = titleText ? titleText.charAt(0).toUpperCase() : 'M';

    return (
      <div className="cover-box">
        {coverUrl ? <img src={coverUrl} alt="" /> : <span>{firstLetter}</span>}
      </div>
    );
  };

  return (
    <div className="fab-container" style={{ right: `${pos.right}px`, bottom: `${pos.bottom}px` }}>
      {panelOpen && (
        <div className="fab-panel">
          {pageInfo.kind === 'other' && !manga ? (
            <div>
              <h3 className="font-display manga-title">{currentUrlObj.host}</h3>
              <p className="site-name">
                {Object.values(appState?.mangas || {}).filter((m) => m.siteOrigin === origin).length} manga tracked
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  void send({ type: 'OPEN_OPTIONS' });
                }}
              >
                <span>Open settings</span>
                <ExternalLink size={16} />
              </button>
            </div>
          ) : !manga && pageInfo.kind !== 'other' ? (
            <div>
              <div className="panel-header">
                {renderCover()}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3 className="font-display manga-title">{pageInfo.title || pageInfo.slug}</h3>
                  <p className="site-name">{currentUrlObj.host}</p>
                  <div style={{ marginTop: '4px' }}>
                    <span className="pill">
                      {pageInfo.kind === 'chapter' ? `Detected Ch ${pageInfo.chapter}` : 'Series page'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="field-label">Initial status</div>
              <select
                className="select-status"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as Status)}
              >
                {STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {STATUS_LABEL[st]}
                  </option>
                ))}
              </select>

              <button type="button" className="btn-primary" onClick={handleAddManga}>
                <Plus size={16} />
                <span>Add to my list</span>
              </button>
            </div>
          ) : manga ? (
            <div>
              <div className="panel-header">
                {renderCover()}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <h3
                      className="font-display manga-title"
                      style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {manga.title}
                    </h3>
                    {manga.pinned && <Pin size={14} color="#a78bfa" fill="#a78bfa" />}
                  </div>
                  <p className="site-name">{currentUrlObj.host}</p>
                  <div style={{ marginTop: '4px' }}>
                    {isUpdated ? (
                      <span className="pill pill--update">+{newChapters} new chapters</span>
                    ) : (
                      <span className="pill pill--success">
                        <Check size={12} /> Up to date
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">Last read</div>
                  <div className="stat-val">Ch {manga.lastReadChapter ?? '—'}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Latest</div>
                  <div className="stat-val">{syncing ? '…' : `Ch ${manga.latestChapter ?? '?'}`}</div>
                </div>
              </div>

              {manga.latestChapter && manga.lastReadChapter && (
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min(100, (manga.lastReadChapter / manga.latestChapter) * 100)}%`,
                    }}
                  />
                </div>
              )}

              <div className="field-label">Status</div>
              <select
                className="select-status"
                value={manga.status}
                onChange={(e) => void handleStatusChange(e.target.value as Status)}
              >
                {STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {STATUS_LABEL[st]}
                  </option>
                ))}
              </select>

              <div className="btn-row">
                <button type="button" className="btn-secondary" onClick={handleSync}>
                  <RefreshCw size={14} className={syncing ? 'spin' : ''} />
                  <span>{syncing ? 'Checking…' : 'Sync'}</span>
                </button>
                <button
                  type="button"
                  className={`btn-icon ${manga.pinned ? 'active' : ''}`}
                  title={manga.pinned ? 'Unpin' : 'Pin to top'}
                  onClick={handleTogglePin}
                >
                  <Pin size={16} fill={manga.pinned ? 'currentColor' : 'none'} />
                </button>
                <button type="button" className="btn-icon" title="Remove from list" onClick={handleRemove}>
                  <Trash2 size={16} color="#ef4444" />
                </button>
              </div>

              {progressNotice && <div className="status-note">{progressNotice}</div>}
            </div>
          ) : null}
        </div>
      )}

      <button
        type="button"
        className={fabClass}
        onMouseDown={handleMouseDown}
        onClick={handleFabClick}
        aria-label="Manga Sync"
      >
        {fabContent}
      </button>
    </div>
  );
}
