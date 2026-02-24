/**
 * MONOLITH SpecState Store
 *
 * Zustand store with discriminated union state machine
 * Enforces DRAFT → FROZEN → RELEASED workflow
 */

import { create } from 'zustand';
import type { StoreApi } from 'zustand';
import type {
  SpecDoc,
  DraftDoc,
  FrozenDoc,
  ReleasedDoc,
  GateReport,
} from './types';
import type { SpecServices } from './services';
import type { PartBreakdownRow, DrillOp, FittingIntent } from '../gate';

// ============================================
// UI STATE TYPES
// ============================================

type UiModalState = {
  freezeOpen: boolean;
  releaseOpen: boolean;
};

type GateUiState = {
  selectedPolicyVersion: string;
  selectedMachineProfileId?: string;
  isRunning: boolean;
  lastError?: string;
};

type AsyncState = {
  busy: boolean;
  error?: string;
};

/**
 * Manufacturing draft state (holds breakdown rows before Freeze)
 * This is MUTABLE in DRAFT state, captured immutably at Freeze time
 */
type DraftManufacturing = {
  breakdownRows: PartBreakdownRow[];
  drillOps: DrillOp[];
  fittings: FittingIntent[];
  cabinet: { backPanelThicknessMm: number };
};

// ============================================
// STORE STATE TYPE
// ============================================

export type SpecStoreState = {
  /** Current document state (discriminated union) */
  doc: SpecDoc;

  /** Modal visibility state */
  modals: UiModalState;

  /** Gate UI state */
  gateUi: GateUiState;

  /** Async operation state */
  async: AsyncState;

  /** Manufacturing draft state (mutable until Freeze) */
  draftManufacturing: DraftManufacturing;

  // ========== MODAL ACTIONS ==========

  /** Open freeze confirmation modal */
  openFreeze(): void;

  /** Close freeze modal */
  closeFreeze(): void;

  /** Open release wizard modal */
  openRelease(): void;

  /** Close release modal */
  closeRelease(): void;

  // ========== GATE CONFIG ACTIONS ==========

  /** Set gate policy version */
  setGatePolicyVersion(v: string): void;

  /** Set machine profile for gate */
  setMachineProfile(id?: string): void;

  // ========== DRAFT MANUFACTURING ACTIONS ==========

  /** Replace all breakdown rows */
  setBreakdownRows(rows: PartBreakdownRow[]): void;

  /** Insert or update a single row by partId */
  upsertBreakdownRow(row: PartBreakdownRow): void;

  /** Remove a breakdown row by partId */
  removeBreakdownRow(partId: string): void;

  /** Set drill operations */
  setDrillOps(ops: DrillOp[]): void;

  /** Set fittings */
  setFittings(fittings: FittingIntent[]): void;

  /** Set cabinet context */
  setCabinetContext(cabinet: { backPanelThicknessMm: number }): void;

  // ========== STATE TRANSITION ACTIONS ==========

  /** Freeze draft to snapshot (DRAFT → FROZEN) */
  freeze(note?: string): Promise<void>;

  /** Run gate validation (FROZEN only) */
  runGate(): Promise<void>;

  /** Release package (FROZEN → RELEASED) */
  release(typedConfirm: string): Promise<void>;

  /** Create revision to edit (FROZEN/RELEASED → DRAFT fork) */
  createRevisionToEdit(): Promise<void>;

  // ========== STATE GUARDS ==========

  /** Assert and return DraftDoc, throws if not DRAFT */
  requireDraft(): DraftDoc;

  /** Assert and return FrozenDoc, throws if not FROZEN */
  requireFrozen(): FrozenDoc;

  /** Assert and return ReleasedDoc, throws if not RELEASED */
  requireReleased(): ReleasedDoc;
};

// ============================================
// STORE FACTORY
// ============================================

/**
 * Create a SpecStore instance with services and initial document
 */
