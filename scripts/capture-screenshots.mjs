import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIST = path.resolve(__dirname, '../dist/chrome-mv3');
const OUT_DIR = path.resolve(__dirname, '../docs/screenshots');

fs.mkdirSync(OUT_DIR, { recursive: true });

function makeCoverSvg(title, c1, c2, symbol) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 300 420">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}" />
        <stop offset="100%" stop-color="${c2}" />
      </linearGradient>
    </defs>
    <rect width="300" height="420" fill="url(#bg)" />
    <circle cx="150" cy="160" r="64" fill="rgba(255,255,255,0.18)" />
    <text x="150" y="180" font-family="-apple-system, sans-serif" font-size="54" font-weight="900" fill="#ffffff" text-anchor="middle">${symbol}</text>
    <rect x="20" y="315" width="260" height="75" rx="10" fill="rgba(0,0,0,0.55)" />
    <text x="150" y="360" font-family="-apple-system, sans-serif" font-size="18" font-weight="700" fill="#ffffff" text-anchor="middle">${title.length > 20 ? title.slice(0, 19) + '…' : title}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const mockMangas = {
  'demo-scans.com::shadow-blade-chronicles': {
    id: 'demo-scans.com::shadow-blade-chronicles',
    siteOrigin: 'https://demo-scans.com',
    slug: 'shadow-blade-chronicles',
    title: 'Shadow Blade Chronicles',
    coverUrl: makeCoverSvg('Shadow Blade Chronicles', '#4f46e5', '#7c3aed', '⚔️'),
    seriesUrl: 'https://demo-scans.com/comics/shadow-blade-chronicles',
    status: 'reading',
    pinned: true,
    lastReadChapter: 42,
    lastReadUrl: 'https://demo-scans.com/comics/shadow-blade-chronicles/chapter/42',
    lastReadAt: Date.now() - 3600 * 1000 * 4,
    latestChapter: 45,
    latestChapterUrl: 'https://demo-scans.com/comics/shadow-blade-chronicles/chapter/45',
    lastUpdatedAt: Date.now() - 3600 * 1000 * 2,
    lastSyncedAt: Date.now() - 3600 * 1000 * 2,
    recentChapters: [
      { number: 43, url: 'https://demo-scans.com/comics/shadow-blade-chronicles/chapter/43' },
      { number: 44, url: 'https://demo-scans.com/comics/shadow-blade-chronicles/chapter/44' },
      { number: 45, url: 'https://demo-scans.com/comics/shadow-blade-chronicles/chapter/45' },
    ],
    addedAt: Date.now() - 86400 * 1000 * 30,
  },
  'demo-scans.com::cyber-samurai-2099': {
    id: 'demo-scans.com::cyber-samurai-2099',
    siteOrigin: 'https://demo-scans.com',
    slug: 'cyber-samurai-2099',
    title: 'Cyber Samurai 2099',
    coverUrl: makeCoverSvg('Cyber Samurai 2099', '#059669', '#10b981', '⚡'),
    seriesUrl: 'https://demo-scans.com/comics/cyber-samurai-2099',
    status: 'reading',
    pinned: true,
    lastReadChapter: 120,
    lastReadUrl: 'https://demo-scans.com/comics/cyber-samurai-2099/chapter/120',
    lastReadAt: Date.now() - 3600 * 1000 * 10,
    latestChapter: 121,
    latestChapterUrl: 'https://demo-scans.com/comics/cyber-samurai-2099/chapter/121',
    lastUpdatedAt: Date.now() - 3600 * 1000 * 5,
    lastSyncedAt: Date.now() - 3600 * 1000 * 5,
    recentChapters: [
      { number: 121, url: 'https://demo-scans.com/comics/cyber-samurai-2099/chapter/121' },
    ],
    addedAt: Date.now() - 86400 * 1000 * 60,
  },
  'demo-scans.com::the-alchemists-return': {
    id: 'demo-scans.com::the-alchemists-return',
    siteOrigin: 'https://demo-scans.com',
    slug: 'the-alchemists-return',
    title: "The Alchemist's Return",
    coverUrl: makeCoverSvg('The Alchemist', '#ea580c', '#f97316', '🌸'),
    seriesUrl: 'https://demo-scans.com/comics/the-alchemists-return',
    status: 'reading',
    pinned: false,
    lastReadChapter: 88,
    lastReadUrl: 'https://demo-scans.com/comics/the-alchemists-return/chapter/88',
    lastReadAt: Date.now() - 86400 * 1000 * 2,
    latestChapter: 88,
    latestChapterUrl: 'https://demo-scans.com/comics/the-alchemists-return/chapter/88',
    lastUpdatedAt: Date.now() - 86400 * 1000 * 2,
    lastSyncedAt: Date.now() - 86400 * 1000 * 2,
    addedAt: Date.now() - 86400 * 1000 * 90,
  },
  'reader-hub.org::infinite-arcana': {
    id: 'reader-hub.org::infinite-arcana',
    siteOrigin: 'https://reader-hub.org',
    slug: 'infinite-arcana',
    title: 'Infinite Arcana',
    coverUrl: makeCoverSvg('Infinite Arcana', '#0284c7', '#38bdf8', '📖'),
    seriesUrl: 'https://reader-hub.org/title/infinite-arcana',
    status: 'reading',
    pinned: false,
    lastReadChapter: 215,
    lastReadUrl: 'https://reader-hub.org/chapter/215',
    lastReadAt: Date.now() - 86400 * 1000 * 3,
    latestChapter: 219,
    latestChapterUrl: 'https://reader-hub.org/chapter/219',
    lastUpdatedAt: Date.now() - 3600 * 1000 * 8,
    lastSyncedAt: Date.now() - 3600 * 1000 * 8,
    addedAt: Date.now() - 86400 * 1000 * 100,
  },
  'reader-hub.org::starbound-voyager': {
    id: 'reader-hub.org::starbound-voyager',
    siteOrigin: 'https://reader-hub.org',
    slug: 'starbound-voyager',
    title: 'Starbound Voyager',
    coverUrl: makeCoverSvg('Starbound', '#8b5cf6', '#a855f7', '✨'),
    seriesUrl: 'https://reader-hub.org/title/starbound-voyager',
    status: 'plan',
    pinned: false,
    lastReadChapter: null,
    latestChapter: 60,
    latestChapterUrl: 'https://reader-hub.org/chapter/60',
    lastUpdatedAt: Date.now() - 86400 * 1000 * 7,
    lastSyncedAt: Date.now() - 86400 * 1000 * 7,
    addedAt: Date.now() - 86400 * 1000 * 15,
  },
};

