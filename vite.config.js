import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Files in static/ (e.g. the sample Excel log) are served from the site root.
export default defineConfig({
  plugins: [react()],
  publicDir: 'static',
});