export function createSpecStore(
  services: SpecServices,
  initialDoc: SpecDoc
): StoreApi<SpecStoreState> {
  return create<SpecStoreState>((set, get) => ({
    // ========== INITIAL STATE ==========

    doc: initialDoc,

    modals: {
      freezeOpen: false,
      releaseOpen: false,
    },

    gateUi: {
      selectedPolicyVersion: 'policy-1.0.0',
      selectedMachineProfileId: undefined,
      isRunning: false,
      lastError: undefined,
    },

    async: {
      busy: false,
      error: undefined,
    },

    draftManufacturing: {
      breakdownRows: [],
      drillOps: [],
      fittings: [],
      cabinet: { backPanelThicknessMm: 9 },
    },

    // ========== MODAL ACTIONS ==========

    openFreeze() {
      set((s) => ({ modals: { ...s.modals, freezeOpen: true } }));
    },

    closeFreeze() {
      set((s) => ({ modals: { ...s.modals, freezeOpen: false } }));
    },

    openRelease() {
      set((s) => ({ modals: { ...s.modals, releaseOpen: true } }));
    },

    closeRelease() {
      set((s) => ({ modals: { ...s.modals, releaseOpen: false } }));
    },

    // ========== GATE CONFIG ACTIONS ==========

    setGatePolicyVersion(v) {
      set((s) => ({ gateUi: { ...s.gateUi, selectedPolicyVersion: v } }));
    },

    setMachineProfile(id) {
      set((s) => ({ gateUi: { ...s.gateUi, selectedMachineProfileId: id } }));
    },

    // ========== DRAFT MANUFACTURING ACTIONS ==========

    setBreakdownRows(rows) {
      set((s) => ({
        draftManufacturing: { ...s.draftManufacturing, breakdownRows: rows },
      }));
    },

    upsertBreakdownRow(row) {
      set((s) => {
        const existing = s.draftManufacturing.breakdownRows;
        const idx = existing.findIndex((r) => r.partId === row.partId);
        const updated =
          idx >= 0
            ? [...existing.slice(0, idx), row, ...existing.slice(idx + 1)]
            : [...existing, row];
        return {
          draftManufacturing: { ...s.draftManufacturing, breakdownRows: updated },
        };
      });
    },

    removeBreakdownRow(partId) {
      set((s) => ({
        draftManufacturing: {
          ...s.draftManufacturing,
          breakdownRows: s.draftManufacturing.breakdownRows.filter(
            (r) => r.partId !== partId
          ),
        },
      }));
    },

    setDrillOps(ops) {
      set((s) => ({
        draftManufacturing: { ...s.draftManufacturing, drillOps: ops },
      }));
    },

    setFittings(fittings) {
      set((s) => ({
        draftManufacturing: { ...s.draftManufacturing, fittings },
      }));
    },

    setCabinetContext(cabinet) {
      set((s) => ({
        draftManufacturing: { ...s.draftManufacturing, cabinet },
      }));
    },

    // ========== STATE GUARDS ==========

    requireDraft(): DraftDoc {
      const doc = get().doc;
      if (doc.state !== 'DRAFT') {
        throw new Error('This action requires DRAFT state.');
      }
      return doc;
    },

    requireFrozen(): FrozenDoc {
      const doc = get().doc;
      if (doc.state !== 'FROZEN') {
        throw new Error('This action requires FROZEN state.');
      }
      return doc;
    },

    requireReleased(): ReleasedDoc {
      const doc = get().doc;
      if (doc.state !== 'RELEASED') {
        throw new Error('This action requires RELEASED state.');
      }
      return doc;
    },

    // ========== STATE TRANSITION ACTIONS ==========

    async freeze(note) {
      const draft = get().requireDraft();
      const { draftManufacturing } = get();
      set({ async: { busy: true, error: undefined } });

      try {
        // Capture immutable manufacturing payload from DRAFT state
        const payload = {
          breakdownRows: draftManufacturing.breakdownRows,
          drillOps: draftManufacturing.drillOps,
          fittings: draftManufacturing.fittings,
          cabinet: draftManufacturing.cabinet,
        };

        const snapshot = await services.freezeToSnapshot({
          projectId: draft.projectId,
          revisionId: draft.revisionId,
          note,
          payload,
        });

        set({
          doc: {
            state: 'FROZEN',
            projectId: draft.projectId,
            snapshot,
          } as FrozenDoc,
          modals: { ...get().modals, freezeOpen: false },
          async: { busy: false, error: undefined },
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Freeze failed';
        set({ async: { busy: false, error: message } });
      }
    },

    async runGate() {
      const frozen = get().requireFrozen();
      const { selectedPolicyVersion, selectedMachineProfileId } = get().gateUi;

      set((s) => ({
        gateUi: { ...s.gateUi, isRunning: true, lastError: undefined },
      }));

      try {
        const report: GateReport = await services.runGate({
          snapshotId: frozen.snapshot.snapshotId,
          policyVersion: selectedPolicyVersion,
          machineProfileId: selectedMachineProfileId,
        });

        set((s) => ({
          doc: { ...frozen, lastGate: report } as FrozenDoc,
          gateUi: { ...s.gateUi, isRunning: false },
        }));
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Gate failed';
        set((s) => ({
          gateUi: { ...s.gateUi, isRunning: false, lastError: message },
        }));
      }
    },

    async release(typedConfirm) {
      const frozen = get().requireFrozen();
      const report = frozen.lastGate;

      if (!report) {
        set({ async: { busy: false, error: 'Run Gate first.' } });
        return;
      }

      if (report.blockers.length > 0) {
        set({ async: { busy: false, error: 'Cannot release: blockers exist.' } });
        return;
      }

      set({ async: { busy: true, error: undefined } });

      try {
        const releasePackage = await services.releasePackage({
          snapshotId: frozen.snapshot.snapshotId,
          gateReportId: report.gateReportId,
          typedConfirm,
        });

        set({
          doc: {
            state: 'RELEASED',
            projectId: frozen.projectId,
            snapshot: frozen.snapshot,
            gate: report,
            release: releasePackage,
          } as ReleasedDoc,
          modals: { ...get().modals, releaseOpen: false },
          async: { busy: false, error: undefined },
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Release failed';
        set({ async: { busy: false, error: message } });
      }
    },

    async createRevisionToEdit() {
      const doc = get().doc;
      set({ async: { busy: true, error: undefined } });

      try {
        // Already in DRAFT - nothing to do
        if (doc.state === 'DRAFT') {
          set({ async: { busy: false, error: undefined } });
          return;
        }

        const newDraft = await services.createRevisionFromSnapshot({
          projectId: doc.projectId,
          snapshotId: doc.snapshot.snapshotId,
        });

        set({
          doc: newDraft,
          async: { busy: false, error: undefined },
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Create revision failed';
        set({ async: { busy: false, error: message } });
      }
    },
  }));
}

// ============================================
// SELECTOR HELPERS
// ============================================

/** Check if current state allows editing */
export function canEdit(doc: SpecDoc): boolean {
  return doc.state === 'DRAFT';
}

/** Check if gate can be run */
export function canRunGate(doc: SpecDoc): boolean {
  return doc.state === 'FROZEN';
}

/** Check if release is possible */
export function canRelease(doc: SpecDoc): boolean {
  if (doc.state !== 'FROZEN') return false;
  if (!doc.lastGate) return false;
  return doc.lastGate.blockers.length === 0;
}

/** Check if export is allowed */
export function canExport(doc: SpecDoc): boolean {
  return doc.state === 'RELEASED';
}
