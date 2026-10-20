import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Relative base so the same build works on GitHub Pages (a sub-path) and in an offline snapshot.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [preact()],
  publicDir: mode === 'snapshot' ? 'snapshot-public' : 'public',
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  server: { port: 5231, strictPort: true, host: '127.0.0.1' },
  preview: { port: 5232, strictPort: true, host: '127.0.0.1' },
  build: {
    outDir: mode === 'snapshot' ? 'dist-snapshot' : 'dist',
    target: 'es2020',
  },
}));
