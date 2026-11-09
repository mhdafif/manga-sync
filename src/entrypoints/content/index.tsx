import ReactDOM from 'react-dom/client';
import App from './App';
import styles from './style.css?inline';

export default defineContentScript({
  registration: 'runtime',
  cssInjectionMode: 'manual',
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'manga-sync-fab-root',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      css: styles,
      onMount: (container) => {
        const root = ReactDOM.createRoot(container);
        root.render(<App />);
        return root;
      },
      onRemove: (root) => {
        root?.unmount();
      },
    });
    ui.mount();
  },
});
