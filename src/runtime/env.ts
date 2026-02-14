/**
 * Runtime Environment Configuration
 *
 * Device-level configuration for Monolith runtime mode.
 * MVP uses localStorage; production should use device provisioning or server config.
 *
 * Modes:
 * - DESIGNER: Design workstation (no factory restrictions)
 * - FACTORY: Factory floor device (strict scope enforcement)
 *
 * G9 COMPLIANCE: Uses unsafeStorage boundary for localStorage access.
 */

import {
  readString,
  writeRaw,
  remove,
} from '../core/persistence/unsafeStorage';

const LS_FACTORY_ID = 'monolith.runtime.factoryId';
const LS_MODE = 'monolith.runtime.mode';

/**
 * Runtime mode determines scope enforcement behavior
 */
export type RuntimeMode = 'DESIGNER' | 'FACTORY';

/**
 * Get current runtime mode
 * Defaults to DESIGNER if not set
 */
export function getRuntimeMode(): RuntimeMode {
  const v = readString(LS_MODE);
  return v === 'FACTORY' ? 'FACTORY' : 'DESIGNER';
}

/**
 * Set runtime mode
 */
export function setRuntimeMode(mode: RuntimeMode): void {
  writeRaw(LS_MODE, mode);
}

/**
 * Get factory ID for this device
 * Only relevant in FACTORY mode
 */
export function getFactoryId(): string | null {
  return readString(LS_FACTORY_ID);
}

/**
 * Set factory ID for this device
 */
export function setFactoryId(factoryId: string): void {
  writeRaw(LS_FACTORY_ID, factoryId);
}

/**
 * Clear factory ID
 */
export function clearFactoryId(): void {
  remove(LS_FACTORY_ID);
}

/**
 * Check if device is properly configured for FACTORY mode
 */
export function isFactoryConfigured(): boolean {
  return getRuntimeMode() === 'FACTORY' && !!getFactoryId();
}

/**
 * Get device context summary for display
 */
export function getDeviceContext(): {
  mode: RuntimeMode;
  factoryId: string | null;
  configured: boolean;
} {
  const mode = getRuntimeMode();
  const factoryId = getFactoryId();
  return {
    mode,
    factoryId,
    configured: mode === 'DESIGNER' || (mode === 'FACTORY' && !!factoryId),
  };
}
