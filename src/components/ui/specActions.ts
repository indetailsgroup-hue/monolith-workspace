/**
 * specActions.ts - UI Spec Action Utilities
 *
 * Helper functions for spec state transitions in UI.
 */

import type { SpecStatus, SpecState } from '../../core/spec/specState';

/**
 * Create next spec status from current + target state
 */
export function nextSpecStatus(current: SpecStatus, next: SpecState): SpecStatus {
  const now = new Date().toISOString();

  switch (next) {
    case 'DRAFT':
      return { state: 'DRAFT', note: current.note };

    case 'FROZEN':
      return {
        state: 'FROZEN',
        frozenAtIso: now,
        note: current.note,
      };

    case 'RELEASED':
      return {
        state: 'RELEASED',
        frozenAtIso: current.frozenAtIso ?? now,
        releasedAtIso: now,
        note: current.note,
      };
  }
}

/**
 * Get button label for spec state
 */
export function getStateButtonLabel(state: SpecState): string {
  switch (state) {
    case 'DRAFT':
      return 'Draft';
    case 'FROZEN':
      return 'Frozen';
    case 'RELEASED':
      return 'Released';
  }
}

/**
 * Get next action label based on current state
 */
export function getNextActionLabel(current: SpecState): string | null {
  switch (current) {
    case 'DRAFT':
      return 'Freeze';
    case 'FROZEN':
      return 'Release';
    case 'RELEASED':
      return null; // Terminal state
  }
}

/**
 * Get color for spec state badge
 */
export function getStateColor(state: SpecState): string {
  switch (state) {
    case 'DRAFT':
      return 'bg-blue-600/30 text-blue-300 border-blue-500/50';
    case 'FROZEN':
      return 'bg-amber-600/30 text-amber-300 border-amber-500/50';
    case 'RELEASED':
      return 'bg-green-600/30 text-green-300 border-green-500/50';
  }
}

/**
 * Get icon for spec state
 */
export function getStateIcon(state: SpecState): string {
  switch (state) {
    case 'DRAFT':
      return '✏️';
    case 'FROZEN':
      return '❄️';
    case 'RELEASED':
      return '✅';
  }
}
