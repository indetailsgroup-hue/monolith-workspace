/**
 * stateRoute.ts - P10 State Transition API Routes
 *
 * Endpoints:
 * - GET  /api/factory/jobs/:jobId/state      - Get authoritative state
 * - POST /api/factory/jobs/:jobId/freeze     - DRAFT -> FROZEN
 * - POST /api/factory/jobs/:jobId/release    - FROZEN -> RELEASED
 * - POST /api/factory/jobs/:jobId/revoke     - RELEASED -> FROZEN
 * - GET  /api/factory/jobs/:jobId/can-export - Check export eligibility
 *
 * Note: P12 proof endpoint moved to server/src/proof/proofRoute.ts
 */

import { Router } from 'express';
import { getState, freezeJob, releaseJob, revokeJob, canExport } from './stateService.js';
import { safeJobId } from './jobStateStorage.js';
import { extractActorFromHeaders } from '../activity/activityStorage.js';
import type { ChangeClass } from '../lineage/lineageTypes.js';
import type { Actor } from './jobStateTypes.js';

export const stateRoute = Router();

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse changeClass from request body.
 */
function parseChangeClass(x: unknown): ChangeClass | undefined {
  const v = String(x || '').trim().toUpperCase();
  if (!v) return undefined;

  const allowed: ChangeClass[] = ['GEOMETRY', 'MATERIAL', 'HARDWARE', 'TOOLPATHS', 'NESTING', 'METADATA'];
  return (allowed as string[]).includes(v) ? (v as ChangeClass) : undefined;
}

/**
 * Extract actor from request headers.
 */
function actorFromReq(req: { headers: Record<string, string | string[] | undefined> }): Actor {
  const extracted = extractActorFromHeaders(req.headers);
  return {
    role: extracted.role,
    name: extracted.name,
  };
}

// ============================================================================
// GET State
// ============================================================================

stateRoute.get('/api/factory/jobs/:jobId/state', async (req, res) => {
  try {
    const jobId = safeJobId(req.params.jobId);
    const snap = await getState(jobId);

    res.json({
      ok: true,
      jobId: snap.jobId,
      specState: snap.specState,
      revisionId: snap.revision?.revisionId,
      packetSha256: snap.revision?.packetSha256,
      manifestSha256: snap.revision?.manifestSha256,
      updatedAt: snap.updatedAt,
      frozenAt: snap.frozenAt,
      releasedAt: snap.releasedAt,
      revokedAt: snap.revokedAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    res.status(400).json({ ok: false, error: message });
  }
});

// Alias without /api prefix
stateRoute.get('/factory/jobs/:jobId/state', async (req, res) => {
  try {
    const jobId = safeJobId(req.params.jobId);
    const snap = await getState(jobId);

    res.json({
      ok: true,
      jobId: snap.jobId,
      specState: snap.specState,
      revisionId: snap.revision?.revisionId,
      packetSha256: snap.revision?.packetSha256,
      manifestSha256: snap.revision?.manifestSha256,
      updatedAt: snap.updatedAt,
      frozenAt: snap.frozenAt,
      releasedAt: snap.releasedAt,
      revokedAt: snap.revokedAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    res.status(400).json({ ok: false, error: message });
  }
});

// ============================================================================
// POST Freeze
// ============================================================================

stateRoute.post('/api/factory/jobs/:jobId/freeze', async (req, res) => {
  try {
    const jobId = safeJobId(req.params.jobId);
    const actor = actorFromReq(req);
    const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
    const changeClass = parseChangeClass(req.body?.changeClass);

    const result = await freezeJob(jobId, actor, note, changeClass);

    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error });
    }

    const snap = result.snapshot!;
    res.json({
      ok: true,
      jobId: snap.jobId,
      specState: snap.specState,
      revisionId: snap.revision?.revisionId,
      packetSha256: snap.revision?.packetSha256,
      manifestSha256: snap.revision?.manifestSha256,
      at: snap.frozenAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    res.status(500).json({ ok: false, error: message });
  }
});

// Alias without /api prefix
stateRoute.post('/factory/jobs/:jobId/freeze', async (req, res) => {
  try {
    const jobId = safeJobId(req.params.jobId);
    const actor = actorFromReq(req);
    const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
    const changeClass = parseChangeClass(req.body?.changeClass);

    const result = await freezeJob(jobId, actor, note, changeClass);

    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error });
    }

    const snap = result.snapshot!;
    res.json({
      ok: true,
      jobId: snap.jobId,
      specState: snap.specState,
      revisionId: snap.revision?.revisionId,
      packetSha256: snap.revision?.packetSha256,
      manifestSha256: snap.revision?.manifestSha256,
      at: snap.frozenAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    res.status(500).json({ ok: false, error: message });
  }
});

// ============================================================================
// POST Release
// ============================================================================

stateRoute.post('/api/factory/jobs/:jobId/release', async (req, res) => {
  try {
    const jobId = safeJobId(req.params.jobId);
    const actor = actorFromReq(req);
    const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
    const changeClass = parseChangeClass(req.body?.changeClass);

    const result = await releaseJob(jobId, actor, note, changeClass);

    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error });
    }

    const snap = result.snapshot!;
    res.json({
      ok: true,
      jobId: snap.jobId,
      specState: snap.specState,
      revisionId: snap.revision?.revisionId,
      packetSha256: snap.revision?.packetSha256,
      manifestSha256: snap.revision?.manifestSha256,
      at: snap.releasedAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    res.status(500).json({ ok: false, error: message });
  }
});

// Alias without /api prefix
stateRoute.post('/factory/jobs/:jobId/release', async (req, res) => {
  try {
    const jobId = safeJobId(req.params.jobId);
    const actor = actorFromReq(req);
    const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
    const changeClass = parseChangeClass(req.body?.changeClass);

    const result = await releaseJob(jobId, actor, note, changeClass);

    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error });
    }

    const snap = result.snapshot!;
    res.json({
      ok: true,
      jobId: snap.jobId,
      specState: snap.specState,
      revisionId: snap.revision?.revisionId,
      packetSha256: snap.revision?.packetSha256,
      manifestSha256: snap.revision?.manifestSha256,
      at: snap.releasedAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    res.status(500).json({ ok: false, error: message });
  }
});

