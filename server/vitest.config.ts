import { defineConfig } from 'vitest/config';

// Isolated config for the factory server test suite. Without this file, Vitest
// walks up and inherits the root app's vite.config.ts (React plugin + jsdom
// setupFiles + Vitest-3 API), which breaks the server's Vitest 1.x runner
// ("Cannot set property testPath"). The server is a plain Node service, so it
// runs in the node environment with no React/jsdom setup. (FS-B1-03)
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
