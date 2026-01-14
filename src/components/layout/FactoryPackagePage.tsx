/**
 * FactoryPackagePage.tsx - Factory Package Management
 *
 * Combines:
 * - ReleasePreflightPanel: Release readiness summary and actions
 * - FixPlanPanel: Issue resolution workflow (optional)
 * - ReceiptIngestPanel: Upload, verify, and append factory receipts
 * - ReceiptViewer: View acceptance timeline and receipt details
 *
 * GUIDED FLOW:
 * 1. Fix Plan: Close/waive blocking issues
 * 2. Preflight: Check readiness
 * 3. Generate Re-Export Package
 * 4. Request Release
 *
 * After appending a receipt, the timeline automatically refreshes.
 */

import React, { useCallback, useState } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { ReceiptViewerState } from '../../core/receiptViewer/receiptViewerStore';
import type { ReceiptIngestState } from '../../core/receiptIngest/receiptIngestStore';
import type { PreflightState } from '../../core/preflight/preflightStore';
import type { FixPlanState } from '../../core/fixPlan/fixPlanStore';
import type { ExportViewerState } from '../exportViewer/exportViewerStore';
import { ReceiptViewer } from '../ui/ReceiptViewer';
import { ReceiptIngestPanel } from '../ui/ReceiptIngestPanel';
import { ReleasePreflightPanel } from '../ui/ReleasePreflightPanel';
import { FixPlanPanel } from '../ui/FixPlanPanel';
import { ExportViewerPanel } from '../exportViewer/ExportViewerPanel';

// ============================================
// PROPS
// ============================================

interface FactoryPackagePageProps {
  /** Receipt viewer store */
  viewerStore: UseBoundStore<StoreApi<ReceiptViewerState>>;

  /** Receipt ingest store */
  ingestStore: UseBoundStore<StoreApi<ReceiptIngestState>>;

  /** Preflight store (optional - for release readiness) */
  preflightStore?: UseBoundStore<StoreApi<PreflightState>>;

  /** Fix plan store (optional - for issue resolution) */
  fixPlanStore?: UseBoundStore<StoreApi<FixPlanState>>;

  /** Export viewer store (optional - for viewing/downloading exports) */
  exportViewerStore?: UseBoundStore<StoreApi<ExportViewerState>>;

  /** Page title */
  title?: string;

  /** Optional class name */
  className?: string;
}

// ============================================
// MAIN COMPONENT
// ============================================

export function FactoryPackagePage({
  viewerStore,
  ingestStore,
  preflightStore,
  fixPlanStore,
  exportViewerStore,
  title = 'Factory Package',
  className = '',
}: FactoryPackagePageProps) {
  const viewerState = viewerStore();
  const [activeTab, setActiveTab] = useState<'preflight' | 'fixplan' | 'exports' | 'receipts'>('preflight');

  // Handler to refresh timeline after receipt is appended
  const handleReceiptAppended = useCallback(async () => {
    await viewerState.loadTimeline();
    // Also refresh preflight if available
    if (preflightStore) {
      preflightStore.getState().load();
    }
  }, [viewerState, preflightStore]);

  return (
    <div className={`flex flex-col h-full bg-gray-950 ${className}`}>
      {/* Page Header */}
      <div className="flex-none p-4 border-b border-gray-800">
        <h1 className="text-xl font-bold text-white">{title}</h1>
        <div className="text-sm text-gray-500 mt-1">
          Release preflight, issue resolution, and factory receipts
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mt-3">
          <TabButton
            label="Preflight"
            active={activeTab === 'preflight'}
            onClick={() => setActiveTab('preflight')}
            disabled={!preflightStore}
          />
          <TabButton
            label="Fix Plan"
            active={activeTab === 'fixplan'}
            onClick={() => setActiveTab('fixplan')}
            disabled={!fixPlanStore}
          />
          <TabButton
            label="Exports"
            active={activeTab === 'exports'}
            onClick={() => setActiveTab('exports')}
            disabled={!exportViewerStore}
          />
          <TabButton
            label="Receipts"
            active={activeTab === 'receipts'}
            onClick={() => setActiveTab('receipts')}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left Panel: Tab Content */}
        <div className="w-1/2 border-r border-gray-800 overflow-y-auto p-4">
          {activeTab === 'preflight' && preflightStore && (
            <ReleasePreflightPanel store={preflightStore} />
          )}

          {activeTab === 'fixplan' && fixPlanStore && (
            <FixPlanPanel store={fixPlanStore} />
          )}

          {activeTab === 'exports' && exportViewerStore && (
            <ExportViewerPanel useStore={exportViewerStore} />
          )}

          {activeTab === 'receipts' && (
            <>
              <ReceiptIngestPanel
                store={ingestStore}
                onAppended={handleReceiptAppended}
              />
              <QuickStatusSummary viewerStore={viewerStore} />
            </>
          )}

          {/* Fallback when stores not provided */}
          {activeTab === 'preflight' && !preflightStore && (
            <div className="p-4 bg-gray-900 rounded-xl border border-gray-700 text-gray-500">
              Preflight store not configured
            </div>
          )}
          {activeTab === 'fixplan' && !fixPlanStore && (
            <div className="p-4 bg-gray-900 rounded-xl border border-gray-700 text-gray-500">
              Fix Plan store not configured
            </div>
          )}
          {activeTab === 'exports' && !exportViewerStore && (
            <div className="p-4 bg-gray-900 rounded-xl border border-gray-700 text-gray-500">
              Export Viewer store not configured
            </div>
          )}
        </div>

        {/* Right Panel: Receipt Viewer / Timeline */}
        <div className="w-1/2 overflow-hidden">
          <ReceiptViewer store={viewerStore} />
        </div>
      </div>
    </div>
  );
}

