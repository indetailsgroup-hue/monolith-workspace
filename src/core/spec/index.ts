/**
 * Spec Module Index
 *
 * Specification state machine and policy enforcement.
 */

// State Types
export type { SpecState, SpecStatus } from './specState';

export {
  SPEC_TRANSITIONS,
  canTransition,
  getAvailableTransitions,
  createDraftStatus,
  createFrozenStatus,
  createReleasedStatus,
  transitionSpec,
  canEditGeometry,
  canExport,
  canFreeze,
  canRelease,
  canUnfreeze,
} from './specState';

// Policy
export type { PolicyResult } from './specPolicy';

export {
  getSpecStatusFromHead,
  getSpecStateFromHead,
  assertExportAllowedBySpec,
  assertEditAllowedBySpec,
  assertFreezeAllowed,
  assertReleaseAllowed,
  assertUnfreezeAllowed,
  assertExportAllowed,
  getStateDescription,
  getStateColor,
} from './specPolicy';
