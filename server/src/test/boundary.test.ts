/**
 * boundary.test.ts - Factory server security boundary (FS-B0-02)
 *
 * Validates the fail-closed application boundary: bearer auth, public-path
 * gating, origin allowlist, rate limiting, body cap, generic error body, and
 * the signed-URL secret fail-closed behaviour.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isWeakSecret,
  requireBearerToken,
  authGate,
  buildCorsOptions,
  createRateLimiter,
  jsonBodyLimit,
  safeErrorHandler,
} from '../security/boundary.js';
import { makeSignedDownloadUrl, verifySignedDownloadQuery } from '../download/signedUrl.js';

const STRONG = 'a-strong-token-value-1234567890';

interface MockRes {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  headersSent: boolean;
  status(code: number): MockRes;
  json(body: unknown): MockRes;
  setHeader(key: string, value: string): void;
}

function mockRes(): MockRes {
  const res: MockRes = {
    statusCode: 200,
    body: undefined,
    headers: {},
    headersSent: false,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      res.headersSent = true;
      return res;
    },
    setHeader(key: string, value: string) {
      res.headers[key] = value;
    },
  };
  return res;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockReq(over: Record<string, any> = {}): any {
  return { headers: {}, path: '/protected', ip: '10.0.0.1', socket: {}, ...over };
}

describe('FS-B0-02 security boundary', () => {
  let savedToken: string | undefined;
  let savedSecret: string | undefined;

  beforeEach(() => {
    savedToken = process.env.FACTORY_API_TOKEN;
    savedSecret = process.env.SIGNED_URL_SECRET;
  });
  afterEach(() => {
    if (savedToken === undefined) delete process.env.FACTORY_API_TOKEN;
    else process.env.FACTORY_API_TOKEN = savedToken;
    if (savedSecret === undefined) delete process.env.SIGNED_URL_SECRET;
    else process.env.SIGNED_URL_SECRET = savedSecret;
  });

  describe('isWeakSecret', () => {
    it('flags empty, placeholder, short; accepts strong', () => {
      expect(isWeakSecret('')).toBe(true);
      expect(isWeakSecret(undefined)).toBe(true);
      expect(isWeakSecret('dev-secret-change-in-production')).toBe(true);
      expect(isWeakSecret('changeme')).toBe(true);
      expect(isWeakSecret('short')).toBe(true);
      expect(isWeakSecret(STRONG)).toBe(false);
    });
  });

  describe('requireBearerToken', () => {
    it('503 when server token is unset/insecure (fail closed)', () => {
      delete process.env.FACTORY_API_TOKEN;
      const res = mockRes();
      let nexted = false;
      requireBearerToken()(mockReq(), res as never, () => { nexted = true; });
      expect(res.statusCode).toBe(503);
      expect(nexted).toBe(false);
    });

    it('401 when no/invalid bearer header', () => {
      process.env.FACTORY_API_TOKEN = STRONG;
      const res1 = mockRes();
      requireBearerToken()(mockReq(), res1 as never, () => {});
      expect(res1.statusCode).toBe(401);

      const res2 = mockRes();
      requireBearerToken()(mockReq({ headers: { authorization: 'Bearer wrong-token-value-1234' } }), res2 as never, () => {});
      expect(res2.statusCode).toBe(401);
    });

    it('passes with the correct bearer token', () => {
      process.env.FACTORY_API_TOKEN = STRONG;
      const res = mockRes();
      let nexted = false;
      requireBearerToken()(mockReq({ headers: { authorization: `Bearer ${STRONG}` } }), res as never, () => { nexted = true; });
      expect(nexted).toBe(true);
      expect(res.statusCode).toBe(200);
    });
  });

  describe('authGate', () => {
    it('lets public paths through without a token', () => {
      delete process.env.FACTORY_API_TOKEN;
      const res = mockRes();
      let nexted = false;
      authGate(['/health'])(mockReq({ path: '/health' }), res as never, () => { nexted = true; });
      expect(nexted).toBe(true);
    });

    it('gates protected paths (401 without token, passes with)', () => {
      process.env.FACTORY_API_TOKEN = STRONG;
      const denied = mockRes();
      authGate(['/health'])(mockReq({ path: '/api/keys/register' }), denied as never, () => {});
      expect(denied.statusCode).toBe(401);

      const allowed = mockRes();
      let nexted = false;
      authGate(['/health'])(
        mockReq({ path: '/api/keys/register', headers: { authorization: `Bearer ${STRONG}` } }),
        allowed as never,
        () => { nexted = true; },
      );
      expect(nexted).toBe(true);
    });
  });

  describe('buildCorsOptions', () => {
    it('allows no-origin (server-to-server) and allowlisted; denies others', () => {
      process.env.FACTORY_ALLOWED_ORIGINS = 'https://app.example.com';
      const { origin } = buildCorsOptions() as { origin: (o: string | undefined, cb: (e: unknown, ok?: boolean) => void) => void };
      const results: Record<string, boolean | undefined> = {};
      origin(undefined, (_e, ok) => { results.none = ok; });
      origin('https://app.example.com', (_e, ok) => { results.allowed = ok; });
      origin('https://evil.example.com', (_e, ok) => { results.denied = ok; });
      expect(results.none).toBe(true);
      expect(results.allowed).toBe(true);
      expect(results.denied).toBe(false);
      delete process.env.FACTORY_ALLOWED_ORIGINS;
    });
  });

  describe('createRateLimiter', () => {
    it('429s once the window max is exceeded', () => {
      const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
      const run = () => {
        const res = mockRes();
        let nexted = false;
        limiter(mockReq({ ip: '9.9.9.9' }), res as never, () => { nexted = true; });
        return { res, nexted };
      };
      expect(run().nexted).toBe(true);
      expect(run().nexted).toBe(true);
      const third = run();
      expect(third.nexted).toBe(false);
      expect(third.res.statusCode).toBe(429);
    });
  });

  describe('jsonBodyLimit', () => {
    it('defaults to 2mb and honours override', () => {
      delete process.env.FACTORY_JSON_LIMIT;
      expect(jsonBodyLimit()).toBe('2mb');
      process.env.FACTORY_JSON_LIMIT = '512kb';
      expect(jsonBodyLimit()).toBe('512kb');
      delete process.env.FACTORY_JSON_LIMIT;
    });
  });

  describe('safeErrorHandler', () => {
    it('returns a generic body and never leaks err.message', () => {
      const res = mockRes();
      safeErrorHandler(new Error('secret internal detail'), mockReq() as never, res as never, () => {});
      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ ok: false, error: 'INTERNAL_ERROR' });
      expect(JSON.stringify(res.body)).not.toContain('secret internal detail');
    });
  });

  describe('signed-URL secret is fail-closed', () => {
    it('throws when SIGNED_URL_SECRET is unset or the old dev default', () => {
      delete process.env.SIGNED_URL_SECRET;
      expect(() => makeSignedDownloadUrl({ sha256: 'a'.repeat(64), mime: 'application/zip' })).toThrow();
      process.env.SIGNED_URL_SECRET = 'dev-secret-change-in-production';
      expect(() => makeSignedDownloadUrl({ sha256: 'a'.repeat(64), mime: 'application/zip' })).toThrow();
    });

    it('signs and verifies with a strong secret; rejects a forged signature', () => {
      process.env.SIGNED_URL_SECRET = STRONG;
      const { url } = makeSignedDownloadUrl({ sha256: 'a'.repeat(64), mime: 'application/zip', filename: 'x.zip' });
      // Parse the query directly (the signature covers only the query params,
      // not the base URL, so this is independent of BASE_URL being absolute).
      const query = Object.fromEntries(new URLSearchParams(url.split('?')[1]).entries());
      expect(verifySignedDownloadQuery(query).ok).toBe(true);
      expect(verifySignedDownloadQuery({ ...query, sig: 'deadbeef' }).ok).toBe(false);
    });
  });
});
