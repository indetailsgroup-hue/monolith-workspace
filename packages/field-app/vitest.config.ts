import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Test gate for @daph/field-app (FS-B1-04). Previously the package had no test
// script or tests at all. jsdom + jest-dom support component smoke tests; the
// tooling (vitest, @testing-library/*, jsdom) resolves from the workspace root.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
