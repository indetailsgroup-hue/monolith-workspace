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
    // React component tests require a browser-like DOM environment.
    // vitest.setup.ts stubs window.matchMedia, ResizeObserver, localStorage, etc.
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Exclude Playwright e2e specs (they import @playwright/test and must run via
    // `playwright test`, not vitest). Keep the standard vitest default excludes.
    exclude: [
      // Playwright visual tests — run via `playwright test`, not vitest
      '**/*.visual.spec.ts',
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      'e2e/**',
      // @daph/field-app owns its own Vitest config (jsdom + React plugin) and
      // runner; the root run must not collect its tests under the wrong config.
      'packages/field-app/**',
      // The Digital Shadow service is a Node process with its own Vitest config.
      // Running it here under jsdom changes module/mocking semantics and also
      // makes infrastructure-backed tests look like frontend unit failures.
      'packages/digital-shadow-service/**',
      // Server and workspace tools each own their runtime/config and have
      // dedicated verification lanes below. The browser-oriented root runner
      // must not reinterpret Node tests under jsdom.
      'server/**',
      'tools/**',
      // These suites exercise a live, freshly migrated Supabase database and
      // require service-role credentials. They run in the database integration
      // lane after the local stack is ready, never in root unit tests.
      'src/__tests__/rls/**',
      'src/__tests__/migrations/**',
      'src/__tests__/integrations/**',
      // Node-native governance tooling tests (node:test runner). Vitest cannot
      // collect them and would report "No test suite found"; run via `npm run
      // test:node`. Keeps `test:run` honestly green (FS-B1-02).
      'scripts/**/*.test.mjs',
      // LineOS owns a separate node:test suite and CI job. Keep the root Vitest
      // run from collecting those files under the wrong runner.
      'LineOS/tests/**/*.test.mjs',
      // Foreign project snapshots / file dumps that live inside this folder but
      // are not part of the MONOLITH workspace — their tests must not run here.
      'cp06-clean-cowork_dev-complete_20260616/**',
      'Furniture_Hardware_Specs/**',
      'north-star-foundation/**',
      'daph-second-brain/**',
      '_daph_extract/**',
      'minifix-skill-pack/**',
      'furniture-hardware-vault/**',
      // Smoke / integration tests under src/e2e/ exercise full pipelines
      // (DXF generation, Uint8Array payloads) that need Node, not jsdom.
      // They run in dedicated e2e lanes, not the root unit-test runner.
      'src/e2e/**',
      // DI transport/workflow tests use Node's Request/Response/Web Crypto.
      // vitest.transport.config.ts owns these four projects; CI runs them in
      // verify-full, edge-fn-verify and entitlement-db-verify with report guards.
      'supabase/functions/**',
      'entitlement-db/supabase/functions/**',
      'tests/workflow/ts/**',
      'tests/line-oa-commerce/ts/**',
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
