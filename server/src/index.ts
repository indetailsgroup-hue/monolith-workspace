/**
 * IIMOS Factory Server
 *
 * Step 9: Express API for bundle verification and export
 *
 * Endpoints:
 * - POST /api/bundle/upload - Upload and verify a bundle
 * - POST /api/export/queue - Queue an export job
 * - GET  /api/export/status/:jobId - Get export job status
 * - GET  /api/export/download/:jobId - Download export result
 * - POST /api/keys/register - Register a public key
 * - GET  /api/keys - List registered keys
 * - GET  /api/health - Health check
 */

import express from 'express';
import cors from 'cors';

import type {
  ArtifactBundle,
  SignatureEnvelope,
  ExportRequest,
  UploadBundleResponse,
  ExportQueueResponse,
  ExportStatusResponse,
} from './types.js';

import { casStats, storeBundleFiles, getStoredBundle, listBundleIds } from './storage/cas.js';
import { registerPublicKey, getPublicKey, listKeyIds, revokeKey } from './crypto/jwkStore.js';
import { verifyBundle, extractManifest, getBundleId } from './verify/verifyBundle.js';
import { evalExportPolicy, DEFAULT_EXPORT_POLICY } from './policy/policy.js';
import {
  processExportRequest,
  exportDirect,
  cacheBundleForExport,
  getCachedBundle,
} from './export/exportService.js';
import { getJob, getAllJobs, getQueueStats, cleanupOldJobs } from './export/jobQueue.js';

// ============================================================================
// Express App Setup
// ============================================================================

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ============================================================================
// Health Check
// ============================================================================

app.get('/api/health', (req, res) => {
  const casStatsData = casStats();
  const queueStatsData = getQueueStats();

  res.json({
    status: 'ok',
    version: '0.9.0',
    uptime: process.uptime(),
    storage: casStatsData,
    queue: queueStatsData,
    keys: listKeyIds().length,
  });
});

// ============================================================================
// Bundle Upload & Verification
// ============================================================================

app.post('/api/bundle/upload', async (req, res) => {
  try {
    const { bundle, signature } = req.body as {
      bundle: ArtifactBundle;
      signature?: SignatureEnvelope;
    };

    if (!bundle || !bundle.files) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_REQUEST',
        message: 'Bundle is required',
      } as UploadBundleResponse);
    }

    // Verify the bundle
    const verify = await verifyBundle(bundle);

    if (!verify.ok) {
      return res.status(400).json({
        ok: false,
        verify,
        error: 'VERIFICATION_FAILED',
      } as UploadBundleResponse);
    }

    // Store the bundle
    const bundleId = cacheBundleForExport(bundle);

    // Also store in CAS for persistence
    const manifestFile = bundle.files.find((f) => f.name === 'manifest.json');
    const sigFile = bundle.files.find((f) => f.name === 'manifest.sig.json');
    if (manifestFile && sigFile) {
      storeBundleFiles(
        manifestFile.content,
        sigFile.content,
        bundle.files.filter((f) => f.name !== 'manifest.json' && f.name !== 'manifest.sig.json')
          .map((f) => ({ name: f.name, content: f.content }))
      );
    }

    res.json({
      ok: true,
      bundleId,
      verify,
    } as UploadBundleResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({
      ok: false,
      error: 'SERVER_ERROR',
      message,
    } as UploadBundleResponse);
  }
});

// List uploaded bundles
app.get('/api/bundle/list', (req, res) => {
  const bundleIds = listBundleIds();
  res.json({
    ok: true,
    bundles: bundleIds.map((id) => ({
      id,
      stored: getStoredBundle(id),
    })),
  });
});

// Get bundle info
app.get('/api/bundle/:bundleId', (req, res) => {
  const { bundleId } = req.params;
  const bundle = getCachedBundle(bundleId);

  if (!bundle) {
    return res.status(404).json({
      ok: false,
      error: 'BUNDLE_NOT_FOUND',
    });
  }

  const manifest = extractManifest(bundle);

  res.json({
    ok: true,
    bundleId,
    manifest,
    fileCount: bundle.files.length,
    createdAt: bundle.createdAtIso,
  });
});

// ============================================================================
// Export Queue
// ============================================================================

app.post('/api/export/queue', async (req, res) => {
  try {
    const { bundleId, request } = req.body as {
      bundleId: string;
      request: ExportRequest;
    };

    if (!bundleId || !request) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_REQUEST',
        message: 'bundleId and request are required',
      } as ExportQueueResponse);
    }

    const result = await processExportRequest(bundleId, request);

    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        error: result.error,
        verify: result.verify,
        policy: result.policy,
      } as ExportQueueResponse);
    }

    res.json({
      ok: true,
      jobId: result.jobId,
    } as ExportQueueResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({
      ok: false,
      error: 'SERVER_ERROR',
      message,
    } as ExportQueueResponse);
  }
});

