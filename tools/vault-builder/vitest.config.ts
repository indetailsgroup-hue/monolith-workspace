import { defineConfig } from 'vitest/config';

// ESM config matching the workspace root ("type": "module").
// Property-based tests (fast-check) run >= 100 iterations per property.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Avoid failing the run when there are no test files yet (scaffold phase).
    passWithNoTests: true,
  },
});
