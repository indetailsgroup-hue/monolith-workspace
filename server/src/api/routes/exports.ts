/**
 * Export API Routes
 *
 * Step 10: Export job queuing and status
 *
 * Endpoints:
 * - POST /exports - Queue an export job
 * - GET /exports/:jobId - Get job status
 * - GET /exports/:jobId/result - Get export result with signed URLs
 */

import { Router, Request, Response } from 'express';
import { CAS } from '../../storage/cas.js';
import { enqueueExportJob, getJobById, getQueueStats, ExportJobData } from '../../queue/queue.js';

export interface ExportsRouterDeps {
  cas: CAS;
}

export function exportsRouter(deps: ExportsRouterDeps): Router {
  const router = Router();
  const { cas } = deps;

  /**
   * POST /exports - Queue an export job
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { bundleId, format, jobName, options } = req.body as ExportJobData & { options?: Record<string, unknown> };

      // Validate required fields
      if (!bundleId || !format || !jobName) {
        return res.status(400).json({
          ok: false,
          error: 'MISSING_FIELDS',
          message: 'bundleId, format, and jobName are required',
        });
      }

      // Validate format
      const validFormats = ['CUTLIST_CSV', 'DXF_R12', 'GCODE'];
      if (!validFormats.includes(format)) {
        return res.status(400).json({
          ok: false,
          error: 'INVALID_FORMAT',
          message: `Format must be one of: ${validFormats.join(', ')}`,
        });
      }

      // Check bundle exists
      const bundleExists = await cas.exists(`bundles/${bundleId}.json`);
      if (!bundleExists) {
        return res.status(404).json({
          ok: false,
          error: 'BUNDLE_NOT_FOUND',
          message: `Bundle ${bundleId} not found`,
        });
      }

      // Enqueue the job
      const job = await enqueueExportJob({
        bundleId,
        format: format as ExportJobData['format'],
        jobName,
        options,
      });

      res.json({
        ok: true,
        jobId: job.id,
        message: `Export job queued for ${format}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Exports] Queue error:', message);
      res.status(500).json({
        ok: false,
        error: 'SERVER_ERROR',
        message,
      });
    }
  });

  /**
   * GET /exports/stats - Get queue statistics
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const stats = await getQueueStats();

      res.json({
        ok: true,
        stats,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({
        ok: false,
        error: 'SERVER_ERROR',
        message,
      });
    }
  });

  /**
   * GET /exports/:jobId - Get job status
   */
  router.get('/:jobId', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;

      const job = await getJobById(jobId);
      if (!job) {
        return res.status(404).json({
          ok: false,
          error: 'JOB_NOT_FOUND',
        });
      }

      const state = await job.getState();
      const progress = job.progress;
      const returnValue = job.returnvalue;
      const failedReason = job.failedReason;

      res.json({
        ok: true,
        job: {
          id: job.id,
          state,
          progress,
          data: job.data,
          result: returnValue ?? null,
          failedReason: failedReason ?? null,
          createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
          processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
          finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({
        ok: false,
        error: 'SERVER_ERROR',
        message,
      });
    }
  });

  /**
   * GET /exports/:jobId/result - Get export result with signed URLs
   */
  router.get('/:jobId/result', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;

      const job = await getJobById(jobId);
      if (!job) {
        return res.status(404).json({
          ok: false,
          error: 'JOB_NOT_FOUND',
        });
      }

      const state = await job.getState();
      if (state !== 'completed') {
        return res.status(400).json({
          ok: false,
          error: 'JOB_NOT_COMPLETE',
          state,
        });
      }

      const result = job.returnvalue;
      if (!result || !result.ok || !result.outputPublicIndexPath) {
        return res.status(404).json({
          ok: false,
          error: 'NO_RESULT',
        });
      }

      // Read the public index
      const publicIndex = await cas.readJson(result.outputPublicIndexPath);

      res.json({
        ok: true,
        result: publicIndex,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({
        ok: false,
        error: 'SERVER_ERROR',
        message,
      });
    }
  });

  return router;
}
