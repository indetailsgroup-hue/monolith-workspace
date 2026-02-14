/**
 * receiptViewerStore.ts - Receipt Viewer State Management
 *
 * Zustand store for viewing acceptance timeline and receipts:
 * - Load and display timeline
 * - View receipt details
 * - Show validation badges
 * - Display diffs between manifests
 */

import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { TrustChainService } from '../trustChain/trustChainService';
import type {
  AcceptanceTimeline,
  TimelineEntry,
  TimelineMilestone,
} from '../chainEvents/buildTimeline';
import type { AcceptanceInfo, AcceptanceStatus } from '../chainEvents/acceptanceStatus';
import type { ChainEvent, ChainEventKind } from '../chainEvents/chainEventTypes';
import type { SignedFactoryReceipt } from '../receipt/factoryReceiptTypes';
import type { ReceiptVerificationResult } from '../receipt/verifyFactoryReceipt';

// ============================================
// FILTER OPTIONS
// ============================================

/**
 * Timeline filter options
 */
export interface TimelineFilter {
  /** Show only these event kinds */
  kinds: ChainEventKind[] | 'all';

  /** Show only auditable events */
  auditableOnly: boolean;

  /** Show only events with state changes */
  stateChangesOnly: boolean;
}

/**
 * Receipt-specific filter options
 */
export interface ReceiptFilters {
  /** Filter by station ID */
  stationId?: string;

  /** Filter by verdict */
  verdict?: 'ACCEPTED' | 'REJECTED';

  /** Filter by signing key ID */
  keyId?: string;
}

// ============================================
// VIEW MODES
// ============================================

/**
 * Receipt viewer mode
 */
export type ReceiptViewerMode =
  | 'timeline'      // Show full timeline
  | 'milestones'    // Show milestones only
  | 'receipts'      // Show receipts only
  | 'receipt-detail'; // Drill-down to receipt

// ============================================
// STORE STATE
// ============================================

export interface ReceiptViewerState {
  // ---- Identity ----
  /** Job ID */
  jobId: string;

  // ---- Loading State ----
  /** Loading indicator */
  loading: boolean;

  /** Error message */
  error: string | null;

  // ---- Timeline Data ----
  /** Full timeline */
  timeline: AcceptanceTimeline | null;

  /** Acceptance status */
  acceptance: AcceptanceInfo | null;

  // ---- View State ----
  /** Current view mode */
  mode: ReceiptViewerMode;

  /** Filter options */
  filter: TimelineFilter;

  /** Receipt-specific filters */
  receiptFilter: ReceiptFilters;

  /** Selected entry index */
  selectedEntryIndex: number | null;

  /** Selected receipt (for detail view) */
  selectedReceipt: SignedFactoryReceipt | null;

  /** Receipt verification result */
  receiptVerification: ReceiptVerificationResult | null;

  // ---- Computed Views ----
  /** Filtered entries */
  filteredEntries: TimelineEntry[];

  /** Milestones */
  milestones: TimelineMilestone[];

  /** Receipt entries only */
  receiptEntries: TimelineEntry[];

  // ---- Actions ----
  /** Load timeline for job */
  loadTimeline: () => Promise<void>;

  /** Set view mode */
  setMode: (mode: ReceiptViewerMode) => void;

  /** Set filter */
  setFilter: (filter: Partial<TimelineFilter>) => void;

  /** Set receipt filter */
  setReceiptFilter: (filter: Partial<ReceiptFilters>) => void;

  /** Clear all receipt filters */
  clearReceiptFilters: () => void;

  /** Select timeline entry */
  selectEntry: (index: number | null) => void;

  /** View receipt detail */
  viewReceiptDetail: (receipt: SignedFactoryReceipt) => Promise<void>;

  /** Close receipt detail */
  closeReceiptDetail: () => void;

  /** Refresh timeline */
  refresh: () => Promise<void>;

  /** Clear error */
  clearError: () => void;

  /** Reset store */
  reset: () => void;
}

// ============================================
// STORE FACTORY
// ============================================

export interface CreateReceiptViewerStoreArgs {
  /** Job ID */
  jobId: string;

  /** Trust chain service */
  svc: TrustChainService;
}

/**
 * Create receipt viewer store
 */
