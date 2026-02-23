import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Independent modules that can be loaded separately
          builder: [
            './js/builder/builder.js',
            './js/builder/dashboard-list.js',
            './js/builder/widget-catalog.js',
            './js/builder/widget-renderer.js',
            './js/builder/widget-config-panel.js',
            './js/builder/data-source.js'
          ],
          'data-entry': [
            './js/data-entry/data-entry.js',
            './js/data-entry/db-dynamic.js',
            './js/data-entry/form-renderer.js',
            './js/data-entry/form-utils.js',
            './js/data-entry/type-editor.js'
          ],
          gis: [
            './js/gis/render-gis.js',
            './js/gis/gis-data.js',
            './js/gis/gis-controls.js'
          ]
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});
