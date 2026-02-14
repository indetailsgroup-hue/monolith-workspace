/**
 * specState.ts - Spec State Machine Types
 *
 * NORTH STAR: Export requires RELEASED state
 *
 * STATE FLOW:
 *   DRAFT → FROZEN → RELEASED
 *
 * POLICIES:
 * - DRAFT: Allow geometry/param edits
 * - FROZEN: No geometry edits (review/calculate allowed)
 * - RELEASED: Factory commits to this spec, Export allowed
 */

// ============================================
// STATE TYPE
// ============================================

/**
 * Specification state
 */
export type SpecState = 'DRAFT' | 'FROZEN' | 'RELEASED';

/**
 * Spec status (embedded in TrustReport, signed)
 */
export interface SpecStatus {
  /** Current state */
  state: SpecState;

  /** When spec was frozen (ISO timestamp) */
  frozenAtIso?: string;

  /** When spec was released (ISO timestamp) */
  releasedAtIso?: string;

  /** Optional human note */
  note?: string;
}

// ============================================
// STATE TRANSITIONS
// ============================================

/**
 * Valid state transitions
 */
export const SPEC_TRANSITIONS: Record<SpecState, SpecState[]> = {
  DRAFT: ['FROZEN'],
  FROZEN: ['DRAFT', 'RELEASED'], // Can unfreeze back to DRAFT
  RELEASED: [], // Terminal state (need revision for changes)
};

/**
 * Check if transition is valid
 */
export function canTransition(from: SpecState, to: SpecState): boolean {
  return SPEC_TRANSITIONS[from].includes(to);
}

/**
 * Get available next states
 */
export function getAvailableTransitions(current: SpecState): SpecState[] {
  return SPEC_TRANSITIONS[current];
}

// ============================================
// STATUS FACTORY
// ============================================

/**
 * Create initial draft status
 */
export function createDraftStatus(note?: string): SpecStatus {
  return { state: 'DRAFT', note };
}

/**
 * Create frozen status from current
 */
export function createFrozenStatus(current: SpecStatus): SpecStatus {
  return {
    state: 'FROZEN',
    frozenAtIso: new Date().toISOString(),
    note: current.note,
  };
}

/**
 * Create released status from current
 */
export function createReleasedStatus(current: SpecStatus): SpecStatus {
  return {
    state: 'RELEASED',
    frozenAtIso: current.frozenAtIso ?? new Date().toISOString(),
    releasedAtIso: new Date().toISOString(),
    note: current.note,
  };
}

/**
 * Transition to next state
 */
export function transitionSpec(
  current: SpecStatus,
  next: SpecState
): SpecStatus | null {
  if (!canTransition(current.state, next)) {
    return null;
  }

  switch (next) {
    case 'DRAFT':
      return createDraftStatus(current.note);
    case 'FROZEN':
      return createFrozenStatus(current);
    case 'RELEASED':
      return createReleasedStatus(current);
  }
}

// ============================================
// PERMISSIONS
// ============================================

/**
 * Check if geometry edits are allowed
 */
export function canEditGeometry(state: SpecState): boolean {
  return state === 'DRAFT';
}

/**
 * Check if export is allowed
 */
export function canExport(state: SpecState): boolean {
  return state === 'RELEASED';
}

/**
 * Check if freeze is allowed
 */
export function canFreeze(state: SpecState): boolean {
  return state === 'DRAFT';
}

/**
 * Check if release is allowed
 */
export function canRelease(state: SpecState): boolean {
  return state === 'FROZEN';
}

/**
 * Check if unfreeze (back to DRAFT) is allowed
 */
export function canUnfreeze(state: SpecState): boolean {
  return state === 'FROZEN';
}

// ============================================
// DISCRIMINATED UNION TYPES
// ============================================

/**
 * Draft spec status - geometry/material edits allowed
 */
export interface DraftSpecStatus {
  state: 'DRAFT';
  note?: string;
}

/**
 * Frozen spec status - manufacturing truth locked
 */
export interface FrozenSpecStatus {
  state: 'FROZEN';
  frozenAtIso: string;
  note?: string;
}

/**
 * Released spec status - factory committed, export allowed
 */
export interface ReleasedSpecStatus {
  state: 'RELEASED';
  frozenAtIso: string;
  releasedAtIso: string;
  note?: string;
}

/**
 * Discriminated union of all spec statuses
 * Use this for type-safe state handling
 */
export type DiscriminatedSpecStatus =
  | DraftSpecStatus
  | FrozenSpecStatus
  | ReleasedSpecStatus;

// ============================================
// TYPE GUARDS & ASSERTIONS
// ============================================

/**
 * Type guard: is draft?
 */
export function isDraft(status: SpecStatus): status is DraftSpecStatus {
  return status.state === 'DRAFT';
}

/**
 * Type guard: is frozen?
 */
export function isFrozen(status: SpecStatus): status is FrozenSpecStatus {
  return status.state === 'FROZEN';
}

/**
 * Type guard: is released?
 */
export function isReleased(status: SpecStatus): status is ReleasedSpecStatus {
  return status.state === 'RELEASED';
}

/**
 * Assertion: require DRAFT state for mutations
 * @throws Error if not in DRAFT state
 */
export function assertDraft(
  status: SpecStatus,
  operation: string = 'edit'
): asserts status is DraftSpecStatus {
  if (status.state !== 'DRAFT') {
    throw new SpecStateError(
      `Cannot ${operation}: requires DRAFT state (current: ${status.state})`
    );
  }
}

/**
 * Assertion: require FROZEN state
 * @throws Error if not in FROZEN state
 */
export function assertFrozen(
  status: SpecStatus,
  operation: string = 'release'
): asserts status is FrozenSpecStatus {
  if (status.state !== 'FROZEN') {
    throw new SpecStateError(
      `Cannot ${operation}: requires FROZEN state (current: ${status.state})`
    );
  }
}

/**
 * Assertion: require RELEASED state
 * @throws Error if not in RELEASED state
 */
export function assertReleased(
  status: SpecStatus,
  operation: string = 'export'
): asserts status is ReleasedSpecStatus {
  if (status.state !== 'RELEASED') {
    throw new SpecStateError(
      `Cannot ${operation}: requires RELEASED state (current: ${status.state})`
    );
  }
}

// ============================================
// ERROR CLASS
// ============================================

/**
 * Error thrown when spec state prevents an operation
 */
export class SpecStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpecStateError';
  }
}

// ============================================
// MUTATION GUARD HELPER
// ============================================

/**
 * Guard helper for use in store mutations
 * Returns true if mutation allowed, false otherwise
 * Does not throw - use in conditional checks
 */
export function canMutateGeometry(state: SpecState): boolean {
  return state === 'DRAFT';
}

/**
 * Guard helper with reason
 * Returns { ok: true } or { ok: false, reason: string }
 */
export function checkMutationAllowed(
  state: SpecState,
  operation: string
): { ok: true } | { ok: false; reason: string } {
  if (state === 'DRAFT') {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `Cannot ${operation}: spec is ${state} (mutations require DRAFT)`,
  };
}
