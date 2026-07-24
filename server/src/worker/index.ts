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

// Trust Kernel (Task 8): managed signer + release worker + artifact materialization.
// Disabled by default in the NOT_FOR_PRODUCTION shadow phase. No private key is
// ever read here - signing is only ever through the managed signer PORT.
import { HttpManagedSignerClient } from '../trust-kernel/signing/httpManagedSignerClient.js';
import { InMemoryPrivateArtifactRepository } from '../trust-kernel/artifacts/artifactRepository.js';
import { executeReleaseAttempt } from '../trust-kernel/worker/releaseWorker.js';
import { materializeArtifact } from '../trust-kernel/worker/materializeArtifact.js';
import { SupabaseReleaseAuthority } from '../trust-kernel/authority/supabaseReleaseAuthority.js';

// ============================================================================
// Configuration
// ============================================================================

const DATA_DIR = process.env.DATA_DIR || './data';
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 2;

// ============================================================================
// Trust Kernel release worker (Task 8) - dormant in the shadow phase
// ============================================================================

/**
 * Construct the Trust Kernel release-worker ports and register the outbox drain.
 * Stays DISABLED unless `TRUST_KERNEL_WORKER=1`; even when enabled it only holds a
 * public signer KEY ID and an endpoint - never private key material. The Postgres
 * release authority and outbox queue binding are supplied by the deployment
 * (Phase-C); until then the worker is dormant.
 */
function startTrustKernelReleaseWorker(): void {
  if (process.env.TRUST_KERNEL_WORKER !== '1') {
    console.log(
      '[TrustKernel] Release worker disabled (NOT_FOR_PRODUCTION). Set TRUST_KERNEL_WORKER=1 to enable.',
    );
    return;
  }

  const endpoint = process.env.TRUST_KERNEL_SIGNER_ENDPOINT;
  const keyId = process.env.TRUST_KERNEL_SIGNER_KEY_ID;
  if (!endpoint || !keyId) {
    console.warn(
      '[TrustKernel] Release worker enabled but signer endpoint/key id are unset; staying dormant.',
    );
    return;
  }

  // The signer holds ONLY a public key id + endpoint; the private key lives in the
  // remote managed signer. The credential provider yields a short-lived workload
  // identity token, never a key.
  const signer = new HttpManagedSignerClient({
    endpoint,
    keyId,
    keyPurpose: 'RELEASE',
    credentialProvider: async () => {
      const token = process.env.TRUST_KERNEL_WORKLOAD_TOKEN;
      if (!token) throw new Error('workload identity token unavailable');
      return token;
    },
    timeoutMs: Number(process.env.TRUST_KERNEL_SIGNER_TIMEOUT_MS) || 5000,
    fetch: (url, init) => (globalThis as { fetch: (u: string, i?: unknown) => Promise<Response> }).fetch(url, init) as never,
  });
  const store = new InMemoryPrivateArtifactRepository();
  const bindReleaseAuthority = (client: unknown) =>
    new SupabaseReleaseAuthority(client as never);

  // Handlers wired for the Phase-C authority + outbox binding.
  const drive = { signer, store, executeReleaseAttempt, materializeArtifact, bindReleaseAuthority };
  void drive;
  console.log(
    '[TrustKernel] Release worker signer/store constructed; awaiting Phase-C authority + outbox binding.',
  );
}

// ============================================================================
// Initialize
// ============================================================================

async function main() {
  console.log('[Worker] Starting...');

  // Initialize CAS
  const cas = new CAS(DATA_DIR);
  await cas.init();

  // Trust Kernel release worker (dormant unless explicitly enabled).
  startTrustKernelReleaseWorker();

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
