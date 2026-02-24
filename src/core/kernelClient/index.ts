/**
 * Kernel Client - Public API
 *
 * SPEC-08 v8.2: Plasticity-DNA Design Engine
 */

// Types
export type {
  KernelOpKind,
  KernelOpRequestV1,
  KernelOpResponseV1,
  KernelBatchRequestV1,
  KernelBatchResponseV1,
  KernelHealthResponse,
  KernelTolerance,
  KernelIssue,
  LoopSegment,
} from './kernelTypes';

// Client
export type { KernelClientOptions } from './kernelClient';
export {
  KernelClient,
  getKernelClient,
  initKernelClient,
  resetKernelClient,
} from './kernelClient';

// Fingerprinting
export {
  KERNEL_TOL_POLICY_ID,
  computeCommandFp,
  computeResponseFp,
} from './kernelFp';

// Request builders
export {
  buildKernelOpRequest,
  buildKernelBatchRequest,
  buildCreateSolidRequest,
  buildExtractLoopsRequest,
  buildValidateLoopsRequest,
} from './buildRequests';
