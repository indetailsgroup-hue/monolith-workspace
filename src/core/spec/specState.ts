/**
 * specState.ts - Spec State Machine
 *
 * Manages the DRAFT → FROZEN → RELEASED lifecycle of a spec document.
 * State transitions are recorded in the trust chain.
 *
 * @version 1.0.0
 */

/**
 * Spec document status
 */
export interface SpecStatus {
  /** Current state */
  state: 'DRAFT' | 'FROZEN' | 'RELEASED';
  /** Optional note for this state */
  note?: string;
  /** ISO timestamp when frozen */
  frozenAtIso?: string;
  /** ISO timestamp when released */
  releasedAtIso?: string;
}

/**
 * Create a new DRAFT status
 */
export function createDraftStatus(note?: string): SpecStatus {
  return {
    state: 'DRAFT',
    note,
  };
}

/**
 * Transition to FROZEN status
 *
 * FROZEN = snapshot taken, no further edits allowed until unfreeze
 */
export function createFrozenStatus(current: SpecStatus): SpecStatus {
  return {
    ...current,
    state: 'FROZEN',
    frozenAtIso: new Date().toISOString(),
  };
}

/**
 * Transition to RELEASED status
 *
 * RELEASED = spec approved for factory export
 */
export function createReleasedStatus(current: SpecStatus): SpecStatus {
  return {
    ...current,
    state: 'RELEASED',
    releasedAtIso: new Date().toISOString(),
  };
}
