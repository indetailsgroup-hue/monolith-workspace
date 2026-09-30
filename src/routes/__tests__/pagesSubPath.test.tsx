// The Designer ships to GitHub Pages under /monolith-workspace/designer/.
// These tests exercise the shipped pieces the way Pages uses them: the router
// module built with that BASE_URL, the site-root 404.html redirect, and the
// inline restore script in index.html.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { matchRoutes } from 'react-router-dom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../App', () => ({ default: () => null }));

const SITE = '/monolith-workspace/';
const DESIGNER = `${SITE}designer/`;

describe('router under the Pages base', () => {
  // The router is built at import time from BASE_URL and the current URL, so
  // load the module once, fresh, the way the Pages build starts it.
  let router: Awaited<typeof import('../index')>['router'];
  beforeAll(async () => {
    vi.stubEnv('BASE_URL', DESIGNER);
    vi.resetModules();
    window.history.replaceState(null, '', DESIGNER);
    ({ router } = await import('../index'));
  }, 60_000);

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    window.history.replaceState(null, '', '/');
  });

  const routePaths = (pathname: string) =>
    (matchRoutes(router.routes, pathname, router.basename) ?? []).map((m) => m.route.path);

  it('starts on the workspace at the deploy root instead of the 404 route', () => {
    expect(router.basename).toBe('/monolith-workspace/designer');
    expect(router.state.matches.map((m) => m.route.path)).toEqual(['/']);
  });

  it('matches the workspace without the trailing slash too', () => {
    expect(routePaths('/monolith-workspace/designer')).toEqual(['/']);
  });

  it('matches a deep route', () => {
    expect(routePaths(`${DESIGNER}jobs`)).toEqual(['/jobs']);
  });
});

// 404.html and the index.html restore script are classic scripts; run their
// source against a stand-in window the same way the browser would.
function scriptFrom(html: string, marker: RegExp): string {
  const body = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => marker.test(s));
  if (!body) throw new Error(`no script matching ${marker}`);
  return body;
}

const repo = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const notFoundScript = scriptFrom(repo('.github/pages/404.html').replace(/__SITE_BASE__/g, SITE), /__deeplink/);
// Vite substitutes %BASE_URL% at build time; do the same with the Pages base.
const restoreScript = scriptFrom(repo('index.html').replace(/%BASE_URL%/g, DESIGNER), /__deeplink/);

/** Where 404.html sends the browser, or null when it stays a 404. */
function redirectFrom404(pathname: string, search = '', hash = ''): string | null {
  let target: string | null = null;
  const location = { pathname, search, hash, replace: (u: string) => { target = u; } };
  new Function('window', notFoundScript)({ location });
  return target;
}

const ORIGIN = 'https://example.test';

/**
 * The URL index.html leaves in the address bar before any module runs.
 * replaceState is modelled on the browser's: the argument is resolved against
 * the document URL with the WHATWG URL parser (dot segments, %2e%2e and
 * backslashes normalised), and a cross-origin result throws SecurityError.
 */
function restoredFrom(url: string): string {
  let current = new URL(url, ORIGIN);
  const history = {
    state: null,
    replaceState: (_s: unknown, _t: string, next: string) => {
      const resolved = new URL(next, current);
      if (resolved.origin !== current.origin) throw new DOMException('cross-origin replaceState', 'SecurityError');
      current = resolved;
    },
  };
  const { origin, pathname, search, hash, href } = current;
  new Function('window', 'history', restoreScript)({ location: { origin, pathname, search, hash, href } }, history);
  return current.pathname + current.search + current.hash;
}

const deepLink = (target: string, hash = '') => `${DESIGNER}?__deeplink=${encodeURIComponent(target)}${hash}`;

