/**
 * MONOLITH Factory Server - API Process
 *
 * Step 10: Multi-process architecture (API separate from Worker)
 *
 * This is the API process that handles:
 * - Bundle upload and verification
 * - Export job queuing
 * - Signed URL downloads
 * - Health checks
 *
 * Run with: npm run dev:api
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import {
  loadServerSecretsOrExit,
  buildCorsOptions,
  createRateLimiter,
  authGate,
  jsonBodyLimit,
  sanitizeInternalErrors,
  safeErrorHandler,
} from '../security/boundary.js';
import { CAS } from '../storage/cas.js';
import { bundlesRouter } from './routes/bundles.js';
import { exportsRouter } from './routes/exports.js';
import { artifactsRouter } from './routes/artifacts.js';
import { factoryRouter } from './routes/factory.js';
import { getQueueStats } from '../queue/queue.js';

// ============================================================================
// Configuration
// ============================================================================

const PORT = Number(process.env.API_PORT) || 3001;
const DATA_DIR = process.env.DATA_DIR || './data';

// ============================================================================
// Initialize
// ============================================================================

async function main() {
  // Initialize CAS
  const cas = new CAS(DATA_DIR);
  await cas.init();

  // Create Express app
  const app = express();

  // Security boundary (FS-B0-02): reject unauthenticated requests before JSON
  // parsing; sanitize legacy route-local 500 responses before they leave.
  app.use(cors(buildCorsOptions()));
  app.use(createRateLimiter());
  app.use(sanitizeInternalErrors());
  app.use(authGate(['/health', '/download']));
  app.use(express.json({ limit: jsonBodyLimit() }));

  // Request logging (simple)
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[API] ${req.method} ${req.path} ${res.statusCode} (${duration}ms)`);
    });
    next();
  });

  // ============================================================================
  // Routes
  // ============================================================================

  // Health check
  app.get('/health', async (req, res) => {
    try {
      const casStats = await cas.stats();
      const queueStats = await getQueueStats();

      res.json({
        ok: true,
        version: '0.10.0',
        uptime: process.uptime(),
        storage: casStats,
        queue: queueStats,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: 'HEALTH_CHECK_FAILED',
      });
    }
  });

  // Bundle routes
  app.use('/bundles', bundlesRouter({ cas }));

  // Export routes
  app.use('/exports', exportsRouter({ cas }));

  // Factory routes
  app.use('/factory', factoryRouter({ cas }));

  // Artifact/download routes
  app.use('/', artifactsRouter({ cas }));

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      ok: false,
      error: 'NOT_FOUND',
      path: req.path,
    });
  });

  // Error handler (generic body — never leaks err.message)
  app.use(safeErrorHandler);

  // ============================================================================
  // Start Server
  // ============================================================================

  // Fail closed: refuse to start without strong secrets.
  loadServerSecretsOrExit();

  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   MONOLITH Factory Server v0.10.0 (API Process)           ║
║                                                           ║
║   Step 10: Multi-process + Signed URLs + DXF R12         ║
║                                                           ║
║   Endpoints:                                              ║
║   - POST /bundles           Upload & verify bundle        ║
║   - POST /exports           Queue export job              ║
║   - GET  /exports/:id       Get job status                ║
║   - GET  /exports/:id/result  Get result w/ signed URLs   ║
║   - GET  /download          Download via signed URL       ║
║   - GET  /factory/export/options  Get export options      ║
║   - POST /factory/jobs/:id/export  Trigger job export     ║
║   - GET  /health            Health check                  ║
║                                                           ║
║   Listening on port ${PORT}                                ║
║   Data directory: ${DATA_DIR}                             ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
  });
}

main().catch((err) => {
  console.error('[API] Failed to start:', err);
  process.exit(1);
});
