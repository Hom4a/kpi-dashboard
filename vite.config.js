import { defineConfig } from 'vite';

// VITE_BASE override дозволяє зібрати для кореневого деплою (on-prem nginx),
// при цьому default '/kpi-dashboard/' залишається для GitHub Pages.
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE || '/kpi-dashboard/',
  root: '.',
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  server: {
    port: 3000,
    open: true
  }
}));