export function createReceiptViewerStore(
  args: CreateReceiptViewerStoreArgs
): UseBoundStore<StoreApi<ReceiptViewerState>> {
  const { jobId, svc } = args;

  const defaultFilter: TimelineFilter = {
    kinds: 'all',
    auditableOnly: false,
    stateChangesOnly: false,
  };

  const defaultReceiptFilter: ReceiptFilters = {};

  return create<ReceiptViewerState>((set, get) => ({
    // Initial state
    jobId,
    loading: false,
    error: null,
    timeline: null,
    acceptance: null,
    mode: 'timeline',
    filter: defaultFilter,
    receiptFilter: defaultReceiptFilter,
    selectedEntryIndex: null,
    selectedReceipt: null,
    receiptVerification: null,
    filteredEntries: [],
    milestones: [],
    receiptEntries: [],

    // Actions
    loadTimeline: async () => {
      set({ loading: true, error: null });

      try {
        const result = await svc.getTimeline(jobId);

        if (!result.ok) {
          set({
            loading: false,
            error: result.reason,
            timeline: null,
            acceptance: null,
          });
          return;
        }

        const timeline = result.timeline;
        const filter = get().filter;
        const receiptFilter = get().receiptFilter;

        set({
          loading: false,
          timeline,
          acceptance: timeline.acceptance,
          filteredEntries: applyFilter(timeline.entries, filter, receiptFilter),
          milestones: timeline.milestones,
          receiptEntries: timeline.entries.filter(
            (e) => e.event.kind === 'FACTORY_RECEIPT'
          ),
        });
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to load timeline',
        });
      }
    },

    setMode: (mode) => {
      set({ mode });
    },

    setFilter: (partial) => {
      const filter = { ...get().filter, ...partial };
      const timeline = get().timeline;
      const receiptFilter = get().receiptFilter;

      set({
        filter,
        filteredEntries: timeline ? applyFilter(timeline.entries, filter, receiptFilter) : [],
      });
    },

    setReceiptFilter: (partial) => {
      const receiptFilter = { ...get().receiptFilter, ...partial };
      const timeline = get().timeline;
      const filter = get().filter;

      set({
        receiptFilter,
        filteredEntries: timeline ? applyFilter(timeline.entries, filter, receiptFilter) : [],
      });
    },

    clearReceiptFilters: () => {
      const timeline = get().timeline;
      const filter = get().filter;

      set({
        receiptFilter: {},
        filteredEntries: timeline ? applyFilter(timeline.entries, filter, {}) : [],
      });
    },

    selectEntry: (index) => {
      set({ selectedEntryIndex: index });
    },

    viewReceiptDetail: async (receipt) => {
      set({
        mode: 'receipt-detail',
        selectedReceipt: receipt,
        receiptVerification: null,
      });

      // Verify receipt
      try {
        const verification = await svc.verifyReceipt(receipt);
        set({ receiptVerification: verification });
      } catch (e) {
        set({
          receiptVerification: {
            ok: false,
            reason: e instanceof Error ? e.message : 'Verification failed',
          },
        });
      }
    },

    closeReceiptDetail: () => {
      set({
        mode: 'timeline',
        selectedReceipt: null,
        receiptVerification: null,
      });
    },

    refresh: async () => {
      await get().loadTimeline();
    },

    clearError: () => {
      set({ error: null });
    },

    reset: () => {
      set({
        loading: false,
        error: null,
        timeline: null,
        acceptance: null,
        mode: 'timeline',
        filter: defaultFilter,
        receiptFilter: defaultReceiptFilter,
        selectedEntryIndex: null,
        selectedReceipt: null,
        receiptVerification: null,
        filteredEntries: [],
        milestones: [],
        receiptEntries: [],
      });
    },
  }));
}

// ============================================
// FILTER HELPERS
// ============================================

/**
 * Apply filter to timeline entries
 */
function applyFilter(
  entries: TimelineEntry[],
  filter: TimelineFilter,
  receiptFilter: ReceiptFilters
): TimelineEntry[] {
  let result = entries;

  // Filter by kind
  if (filter.kinds !== 'all') {
    const kindSet = new Set(filter.kinds);
    result = result.filter((e) => kindSet.has(e.event.kind));
  }

  // Filter auditable only
  if (filter.auditableOnly) {
    result = result.filter((e) => isAuditable(e.event.kind));
  }

  // Filter state changes only
  if (filter.stateChangesOnly) {
    result = result.filter((e) => e.diff?.specStateChanged);
  }

  // Apply receipt-specific filters (only to FACTORY_RECEIPT events)
  if (receiptFilter.stationId || receiptFilter.verdict || receiptFilter.keyId) {
    result = result.filter((e) => {
      // Non-receipt events pass through
      if (e.event.kind !== 'FACTORY_RECEIPT') {
        return true;
      }

      const receipt = e.event.receipt;
      if (!receipt) return false;

      // Filter by stationId
      if (receiptFilter.stationId) {
        if (receipt.receipt.stationId !== receiptFilter.stationId) {
          return false;
        }
      }

      // Filter by verdict
      if (receiptFilter.verdict) {
        if (receipt.receipt.verdict !== receiptFilter.verdict) {
          return false;
        }
      }

      // Filter by keyId
      if (receiptFilter.keyId) {
        if (receipt.keyId !== receiptFilter.keyId) {
          return false;
        }
      }

      return true;
    });
  }

  return result;
}

