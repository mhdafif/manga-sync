import { defineConfig } from 'wxt';

// `E2E=1` adds a host permission for 127.0.0.1 so the end-to-end test can run
// without the interactive permission prompt. The shipped build never has it.
const e2e = process.env.E2E === '1';

export default defineConfig({
  srcDir: 'src',
  outDir: e2e ? '.output-e2e' : 'dist',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Manga Sync',
    description: 'Track the last chapter you read and see which manga have new chapters.',
    permissions: ['storage', 'scripting', 'activeTab', 'tabs'],
    // Sites are added one by one at runtime with chrome.permissions.request.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    host_permissions: e2e ? ['http://127.0.0.1/*'] : [],
    action: { default_title: 'Manga Sync' },
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
  },
});
