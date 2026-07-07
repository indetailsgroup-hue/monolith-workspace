import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' เพื่อ GitHub Pages (ADR-040 มติ 5) — asset path แบบ relative
export default defineConfig({
  plugins: [react()],
  base: './',
});
