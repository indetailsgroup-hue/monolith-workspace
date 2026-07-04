import { defineConfig } from 'vitest/config';

// Property-based tests (fast-check) run >= 100 iterations per property.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    passWithNoTests: true,
  },
});