describe('Pages deep-link round trip (404.html → index.html)', () => {
  it.each([
    [`${DESIGNER}projects/42`, '', ''],
    [`${DESIGNER}projects/42/design`, '?tab=cnc&x=1', '#panel-3'],
    [`${DESIGNER}login`, '?next=%2Fjobs', ''],
    [`${DESIGNER}settings/notifications`, '', '#access_token=abc&type=recovery'],
  ])('refresh or direct open of %s%s%s lands on the same URL', (path, search, hash) => {
    const hop = redirectFrom404(path, search, hash);
    expect(hop).not.toBeNull();
    expect(hop!.startsWith(`${DESIGNER}?__deeplink=`)).toBe(true);
    expect(restoredFrom(hop!)).toBe(path + search + hash);
  });

  it('leaves paths outside the Designer as real 404s', () => {
    for (const path of [`${SITE}nope`, `${SITE}docs/missing.html`, '/elsewhere/designer/x']) {
      expect(redirectFrom404(path)).toBeNull();
    }
  });

  it('never redirects the Designer root or an already-redirected URL', () => {
    expect(redirectFrom404(DESIGNER)).toBeNull();
    expect(redirectFrom404(`${DESIGNER}x`, '?__deeplink=x')).toBeNull();
  });

  it('does nothing on an ordinary visit', () => {
    expect(restoredFrom(`${DESIGNER}?work_item=W1#x`)).toBe(`${DESIGNER}?work_item=W1#x`);
  });
});

describe('deep-link restore stays inside the Designer after URL normalisation', () => {
  it.each([
    ['dot segments', '../../docs/'],
    ['dot segments below a route', 'projects/../../../docs/'],
    ['encoded dot segments', '%2e%2e/%2e%2e/docs/'],
    ['mixed-case encoded dot segments', '%2E%2e/.%2E/docs/'],
    ['backslash dot segments', '..\\..\\docs\\'],
    ['a sibling directory sharing the prefix', '../designer-evil/x'],
    ['a root-absolute path', '/monolith-workspace/docs/'],
    ['a protocol-relative URL', '//evil.example/x'],
    ['a backslash protocol-relative URL', '\\\\evil.example\\x'],
    ['an absolute URL', 'https://evil.example/x'],
    ['a javascript: URL', 'javascript:alert(1)'],
  ])('%s (%s) falls back to the Designer start page', (_name, target) => {
    expect(restoredFrom(deepLink(target))).toBe(DESIGNER);
    expect(restoredFrom(deepLink(target, '#x'))).toBe(DESIGNER);
  });

  // The same attacks written straight into the address bar, encoded once or twice.
  it.each([
    '..%2F..%2Fdocs%2F',
    '../../docs/',
    '%2e%2e/%2e%2e/docs/',
    '%2e%2e%2f%2e%2e%2fdocs%2f',
    '%252e%252e/%252e%252e/docs/',
  ])('raw ?__deeplink=%s falls back to the Designer start page', (raw) => {
    expect(restoredFrom(`${DESIGNER}?__deeplink=${raw}#x`)).toBe(DESIGNER);
  });

  it('falls back to the start page when the parameter is not valid percent-encoding', () => {
    expect(restoredFrom(`${DESIGNER}?__deeplink=%E0%A4%A`)).toBe(DESIGNER);
  });

  it.each([
    ['projects/42?tab=cnc&x=1', '#panel-3', `${DESIGNER}projects/42?tab=cnc&x=1#panel-3`],
    ['login?next=%2Fjobs', '#frag', `${DESIGNER}login?next=%2Fjobs#frag`],
    ['projects/../jobs', '', `${DESIGNER}jobs`],
    ['projects/%2e%2e/jobs?view=list', '#top', `${DESIGNER}jobs?view=list#top`],
    // An encoded slash is not a path separator, so this is one (unknown) route
    // segment inside the Designer; the router shows its own 404 for it.
    ['..%2f..%2fdocs/', '', `${DESIGNER}..%2f..%2fdocs/`],
    ['', '', DESIGNER],
  ])('keeps a link that normalises inside the Designer: %s%s', (target, hash, expected) => {
    expect(restoredFrom(deepLink(target, hash))).toBe(expected);
  });
});
