/**
 * @vitest-environment jsdom
 */

/**
 * financeRouteBundling.test.ts - S18 L7 Slice 4 (review fix): /finance must be
 * bundler-visible
 *
 * Review finding: the /finance lazy import used a variable module path marked
 * with the "vite-ignore" comment, which Rollup skips entirely. In a production
 * build the
 * browser then executes a NATIVE import('../pages/FinanceDashboard') relative
 * to the page URL, 404s, and the catch fallback silently renders
 * FinanceComingSoon forever — even after L4's FinanceDashboard merges.
 *
 * A bare static import('../pages/FinanceDashboard') is not possible while
 * L4's file is absent from this branch (TS2307 breaks the build), so the
 * correct mechanism is import.meta.glob with a LITERAL pattern: Vite
 * statically analyzes it, bundles the module the moment the file lands, and
 * yields an empty record (→ FinanceComingSoon) while it is absent. No manual
 * integration-pass TODO remains.
 *
 * Same source-pin style as supabaseSession.test.ts: these pins fail loudly if
 * the route wiring regresses to a bundler-invisible import. This lives under
 * src/core/auth/__tests__ with the other route-guard tests because that is
 * the lane's test home for /finance RequireRole wiring.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// vitest runs from the workspace root; import.meta.url is not a file: URL
// under the jsdom environment, so resolve from cwd instead.
const routesSource = readFileSync(
  join(process.cwd(), 'src', 'routes', 'index.tsx'),
  'utf8'
);

describe('/finance route bundling (S18 L7 Slice 4 review fix)', () => {
  it('no longer uses @vite-ignore (bundler-invisible import 404s in prod builds)', () => {
    expect(routesSource).not.toContain('@vite-ignore');
  });

  it('loads FinanceDashboard via import.meta.glob with a literal pattern Vite can analyze', () => {
    // Literal pattern(s) must appear inside an import.meta.glob call so the
    // module is code-split into the production bundle once L4's file exists.
    expect(routesSource).toMatch(
      /import\.meta\.glob[\s\S]{0,200}['"]\.\.\/pages\/FinanceDashboard(\.tsx|\/index\.tsx)['"]/
    );
  });

  it('keeps the FinanceComingSoon fallback for while the L4 module is absent', () => {
    expect(routesSource).toContain('FinanceComingSoon');
  });
});
