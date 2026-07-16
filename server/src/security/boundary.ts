/**
 * boundary.ts - Factory server security boundary (FS-B0-02)
 *
 * Fail-closed application-boundary primitives shared by both HTTP entry points:
 * - loadServerSecretsOrExit: refuse to start without strong secrets
 * - requireBearerToken:      env-configured bearer-token auth (timing-safe)
 * - buildCorsOptions:        origin allowlist (no wildcard CORS)
 * - createRateLimiter:       minimal in-memory fixed-window limiter (no new dep)
 * - jsonBodyLimit:           configurable body cap (default 2mb, not 50mb)
 * - safeErrorHandler:        logs full error, returns a generic body (no leak)
 *
 * Auth model: a single shared bearer token (FACTORY_API_TOKEN). Every route is
 * protected except explicitly public paths (health, and the self-authenticating
 * signed-URL /download). This is the minimum safe boundary for an internal
 * factory service; per-actor scopes can layer on later.
 */

import crypto from 'node:crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { CorsOptions } from 'cors';

// ============================================================================
// Secret hygiene
// ============================================================================

const INSECURE_SECRET_VALUES = new Set([
  '',
  'dev-secret-change-in-production',
  'changeme',
  'secret',
  'password',
]);

const MIN_SECRET_LENGTH = 16;

/** A secret is weak if it is empty, a known placeholder, or too short. */
export function isWeakSecret(value: string | undefined): boolean {
  if (!value) return true;
  if (INSECURE_SECRET_VALUES.has(value)) return true;
  return value.length < MIN_SECRET_LENGTH;
}

export interface ServerSecrets {
  apiToken: string;
  signedUrlSecret: string;
}

/**
 * Validate required secrets at startup. Refuses to start (process.exit(1)) if
 * any required secret is missing or insecure — fail closed. Call this right
 * before app.listen(), never at module load, so importing the app for tests
 * does not exit.
 */
export function loadServerSecretsOrExit(logger: Pick<Console, 'error'> = console): ServerSecrets {
  const apiToken = process.env.FACTORY_API_TOKEN ?? '';
  const signedUrlSecret = process.env.SIGNED_URL_SECRET ?? '';

  const problems: string[] = [];
  if (isWeakSecret(apiToken)) problems.push(`FACTORY_API_TOKEN (set a strong value, >= ${MIN_SECRET_LENGTH} chars)`);
  if (isWeakSecret(signedUrlSecret)) problems.push(`SIGNED_URL_SECRET (set a strong value, >= ${MIN_SECRET_LENGTH} chars)`);

  if (problems.length > 0) {
    logger.error(
      `[SECURITY] Refusing to start — missing or insecure secrets:\n  - ${problems.join('\n  - ')}\n` +
        `Set these in the environment (e.g. server/.env) before starting the factory server.`,
    );
    process.exit(1);
  }

  return { apiToken, signedUrlSecret };
}

// ============================================================================
// Bearer-token authentication
// ============================================================================

/** Constant-time string equality via fixed-length digests (no length leak). */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/.exec(header);
  return match ? match[1] : null;
}

/**
 * Require a valid `Authorization: Bearer <FACTORY_API_TOKEN>` header.
 * Fails closed: if the server token is unset/insecure at request time it
 * answers 503 rather than allowing the request through.
 */
export function requireBearerToken(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const expected = process.env.FACTORY_API_TOKEN ?? '';
    if (isWeakSecret(expected)) {
      res.status(503).json({ ok: false, error: 'SERVER_MISCONFIGURED' });
      return;
    }
    const provided = extractBearer(req);
    if (!provided || !safeEqual(provided, expected)) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      return;
    }
    next();
  };
}

/**
 * Gate every request through bearer auth except the given public paths.
 * `publicPaths` is matched by exact path or path prefix (for e.g. /download).
 */
export function authGate(publicPaths: string[]): RequestHandler {
  const bearer = requireBearerToken();
  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.path;
    const isPublic = publicPaths.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));
    if (isPublic) {
      next();
      return;
    }
    bearer(req, res, next);
  };
}

// ============================================================================
// CORS (origin allowlist)
// ============================================================================

/**
 * CORS options driven by FACTORY_ALLOWED_ORIGINS (comma-separated). Requests
 * with no Origin header (server-to-server, curl) are allowed — CORS only
 * guards browsers. Cross-origin browser requests are allowed only for
 * allowlisted origins; everything else gets no CORS headers (browser blocks).
 */
export function buildCorsOptions(): CorsOptions {
  const allow = (process.env.FACTORY_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, allow.includes(origin));
    },
    credentials: false,
  };
}

// ============================================================================
// Rate limiting (minimal, dependency-free)
// ============================================================================

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
}

/**
 * Fixed-window per-IP rate limiter. Intentionally dependency-free (avoids
 * adding to the dependency-advisory surface flagged by FS-B1-01). Suitable for
 * an internal service; swap for a shared store if horizontally scaled.
 */
export function createRateLimiter(options: RateLimitOptions = {}): RequestHandler {
  const windowMs = options.windowMs ?? Number(process.env.FACTORY_RATE_WINDOW_MS) ?? 60_000;
  const max = options.max ?? Number(process.env.FACTORY_RATE_MAX) ?? 120;
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';

    // Opportunistic prune so the map cannot grow without bound.
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) {
        if (now >= v.resetAt) buckets.delete(k);
      }
    }

    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (bucket.count > max) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000).toString());
      res.status(429).json({ ok: false, error: 'RATE_LIMITED' });
      return;
    }
    next();
  };
}

// ============================================================================
// Body limit + error handler
// ============================================================================

/** JSON body size cap; default 2mb (was 50mb). Override with FACTORY_JSON_LIMIT. */
export function jsonBodyLimit(): string {
  return process.env.FACTORY_JSON_LIMIT || '2mb';
}

/**
 * Terminal error handler: log the full error server-side, return a generic
 * body to the caller (never err.message — that leaked internals, FS-B0-02).
 */
export function safeErrorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err);
  if (res.headersSent) return;
  res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
}
