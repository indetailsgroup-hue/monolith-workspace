/**
 * Kernel Client Smoke Test
 *
 * SPEC-08 v8.2: Plasticity-DNA Design Engine
 *
 * Run this to verify client-server fingerprint matching:
 * 1. Start kernel service: cd services/kernel-pyocc && uvicorn src.main:app --port 8080
 * 2. Run this smoke test from browser console or test file
 */

import { KernelClient } from './kernelClient';
import {
  buildKernelOpRequest,
  buildKernelBatchRequest,
  buildCreateSolidRequest,
  buildExtractLoopsRequest,
  buildValidateLoopsRequest,
} from './buildRequests';

/**
 * Run full smoke test against kernel service.
 *
 * @param baseUrl - Kernel service URL (default: http://localhost:8080)
 */
export async function runKernelSmoke(baseUrl = 'http://localhost:8080'): Promise<void> {
  console.log('=== Kernel Client Smoke Test ===');
  console.log(`Target: ${baseUrl}`);
  console.log('');

  const client = new KernelClient({ baseUrl });

  // --------------------------------------------------------------------------
  // 1. Health Check
  // --------------------------------------------------------------------------
  console.log('1. Health check...');
  try {
    const health = await client.health();
    console.log('   ✓ ok:', health.ok);
    console.log('   ✓ service:', health.service);
    console.log('   ✓ version:', health.version);
    console.log('   ✓ tolerance:', JSON.stringify(health.tolerance));
    if (health.tolPolicyId) {
      console.log('   ✓ tolPolicyId:', health.tolPolicyId);
    }
  } catch (err) {
    console.error('   ✗ Health check failed:', err);
    return;
  }
  console.log('');

  // --------------------------------------------------------------------------
  // 2. Single Operation - createSolidFromProfile
  // --------------------------------------------------------------------------
  console.log('2. Single op: createSolidFromProfile...');
  try {
    const opReq = await buildCreateSolidRequest({
      requestId: 'smoke-op-001',
      jobId: 'smoke-job',
      profile2d: { closed: true, segs: [] },
      thickness: 19.6,
      width: 600,
      height: 720,
    });

    console.log('   Request commandFp:', opReq.fingerprints.commandFp.slice(0, 16) + '...');

    const opRes = await client.op(opReq);
    console.log('   ✓ ok:', opRes.ok);
    console.log('   ✓ responseFp:', opRes.responseFp.slice(0, 16) + '...');

    if (opRes.ok && opRes.created) {
      console.log('   ✓ solidIds:', opRes.created.solidIds);
    }

    if (!opRes.ok && opRes.issues) {
      console.log('   ✗ issues:', opRes.issues.map(i => `${i.code}: ${i.message}`));
    }
  } catch (err) {
    console.error('   ✗ Op failed:', err);
  }
  console.log('');

  // --------------------------------------------------------------------------
  // 3. Single Operation with custom commandInputs
  // --------------------------------------------------------------------------
  console.log('3. Single op: extractPlanarLoops...');
  try {
    const opReq = await buildExtractLoopsRequest({
      requestId: 'smoke-op-002',
      jobId: 'smoke-job',
      solidId: 'SOLID_STUB_0001',
      faceId: 'FACE_TOP',
    });

    const opRes = await client.op(opReq);
    console.log('   ✓ ok:', opRes.ok);

    if (opRes.ok && opRes.loops) {
      console.log('   ✓ loops schema:', opRes.loops.schema);
      console.log('   ✓ outer segs:', opRes.loops.outer?.segs?.length ?? 0);
    }

    if (!opRes.ok && opRes.issues) {
      console.log('   ✗ issues:', opRes.issues.map(i => `${i.code}: ${i.message}`));
    }
  } catch (err) {
    console.error('   ✗ Op failed:', err);
  }
  console.log('');

  // --------------------------------------------------------------------------
  // 4. Batch Operations
  // --------------------------------------------------------------------------
  console.log('4. Batch: extractPlanarLoops + validateLoops...');
  try {
    const batchReq = await buildKernelBatchRequest({
      requestId: 'smoke-batch-001',
      jobId: 'smoke-job',
      ops: [
        {
          requestId: 'smoke-op-003',
          opKind: 'extractPlanarLoops',
          commandId: 'manufacturing.flatten',
          commandVersion: 1,
          commandInputs: {},
          selectionKernelIds: ['SOLID_STUB_0001'],
          payload: { solidId: 'SOLID_STUB_0001', faceId: 'FACE_TOP' },
        },
        {
          requestId: 'smoke-op-004',
          opKind: 'validateLoops',
          commandId: 'manufacturing.runGate',
          commandVersion: 1,
          commandInputs: {},
          selectionKernelIds: [],
          payload: {
            loops: { outer: { closed: true, segs: [] }, inners: [] },
            rulesetId: 'flatten.v1',
          },
        },
      ],
    });

    const batchRes = await client.batch(batchReq);
    console.log('   ✓ batch ok:', batchRes.ok);
    console.log('   ✓ responseFp:', batchRes.responseFp.slice(0, 16) + '...');
    console.log('   ✓ responses:');

    for (const r of batchRes.responses) {
      const status = r.ok ? '✓' : '✗';
      const issues = r.issues?.length ? ` (${r.issues.length} issues)` : '';
      console.log(`     ${status} ${r.requestId}: ok=${r.ok}${issues}`);
    }
  } catch (err) {
    console.error('   ✗ Batch failed:', err);
  }
  console.log('');

  // --------------------------------------------------------------------------
  // 5. Fingerprint Mismatch Test (negative test)
  // --------------------------------------------------------------------------
  console.log('5. Negative test: invalid commandFp...');
  try {
    // Build request with correct fingerprint
    const opReq = await buildCreateSolidRequest({
      requestId: 'smoke-op-005',
      jobId: 'smoke-job',
      profile2d: { closed: true, segs: [] },
      thickness: 18,
    });

    // Corrupt the fingerprint
    opReq.fingerprints.commandFp = 'invalid_fingerprint_0000000000000000000000000000000000000000';

    const opRes = await client.op(opReq);
    console.log('   ✓ ok:', opRes.ok, '(expected: false)');

    if (!opRes.ok && opRes.issues) {
      const mismatch = opRes.issues.find(i => i.code === 'COMMAND_FP_MISMATCH');
      if (mismatch) {
        console.log('   ✓ COMMAND_FP_MISMATCH detected as expected');
      } else {
        console.log('   ? issues:', opRes.issues.map(i => i.code));
      }
    }
  } catch (err) {
    console.error('   ✗ Test failed:', err);
  }
  console.log('');

  console.log('=== Smoke Test Complete ===');
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  (window as any).runKernelSmoke = runKernelSmoke;
}
