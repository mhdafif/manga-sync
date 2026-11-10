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
  const [isDragging, setIsDragging] = useState(false);

  // Position state (default bottom-right: 24px from right, 24px from bottom)
  const [pos, setPos] = useState<{ x: number; y: number }>(() => ({
    x: typeof window !== 'undefined' ? Math.max(16, window.innerWidth - 170) : 100,
    y: typeof window !== 'undefined' ? Math.max(16, window.innerHeight - 75) : 100,
  }));
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0,
    startY: 0,
    initX: 0,
    initY: 0,
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
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        // Clamp saved coordinates to current viewport
        const clampedX = Math.max(12, Math.min(window.innerWidth - 60, saved.x));
        const clampedY = Math.max(12, Math.min(window.innerHeight - 60, saved.y));
        setPos({ x: clampedX, y: clampedY });
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
  const handleDragStart = (clientX: number, clientY: number) => {
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    setIsDragging(true);
    dragStartRef.current = {
      startX: clientX,
      startY: clientY,
      initX: pos.x,
      initY: pos.y,
    };

    const handlePointerMove = (moveX: number, moveY: number) => {
      if (!isDraggingRef.current) return;
      const dx = moveX - dragStartRef.current.startX;
      const dy = moveY - dragStartRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMovedRef.current = true;
      }
      const maxX = Math.max(12, window.innerWidth - 60);
      const maxY = Math.max(12, window.innerHeight - 60);
      const newX = Math.max(12, Math.min(maxX, dragStartRef.current.initX + dx));
      const newY = Math.max(12, Math.min(maxY, dragStartRef.current.initY + dy));
      setPos({ x: newX, y: newY });
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      if (hasMovedRef.current) {
        setFabPos({ x: pos.x, y: pos.y }).catch(() => undefined);
      }
    };

    const onMouseMove = (e: MouseEvent) => handlePointerMove(e.clientX, e.clientY);
    const onMouseUp = () => handlePointerUp();
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchEnd = () => handlePointerUp();

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Prevent dragging when clicking inside open panel
    if ((e.target as HTMLElement).closest('.fab-panel')) return;
    e.preventDefault(); // Prevent text selection and HTML5 native drag!
    handleDragStart(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('.fab-panel')) return;
    if (e.touches[0]) {
      handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
    }
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

  const popAbove = typeof window !== 'undefined' ? pos.y > window.innerHeight / 2 : true;
  const alignRight = typeof window !== 'undefined' ? pos.x > window.innerWidth / 2 : true;
  const panelClass = `fab-panel ${popAbove ? 'pop-above' : 'pop-below'} ${alignRight ? 'align-right' : 'align-left'}`;

  return (
    <div className="fab-container" style={{ left: `${pos.x}px`, top: `${pos.y}px` }}>
      {panelOpen && (
        <div className={panelClass}>
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
        className={`${fabClass} ${isDragging ? 'dragging' : ''}`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={handleFabClick}
        aria-label="Manga Sync"
      >
        {fabContent}
      </button>
    </div>
  );
}
