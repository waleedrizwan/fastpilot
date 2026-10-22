import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: { target: 'es2022' },
  // Identifies this build, so the Gauntlet runner can tell whether Chrome is running the latest one.
  define: { __BUILD_ID__: JSON.stringify(new Date().toISOString()) },
});
