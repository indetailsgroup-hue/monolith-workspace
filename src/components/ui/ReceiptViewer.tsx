/**
 * ReceiptViewer.tsx - Acceptance Timeline & Receipt Viewer
 *
 * FEATURES:
 * - Timeline view: APPROVAL / FREEZE / RELEASE / EXPORT / FACTORY_RECEIPT
 * - Milestone markers for significant events
 * - Drill-down to receipt details
 * - Validation badges (chain verified / bundle verified / receipt verified)
 * - Diff display between manifests
 * - Acceptance status badge
 */

import React, { useEffect, useMemo } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { ReceiptViewerState } from '../../core/receiptViewer/receiptViewerStore';
import type { TimelineEntry, TimelineMilestone } from '../../core/chainEvents/buildTimeline';
import type { AcceptanceInfo } from '../../core/chainEvents/acceptanceStatus';
import type { SignedFactoryReceipt } from '../../core/receipt/factoryReceiptTypes';
import { getEventKindLabel, getEventKindColor, getEventKindIcon } from '../../core/chainEvents/chainEventTypes';

// ============================================
// PROPS
// ============================================

interface ReceiptViewerProps {
  /** Receipt viewer store */
  store: UseBoundStore<StoreApi<ReceiptViewerState>>;

  /** Optional class name */
  className?: string;
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ReceiptViewer({ store, className = '' }: ReceiptViewerProps) {
  const {
    jobId,
    loading,
    error,
    timeline,
    acceptance,
    mode,
    filter,
    filteredEntries,
    milestones,
    receiptEntries,
    selectedReceipt,
    receiptVerification,
    loadTimeline,
    setMode,
    setFilter,
    selectEntry,
    viewReceiptDetail,
    closeReceiptDetail,
    refresh,
    clearError,
  } = store();

  // Load timeline on mount
  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  // Render based on mode
  const content = useMemo(() => {
    if (loading) {
      return <LoadingState />;
    }

    if (error) {
      return <ErrorState error={error} onRetry={refresh} onDismiss={clearError} />;
    }

    if (!timeline) {
      return <EmptyState jobId={jobId} onRefresh={refresh} />;
    }

    switch (mode) {
      case 'receipt-detail':
        return (
          <ReceiptDetail
            receipt={selectedReceipt}
            verification={receiptVerification}
            onClose={closeReceiptDetail}
          />
        );

      case 'milestones':
        return (
          <MilestoneList
            milestones={milestones}
            onEntryClick={(e) => {
              // Find entry index and select
              const idx = timeline.entries.findIndex(
                (entry) => entry.event.manifestHashHex === e.event.manifestHashHex
              );
              if (idx >= 0) selectEntry(idx);
            }}
          />
        );

      case 'receipts':
        return (
          <ReceiptList
            entries={receiptEntries}
            onReceiptClick={(receipt) => viewReceiptDetail(receipt)}
          />
        );

      case 'timeline':
      default:
        return (
          <TimelineList
            entries={filteredEntries}
            selectedIndex={store.getState().selectedEntryIndex}
            onEntryClick={(entry, idx) => selectEntry(idx)}
            onReceiptClick={(receipt) => viewReceiptDetail(receipt)}
          />
        );
    }
  }, [
    loading,
    error,
    timeline,
    mode,
    filteredEntries,
    milestones,
    receiptEntries,
    selectedReceipt,
    receiptVerification,
  ]);

  return (
    <div className={`flex flex-col h-full bg-gray-900 ${className}`}>
      {/* Header */}
      <div className="flex-none p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Acceptance Timeline</h2>
          <button
            onClick={refresh}
            className="p-2 hover:bg-gray-700 rounded"
            title="Refresh"
          >
            <span className="text-gray-400">↻</span>
          </button>
        </div>

        {/* Acceptance Status Badge */}
        {acceptance && <AcceptanceStatusBadge acceptance={acceptance} />}

        {/* Mode Tabs */}
        <div className="flex gap-2 mt-3">
          <ModeTab
            active={mode === 'timeline'}
            label="Timeline"
            onClick={() => setMode('timeline')}
          />
          <ModeTab
            active={mode === 'milestones'}
            label="Milestones"
            count={milestones.length}
            onClick={() => setMode('milestones')}
          />
          <ModeTab
            active={mode === 'receipts'}
            label="Receipts"
            count={receiptEntries.length}
            onClick={() => setMode('receipts')}
          />
        </div>

        {/* Filters (for timeline mode) */}
        {mode === 'timeline' && (
          <div className="flex gap-2 mt-3">
            <FilterToggle
              active={filter.auditableOnly}
              label="Auditable Only"
              onClick={() => setFilter({ auditableOnly: !filter.auditableOnly })}
            />
            <FilterToggle
              active={filter.stateChangesOnly}
              label="State Changes"
              onClick={() => setFilter({ stateChangesOnly: !filter.stateChangesOnly })}
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">{content}</div>

      {/* Summary Footer */}
      {timeline && mode !== 'receipt-detail' && (
        <div className="flex-none p-3 border-t border-gray-700 text-xs text-gray-500">
          <div className="flex justify-between">
            <span>{timeline.summary.totalManifests} manifests</span>
            <span>{timeline.summary.totalExports} exports</span>
            <span>{timeline.summary.totalReceipts} receipts</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// ACCEPTANCE STATUS BADGE
// ============================================

function AcceptanceStatusBadge({ acceptance }: { acceptance: AcceptanceInfo }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800`}>
      <span className="text-lg">{acceptance.icon}</span>
      <div>
        <div className={`font-medium ${acceptance.color}`}>{acceptance.status}</div>
        <div className="text-xs text-gray-400">{acceptance.message}</div>
      </div>
      {acceptance.hasReceipts && (
        <div className="ml-auto text-xs text-gray-500">
          {acceptance.receiptCounts.accepted}/{acceptance.receiptCounts.total} accepted
        </div>
      )}
    </div>
  );
}

// ============================================
// MODE TABS
// ============================================

function ModeTab({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-sm rounded-full transition-colors ${
        active
          ? 'bg-green-600 text-white'
          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-600 rounded-full">
          {count}
        </span>
      )}
    </button>
  );
}

// ============================================
// FILTER TOGGLES
// ============================================

function FilterToggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded transition-colors ${
        active
          ? 'bg-blue-600/30 text-blue-400 border border-blue-500'
          : 'bg-gray-800 text-gray-500 border border-gray-700 hover:border-gray-600'
      }`}
    >
      {label}
    </button>
  );
}

// ============================================
// TIMELINE LIST
// ============================================

function TimelineList({
  entries,
  selectedIndex,
  onEntryClick,
  onReceiptClick,
}: {
  entries: TimelineEntry[];
  selectedIndex: number | null;
  onEntryClick: (entry: TimelineEntry, index: number) => void;
  onReceiptClick: (receipt: SignedFactoryReceipt) => void;
}) {
  if (entries.length === 0) {
    return <div className="text-gray-500 text-center py-8">No events match filter</div>;
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, idx) => (
        <TimelineEntryCard
          key={entry.event.manifestHashHex}
          entry={entry}
          selected={selectedIndex === idx}
          onClick={() => onEntryClick(entry, idx)}
          onReceiptClick={entry.event.receipt ? () => onReceiptClick(entry.event.receipt!) : undefined}
        />
      ))}
    </div>
  );
}

// ============================================
// TIMELINE ENTRY CARD
// ============================================

function TimelineEntryCard({
  entry,
  selected,
  onClick,
  onReceiptClick,
}: {
  entry: TimelineEntry;
  selected: boolean;
  onClick: () => void;
  onReceiptClick?: () => void;
}) {
  const { event, diff, formattedTime, relativeTime, isHead, isGenesis } = entry;

  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-lg cursor-pointer transition-colors ${
        selected
          ? 'bg-gray-700 ring-1 ring-green-500'
          : 'bg-gray-800 hover:bg-gray-750'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{getEventKindIcon(event.kind)}</span>
        <span className={`font-medium ${getEventKindColor(event.kind)}`}>
          {getEventKindLabel(event.kind)}
        </span>
        {isHead && (
          <span className="px-1.5 py-0.5 text-[10px] bg-green-600/30 text-green-400 rounded">
            HEAD
          </span>
        )}
        {isGenesis && (
          <span className="px-1.5 py-0.5 text-[10px] bg-purple-600/30 text-purple-400 rounded">
            GENESIS
          </span>
        )}
        <span className="ml-auto text-xs text-gray-500">{relativeTime}</span>
      </div>

      {/* Metadata */}
      <div className="text-xs text-gray-500 mb-2">
        <span className="font-mono">{event.manifestHashHex.slice(0, 12)}...</span>
        <span className="mx-2">|</span>
        <span>{formattedTime}</span>
      </div>

      {/* Status Badges */}
      <div className="flex gap-1.5 mb-2">
        <StatusBadge
          ok={event.gateOk}
          label={event.gateOk ? 'Gate OK' : 'Gate Error'}
          okColor="text-green-400"
          errorColor="text-red-400"
        />
        <StatusBadge
          ok={!event.collisionBlocked}
          label={event.collisionBlocked ? 'Collision' : 'No Collision'}
          okColor="text-green-400"
          errorColor="text-orange-400"
        />
        <span className="px-1.5 py-0.5 text-[10px] bg-gray-700 text-gray-400 rounded">
          {event.specState}
        </span>
      </div>

      {/* Diff (if available) */}
      {diff && (
        <div className="flex gap-2 text-[10px]">
          {diff.specStateChanged && (
            <span className="text-amber-400">
              State: {diff.prevSpecState} → {event.specState}
            </span>
          )}
          {diff.exportsChanged && diff.exportsDelta > 0 && (
            <span className="text-emerald-400">+{diff.exportsDelta} exports</span>
          )}
          {diff.receiptsChanged && diff.receiptsDelta > 0 && (
            <span className="text-lime-400">+{diff.receiptsDelta} receipts</span>
          )}
        </div>
      )}

      {/* Receipt Button (if applicable) */}
      {event.receipt && onReceiptClick && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReceiptClick();
          }}
          className="mt-2 px-2 py-1 text-xs bg-lime-600/30 text-lime-400 rounded hover:bg-lime-600/50"
        >
          View Receipt
        </button>
      )}
    </div>
  );
}

