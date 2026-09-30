// Deploy-prefix helpers for the Designer.
//
// GitHub Pages serves the Designer under a sub-path (the Pages workflow builds it
// with `vite build --base=/monolith-workspace/designer/`). React Router, full-page
// navigations, shareable URLs and public/ assets must all carry that prefix, or
// they resolve against the origin root: the router falls through to its 404
// route, and links and textures point outside the site. Local dev and any
// root deploy keep BASE_URL '/', where every helper here is a no-op.

/** The router basename for a Vite BASE_URL: '/monolith-workspace/designer/' → '/monolith-workspace/designer'. */
export function routerBasename(baseUrl: string = import.meta.env.BASE_URL): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed === '' || trimmed === '.' ? '/' : trimmed;
}

/** An in-app path with the deploy prefix, for full-page navigation and shareable URLs. */
export function appPath(path: string, baseUrl: string = import.meta.env.BASE_URL): string {
  const base = routerBasename(baseUrl);
  const rest = path.replace(/^\/+/, '');
  return base === '/' ? `/${rest}` : `${base}/${rest}`;
}

/**
 * A root-relative URL ('/textures/wood/x.jpg', a notification's '/settings/billing')
 * with the deploy prefix. Absolute, protocol-relative, data: and blob: URLs pass through.
 */
export function withBase(url: string, baseUrl: string = import.meta.env.BASE_URL): string {
  return url.startsWith('/') && !url.startsWith('//') ? appPath(url, baseUrl) : url;
}
