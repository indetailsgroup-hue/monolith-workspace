import { defineConfig } from 'vitest/config';

// Dependency-injected HTTP handlers and workflow contracts use Node's native
// Request/Response/Web Crypto, without the browser setup or a live Supabase DB.
export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      { extends: true, test: { name: 'workflow', include: ['tests/workflow/ts/**/*.{test,spec}.ts'] } },
      { extends: true, test: { name: 'line-oa-commerce', include: ['tests/line-oa-commerce/ts/**/*.{test,spec}.ts'] } },
      { extends: true, test: { name: 'edge', include: ['supabase/functions/**/*.{test,spec}.ts'] } },
      { extends: true, test: { name: 'entitlement', include: ['entitlement-db/supabase/functions/**/*.{test,spec}.ts'] } },
    ],
  },
});
