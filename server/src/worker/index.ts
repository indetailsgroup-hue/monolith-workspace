/**
 * MONOLITH Factory Server - Worker Process
 *
 * Step 10: Multi-process architecture (Worker separate from API)
 *
 * This is the Worker process that:
 * - Listens to the export job queue
 * - Processes export jobs
 * - Stores outputs in CAS
 * - Generates signed download URLs
 *
 * Run with: npm run dev:worker
 */

import 'dotenv/config';
import { CAS } from '../storage/cas.js';
import { makeWorker, closeRedis, ExportJobData, ExportJobResult } from '../queue/queue.js';
import { processExportJob } from './processors/exportJobProcessor.js';
import { Job } from 'bullmq';

// ============================================================================
// Configuration
// ============================================================================

const DATA_DIR = process.env.DATA_DIR || './data';
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 2;

// ============================================================================
// Initialize
// ============================================================================

async function main() {
  console.log('[Worker] Starting...');

  // Initialize CAS
  const cas = new CAS(DATA_DIR);
  await cas.init();

  // Create worker
  const worker = makeWorker(
    async (job: Job<ExportJobData, ExportJobResult>) => {
      return processExportJob({ cas }, job);
    },
    { concurrency: CONCURRENCY }
  );

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[Worker] Received ${signal}, shutting down...`);

    await worker.close();
    await closeRedis();

    console.log('[Worker] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Log startup
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   MONOLITH Factory Server v0.10.5 (Worker Process)          ║
║                                                           ║
║   Step 10.5: G-Code Compilation from Toolpath Plans      ║
║                                                           ║
║   Processing jobs from queue: monolith_export_jobs          ║
║   Concurrency: ${CONCURRENCY}                                         ║
║   Data directory: ${DATA_DIR}                            ║
║                                                           ║
║   Supported formats:                                     ║
║   - CUTLIST_CSV    Cut list spreadsheet                  ║
║   - DXF_R12        Single panel AutoCAD R12 DXF          ║
║   - DXF_SHEET      Multi-part nested sheet DXF           ║
║   - DXF_SHEET_V2   Rotation packing + DRILL annotations  ║
║   - GCODE          Basic CNC G-code                      ║
║   - GCODE_KDT_MVP  G-code compiled from toolpath plan    ║
║                                                           ║
║   CAM Features (v0.10.5):                                ║
║   - Tabs/bridges on profile cuts (hold-down)             ║
║   - Keepout zones (clamp/vacuum collision avoidance)     ║
║   - Toolpath Plan JSON sidecar for automation            ║
║   - G-code compiler with machine profiles                ║
║   - Tool table management (drill, endmill, vbit)         ║
║   - Multi-pass depth control + drill optimization        ║
║                                                           ║
║   Waiting for jobs...                                    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
}

main().catch((err) => {
  console.error('[Worker] Failed to start:', err);
  process.exit(1);
});
