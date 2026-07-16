/**
 * version.ts — single source of truth for the factory server version.
 *
 * Both HTTP entry points (api/index.ts, index.ts) previously hard-coded
 * different versions ('0.10.0', '2.0.0-p22a') in their /health responses and
 * banners, none matching package.json — so an operator could not tell which
 * contract was actually running (FS-B2-01). Read it from package.json instead.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function readServerVersion(): string {
  try {
    // src/version.ts -> ../package.json ; dist/version.js -> ../package.json.
    // Both resolve to server/package.json.
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** The factory server version, read once from package.json. */
export const SERVER_VERSION = readServerVersion();