// ============================================================================
// POST Revoke
// ============================================================================

stateRoute.post('/api/factory/jobs/:jobId/revoke', async (req, res) => {
  try {
    const jobId = safeJobId(req.params.jobId);
    const actor = actorFromReq(req);
    const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
    const changeClass = parseChangeClass(req.body?.changeClass);

    const result = await revokeJob(jobId, actor, note, changeClass);

    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error });
    }

    const snap = result.snapshot!;
    res.json({
      ok: true,
      jobId: snap.jobId,
      specState: snap.specState,
      revisionId: snap.revision?.revisionId,
      packetSha256: snap.revision?.packetSha256,
      manifestSha256: snap.revision?.manifestSha256,
      at: snap.revokedAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    res.status(500).json({ ok: false, error: message });
  }
});

// Alias without /api prefix
stateRoute.post('/factory/jobs/:jobId/revoke', async (req, res) => {
  try {
    const jobId = safeJobId(req.params.jobId);
    const actor = actorFromReq(req);
    const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
    const changeClass = parseChangeClass(req.body?.changeClass);

    const result = await revokeJob(jobId, actor, note, changeClass);

    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error });
    }

    const snap = result.snapshot!;
    res.json({
      ok: true,
      jobId: snap.jobId,
      specState: snap.specState,
      revisionId: snap.revision?.revisionId,
      packetSha256: snap.revision?.packetSha256,
      manifestSha256: snap.revision?.manifestSha256,
      at: snap.revokedAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    res.status(500).json({ ok: false, error: message });
  }
});

// ============================================================================
// GET Can Export (convenience check)
// ============================================================================

stateRoute.get('/api/factory/jobs/:jobId/can-export', async (req, res) => {
  try {
    const jobId = safeJobId(req.params.jobId);
    const result = await canExport(jobId);

    res.json({
      ok: true,
      ...result,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    res.status(400).json({ ok: false, error: message });
  }
});
