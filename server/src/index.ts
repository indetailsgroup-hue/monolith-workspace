/**
 * MONOLITH Factory Server
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
import { existsSync, mkdirSync } from 'fs';

import {
  loadServerSecretsOrExit,
  buildCorsOptions,
  createRateLimiter,
  authGate,
  jsonBodyLimit,
  sanitizeInternalErrors,
  safeErrorHandler,
} from './security/boundary.js';

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
import { createFactoryPackage } from './export/zipBundle.js';
import {
  logExportSuccess,
  logVerifyFail,
  logPolicyDenied,
  logExportError,
  queryAudit,
  getAuditStats,
  getAuditEntry,
} from './export/exportAudit.js';
import { getExportOptionsResponse } from './export/exportOptions.js';
import type { AuditStatus } from './export/exportTypes.js';
import { activityRoute, appendActivity, extractActorFromHeaders } from './activity/index.js';
import { lineageRouter } from './lineage/lineageRoute.js';
import { stateRoute, canExport } from './state/index.js';
import { proofRoute } from './proof/index.js';

// ============================================================================
// Express App Setup
// ============================================================================

const app = express();
const PORT = process.env.PORT || 3001;

// Security boundary (FS-B0-02): reject unauthenticated requests before JSON
// parsing; sanitize legacy route-local 500 responses before they leave.
app.use(cors(buildCorsOptions()));
app.use(createRateLimiter());
app.use(sanitizeInternalErrors());
app.use(authGate(['/api/health']));
app.use(express.json({ limit: jsonBodyLimit() }));

// P8: Activity Timeline Route
app.use(activityRoute);

// P9.1: Server-Anchored Lineage Route
app.use(lineageRouter);

// P10: Server State Transitions Route
app.use(stateRoute);

// P12: Authority Proof Bundle Route
app.use(proofRoute);

// ============================================================================
// Health Check
// ============================================================================

app.get('/api/health', (req, res) => {
  const casStatsData = casStats();
  const queueStatsData = getQueueStats();

  res.json({
    status: 'ok',
    version: '2.0.0-p22a',
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
// ZIP Export with SHA-256 Header (P2.2a)
// ============================================================================

app.post('/api/export/zip', async (req, res) => {
  const startTime = Date.now();
  const requester = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';

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

    const bundleId = getBundleId(bundle);
    const jobId = request.jobName || bundleId.slice(0, 8);
    const actor = extractActorFromHeaders(req.headers as Record<string, string | string[] | undefined>);

    // P8: Log EXPORT_ATTEMPT at start
    await appendActivity(jobId, {
      type: 'EXPORT_ATTEMPT',
      actor,
      export: {
        dialect: request.format as 'KDT' | 'BIESSE' | 'HOMAG' | undefined,
        mode: 'PER_JOB',
        target: 'BUNDLE',
      },
    });

    // P10: Check server state (must be RELEASED)
    const stateCheck = await canExport(jobId);
    if (!stateCheck.canExport) {
      await appendActivity(jobId, {
        type: 'EXPORT_BLOCKED',
        actor,
        export: {
          dialect: request.format as 'KDT' | 'BIESSE' | 'HOMAG' | undefined,
          ok: false,
          reason: stateCheck.reason ?? `Job is ${stateCheck.specState}, must be RELEASED`,
        },
      });

      return res.status(403).json({
        ok: false,
        error: 'NOT_RELEASED',
        specState: stateCheck.specState,
        message: stateCheck.reason ?? `Job must be RELEASED for export (current: ${stateCheck.specState})`,
      });
    }

    // 1. Verify the bundle
    const verify = await verifyBundle(bundle);
    if (!verify.ok) {
      // P8: Log VERIFY_RUN (FAIL)
      await appendActivity(jobId, {
        type: 'VERIFY_RUN',
        actor,
        verify: {
          verdict: 'FAIL',
          code: 'VERIFICATION_FAILED',
          summary: verify.issues?.[0]?.message ?? 'Verification failed',
        },
      });

      // Audit: verification failed
      logVerifyFail({
        bundleId,
        format: request.format,
        requester,
        issueCount: verify.issues?.length ?? 0,
        errorCount: verify.issues?.filter(i => i.severity === 'ERROR').length ?? 0,
        error: verify.issues?.[0]?.message,
      });

      return res.status(400).json({
        ok: false,
        error: 'VERIFICATION_FAILED',
        verify,
      });
    }

    // P8: Log VERIFY_RUN (PASS)
    const hasWarnings = (verify.issues?.filter(i => i.severity === 'WARNING').length ?? 0) > 0;
    await appendActivity(jobId, {
      type: 'VERIFY_RUN',
      actor,
      verify: {
        verdict: hasWarnings ? 'PASS_WITH_WARN' : 'PASS',
        code: 'VERIFICATION_OK',
        summary: hasWarnings ? `Passed with ${verify.issues?.filter(i => i.severity === 'WARNING').length} warnings` : 'All checks passed',
      },
    });

    // 2. Evaluate policy
    const manifest = extractManifest(bundle);
    const policyResult = evalExportPolicy({
      policy: DEFAULT_EXPORT_POLICY,
      request,
      verify,
      manifest,
    });

    if (!policyResult.ok) {
      // P8: Log EXPORT_BLOCKED
      const deniedDecision = policyResult.decisions?.find(d => d.effect === 'DENY');
      await appendActivity(jobId, {
        type: 'EXPORT_BLOCKED',
        actor,
        export: {
          dialect: request.format as 'KDT' | 'BIESSE' | 'HOMAG' | undefined,
          ok: false,
          reason: deniedDecision?.reason ?? 'Policy check failed',
        },
      });

      // Audit: policy denied
      logPolicyDenied({
        bundleId,
        format: request.format,
        requester,
        deniedReason: deniedDecision?.reason ?? 'Policy check failed',
      });

      return res.status(403).json({
        ok: false,
        error: 'POLICY_DENIED',
        policy: policyResult,
      });
    }

    // 3. Get exporter and generate files
    const result = await exportDirect(bundle, request);

    if (!result.ok || !result.files) {
      // Audit: export error
      logExportError({
        bundleId,
        format: request.format,
        requester,
        error: result.error ?? 'Export failed',
      });

      return res.status(500).json({
        ok: false,
        error: result.error ?? 'EXPORT_FAILED',
      });
    }

    // 4. Create deterministic ZIP bundle
    const manifestFile = bundle.files.find(f => f.name === 'manifest.json');
    const sigFile = bundle.files.find(f => f.name === 'manifest.sig.json');

    const zipResult = await createFactoryPackage({
      jobId: request.jobName || bundleId.slice(0, 8),
      projectName: manifest?.bundleId ?? 'Unnamed', // Use bundleId as project identifier
      format: request.format,
      manifest: manifestFile?.content ?? '{}',
      signature: sigFile?.content,
      files: result.files.map(f => ({
        name: f.name,
        content: f.content,
      })),
      verifyReport: JSON.stringify(verify, null, 2),
    });

    const processingTimeMs = Date.now() - startTime;

    // 5. Audit: success
    logExportSuccess({
      bundleId,
      format: request.format,
      requester,
      zipHashHex: zipResult.sha256Hex,
      fileCount: result.files.length,
      processingTimeMs,
    });

    // P8.1: Log EXPORT_SUCCESS with exportId for correlation
    const exportId = zipResult.sha256Hex.slice(0, 12);
    await appendActivity(jobId, {
      type: 'EXPORT_SUCCESS',
      actor,
      export: {
        exportId,
        dialect: request.format as 'KDT' | 'BIESSE' | 'HOMAG' | undefined,
        mode: 'PER_JOB',
        target: 'BUNDLE',
        ok: true,
        artifactSha256: zipResult.sha256Hex,
        artifactName: `factory-package-${jobId}.zip`,
      },
    });

    // 6. Send ZIP with SHA-256 header
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="factory-package-${request.jobName || bundleId.slice(0, 8)}.zip"`);
    res.setHeader('X-MONOLITH-ZIP-SHA256', zipResult.sha256Hex);
    res.setHeader('X-MONOLITH-Entry-Count', zipResult.entryCount.toString());
    res.setHeader('X-MONOLITH-Processing-Ms', processingTimeMs.toString());

    res.send(zipResult.buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    // Audit: error
    logExportError({
      bundleId: 'unknown',
      format: req.body?.request?.format ?? 'unknown',
      requester,
      error: message,
    });

    res.status(500).json({
      ok: false,
      error: 'SERVER_ERROR',
      message,
    });
  }
});

// ============================================================================
// Audit Trail Endpoints (P2.2a)
// ============================================================================

// Query audit log
app.get('/api/audit', (req, res) => {
  const query = {
    bundleId: req.query.bundleId as string | undefined,
    jobId: req.query.jobId as string | undefined,
    status: req.query.status as AuditStatus | undefined,
    format: req.query.format as string | undefined,
    fromIso: req.query.fromIso as string | undefined,
    toIso: req.query.toIso as string | undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
  };

  const entries = queryAudit(query);

  res.json({
    ok: true,
    count: entries.length,
    entries,
  });
});

// Get audit statistics
app.get('/api/audit/stats', (_req, res) => {
  const stats = getAuditStats();

  res.json({
    ok: true,
    stats,
  });
});

// Get single audit entry
app.get('/api/audit/:id', (req, res) => {
  const { id } = req.params;
  const entry = getAuditEntry(id);

  if (!entry) {
    return res.status(404).json({
      ok: false,
      error: 'AUDIT_ENTRY_NOT_FOUND',
    });
  }

  res.json({
    ok: true,
    entry,
  });
});

// ============================================================================
// Export Options Endpoint (P2.2a)
// ============================================================================

app.get('/api/export/options', (_req, res) => {
  const options = getExportOptionsResponse();
  res.json({
    ok: true,
    ...options,
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

// Terminal error handler (generic body — never leaks err.message)
app.use(safeErrorHandler);

// ============================================================================
// Start Server
// ============================================================================

// Ensure data directory exists for audit log
const dataDir = process.env.AUDIT_DIR ?? './data';
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
  console.log(`[INIT] Created data directory: ${dataDir}`);
}

// Fail closed: refuse to start without strong secrets.
loadServerSecretsOrExit();

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   MONOLITH Factory Server v2.0.0-p22a                       ║
║                                                           ║
║   P2.2a: Gated Export with Deterministic ZIP             ║
║                                                           ║
║   Endpoints:                                             ║
║   - POST /api/bundle/upload    Upload & verify bundle    ║
║   - POST /api/export/zip       Gated export (ZIP+SHA)    ║
║   - GET  /api/export/options   Available formats/opts    ║
║   - GET  /api/audit            Query audit log           ║
║   - GET  /api/audit/stats      Audit statistics          ║
║   - POST /api/keys/register    Register public key       ║
║   - GET  /api/health           Health check              ║
║                                                           ║
║   Listening on port ${PORT}                               ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