// ============================================
// TAB BUTTON
// ============================================

function TabButton({
  label,
  active,
  onClick,
  disabled = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active
          ? 'bg-gray-700 text-white'
          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {label}
    </button>
  );
}

// ============================================
// QUICK STATUS SUMMARY
// ============================================

function QuickStatusSummary({
  viewerStore,
}: {
  viewerStore: UseBoundStore<StoreApi<ReceiptViewerState>>;
}) {
  const state = viewerStore();
  const { timeline, acceptance } = state;

  if (!timeline) {
    return null;
  }

  return (
    <div className="mt-4 p-4 bg-gray-900 rounded-xl border border-gray-700">
      <h4 className="text-sm font-semibold text-white mb-3">Current Status</h4>

      <div className="grid grid-cols-2 gap-3">
        {/* Acceptance Status */}
        {acceptance && (
          <div className="p-3 bg-gray-800 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">Acceptance</div>
            <div className={`font-medium ${acceptance.color}`}>
              {acceptance.icon} {acceptance.status}
            </div>
          </div>
        )}

        {/* Spec State */}
        <div className="p-3 bg-gray-800 rounded-lg">
          <div className="text-xs text-gray-500 mb-1">Spec State</div>
          <div className="font-medium text-white">
            {acceptance?.specState ?? 'Unknown'}
          </div>
        </div>

        {/* Manifests */}
        <div className="p-3 bg-gray-800 rounded-lg">
          <div className="text-xs text-gray-500 mb-1">Manifests</div>
          <div className="font-medium text-white">
            {timeline.summary.totalManifests}
          </div>
        </div>

        {/* Receipts */}
        <div className="p-3 bg-gray-800 rounded-lg">
          <div className="text-xs text-gray-500 mb-1">Receipts</div>
          <div className="font-medium text-white">
            {timeline.summary.totalReceipts}
            {acceptance?.receiptCounts && acceptance.receiptCounts.total > 0 && (
              <span className="text-xs text-gray-500 ml-1">
                ({acceptance.receiptCounts.accepted} accepted)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Rejection Reasons */}
      {acceptance?.rejectReasons && acceptance.rejectReasons.length > 0 && (
        <div className="mt-3 p-3 bg-red-900/20 border border-red-700 rounded-lg">
          <div className="text-xs text-red-400 font-medium mb-1">
            Rejection Reasons:
          </div>
          <ul className="list-disc list-inside text-xs text-gray-300 space-y-1">
            {acceptance.rejectReasons.map((reason, idx) => (
              <li key={idx}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================
// COMPACT VARIANT
// ============================================

interface FactoryPackageCompactProps {
  /** Receipt viewer store */
  viewerStore: UseBoundStore<StoreApi<ReceiptViewerState>>;

  /** Receipt ingest store */
  ingestStore: UseBoundStore<StoreApi<ReceiptIngestState>>;

  /** Optional class name */
  className?: string;
}

/**
 * Compact version for embedding in sidebars
 */
export function FactoryPackageCompact({
  viewerStore,
  ingestStore,
  className = '',
}: FactoryPackageCompactProps) {
  const viewerState = viewerStore();

  const handleReceiptAppended = useCallback(async () => {
    await viewerState.loadTimeline();
  }, [viewerState]);

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <ReceiptIngestPanel
        store={ingestStore}
        onAppended={handleReceiptAppended}
      />
      <ReceiptViewer store={viewerStore} />
    </div>
  );
}

export default FactoryPackagePage;
