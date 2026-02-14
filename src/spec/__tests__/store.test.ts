/**
 * store.test.ts - Tests for Spec Store
 *
 * Tests the Zustand store state machine:
 * - Store creation and initial state
 * - Modal actions
 * - Gate config actions
 * - Draft manufacturing actions
 * - State guards (requireDraft, requireFrozen, requireReleased)
 * - State transitions (freeze, runGate, release)
 * - Selector helpers (canEdit, canRunGate, canRelease, canExport)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createSpecStore,
  canEdit,
  canRunGate,
  canRelease,
  canExport,
  type SpecStoreState,
} from '../store';
import type { SpecDoc, DraftDoc, FrozenDoc, ReleasedDoc, GateReport, FrozenSnapshot } from '../types';
import type { SpecServices } from '../services';

describe('Spec Store', () => {
  // Mock services
  function createMockServices(overrides?: Partial<SpecServices>): SpecServices {
    return {
      freezeToSnapshot: vi.fn().mockResolvedValue({
        snapshotId: 'snap_001',
        sourceRevisionId: 'rev_001',
        createdAt: new Date().toISOString(),
        createdBy: 'test-user',
        summary: { partsCount: 5, fittingsCount: 10, materialsCount: 3, warnings: [] },
      } as FrozenSnapshot),
      runGate: vi.fn().mockResolvedValue({
        gateReportId: 'gate_001',
        snapshotId: 'snap_001',
        runAt: new Date().toISOString(),
        runBy: 'test-user',
        policyVersion: 'policy-1.0.0',
        blockers: [],
        warnings: [],
        info: [],
      } as GateReport),
      releasePackage: vi.fn().mockResolvedValue({
        releaseId: 'rel_001',
        snapshotId: 'snap_001',
        gateReportId: 'gate_001',
        releasedAt: new Date().toISOString(),
        releasedBy: 'test-user',
        manifest: {
          manifestId: 'man_001',
          snapshotId: 'snap_001',
          gateReportId: 'gate_001',
          createdAt: new Date().toISOString(),
          files: [],
        },
        signatures: [],
      }),
      createRevisionFromSnapshot: vi.fn().mockResolvedValue({
        state: 'DRAFT',
        projectId: 'proj_001',
        revisionId: 'rev_002',
        spec: { version: 2, name: 'Test', updatedAt: new Date().toISOString() },
        summary: { partsCount: 5, fittingsCount: 10, materialsCount: 3, warnings: [] },
      } as DraftDoc),
      ...overrides,
    };
  }

  // Create initial draft document
  function createDraftDoc(): DraftDoc {
    return {
      state: 'DRAFT',
      projectId: 'proj_001',
      revisionId: 'rev_001',
      spec: { version: 1, name: 'Test Project', updatedAt: new Date().toISOString() },
      summary: { partsCount: 5, fittingsCount: 10, materialsCount: 3, warnings: [] },
    };
  }

  // Create frozen document
  function createFrozenDoc(lastGate?: GateReport): FrozenDoc {
    return {
      state: 'FROZEN',
      projectId: 'proj_001',
      snapshot: {
        snapshotId: 'snap_001',
        sourceRevisionId: 'rev_001',
        createdAt: new Date().toISOString(),
        createdBy: 'test-user',
        summary: { partsCount: 5, fittingsCount: 10, materialsCount: 3, warnings: [] },
      },
      lastGate,
    };
  }

  // Create released document
  function createReleasedDoc(): ReleasedDoc {
    const gate: GateReport = {
      gateReportId: 'gate_001',
      snapshotId: 'snap_001',
      runAt: new Date().toISOString(),
      runBy: 'test-user',
      policyVersion: 'policy-1.0.0',
      blockers: [],
      warnings: [],
      info: [],
    };

    return {
      state: 'RELEASED',
      projectId: 'proj_001',
      snapshot: {
        snapshotId: 'snap_001',
        sourceRevisionId: 'rev_001',
        createdAt: new Date().toISOString(),
        createdBy: 'test-user',
        summary: { partsCount: 5, fittingsCount: 10, materialsCount: 3, warnings: [] },
      },
      gate,
      release: {
        releaseId: 'rel_001',
        snapshotId: 'snap_001',
        gateReportId: 'gate_001',
        releasedAt: new Date().toISOString(),
        releasedBy: 'test-user',
        manifest: {
          manifestId: 'man_001',
          snapshotId: 'snap_001',
          gateReportId: 'gate_001',
          createdAt: new Date().toISOString(),
          files: [],
        },
        signatures: [],
      },
    };
  }

  describe('store creation', () => {
    it('should create store with initial document', () => {
      const services = createMockServices();
      const initialDoc = createDraftDoc();
      const store = createSpecStore(services, initialDoc);

      const state = store.getState();
      expect(state.doc).toBe(initialDoc);
      expect(state.doc.state).toBe('DRAFT');
    });

    it('should initialize with default UI state', () => {
      const services = createMockServices();
      const initialDoc = createDraftDoc();
      const store = createSpecStore(services, initialDoc);

      const state = store.getState();
      expect(state.modals.freezeOpen).toBe(false);
      expect(state.modals.releaseOpen).toBe(false);
      expect(state.gateUi.isRunning).toBe(false);
      expect(state.async.busy).toBe(false);
    });

    it('should initialize with default draft manufacturing state', () => {
      const services = createMockServices();
      const initialDoc = createDraftDoc();
      const store = createSpecStore(services, initialDoc);

      const state = store.getState();
      expect(state.draftManufacturing.breakdownRows).toEqual([]);
      expect(state.draftManufacturing.drillOps).toEqual([]);
      expect(state.draftManufacturing.fittings).toEqual([]);
    });
  });

  describe('modal actions', () => {
    it('should open freeze modal', () => {
      const services = createMockServices();
      const store = createSpecStore(services, createDraftDoc());

      store.getState().openFreeze();
      expect(store.getState().modals.freezeOpen).toBe(true);
    });

    it('should close freeze modal', () => {
      const services = createMockServices();
      const store = createSpecStore(services, createDraftDoc());

      store.getState().openFreeze();
      store.getState().closeFreeze();
      expect(store.getState().modals.freezeOpen).toBe(false);
    });

    it('should open release modal', () => {
      const services = createMockServices();
      const store = createSpecStore(services, createDraftDoc());

      store.getState().openRelease();
      expect(store.getState().modals.releaseOpen).toBe(true);
    });

    it('should close release modal', () => {
      const services = createMockServices();
      const store = createSpecStore(services, createDraftDoc());

      store.getState().openRelease();
      store.getState().closeRelease();
      expect(store.getState().modals.releaseOpen).toBe(false);
    });
  });

  describe('gate config actions', () => {
    it('should set gate policy version', () => {
      const services = createMockServices();
      const store = createSpecStore(services, createDraftDoc());

      store.getState().setGatePolicyVersion('policy-2.0.0');
      expect(store.getState().gateUi.selectedPolicyVersion).toBe('policy-2.0.0');
    });

    it('should set machine profile', () => {
      const services = createMockServices();
      const store = createSpecStore(services, createDraftDoc());

      store.getState().setMachineProfile('machine-001');
      expect(store.getState().gateUi.selectedMachineProfileId).toBe('machine-001');
    });

    it('should clear machine profile with undefined', () => {
      const services = createMockServices();
      const store = createSpecStore(services, createDraftDoc());

      store.getState().setMachineProfile('machine-001');
      store.getState().setMachineProfile(undefined);
      expect(store.getState().gateUi.selectedMachineProfileId).toBeUndefined();
    });
  });

  describe('draft manufacturing actions', () => {
    it('should set breakdown rows', () => {
      const services = createMockServices();
      const store = createSpecStore(services, createDraftDoc());

      const rows = [
        { partId: 'part_001', name: 'Test Part', finishW: 100, finishH: 200 } as any,
      ];
      store.getState().setBreakdownRows(rows);
      expect(store.getState().draftManufacturing.breakdownRows).toEqual(rows);
    });

    it('should upsert breakdown row (insert)', () => {
      const services = createMockServices();
      const store = createSpecStore(services, createDraftDoc());

      const row = { partId: 'part_001', name: 'Test Part', finishW: 100, finishH: 200 } as any;
      store.getState().upsertBreakdownRow(row);
      expect(store.getState().draftManufacturing.breakdownRows).toHaveLength(1);
      expect(store.getState().draftManufacturing.breakdownRows[0].partId).toBe('part_001');
    });

    it('should upsert breakdown row (update)', () => {
      const services = createMockServices();
      const store = createSpecStore(services, createDraftDoc());

      const row1 = { partId: 'part_001', name: 'Test Part', finishW: 100, finishH: 200 } as any;
      const row2 = { partId: 'part_001', name: 'Updated Part', finishW: 150, finishH: 250 } as any;

      store.getState().upsertBreakdownRow(row1);
      store.getState().upsertBreakdownRow(row2);

      expect(store.getState().draftManufacturing.breakdownRows).toHaveLength(1);
      expect(store.getState().draftManufacturing.breakdownRows[0].name).toBe('Updated Part');
    });

    it('should remove breakdown row', () => {
      const services = createMockServices();
      const store = createSpecStore(services, createDraftDoc());

      const rows = [
        { partId: 'part_001', name: 'Part 1' } as any,
        { partId: 'part_002', name: 'Part 2' } as any,
      ];
      store.getState().setBreakdownRows(rows);
      store.getState().removeBreakdownRow('part_001');

      expect(store.getState().draftManufacturing.breakdownRows).toHaveLength(1);
      expect(store.getState().draftManufacturing.breakdownRows[0].partId).toBe('part_002');
    });

    it('should set drill operations', () => {
      const services = createMockServices();
      const store = createSpecStore(services, createDraftDoc());

      const ops = [{ id: 'drill_001' }] as any;
      store.getState().setDrillOps(ops);
      expect(store.getState().draftManufacturing.drillOps).toEqual(ops);
    });

    it('should set fittings', () => {
      const services = createMockServices();
      const store = createSpecStore(services, createDraftDoc());

      const fittings = [{ id: 'fitting_001' }] as any;
      store.getState().setFittings(fittings);
      expect(store.getState().draftManufacturing.fittings).toEqual(fittings);
    });

    it('should set cabinet context', () => {
      const services = createMockServices();
      const store = createSpecStore(services, createDraftDoc());

      store.getState().setCabinetContext({ backPanelThicknessMm: 12 });
      expect(store.getState().draftManufacturing.cabinet.backPanelThicknessMm).toBe(12);
    });
  });

  describe('state guards', () => {
    it('requireDraft should return draft doc when in DRAFT state', () => {
      const services = createMockServices();
      const draftDoc = createDraftDoc();
      const store = createSpecStore(services, draftDoc);

      const result = store.getState().requireDraft();
      expect(result).toBe(draftDoc);
    });

    it('requireDraft should throw when not in DRAFT state', () => {
      const services = createMockServices();
      const frozenDoc = createFrozenDoc();
      const store = createSpecStore(services, frozenDoc);

      expect(() => store.getState().requireDraft()).toThrow('DRAFT');
    });

    it('requireFrozen should return frozen doc when in FROZEN state', () => {
      const services = createMockServices();
      const frozenDoc = createFrozenDoc();
      const store = createSpecStore(services, frozenDoc);

      const result = store.getState().requireFrozen();
      expect(result).toBe(frozenDoc);
    });

    it('requireFrozen should throw when not in FROZEN state', () => {
      const services = createMockServices();
      const draftDoc = createDraftDoc();
      const store = createSpecStore(services, draftDoc);

      expect(() => store.getState().requireFrozen()).toThrow('FROZEN');
    });

    it('requireReleased should return released doc when in RELEASED state', () => {
      const services = createMockServices();
      const releasedDoc = createReleasedDoc();
      const store = createSpecStore(services, releasedDoc);

      const result = store.getState().requireReleased();
      expect(result).toBe(releasedDoc);
    });

    it('requireReleased should throw when not in RELEASED state', () => {
      const services = createMockServices();
      const frozenDoc = createFrozenDoc();
      const store = createSpecStore(services, frozenDoc);

      expect(() => store.getState().requireReleased()).toThrow('RELEASED');
    });
  });

  describe('freeze action', () => {
    it('should transition from DRAFT to FROZEN', async () => {
      const services = createMockServices();
      const store = createSpecStore(services, createDraftDoc());

      await store.getState().freeze('Test freeze');

      expect(store.getState().doc.state).toBe('FROZEN');
      expect(services.freezeToSnapshot).toHaveBeenCalled();
    });

    it('should set busy state during freeze', async () => {
      const services = createMockServices({
        freezeToSnapshot: vi.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 50));
          return {
            snapshotId: 'snap_001',
            sourceRevisionId: 'rev_001',
            createdAt: new Date().toISOString(),
            createdBy: 'test-user',
            summary: { partsCount: 5, fittingsCount: 10, materialsCount: 3, warnings: [] },
          };
        }),
      });
      const store = createSpecStore(services, createDraftDoc());

      const freezePromise = store.getState().freeze();

      // Check busy state immediately after calling
      expect(store.getState().async.busy).toBe(true);

      await freezePromise;

      expect(store.getState().async.busy).toBe(false);
    });

    it('should handle freeze error', async () => {
      const services = createMockServices({
        freezeToSnapshot: vi.fn().mockRejectedValue(new Error('Freeze failed')),
      });
      const store = createSpecStore(services, createDraftDoc());

      await store.getState().freeze();

      expect(store.getState().async.error).toBe('Freeze failed');
      expect(store.getState().doc.state).toBe('DRAFT');
    });

    it('should close freeze modal after successful freeze', async () => {
      const services = createMockServices();
      const store = createSpecStore(services, createDraftDoc());

      store.getState().openFreeze();
      await store.getState().freeze();

      expect(store.getState().modals.freezeOpen).toBe(false);
    });
  });

  describe('runGate action', () => {
    it('should run gate on FROZEN document', async () => {
      const services = createMockServices();
      const store = createSpecStore(services, createFrozenDoc());

      await store.getState().runGate();

      expect(services.runGate).toHaveBeenCalled();
      const frozen = store.getState().doc as FrozenDoc;
      expect(frozen.lastGate).toBeDefined();
    });

    it('should throw when not in FROZEN state', async () => {
      const services = createMockServices();
      const store = createSpecStore(services, createDraftDoc());

      await expect(async () => {
        await store.getState().runGate();
      }).rejects.toThrow('FROZEN');
    });

    it('should set isRunning state during gate', async () => {
      const services = createMockServices({
        runGate: vi.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 50));
          return {
            gateReportId: 'gate_001',
            snapshotId: 'snap_001',
            runAt: new Date().toISOString(),
            runBy: 'test-user',
            policyVersion: 'policy-1.0.0',
            blockers: [],
            warnings: [],
            info: [],
          };
        }),
      });
      const store = createSpecStore(services, createFrozenDoc());

      const gatePromise = store.getState().runGate();

      expect(store.getState().gateUi.isRunning).toBe(true);

      await gatePromise;

      expect(store.getState().gateUi.isRunning).toBe(false);
    });
  });

  describe('release action', () => {
    it('should transition from FROZEN to RELEASED with passing gate', async () => {
      const services = createMockServices();
      const gate: GateReport = {
        gateReportId: 'gate_001',
        snapshotId: 'snap_001',
        runAt: new Date().toISOString(),
        runBy: 'test-user',
        policyVersion: 'policy-1.0.0',
        blockers: [],
        warnings: [],
        info: [],
      };
      const store = createSpecStore(services, createFrozenDoc(gate));

      await store.getState().release('RELEASE');

      expect(store.getState().doc.state).toBe('RELEASED');
      expect(services.releasePackage).toHaveBeenCalled();
    });

    it('should not release without running gate first', async () => {
      const services = createMockServices();
      const store = createSpecStore(services, createFrozenDoc()); // No lastGate

      await store.getState().release('RELEASE');

      expect(store.getState().async.error).toContain('Gate');
      expect(store.getState().doc.state).toBe('FROZEN');
    });

    it('should not release with blockers', async () => {
      const services = createMockServices();
      const gate: GateReport = {
        gateReportId: 'gate_001',
        snapshotId: 'snap_001',
        runAt: new Date().toISOString(),
        runBy: 'test-user',
        policyVersion: 'policy-1.0.0',
        blockers: [{ id: 'blocker_001', severity: 'BLOCKER', code: 'B_001', message: 'Error' }],
        warnings: [],
        info: [],
      };
      const store = createSpecStore(services, createFrozenDoc(gate));

      await store.getState().release('RELEASE');

      expect(store.getState().async.error).toContain('blocker');
      expect(store.getState().doc.state).toBe('FROZEN');
    });

    it('should close release modal after successful release', async () => {
      const services = createMockServices();
      const gate: GateReport = {
        gateReportId: 'gate_001',
        snapshotId: 'snap_001',
        runAt: new Date().toISOString(),
        runBy: 'test-user',
        policyVersion: 'policy-1.0.0',
        blockers: [],
        warnings: [],
        info: [],
      };
      const store = createSpecStore(services, createFrozenDoc(gate));

      store.getState().openRelease();
      await store.getState().release('RELEASE');

      expect(store.getState().modals.releaseOpen).toBe(false);
    });
  });

  describe('createRevisionToEdit action', () => {
    it('should create new draft from FROZEN state', async () => {
      const services = createMockServices();
      const store = createSpecStore(services, createFrozenDoc());

      await store.getState().createRevisionToEdit();

      expect(store.getState().doc.state).toBe('DRAFT');
      expect(services.createRevisionFromSnapshot).toHaveBeenCalled();
    });

    it('should create new draft from RELEASED state', async () => {
      const services = createMockServices();
      const store = createSpecStore(services, createReleasedDoc());

      await store.getState().createRevisionToEdit();

      expect(store.getState().doc.state).toBe('DRAFT');
    });

    it('should do nothing when already in DRAFT state', async () => {
      const services = createMockServices();
      const store = createSpecStore(services, createDraftDoc());

      await store.getState().createRevisionToEdit();

      expect(services.createRevisionFromSnapshot).not.toHaveBeenCalled();
      expect(store.getState().doc.state).toBe('DRAFT');
    });
  });

  describe('selector helpers', () => {
    describe('canEdit', () => {
      it('should return true for DRAFT', () => {
        expect(canEdit(createDraftDoc())).toBe(true);
      });

      it('should return false for FROZEN', () => {
        expect(canEdit(createFrozenDoc())).toBe(false);
      });

      it('should return false for RELEASED', () => {
        expect(canEdit(createReleasedDoc())).toBe(false);
      });
    });

    describe('canRunGate', () => {
      it('should return false for DRAFT', () => {
        expect(canRunGate(createDraftDoc())).toBe(false);
      });

      it('should return true for FROZEN', () => {
        expect(canRunGate(createFrozenDoc())).toBe(true);
      });

      it('should return false for RELEASED', () => {
        expect(canRunGate(createReleasedDoc())).toBe(false);
      });
    });

    describe('canRelease', () => {
      it('should return false for DRAFT', () => {
        expect(canRelease(createDraftDoc())).toBe(false);
      });

      it('should return false for FROZEN without gate', () => {
        expect(canRelease(createFrozenDoc())).toBe(false);
      });

      it('should return false for FROZEN with blockers', () => {
        const gate: GateReport = {
          gateReportId: 'gate_001',
          snapshotId: 'snap_001',
          runAt: new Date().toISOString(),
          runBy: 'test-user',
          policyVersion: 'policy-1.0.0',
          blockers: [{ id: 'b1', severity: 'BLOCKER', code: 'B', message: 'Error' }],
          warnings: [],
          info: [],
        };
        expect(canRelease(createFrozenDoc(gate))).toBe(false);
      });

      it('should return true for FROZEN with passing gate', () => {
        const gate: GateReport = {
          gateReportId: 'gate_001',
          snapshotId: 'snap_001',
          runAt: new Date().toISOString(),
          runBy: 'test-user',
          policyVersion: 'policy-1.0.0',
          blockers: [],
          warnings: [],
          info: [],
        };
        expect(canRelease(createFrozenDoc(gate))).toBe(true);
      });

      it('should return false for RELEASED', () => {
        expect(canRelease(createReleasedDoc())).toBe(false);
      });
    });

    describe('canExport', () => {
      it('should return false for DRAFT', () => {
        expect(canExport(createDraftDoc())).toBe(false);
      });

      it('should return false for FROZEN', () => {
        expect(canExport(createFrozenDoc())).toBe(false);
      });

      it('should return true for RELEASED', () => {
        expect(canExport(createReleasedDoc())).toBe(true);
      });
    });
  });
});
