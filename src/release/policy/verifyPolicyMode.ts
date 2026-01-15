/**
 * Verify Policy Mode (v0.10)
 *
 * Centralized decision for requirePolicy based on runtime mode.
 * FACTORY mode automatically requires policy - no opt-in needed.
 *
 * This enables:
 * - DESIGNER mode: Flexible, policy optional (dev/design workflow)
 * - FACTORY mode: Strict, policy required (factory safety)
 */

import { getRuntimeMode } from '../../runtime/env';

/**
 * Determine if policy is required based on runtime mode
 *
 * @returns True if runtime mode is FACTORY (policy required)
 */
export function shouldRequirePolicy(): boolean {
  return getRuntimeMode() === 'FACTORY';
}

/**
 * Get human-readable description of policy requirement
 *
 * @returns Description string for UI display
 */
export function describePolicyRequirement(): string {
  const mode = getRuntimeMode();
  if (mode === 'FACTORY') {
    return 'Policy required (FACTORY mode)';
  }
  return 'Policy optional (DESIGNER mode)';
}

/**
 * Check if current mode is factory mode
 */
export function isFactoryMode(): boolean {
  return getRuntimeMode() === 'FACTORY';
}
