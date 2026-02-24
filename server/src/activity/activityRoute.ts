/**
 * Activity Route - P8 GET /factory/jobs/:jobId/activity
 *
 * Server-authoritative activity timeline endpoint.
 *
 * @version 0.12.9
 */

import { Router } from "express";
import { readActivity, getActivityStats } from "./activityStorage.js";

export const activityRoute = Router();

// ============================================================================
// GET /factory/jobs/:jobId/activity
// GET /api/factory/jobs/:jobId/activity (alias)
// ============================================================================

// Handler function for activity endpoint
async function handleGetActivity(req: any, res: any) {
  try {
    const { jobId } = req.params;
    const limitParam = req.query.limit;
    const limit = Math.min(
      5000,
      Math.max(50, Number(limitParam) || 2000)
    );

    const items = await readActivity(jobId, { limit });

    res.json({
      ok: true,
      items,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ACTIVITY ROUTE] Error:", message);

    res.status(500).json({
      ok: false,
      code: "ACTIVITY_READ_ERROR",
      message,
    });
  }
}

// Primary route
activityRoute.get("/factory/jobs/:jobId/activity", handleGetActivity);

// Alias route for /api/factory/... compatibility
activityRoute.get("/api/factory/jobs/:jobId/activity", handleGetActivity);

// ============================================================================
// GET /factory/jobs/:jobId/activity/stats (optional debug endpoint)
// ============================================================================

async function handleGetActivityStats(req: any, res: any) {
  try {
    const { jobId } = req.params;
    const stats = await getActivityStats(jobId);

    if (!stats) {
      res.json({
        ok: true,
        exists: false,
        lineCount: 0,
        sizeBytes: 0,
      });
      return;
    }

    res.json({
      ok: true,
      ...stats,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      ok: false,
      code: "ACTIVITY_STATS_ERROR",
      message,
    });
  }
}

activityRoute.get("/factory/jobs/:jobId/activity/stats", handleGetActivityStats);
activityRoute.get("/api/factory/jobs/:jobId/activity/stats", handleGetActivityStats);