const mockSites = [
  { origin: 'https://demo-scans.com', adapterId: 'generic', addedAt: Date.now() - 86400 * 1000 * 120 },
  { origin: 'https://reader-hub.org', adapterId: 'generic', addedAt: Date.now() - 86400 * 1000 * 100 },
];

const mockState = {
  sites: mockSites,
  mangas: mockMangas,
  settings: {
    autoTrack: true,
    bgTabFallback: true,
    periodicSync: true,
    periodicSyncInterval: 60,
    notifications: true,
    fabPosition: 'bottom-right',
    theme: 'system',
  },
  lastSyncAllAt: Date.now() - 3600 * 1000 * 2,
};

async function main() {
  console.log('🚀 Generating showcase screenshots...');

  const server = http.createServer((req, res) => {
    const cleanUrl = req.url.split('?')[0];

    if (cleanUrl === '/reader.html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Shadow Blade Chronicles Chapter 42</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0f172a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
    }
    header {
      height: 56px;
      background: #1e293b;
      border-bottom: 1px solid #334155;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 32px;
    }
    .brand { font-size: 18px; font-weight: 800; color: #a78bfa; }
    .series-nav { font-size: 14px; font-weight: 600; color: #cbd5e1; }
    .content-wrap {
      max-width: 800px;
      margin: 30px auto;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .panel {
      width: 100%;
      height: 480px;
      background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
      border: 1px solid #334155;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #64748b;
      font-size: 22px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">⚡ Comic Reader</div>
    <div class="series-nav">Shadow Blade Chronicles — Chapter 42</div>
    <div style="font-size: 13px; color: #94a3b8;">Chapter 43 ➔</div>
  </header>
  <div class="content-wrap">
    <div class="panel">Comic Panel 1</div>
    <div class="panel">Comic Panel 2</div>
  </div>
  <script type="module" src="/content-scripts/content.js"></script>
</body>
</html>`);
      return;
    }

    let filePath = path.join(DIST, cleanUrl);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST, 'popup.html');
    }
    const ext = path.extname(filePath);
    const mimes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.woff2': 'font/woff2',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
    };
    res.setHeader('Content-Type', mimes[ext] || 'application/octet-stream');
    res.end(fs.readFileSync(filePath));
  });

  const PORT = 4789;
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
  });

  const setupMocks = async (page, customSettings = {}) => {
    const st = { ...mockState, settings: { ...mockState.settings, ...customSettings } };
    await page.evaluateOnNewDocument((stateData) => {
      const listeners = [];
      window.chrome = window.browser = {
        storage: {
          local: {
            get: async (key) => ({ state: stateData }),
            set: async (obj) => {
              if (obj.state) Object.assign(stateData, obj.state);
              listeners.forEach((cb) => cb({ state: { newValue: stateData } }, 'local'));
            },
          },
          onChanged: {
            addListener: (cb) => listeners.push(cb),
            removeListener: () => {},
          },
        },
        tabs: {
          query: async () => [{ url: 'https://demo-scans.com/comics/shadow-blade-chronicles', title: 'Shadow Blade Chronicles' }],
          create: async () => {},
        },
        runtime: {
          sendMessage: async (msg) => {
            if (msg.type === 'PATCH_MANGA') {
              if (stateData.mangas[msg.id]) Object.assign(stateData.mangas[msg.id], msg.patch);
              return { ok: true };
            }
            if (msg.type === 'SET_SETTINGS') {
              Object.assign(stateData.settings, msg.patch);
              return { ok: true };
            }
            return { ok: true };
          },
          openOptionsPage: async () => {},
          getURL: (p) => p,
        },
        action: {
          setBadgeText: async () => {},
          setBadgeBackgroundColor: async () => {},
        },
        alarms: {
          create: () => {},
          clear: async () => {},
        },
      };
    }, st);
  };

  try {
    // 1. Popup List View (Light)
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 400, height: 520, deviceScaleFactor: 2 });
      await setupMocks(page);
      await page.goto(`http://127.0.0.1:${PORT}/popup.html`);
      await page.evaluate(() => {
        localStorage.setItem('manga_sync_layout', 'list');
        localStorage.setItem('manga_sync_theme', 'light');
        document.documentElement.dataset.theme = 'light';
      });
      await page.reload();
      await page.waitForSelector('.popup-container');
      await new Promise((r) => setTimeout(r, 500));

      const container = await page.$('.popup-container');
      await container.screenshot({ path: path.join(OUT_DIR, 'popup-list-light.png') });
      console.log('✓ Captured: popup-list-light.png');
      await page.close();
    }

    // 2. Popup Grid View (Light)
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 400, height: 520, deviceScaleFactor: 2 });
      await setupMocks(page);
      await page.goto(`http://127.0.0.1:${PORT}/popup.html`);
      await page.evaluate(() => {
        localStorage.setItem('manga_sync_layout', 'grid');
        localStorage.setItem('manga_sync_theme', 'light');
        document.documentElement.dataset.theme = 'light';
      });
      await page.reload();
      await page.waitForSelector('.popup-container');
      await new Promise((r) => setTimeout(r, 500));

      const container = await page.$('.popup-container');
      await container.screenshot({ path: path.join(OUT_DIR, 'popup-grid-light.png') });
      console.log('✓ Captured: popup-grid-light.png');
      await page.close();
    }

    // 3. Popup Dark Mode
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 400, height: 520, deviceScaleFactor: 2 });
      await setupMocks(page, { theme: 'dark' });
      await page.goto(`http://127.0.0.1:${PORT}/popup.html`);
      await page.evaluate(() => {
        localStorage.setItem('manga_sync_layout', 'list');
        localStorage.setItem('manga_sync_theme', 'dark');
        document.documentElement.dataset.theme = 'dark';
      });
      await page.reload();
      await page.waitForSelector('.popup-container');
      await new Promise((r) => setTimeout(r, 500));

      const container = await page.$('.popup-container');
      await container.screenshot({ path: path.join(OUT_DIR, 'popup-dark.png') });
      console.log('✓ Captured: popup-dark.png');
      await page.close();
    }

    // 4. Popup Filter Popover
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 400, height: 520, deviceScaleFactor: 2 });
      await setupMocks(page);
      await page.goto(`http://127.0.0.1:${PORT}/popup.html`);
      await page.evaluate(() => {
        localStorage.setItem('manga_sync_layout', 'list');
        localStorage.setItem('manga_sync_theme', 'light');
        document.documentElement.dataset.theme = 'light';
      });
      await page.reload();
      await page.waitForSelector('.btn-filter');
      await page.click('.btn-filter');
      await page.waitForSelector('.filter-popover');
      await new Promise((r) => setTimeout(r, 400));

      const container = await page.$('.popup-container');
      await container.screenshot({ path: path.join(OUT_DIR, 'popup-filter.png') });
      console.log('✓ Captured: popup-filter.png');
      await page.close();
    }

    // 5. Options Dashboard
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1040, height: 820, deviceScaleFactor: 2 });
      await setupMocks(page);
      await page.goto(`http://127.0.0.1:${PORT}/options.html`);
      await page.waitForSelector('.page-title');
      await new Promise((r) => setTimeout(r, 600));

      await page.screenshot({ path: path.join(OUT_DIR, 'options-dashboard.png') });
      console.log('✓ Captured: options-dashboard.png');
      await page.close();
    }

    // 6. In-Page Reader with Floating Button & Quick Action Panel
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1100, height: 740, deviceScaleFactor: 2 });
      await setupMocks(page);
      await page.goto(`http://127.0.0.1:${PORT}/reader.html`);
      await page.waitForSelector('manga-sync-fab-root', { timeout: 8000 });
      await new Promise((r) => setTimeout(r, 500));

      await page.evaluate(() => {
        const host = document.querySelector('manga-sync-fab-root');
        const root = host?.shadowRoot;
        const btn = root?.querySelector('.fab-btn');
        btn?.click();
      });

      await new Promise((r) => setTimeout(r, 500));
      await page.screenshot({ path: path.join(OUT_DIR, 'reader-fab.png') });
      console.log('✓ Captured: reader-fab.png');
      await page.close();
    }

    // 7. Promo Banner (1280x640)
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 640, deviceScaleFactor: 2 });

      const darkImgB64 = fs.readFileSync(path.join(OUT_DIR, 'popup-dark.png')).toString('base64');
      const lightImgB64 = fs.readFileSync(path.join(OUT_DIR, 'popup-list-light.png')).toString('base64');

      const promoHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Outfit:wght@400;500;600;700&display=swap">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1280px;
      height: 640px;
      background: radial-gradient(circle at 82% 20%, #2e1065 0%, #0f172a 60%, #030712 100%);
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #ffffff;
      display: flex;
      position: relative;
      overflow: hidden;
      padding: 50px 64px;
    }
    .left {
      flex: 1.15;
      display: flex;
      flex-direction: column;
      justify-content: center;
      z-index: 2;
    }
    .badge-pill {
      align-self: flex-start;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 9999px;
      background: rgba(124, 58, 237, 0.2);
      border: 1px solid rgba(167, 139, 250, 0.4);
      color: #c4b5fd;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 18px;
    }
    h1 {
      font-family: 'Bricolage Grotesque', sans-serif;
      font-size: 46px;
      line-height: 1.12;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 16px;
    }
    h1 span {
      background: linear-gradient(135deg, #a78bfa 0%, #c084fc 50%, #f472b6 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    p {
      font-size: 16px;
      line-height: 1.5;
      color: #94a3b8;
      max-width: 520px;
      margin-bottom: 24px;
    }
    .features-list {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px 16px;
      max-width: 520px;
    }
    .feature-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 500;
      color: #e2e8f0;
    }
    .feature-icon {
      color: #a78bfa;
      font-weight: bold;
    }
    .right {
      flex: 0.85;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .mockup-wrap {
      position: relative;
      width: 360px;
      height: 480px;
    }
    .mockup-img {
      position: absolute;
      width: 310px;
      border-radius: 14px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.12);
    }
    .img-back {
      right: -10px;
      top: 15px;
      opacity: 0.88;
      transform: rotate(5deg) scale(0.95);
      filter: brightness(0.92);
    }
    .img-front {
      left: -15px;
      top: 5px;
      z-index: 3;
      transform: rotate(-3deg);
    }
    .glow {
      position: absolute;
      width: 450px;
      height: 450px;
      background: radial-gradient(circle, rgba(124, 58, 237, 0.4) 0%, transparent 70%);
      top: 80px;
      right: 30px;
      z-index: 1;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div class="glow"></div>
  <div class="left">
    <div class="badge-pill">
      <span>✨ Chrome Extension · Open Source</span>
    </div>
    <h1>Never lose your <span>reading progress</span> again.</h1>
    <p>Auto-tracks what chapter you're reading, alerts you when new chapters release, and keeps all your reading sites organized in one fast, beautiful popup.</p>
    <div class="features-list">
      <div class="feature-item"><span class="feature-icon">⚡</span> Auto-Track Progress</div>
      <div class="feature-item"><span class="feature-icon">🔔</span> Chapter Notifications</div>
      <div class="feature-item"><span class="feature-icon">📌</span> Pinned & Site Groups</div>
      <div class="feature-item"><span class="feature-icon">🌓</span> Dark & Light Themes</div>
      <div class="feature-item"><span class="feature-icon">💾</span> Full JSON Backup</div>
      <div class="feature-item"><span class="feature-icon">🎯</span> 1-Col & 2-Col Grid</div>
    </div>
  </div>
  <div class="right">
    <div class="mockup-wrap">
      <img src="data:image/png;base64,${darkImgB64}" class="mockup-img img-back" alt="">
      <img src="data:image/png;base64,${lightImgB64}" class="mockup-img img-front" alt="">
    </div>
  </div>
</body>
</html>`;

      await page.setContent(promoHtml, { waitUntil: 'networkidle0' });
      await new Promise((r) => setTimeout(r, 600));

      await page.screenshot({ path: path.join(OUT_DIR, 'promo-banner.png') });
      console.log('✓ Captured: promo-banner.png');
      await page.close();
    }

    console.log('🎉 All screenshots generated successfully in docs/screenshots/!');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('Error generating screenshots:', err);
  process.exit(1);
});