// Direct export (synchronous, for small jobs)
app.post('/api/export/direct', async (req, res) => {
  try {
    const { bundle, request } = req.body as {
      bundle: ArtifactBundle;
      request: ExportRequest;
    };

    if (!bundle || !request) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_REQUEST',
        message: 'bundle and request are required',
      });
    }

    const result = await exportDirect(bundle, request);

    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        error: result.error,
        verify: result.verify,
        policy: result.policy,
      });
    }

    res.json({
      ok: true,
      files: result.files,
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

// Get export job status
app.get('/api/export/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);

  if (!job) {
    return res.status(404).json({
      ok: false,
      error: 'JOB_NOT_FOUND',
    } as ExportStatusResponse);
  }

  res.json({
    ok: true,
    job,
  } as ExportStatusResponse);
});

// Download export result
app.get('/api/export/download/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);

  if (!job) {
    return res.status(404).json({
      ok: false,
      error: 'JOB_NOT_FOUND',
    });
  }

  if (job.status !== 'COMPLETED') {
    return res.status(400).json({
      ok: false,
      error: 'JOB_NOT_COMPLETE',
      status: job.status,
    });
  }

  if (!job.result || !job.result.files || job.result.files.length === 0) {
    return res.status(404).json({
      ok: false,
      error: 'NO_FILES',
    });
  }

  // For multiple files, return as JSON
  // For single file, return the file directly
  if (job.result.files.length === 1) {
    const file = job.result.files[0];
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.send(file.content);
  } else {
    res.json({
      ok: true,
      files: job.result.files,
    });
  }
});

// List all jobs
app.get('/api/export/jobs', (req, res) => {
  const jobs = getAllJobs();
  const stats = getQueueStats();

  res.json({
    ok: true,
    stats,
    jobs,
  });
});

// ============================================================================
// Key Management
// ============================================================================

app.post('/api/keys/register', (req, res) => {
  try {
    const { keyId, publicJwk, factoryId, scope, expiresAtIso } = req.body;

    if (!keyId || !publicJwk) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_REQUEST',
        message: 'keyId and publicJwk are required',
      });
    }

    const key = registerPublicKey(keyId, publicJwk, {
      factoryId,
      scope,
      expiresAtIso,
    });

    res.json({
      ok: true,
      key: {
        keyId: key.keyId,
        algorithm: key.algorithm,
        factoryId: key.factoryId,
        scope: key.scope,
        createdAtIso: key.createdAtIso,
        expiresAtIso: key.expiresAtIso,
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

app.get('/api/keys', (req, res) => {
  const keyIds = listKeyIds();
  const keys = keyIds.map((id) => {
    const key = getPublicKey(id);
    return key
      ? {
          keyId: key.keyId,
          algorithm: key.algorithm,
          factoryId: key.factoryId,
          scope: key.scope,
          createdAtIso: key.createdAtIso,
          expiresAtIso: key.expiresAtIso,
          revoked: key.revoked,
        }
      : null;
  }).filter(Boolean);

  res.json({
    ok: true,
    keys,
  });
});

app.get('/api/keys/:keyId', (req, res) => {
  const { keyId } = req.params;
  const key = getPublicKey(keyId);

  if (!key) {
    return res.status(404).json({
      ok: false,
      error: 'KEY_NOT_FOUND',
    });
  }

  res.json({
    ok: true,
    key: {
      keyId: key.keyId,
      algorithm: key.algorithm,
      publicJwk: key.publicJwk,
      factoryId: key.factoryId,
      scope: key.scope,
      createdAtIso: key.createdAtIso,
      expiresAtIso: key.expiresAtIso,
      revoked: key.revoked,
      revokedAtIso: key.revokedAtIso,
    },
  });
});

app.post('/api/keys/:keyId/revoke', (req, res) => {
  const { keyId } = req.params;
  const success = revokeKey(keyId);

  if (!success) {
    return res.status(404).json({
      ok: false,
      error: 'KEY_NOT_FOUND',
    });
  }

  res.json({
    ok: true,
    message: `Key ${keyId} has been revoked`,
  });
});

// ============================================================================
// Admin Endpoints
// ============================================================================

app.post('/api/admin/cleanup', (req, res) => {
  const { maxAgeMs } = req.body || {};
  const removed = cleanupOldJobs(maxAgeMs);

  res.json({
    ok: true,
    removed,
  });
});

app.get('/api/admin/stats', (req, res) => {
  res.json({
    ok: true,
    storage: casStats(),
    queue: getQueueStats(),
    keys: listKeyIds().length,
    bundles: listBundleIds().length,
  });
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   IIMOS Factory Server v0.9.0                            ║
║                                                           ║
║   Step 9: Server-side verification & export              ║
║                                                           ║
║   Endpoints:                                             ║
║   - POST /api/bundle/upload    Upload & verify bundle    ║
║   - POST /api/export/queue     Queue export job          ║
║   - GET  /api/export/status    Get job status            ║
║   - POST /api/keys/register    Register public key       ║
║   - GET  /api/health           Health check              ║
║                                                           ║
║   Listening on port ${PORT}                               ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
