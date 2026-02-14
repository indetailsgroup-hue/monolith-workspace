/**
 * proofRoute.ts - P12 Authority Proof Bundle Routes
 *
 * Endpoints:
 * - GET /api/factory/jobs/:jobId/proof - Get proof bundle
 * - GET /factory/jobs/:jobId/proof (alias)
 *
 * @version 0.12.12
 */

import { Router } from 'express';
import { buildJobProof } from './proofService.js';
import { safeJobId } from '../state/jobStateStorage.js';
import type { JobProofError } from './proofTypes.js';

export const proofRoute = Router();

// ============================================================================
// GET Proof Bundle
// ============================================================================

/**
 * P12: Authority Cohesion Proof Bundle
 *
 * Returns a canonical object for dispute resolution:
 * - state: Current authoritative state with revision hashes
 * - latestVerify: Most recent verification result
 * - latestExport: Most recent successful export
 * - lineageHead: Most recent lineage event with revision
 * - canExport: Current export eligibility
 * - generatedAt: Server timestamp
 */
proofRoute.get('/api/factory/jobs/:jobId/proof', async (req, res) => {
  try {
    const jobId = safeJobId(req.params.jobId);
    const proof = await buildJobProof(jobId);

    if (!proof.ok) {
      const err = proof as JobProofError;
      res.set('Cache-Control', 'no-store');
      return res.status(err.code === 'E_NOT_FOUND' ? 404 : 400).json(proof);
    }

    // P12.1: Evidentiary endpoint - prevent caching
    res.set('Cache-Control', 'no-store');
    res.json(proof);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    res.set('Cache-Control', 'no-store');
    res.status(400).json({
      ok: false,
      jobId: req.params.jobId,
      code: 'E_INVALID_JOBID',
      error: message,
    });
  }
});

// Alias without /api prefix
proofRoute.get('/factory/jobs/:jobId/proof', async (req, res) => {
  try {
    const jobId = safeJobId(req.params.jobId);
    const proof = await buildJobProof(jobId);

    if (!proof.ok) {
      const err = proof as JobProofError;
      res.set('Cache-Control', 'no-store');
      return res.status(err.code === 'E_NOT_FOUND' ? 404 : 400).json(proof);
    }

    // P12.1: Evidentiary endpoint - prevent caching
    res.set('Cache-Control', 'no-store');
    res.json(proof);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    res.set('Cache-Control', 'no-store');
    res.status(400).json({
      ok: false,
      jobId: req.params.jobId,
      code: 'E_INVALID_JOBID',
      error: message,
    });
  }
});
