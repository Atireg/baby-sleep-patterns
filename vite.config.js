import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Files in static/ (e.g. the sample Excel log) are served from the site root.
// Relative base so the build works under the GitHub Pages sub-path (/baby-sleep-patterns/).
export default defineConfig({
  plugins: [react()],
  publicDir: 'static',
  base: './',
});
