/**
 * Release Store - State Management for Release Workflow
 *
 * Manages:
 * - Approval signatures (pending + collected)
 * - Last created release bundle
 * - Release history
 *
 * v1.0: Initial release store
 */

import { create } from 'zustand';
import type { ApprovalSignature, ReleaseBundle, ApprovalRequirement, DEFAULT_APPROVAL_REQUIREMENT } from './types';

interface ReleaseStoreState {
  /** Collected approval signatures */
  approvals: ApprovalSignature[];
  /** Last created release bundle */
  lastBundle: ReleaseBundle | null;
  /** Approval requirements (policy-driven in future) */
  requirement: ApprovalRequirement;
  /** Is approval modal open */
  approvalModalOpen: boolean;
}

interface ReleaseStoreActions {
  /** Add an approval signature */
  addApproval: (approval: ApprovalSignature) => void;
  /** Remove an approval by index */
  removeApproval: (index: number) => void;
  /** Clear all approvals */
  clearApprovals: () => void;
  /** Set the last bundle */
  setBundle: (bundle: ReleaseBundle | null) => void;
  /** Set approval requirements */
  setRequirement: (req: ApprovalRequirement) => void;
  /** Open/close approval modal */
  setApprovalModalOpen: (open: boolean) => void;
  /** Check if requirements are met */
  canRelease: () => boolean;
  /** Reset store state */
  reset: () => void;
}

type ReleaseStore = ReleaseStoreState & ReleaseStoreActions;

export const useReleaseStore = create<ReleaseStore>((set, get) => ({
  // State
  approvals: [],
  lastBundle: null,
  requirement: { minApprovals: 1 },
  approvalModalOpen: false,

  // Actions
  addApproval: (approval) =>
    set((state) => ({
      approvals: [...state.approvals, approval],
    })),

  removeApproval: (index) =>
    set((state) => ({
      approvals: state.approvals.filter((_, i) => i !== index),
    })),

  clearApprovals: () => set({ approvals: [] }),

  setBundle: (bundle) => set({ lastBundle: bundle }),

  setRequirement: (requirement) => set({ requirement }),

  setApprovalModalOpen: (open) => set({ approvalModalOpen: open }),

  canRelease: () => {
    const { approvals, requirement } = get();

    // Check minimum approvals
    if (approvals.length < requirement.minApprovals) {
      return false;
    }

    // Check required roles (if specified)
    if (requirement.requiredRoles && requirement.requiredRoles.length > 0) {
      const hasRequiredRole = requirement.requiredRoles.some((role) =>
        approvals.some((a) => a.role === role)
      );
      if (!hasRequiredRole) return false;
    }

    // Check required approvers (if specified)
    if (requirement.requiredApprovers && requirement.requiredApprovers.length > 0) {
      const hasAllRequired = requirement.requiredApprovers.every((id) =>
        approvals.some((a) => a.approverId === id)
      );
      if (!hasAllRequired) return false;
    }

    return true;
  },

  reset: () =>
    set({
      approvals: [],
      lastBundle: null,
      approvalModalOpen: false,
    }),
}));

// Selector hooks
export const useApprovals = () => useReleaseStore((s) => s.approvals);
export const useLastBundle = () => useReleaseStore((s) => s.lastBundle);
export const useApprovalModalOpen = () => useReleaseStore((s) => s.approvalModalOpen);
export const useCanRelease = () => useReleaseStore((s) => s.canRelease());
