/**
 * MONOLITH DesignerScreen MVP
 *
 * Demo screen that demonstrates the full Freeze → Gate → Release workflow
 * Injects mock breakdown rows on mount for Gate validation
 */

import React, { useEffect, useMemo } from 'react';
import {
  createSpecStore,
  createMockSpecServices,
  createInitialDraftDoc,
  SpecStoreProvider,
  useSpecDoc,
  useSpecState,
  useDraftManufacturing,
  useDraftManufacturingActions,
  makeMockBreakdownRows,
} from '..';
import { SpecStateBanner } from './SpecStateBanner';
import { FreezeModal } from './FreezeModal';
import { GatePanel } from './GatePanel';
import { ReleaseWizardModal } from './ReleaseWizardModal';
import { ReleaseCenter } from './ReleaseCenter';
import { BreakdownTable } from '@/ui/components/BreakdownTable';

// ============================================
// INNER CONTENT (needs store context)
// ============================================

function DesignerScreenContent() {
  const doc = useSpecDoc();
  const state = useSpecState();
  const draftManufacturing = useDraftManufacturing();
  const { setBreakdownRows, setCabinetContext } = useDraftManufacturingActions();

  // Inject mock breakdown rows on mount (DRAFT only)
  useEffect(() => {
    if (state === 'DRAFT' && draftManufacturing.breakdownRows.length === 0) {
      const mockRows = makeMockBreakdownRows();
      setBreakdownRows(mockRows);
      setCabinetContext({ backPanelThicknessMm: 9 });
    }
  }, [state, draftManufacturing.breakdownRows.length, setBreakdownRows, setCabinetContext]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* State Banner */}
      <SpecStateBanner />

      {/* Main Content */}
      <div className="p-6 space-y-6">
        {/* Project Info */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-zinc-100 mb-2">
            Project: {doc.projectId}
          </h2>
          <div className="text-sm text-zinc-400">
            State: <span className="font-mono text-emerald-400">{state}</span>
          </div>
        </div>

        {/* DRAFT: Show editable BreakdownTable with live CutW/CutH */}
        {state === 'DRAFT' && (
          <div className="space-y-4">
            {/* Manufacturing Summary */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h3 className="text-md font-semibold text-zinc-100 mb-3">
                Draft Manufacturing Data
              </h3>
              <div className="text-sm text-zinc-400 flex gap-6">
                <div>
                  Parts: <span className="text-emerald-400 font-mono">{draftManufacturing.breakdownRows.length}</span>
                </div>
                <div>
                  Drill Ops: <span className="text-purple-400 font-mono">{draftManufacturing.drillOps.length}</span>
                </div>
                <div>
                  Fittings: <span className="text-cyan-400 font-mono">{draftManufacturing.fittings.length}</span>
                </div>
                <div>
                  Back Panel: <span className="text-amber-400 font-mono">{draftManufacturing.cabinet.backPanelThicknessMm}mm</span>
                </div>
              </div>
            </div>

            {/* Editable Part Breakdown Table */}
            <BreakdownTable />
          </div>
        )}

        {/* FROZEN: Show Gate Panel */}
        {state === 'FROZEN' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <h3 className="text-md font-semibold text-zinc-100 mb-3">
              Gate Validation
            </h3>
            <GatePanel />
          </div>
        )}

        {/* RELEASED: Show Release Center */}
        {state === 'RELEASED' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <h3 className="text-md font-semibold text-zinc-100 mb-3">
              Release Center
            </h3>
            <ReleaseCenter />
          </div>
        )}
      </div>

      {/* Modals */}
      <FreezeModal />
      <ReleaseWizardModal />
    </div>
  );
}

// ============================================
// MAIN COMPONENT (sets up store)
// ============================================

export interface DesignerScreenProps {
  projectId?: string;
  /** Use real Gate v0.1 validation (default: true) */
  useRealGate?: boolean;
}

export function DesignerScreen({
  projectId = 'proj_demo_001',
  useRealGate = true,
}: DesignerScreenProps) {
  // Create store once
  const store = useMemo(() => {
    const { services } = createMockSpecServices({
      user: { userId: 'designer_demo' },
      useRealGate,
    });
    const initialDoc = createInitialDraftDoc(projectId, {
      userId: 'designer_demo',
    });
    return createSpecStore(services, initialDoc);
  }, [projectId, useRealGate]);

  return (
    <SpecStoreProvider store={store}>
      <DesignerScreenContent />
    </SpecStoreProvider>
  );
}
