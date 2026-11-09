import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const EXT_PATH = path.resolve(__dirname, '../.output-e2e/chrome-mv3');

async function run() {
  console.log('--- Starting Manga Sync E2E Test ---');

  // 1. Create mock manga web server
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const u = req.url || '';

    if (u === '/comics/nano-machine-ab39de10' || u.startsWith('/comics/nano-machine-f212c582')) {
      res.end(`<!DOCTYPE html>
<html>
<head>
  <title>Nano Machine | Asura Scans</title>
  <link rel="canonical" href="http://127.0.0.1:3921/comics/nano-machine-f212c582">
  <meta property="og:title" content="Nano Machine | Asura Scans">
  <meta property="og:image" content="http://127.0.0.1:3921/cover.jpg">
</head>
<body>
  <h1>Nano Machine</h1>
  <a href="/comics/nano-machine-f212c582/chapter/1">Chapter 1</a>
  <a href="/comics/nano-machine-f212c582/chapter/5">Chapter 5</a>
  <a href="/comics/nano-machine-f212c582/chapter/10">Chapter 10</a>
</body>
</html>`);
    } else if (u.includes('/chapter/')) {
      const match = u.match(/chapter\/(\d+)/);
      const chNum = match ? match[1] : '1';
      res.end(`<!DOCTYPE html>
<html>
<head>
  <title>Nano Machine Chapter ${chNum} | Asura Scans</title>
</head>
<body>
  <h1>Nano Machine - Chapter ${chNum}</h1>
  <p>Reading content of chapter ${chNum}...</p>
</body>
</html>`);
    } else {
      res.end('<!DOCTYPE html><html><body><h1>Asura Scans Home</h1></body></html>');
    }
  });

  await new Promise<void>((resolve) => server.listen(3921, '127.0.0.1', resolve));
  console.log('✓ Mock manga server running on http://127.0.0.1:3921');

  // 2. Launch Chrome with extension
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages'],
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1200,900',
    ],
  });

  try {
    // 3. Find extension ID
    const workerTarget = await browser.waitForTarget(
      (t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'),
      { timeout: 10000 }
    );
    const workerUrl = workerTarget.url();
    const extId = new URL(workerUrl).host;
    console.log(`✓ Extension loaded, ID: ${extId}`);

    // 4. Test Options page
    const optionsPage = await browser.newPage();
    await optionsPage.goto(`chrome-extension://${extId}/options.html`);
    await optionsPage.waitForSelector('.page-title');
    const optionsTitle = await optionsPage.$eval('.page-title', (el) => el.textContent);
    console.log(`✓ Options page loaded: "${optionsTitle}"`);

    // Seed subscribed site for 127.0.0.1 into extension storage
    const worker = await workerTarget.worker();
    if (!worker) throw new Error('No service worker');

    await worker.evaluate(async () => {
      // @ts-ignore
      await chrome.storage.local.set({
        state: {
          sites: [
            {
              origin: 'http://127.0.0.1:3921',
              adapterId: 'asura',
              addedAt: Date.now(),
            },
          ],
          mangas: {},
          settings: { autoTrack: true, bgTabFallback: true },
        },
      });
      // Register content script for this test origin
      // @ts-ignore
      await chrome.scripting.registerContentScripts([
        {
          id: 'test:site',
          matches: ['http://127.0.0.1:3921/*'],
          js: ['content-scripts/content.js'],
          runAt: 'document_idle',
        },
      ]);
    });
    console.log('✓ Subscribed site registered for test server');

    // 5. Open mock series page
    const mangaPage = await browser.newPage();
    await mangaPage.goto('http://127.0.0.1:3921/comics/nano-machine-ab39de10');

    // Wait for content script shadow DOM
    await mangaPage.waitForSelector('manga-sync-fab-root', { timeout: 8000 });
    console.log('✓ Content script mounted (manga-sync-fab-root found)');

    // Verify FAB state and click "+ Add manga"
    const fabText = await mangaPage.evaluate(() => {
      const host = document.querySelector('manga-sync-fab-root');
      const root = host?.shadowRoot;
      const btn = root?.querySelector('.fab-btn');
      return btn?.textContent?.trim();
    });
    console.log(`✓ Initial FAB button text: "${fabText}"`);

    // Click FAB button to open panel
    await mangaPage.evaluate(() => {
      const host = document.querySelector('manga-sync-fab-root');
      const root = host?.shadowRoot;
      const btn = root?.querySelector<HTMLButtonElement>('.fab-btn');
      btn?.click();
    });

    // Wait for panel to open and click "Add to my list"
    await mangaPage.waitForFunction(() => {
      const host = document.querySelector('manga-sync-fab-root');
      const root = host?.shadowRoot;
      return root?.querySelector('.btn-primary') !== null;
    });

    await mangaPage.evaluate(() => {
      const host = document.querySelector('manga-sync-fab-root');
      const root = host?.shadowRoot;
      const addBtn = root?.querySelector<HTMLButtonElement>('.btn-primary');
      addBtn?.click();
    });
    console.log('✓ Clicked "Add to my list"');

    // Wait 1.5s for background worker to add manga and run initial sync
    await new Promise((r) => setTimeout(r, 1500));

    // Verify stored manga in extension
    const storedState = await worker.evaluate(async () => {
      // @ts-ignore
      return (await chrome.storage.local.get('state')).state;
    });
    const mangaList = Object.values(storedState.mangas);
    console.log(`✓ Stored mangas count: ${mangaList.length}`);
    if (mangaList.length !== 1) throw new Error('Manga was not added to storage');

    // 6. Test Auto-Track: Navigate to Chapter 1
    console.log('Navigating to Chapter 1...');
    await mangaPage.goto('http://127.0.0.1:3921/comics/nano-machine-ab39de10/chapter/1');
    await mangaPage.waitForSelector('manga-sync-fab-root');

    // Wait 3.5 seconds for the 3s auto-track timer
    console.log('Waiting 3.5s for auto-track timer...');
    await new Promise((r) => setTimeout(r, 3500));

    const stateAfterCh1 = await worker.evaluate(async () => {
      // @ts-ignore
      return (await chrome.storage.local.get('state')).state;
    });
    const mCh1 = Object.values(stateAfterCh1.mangas)[0] as any;
    console.log(`✓ Auto-track after Chapter 1: lastReadChapter = ${mCh1?.lastReadChapter}`);
    if (mCh1?.lastReadChapter !== 1) {
      throw new Error(`Expected lastReadChapter 1, got ${mCh1?.lastReadChapter}`);
    }

    // 7. Test Auto-Track: Navigate to Chapter 5
    console.log('Navigating to Chapter 5...');
    await mangaPage.goto('http://127.0.0.1:3921/comics/nano-machine-ab39de10/chapter/5');
    await mangaPage.waitForSelector('manga-sync-fab-root');
    console.log('Waiting 3.5s for auto-track timer...');
    await new Promise((r) => setTimeout(r, 3500));

    const stateAfterCh5 = await worker.evaluate(async () => {
      // @ts-ignore
      return (await chrome.storage.local.get('state')).state;
    });
    const mCh5 = Object.values(stateAfterCh5.mangas)[0] as any;
    console.log(`✓ Auto-track after Chapter 5: lastReadChapter = ${mCh5?.lastReadChapter}`);
    if (mCh5?.lastReadChapter !== 5) {
      throw new Error(`Expected lastReadChapter 5, got ${mCh5?.lastReadChapter}`);
    }

    // 8. Test Popup page
    console.log('Testing Popup UI...');
    const popupPage = await browser.newPage();
    await popupPage.goto(`chrome-extension://${extId}/popup.html`);
    await popupPage.waitForSelector('.header-title');

    const popupMangaName = await popupPage.$eval('.manga-name', (el) => el.textContent);
    const popupProgress = await popupPage.$eval('.manga-progress', (el) => el.textContent);
    console.log(`✓ Popup rendered manga: "${popupMangaName}" with progress "${popupProgress}"`);

    console.log('\n🎉 ALL E2E VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  } finally {
    await browser.close().catch(() => undefined);
    server.close();
  }
}

run().catch((err) => {
  console.error('\n❌ E2E Test failed:', err);
  process.exit(1);
});
