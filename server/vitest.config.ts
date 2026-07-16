import { defineConfig } from 'vitest/config';

// Isolated config for the factory server test suite. Without this file, Vitest
// walks up and inherits the root app's vite.config.ts (React plugin + jsdom
// setupFiles + Vitest-3 API), which breaks the server's Vitest 1.x runner
// ("Cannot set property testPath"). The server is a plain Node service, so it
// runs in the node environment with no React/jsdom setup. (FS-B1-03)
export default defineConfig({
  // The server has no CSS. Inline an empty PostCSS config so Vitest does not
  // walk up to the workspace-root postcss.config (which loads tailwindcss) —
  // that module is absent when only server/ deps are installed (CI), and the
  // lookup fails the run. (FS-R2-B1-01)
  css: { postcss: {} },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
