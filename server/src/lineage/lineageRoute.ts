/**
 * lineageRoute.ts - P9.1 Server Lineage API Routes
 *
 * GET /factory/jobs/:jobId/lineage - Read lineage events
 * GET /api/factory/jobs/:jobId/lineage - Alias
 */

import { Router } from 'express';
import { readLineageEvents, safeJobId } from './lineageStorage.js';
import type { LineageResponse } from './lineageTypes.js';

export const lineageRouter = Router();

// ============================================================================
// GET /factory/jobs/:jobId/lineage
// ============================================================================

lineageRouter.get('/factory/jobs/:jobId/lineage', async (req, res) => {
  try {
    const { jobId } = req.params;
    const limit = Number(req.query.limit ?? 2000);
    const offset = Number(req.query.offset ?? 0);
    const typeFilter = req.query.type as string | undefined;

    // Validate jobId
    let safeId: string;
    try {
      safeId = safeJobId(jobId);
    } catch (e) {
      res.status(400).json({
        ok: false,
        jobId,
        items: [],
        error: 'Invalid jobId',
      } satisfies LineageResponse);
      return;
    }

    // Parse type filter
    const type = typeFilter ? typeFilter.split(',') as any[] : undefined;

    const items = await readLineageEvents(safeId, { limit, offset, type });

    res.json({
      ok: true,
      jobId: safeId,
      items,
    } satisfies LineageResponse);
  } catch (e) {
    console.error('[LineageRoute] Error:', e);
    res.status(500).json({
      ok: false,
      jobId: req.params.jobId,
      items: [],
      error: e instanceof Error ? e.message : 'Internal error',
    } satisfies LineageResponse);
  }
});

// ============================================================================
// Alias: GET /api/factory/jobs/:jobId/lineage
// ============================================================================

lineageRouter.get('/api/factory/jobs/:jobId/lineage', async (req, res) => {
  try {
    const { jobId } = req.params;
    const limit = Number(req.query.limit ?? 2000);
    const offset = Number(req.query.offset ?? 0);
    const typeFilter = req.query.type as string | undefined;

    let safeId: string;
    try {
      safeId = safeJobId(jobId);
    } catch (e) {
      res.status(400).json({
        ok: false,
        jobId,
        items: [],
        error: 'Invalid jobId',
      } satisfies LineageResponse);
      return;
    }

    const type = typeFilter ? typeFilter.split(',') as any[] : undefined;
    const items = await readLineageEvents(safeId, { limit, offset, type });

    res.json({
      ok: true,
      jobId: safeId,
      items,
    } satisfies LineageResponse);
  } catch (e) {
    console.error('[LineageRoute] Error:', e);
    res.status(500).json({
      ok: false,
      jobId: req.params.jobId,
      items: [],
      error: e instanceof Error ? e.message : 'Internal error',
    } satisfies LineageResponse);
  }
});

export default lineageRouter;