// ============================================
// STATUS BADGE
// ============================================

function StatusBadge({
  ok,
  label,
  okColor,
  errorColor,
}: {
  ok: boolean;
  label: string;
  okColor: string;
  errorColor: string;
}) {
  return (
    <span
      className={`px-1.5 py-0.5 text-[10px] rounded ${
        ok ? `bg-green-900/30 ${okColor}` : `bg-red-900/30 ${errorColor}`
      }`}
    >
      {label}
    </span>
  );
}

// ============================================
// MILESTONE LIST
// ============================================

function MilestoneList({
  milestones,
  onEntryClick,
}: {
  milestones: TimelineMilestone[];
  onEntryClick: (milestone: TimelineMilestone) => void;
}) {
  if (milestones.length === 0) {
    return <div className="text-gray-500 text-center py-8">No milestones yet</div>;
  }

  return (
    <div className="space-y-3">
      {milestones.map((milestone, idx) => (
        <div
          key={`${milestone.type}-${idx}`}
          onClick={() => onEntryClick(milestone)}
          className="p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-750"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{getEventKindIcon(milestone.event.kind)}</span>
            <span className="font-medium text-white">{milestone.label}</span>
            <span className="ml-auto text-xs text-gray-500">
              {formatDate(milestone.timestampIso)}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-1 font-mono">
            {milestone.event.manifestHashHex.slice(0, 16)}...
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// RECEIPT LIST
// ============================================

function ReceiptList({
  entries,
  onReceiptClick,
}: {
  entries: TimelineEntry[];
  onReceiptClick: (receipt: SignedFactoryReceipt) => void;
}) {
  if (entries.length === 0) {
    return <div className="text-gray-500 text-center py-8">No factory receipts yet</div>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const receipt = entry.event.receipt;
        if (!receipt) return null;

        const r = receipt.receipt;
        const isAccepted = r.verdict === 'ACCEPTED';

        return (
          <div
            key={receipt.receiptHashHex}
            onClick={() => onReceiptClick(receipt)}
            className={`p-3 rounded-lg cursor-pointer transition-colors ${
              isAccepted
                ? 'bg-green-900/20 hover:bg-green-900/30 border border-green-700'
                : 'bg-red-900/20 hover:bg-red-900/30 border border-red-700'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{isAccepted ? '✓' : '✗'}</span>
              <span className={isAccepted ? 'text-green-400' : 'text-red-400'}>
                {r.verdict}
              </span>
              <span className="ml-auto text-xs text-gray-500">
                {formatDate(r.acceptedAtIso)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
              <div>Station: {r.stationId}</div>
              <div>Inspector: {r.inspector}</div>
            </div>
            {r.rejectReasons && r.rejectReasons.length > 0 && (
              <div className="mt-2 text-xs text-red-400">
                Reasons: {r.rejectReasons.join(', ')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// RECEIPT DETAIL
// ============================================

function ReceiptDetail({
  receipt,
  verification,
  onClose,
}: {
  receipt: SignedFactoryReceipt | null;
  verification: { ok: boolean; reason?: string } | null;
  onClose: () => void;
}) {
  if (!receipt) {
    return <div className="text-gray-500 text-center py-8">No receipt selected</div>;
  }

  const r = receipt.receipt;
  const isAccepted = r.verdict === 'ACCEPTED';

  return (
    <div className="space-y-4">
      {/* Back Button */}
      <button
        onClick={onClose}
        className="flex items-center gap-2 text-gray-400 hover:text-white"
      >
        ← Back to Timeline
      </button>

      {/* Verdict Header */}
      <div
        className={`p-4 rounded-lg ${
          isAccepted
            ? 'bg-green-900/20 border border-green-700'
            : 'bg-red-900/20 border border-red-700'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">{isAccepted ? '✓' : '✗'}</span>
          <div>
            <div className={`text-xl font-bold ${isAccepted ? 'text-green-400' : 'text-red-400'}`}>
              {r.verdict}
            </div>
            <div className="text-sm text-gray-400">{formatDate(r.acceptedAtIso)}</div>
          </div>
        </div>
      </div>

      {/* Verification Badge */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">Signature:</span>
        {verification ? (
          verification.ok ? (
            <span className="px-2 py-1 text-xs bg-green-900/30 text-green-400 rounded">
              ✓ Verified
            </span>
          ) : (
            <span className="px-2 py-1 text-xs bg-red-900/30 text-red-400 rounded">
              ✗ {verification.reason}
            </span>
          )
        ) : (
          <span className="px-2 py-1 text-xs bg-gray-700 text-gray-400 rounded">
            Verifying...
          </span>
        )}
      </div>

      {/* Receipt Details */}
      <div className="bg-gray-800 rounded-lg p-4 space-y-3">
        <DetailRow label="Job ID" value={r.jobId} />
        <DetailRow label="Station" value={r.stationId} />
        <DetailRow label="Inspector" value={r.inspector} />
        <DetailRow label="Manifest Hash" value={r.headManifestHashHex} mono />
        <DetailRow label="Snapshot Hash" value={r.snapshotHashHex} mono />
        <DetailRow label="Bundle Hash" value={r.bundleZipSha256Hex} mono />
        <DetailRow label="Key ID" value={receipt.keyId} />
      </div>

      {/* Rejection Reasons */}
      {r.rejectReasons && r.rejectReasons.length > 0 && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <div className="text-sm font-medium text-red-400 mb-2">Rejection Reasons:</div>
          <ul className="list-disc list-inside text-sm text-gray-300 space-y-1">
            {r.rejectReasons.map((reason, idx) => (
              <li key={idx}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Signature */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="text-sm text-gray-400 mb-2">Signature (Ed25519):</div>
        <div className="text-xs text-gray-500 font-mono break-all">
          {receipt.signatureHex}
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const displayValue = value.length > 40 ? `${value.slice(0, 20)}...${value.slice(-12)}` : value;

  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-400 text-sm">{label}:</span>
      <span className={`text-white text-sm ${mono ? 'font-mono' : ''}`} title={value}>
        {displayValue}
      </span>
    </div>
  );
}

// ============================================
// STATES
// ============================================

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-500 border-t-transparent" />
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
  onDismiss,
}: {
  error: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 text-center">
      <div className="text-red-400 mb-3">{error}</div>
      <div className="flex gap-2 justify-center">
        <button
          onClick={onRetry}
          className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
        <button
          onClick={onDismiss}
          className="px-3 py-1 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function EmptyState({ jobId, onRefresh }: { jobId: string; onRefresh: () => void }) {
  return (
    <div className="text-center py-12">
      <div className="text-gray-400 mb-4">No timeline data for job: {jobId}</div>
      <button
        onClick={onRefresh}
        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
      >
        Load Timeline
      </button>
    </div>
  );
}

// ============================================
// HELPERS
// ============================================

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export default ReceiptViewer;
