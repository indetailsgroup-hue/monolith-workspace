import { describe, it, expect } from 'vitest';
import { appPath, withBase, routerBasename } from '../basePath';

const PAGES = '/monolith-workspace/designer/';

describe('routerBasename', () => {
  it('drops the trailing slash Vite puts on BASE_URL', () => {
    expect(routerBasename(PAGES)).toBe('/monolith-workspace/designer');
  });

  it('is "/" for a root deploy and for local dev', () => {
    expect(routerBasename('/')).toBe('/');
    expect(routerBasename('')).toBe('/');
    expect(routerBasename('./')).toBe('/');
  });
});

describe('appPath', () => {
  it('puts the deploy prefix in front of an in-app path', () => {
    expect(appPath('/jobs', PAGES)).toBe('/monolith-workspace/designer/jobs');
    expect(appPath('projects/42', PAGES)).toBe('/monolith-workspace/designer/projects/42');
    expect(appPath('/', PAGES)).toBe('/monolith-workspace/designer/');
  });

  it('leaves paths alone under a root base', () => {
    expect(appPath('/jobs', '/')).toBe('/jobs');
  });

  it('cannot be steered to another origin', () => {
    expect(appPath('//evil.example/x', PAGES)).toBe('/monolith-workspace/designer/evil.example/x');
  });
});

describe('withBase', () => {
  it('prefixes root-relative public/ assets', () => {
    expect(withBase('/textures/wood/a.jpg', PAGES)).toBe('/monolith-workspace/designer/textures/wood/a.jpg');
  });

  it('passes through URLs that are not root-relative', () => {
    for (const url of ['https://cdn.example/a.jpg', '//cdn.example/a.jpg', 'data:image/png;base64,AA', 'blob:http://x/1', '']) {
      expect(withBase(url, PAGES)).toBe(url);
    }
  });
});

