import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Relative base so the same build works on GitHub Pages (a sub-path) and inside a Claude artifact.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [preact()],
  server: { port: 5191, strictPort: true, host: '127.0.0.1' },
  preview: { port: 5192, strictPort: true, host: '127.0.0.1' },
  build: {
    outDir: mode === 'snapshot' ? 'dist-snapshot' : 'dist',
    target: 'es2020',
  },
}));
