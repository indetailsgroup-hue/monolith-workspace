import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for the standalone independent FactoryPacket V3 verifier.
 *
 * The verifier is a pure Node tool: no DOM, no globals, no builder code. Tests run
 * in the `node` environment and are confined to this workspace's own `src` tree, so
 * a root-level `vitest` run can never sweep them and this suite can never import a
 * root/server module by accident.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
