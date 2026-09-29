import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/__tests__/rls/**/*.test.ts',
      'src/__tests__/migrations/**/*.test.ts',
      'src/__tests__/integrations/**/*.test.ts',
    ],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 90_000,
  },
});
