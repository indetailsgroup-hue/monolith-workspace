/**
 * Runtime Environment Configuration (v0.10)
 *
 * Provides runtime mode and factory identity for policy enforcement.
 *
 * Modes:
 * - DESIGNER: Development/design mode (flexible, policy optional)
 * - FACTORY: Production mode (strict, policy required)
 *
 * Values stored in localStorage with 'iimos.' prefix.
 * Defaults: mode = DESIGNER, factoryId = null
 */

/** Supported runtime modes */
export type RuntimeMode = 'DESIGNER' | 'FACTORY';

const LS_MODE = 'iimos.runtime.mode';
const LS_FACTORY_ID = 'iimos.runtime.factoryId';

/**
 * Get current runtime mode.
 *
 * @returns 'DESIGNER' (default) or 'FACTORY'
 */
export function getRuntimeMode(): RuntimeMode {
  const stored = localStorage.getItem(LS_MODE);
  if (stored === 'FACTORY') return 'FACTORY';
  return 'DESIGNER';
}

/**
 * Get factory ID for scope binding.
 *
 * @returns Factory ID string or null if not set
 */
export function getFactoryId(): string | null {
  return localStorage.getItem(LS_FACTORY_ID) || null;
}

/**
 * Set runtime mode.
 */
export function setRuntimeMode(mode: RuntimeMode): void {
  localStorage.setItem(LS_MODE, mode);
}

/**
 * Set factory ID.
 */
export function setFactoryId(id: string | null): void {
  if (id) {
    localStorage.setItem(LS_FACTORY_ID, id);
  } else {
    localStorage.removeItem(LS_FACTORY_ID);
  }
}