/**
 * Check if event kind is auditable
 */
function isAuditable(kind: ChainEventKind): boolean {
  return kind === 'RELEASE' || kind === 'FACTORY_RECEIPT' || kind === 'FREEZE';
}

// ============================================
// SELECTORS
// ============================================

/**
 * Get HEAD event from store
 */
export function selectHeadEvent(state: ReceiptViewerState): ChainEvent | null {
  const timeline = state.timeline;
  if (!timeline || timeline.entries.length === 0) return null;
  const headEntry = timeline.entries[timeline.entries.length - 1];
  return headEntry.event;
}

/**
 * Get genesis event from store
 */
export function selectGenesisEvent(state: ReceiptViewerState): ChainEvent | null {
  const timeline = state.timeline;
  if (!timeline || timeline.entries.length === 0) return null;
  return timeline.entries[0].event;
}

/**
 * Get selected entry from store
 */
export function selectSelectedEntry(state: ReceiptViewerState): TimelineEntry | null {
  if (state.selectedEntryIndex === null) return null;
  return state.filteredEntries[state.selectedEntryIndex] ?? null;
}

/**
 * Check if job is accepted
 */
export function selectIsAccepted(state: ReceiptViewerState): boolean {
  return state.acceptance?.status === 'ACCEPTED';
}

/**
 * Check if job is rejected
 */
export function selectIsRejected(state: ReceiptViewerState): boolean {
  return state.acceptance?.status === 'REJECTED';
}

/**
 * Check if job is ready for factory
 */
export function selectIsReadyForFactory(state: ReceiptViewerState): boolean {
  return state.acceptance?.status === 'READY_FOR_FACTORY';
}

/**
 * Get unique station IDs from receipt events
 */
export function selectUniqueStationIds(state: ReceiptViewerState): string[] {
  if (!state.timeline) return [];

  const stationIds = new Set<string>();
  for (const entry of state.timeline.entries) {
    if (entry.event.kind === 'FACTORY_RECEIPT' && entry.event.receipt) {
      const stationId = entry.event.receipt.receipt.stationId;
      if (stationId) {
        stationIds.add(stationId);
      }
    }
  }
  return Array.from(stationIds).sort();
}

/**
 * Get unique verdicts from receipt events
 */
export function selectUniqueVerdicts(state: ReceiptViewerState): ('ACCEPTED' | 'REJECTED')[] {
  if (!state.timeline) return [];

  const verdicts = new Set<'ACCEPTED' | 'REJECTED'>();
  for (const entry of state.timeline.entries) {
    if (entry.event.kind === 'FACTORY_RECEIPT' && entry.event.receipt) {
      const verdict = entry.event.receipt.receipt.verdict;
      if (verdict === 'ACCEPTED' || verdict === 'REJECTED') {
        verdicts.add(verdict);
      }
    }
  }
  return Array.from(verdicts);
}

/**
 * Get unique key IDs from receipt events
 */
export function selectUniqueKeyIds(state: ReceiptViewerState): string[] {
  if (!state.timeline) return [];

  const keyIds = new Set<string>();
  for (const entry of state.timeline.entries) {
    if (entry.event.kind === 'FACTORY_RECEIPT' && entry.event.receipt) {
      const keyId = entry.event.receipt.keyId;
      if (keyId) {
        keyIds.add(keyId);
      }
    }
  }
  return Array.from(keyIds).sort();
}

/**
 * Check if any receipt filters are active
 */
export function selectHasActiveReceiptFilters(state: ReceiptViewerState): boolean {
  const { receiptFilter } = state;
  return !!(receiptFilter.stationId || receiptFilter.verdict || receiptFilter.keyId);
}
