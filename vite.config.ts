import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],
    // Exclude Playwright e2e specs (they import @playwright/test and must run via
    // `playwright test`, not vitest). Keep the standard vitest default excludes.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      'e2e/**',
      // Node-native governance tooling tests (node:test runner). Vitest cannot
      // collect them and would report "No test suite found"; run via `npm run
      // test:node`. Keeps `test:run` honestly green (FS-B1-02).
      'scripts/**/*.test.mjs',
      // Foreign project snapshots / file dumps that live inside this folder but
      // are not part of the MONOLITH workspace — their tests must not run here.
      'cp06-clean-cowork_dev-complete_20260616/**',
      'Furniture_Hardware_Specs/**',
      'north-star-foundation/**',
      'daph-second-brain/**',
      '_daph_extract/**',
      'minifix-skill-pack/**',
      'furniture-hardware-vault/**',
    ],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/factory': 'http://localhost:3001',
    },
  },
  // T018: Code Splitting - Manual chunks for vendor bundles
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Normalize path separators for Windows compatibility
          const normalId = id.replace(/\\/g, '/');
          // React core - rarely changes, highly cacheable
          if (normalId.includes('node_modules/react-dom/') || normalId.includes('node_modules/react/')) {
            return 'vendor-react';
          }
          // R3F ecosystem (fiber + drei + three-stdlib) — split from Three core
          // so neither chunk exceeds the 600 kB warning threshold (FS-B2-02).
          if (
            normalId.includes('node_modules/@react-three/') ||
            normalId.includes('node_modules/three-stdlib/')
          ) {
            return 'vendor-r3f';
          }
          // Three.js core
          if (normalId.includes('node_modules/three/')) {
            return 'vendor-three';
          }
          // State management
          if (normalId.includes('node_modules/zustand/') || normalId.includes('node_modules/immer/')) {
            return 'vendor-zustand';
          }
          // Animation
          if (normalId.includes('node_modules/motion/') || normalId.includes('node_modules/framer-motion/')) {
            return 'vendor-motion';
          }
          // Icons
          if (normalId.includes('node_modules/lucide-react/')) {
            return 'vendor-icons';
          }
          // App 3D subsystem — the ~58 canvas components are the bulk of the
          // oversized App chunk; move them into their own cacheable chunk that
          // downloads in parallel with the app shell (FS-B2-02).
          if (normalId.includes('/src/components/canvas/')) {
            return 'canvas';
          }
        },
      },
    },
    // Report chunk sizes above 600KB
    chunkSizeWarningLimit: 600,
  },
})
