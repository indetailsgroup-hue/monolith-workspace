/**
 * Kernel Fingerprinting - Compute commandFp matching server
 *
 * SPEC-08 v8.2: Plasticity-DNA Design Engine
 *
 * CRITICAL: This MUST produce identical fingerprints to server's
 * compute_command_fp() in dispatcher.py, otherwise requests
 * will be rejected with COMMAND_FP_MISMATCH.
 */

import { stableStringify, sha256HexUtf8 } from './stablejson';

// ============================================================================
// TOLERANCE POLICY
// ============================================================================

/**
 * Pin tolerance policy string.
 * MUST match server's tolerance.py policy_id() exactly.
 *
 * Format: "tol:{internalEps}:{exportEps}:{angleEpsDeg}"
 */
export const KERNEL_TOL_POLICY_ID = 'tol:1e-06:0.001:1e-06';

// ============================================================================
// FINGERPRINT COMPUTATION
// ============================================================================

export interface ComputeCommandFpArgs {
  commandId: string;
  commandVersion: number;
  commandInputs: unknown;
  selectionKernelIds: string[];
}

/**
 * Compute command fingerprint matching server calculation.
 *
 * Server computes fingerprint from:
 * ```python
 * fp_obj = {
 *     "commandId": req.commandId,
 *     "commandVersion": req.commandVersion,
 *     "commandInputs": req.commandInputs,
 *     "selectionKernelIds": req.selectionKernelIds,
 *     "tolPolicy": policy_id(),
 * }
 * return fp256(fp_obj, float_ndigits=6)
 * ```
 *
 * @param args - Command arguments
 * @returns SHA-256 hex string (64 chars)
 */
export async function computeCommandFp(args: ComputeCommandFpArgs): Promise<string> {
  const fpObj = {
    commandId: args.commandId,
    commandVersion: args.commandVersion,
    commandInputs: args.commandInputs ?? {},
    selectionKernelIds: args.selectionKernelIds ?? [],
    tolPolicy: KERNEL_TOL_POLICY_ID,
  };

  // Use float_ndigits=6 to match server
  const canonical = stableStringify(fpObj, 6);
  return sha256HexUtf8(canonical);
}

/**
 * Compute response fingerprint for verification.
 *
 * Useful for verifying server response hasn't been tampered with.
 */
export async function computeResponseFp(response: unknown): Promise<string> {
  const canonical = stableStringify({ resp: response }, 6);
  return sha256HexUtf8(canonical);
}
