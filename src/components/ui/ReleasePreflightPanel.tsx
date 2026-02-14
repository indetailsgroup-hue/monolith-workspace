/**
 * ReleasePreflightPanel.tsx - Release Preflight Summary Panel
 *
 * FEATURES:
 * - Summary of job state before release
 * - Blocking issues / Waived issues display
 * - Factory receipts per station
 * - Export bundle status
 * - Generate Re-Export Package button
 * - Request Release button (blocked when preflight fails)
 *
 * GUIDED FLOW:
 * 1. Fix Plan: Close/waive all blocking issues
 * 2. Preflight: Gate OK + no blocking + exports exist
 * 3. Generate Re-Export Package (if needed)
 * 4. Request Release
 */

import React, { useEffect } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { PreflightState } from '../../core/preflight/preflightStore';
import type { IssueItem } from '../../core/issues/issueTypes';
import type { StationReceiptSummary } from '../../core/preflight/preflightTypes';

// ============================================
// PROPS
// ============================================

interface ReleasePreflightPanelProps {
  /** Preflight store */
  store: UseBoundStore<StoreApi<PreflightState>>;

  /** Optional class name */
  className?: string;
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ReleasePreflightPanel({
  store,
  className = '',
}: ReleasePreflightPanelProps) {
  const state = store();

  // Load on mount
  useEffect(() => {
    state.load();
  }, []);

  if (state.loading && !state.report) {
    return (
      <div className={`bg-gray-900 rounded-xl border border-gray-700 p-4 ${className}`}>
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-cyan-500 border-t-transparent" />
          <span className="text-gray-400">Loading Preflight Report...</span>
        </div>
      </div>
    );
  }

  const r = state.report;

  return (
    <div className={`bg-gray-900 rounded-xl border border-gray-700 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Release Preflight
              {r?.ready.canRequestRelease ? (
                <span className="px-2 py-0.5 bg-green-900/50 text-green-400 text-xs rounded-full font-semibold">
                  READY
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-red-900/50 text-red-400 text-xs rounded-full font-semibold">
                  BLOCKED
                </span>
              )}
            </h3>
            <div className="text-xs text-gray-500 mt-1">
              Job: <span className="font-mono">{state.jobId}</span> |
              Spec: <span className="font-bold">{r?.specState ?? '—'}</span> |
              Gate: <span className={r?.gate.ok ? 'text-green-400' : 'text-red-400'}>{r?.gate.ok ? 'OK' : 'NOT OK'}</span>
            </div>
            <div className="text-xs text-gray-600 mt-1 font-mono">
              HEAD: {r?.headHashHex?.slice(0, 16)}...
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => state.load()}
              disabled={state.loading}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
            >
              {state.loading ? 'Loading...' : 'Refresh'}
            </button>

            <button
              onClick={() => state.generateReExport()}
              disabled={state.loading || !r?.ready.canReExport}
              className="px-4 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Generate Factory Re-Export Package
            </button>

            <button
              onClick={() => state.requestRelease()}
              disabled={state.loading || !r?.ready.canRequestRelease}
              className="px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Request Release
            </button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {state.error && (
        <div className="mx-4 mt-4 p-3 bg-red-900/30 border border-red-700 rounded-lg">
          <div className="text-red-400 text-sm">{state.error}</div>
          <button
            onClick={() => state.clearError()}
            className="text-xs text-red-400 hover:text-red-300 mt-1 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Last Action Result */}
      {state.lastAction && (
        <div className={`mx-4 mt-4 p-3 rounded-lg border ${
          state.lastAction.ok
            ? 'bg-green-900/20 border-green-700/30'
            : 'bg-red-900/20 border-red-700/30'
        }`}>
          <div className={`text-sm font-semibold ${state.lastAction.ok ? 'text-green-400' : 'text-red-400'}`}>
            {state.lastAction.kind}: {state.lastAction.ok ? 'SUCCESS' : 'FAILED'}
          </div>
          <div className="text-xs text-gray-300 mt-1">{state.lastAction.message}</div>
          <button
            onClick={() => state.clearLastAction()}
            className="text-xs text-gray-400 hover:text-gray-300 mt-1 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Readiness Section */}
      <div className="p-4 border-b border-gray-700">
        <div className="font-bold text-white mb-2">Readiness</div>
        <div className="flex items-center gap-4 text-sm">
          <div>
            Re-Export:{' '}
            <span className={r?.ready.canReExport ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
              {r?.ready.canReExport ? 'READY' : 'BLOCKED'}
            </span>
          </div>
          <div>
            Release:{' '}
            <span className={r?.ready.canRequestRelease ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
              {r?.ready.canRequestRelease ? 'READY' : 'BLOCKED'}
            </span>
          </div>
        </div>

        {/* Blocking Reasons */}
        {(r?.ready.reasons?.length ?? 0) > 0 && (
          <div className="mt-3 p-3 bg-red-900/20 border border-red-700/30 rounded-lg">
            <div className="text-xs text-red-400 font-semibold mb-1">Blocking Reasons:</div>
            <ul className="list-disc list-inside text-xs text-red-300 space-y-1">
              {r!.ready.reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        {r?.ready.canRequestRelease && (
          <div className="mt-3 p-3 bg-green-900/20 border border-green-700/30 rounded-lg">
            <div className="text-xs text-green-400">
              All preflight checks passed. Ready for release.
            </div>
          </div>
        )}
      </div>

      {/* Issues Summary */}
      <div className="p-4 border-b border-gray-700">
        <div className="font-bold text-white mb-2">Issues Summary</div>
        <div className="flex items-center gap-4 text-sm">
          <StatBadge label="Blocking" count={r?.issues.blocking.length ?? 0} color="red" />
          <StatBadge label="Waived" count={r?.issues.waived.length ?? 0} color="orange" />
          <StatBadge label="Resolved/Info" count={r?.issues.resolvedOrInfo.length ?? 0} color="green" />
        </div>

        {/* Blocking Issues List */}
        {(r?.issues.blocking?.length ?? 0) > 0 && (
          <div className="mt-4">
            <div className="text-sm font-semibold text-red-400 mb-2">Blocking Issues</div>
            <div className="space-y-2">
              {r!.issues.blocking.slice(0, 5).map((issue) => (
                <IssueCard key={issue.id} issue={issue} variant="blocking" />
              ))}
              {r!.issues.blocking.length > 5 && (
                <div className="text-xs text-gray-500">
                  ...and {r!.issues.blocking.length - 5} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Waived Issues List */}
        {(r?.issues.waived?.length ?? 0) > 0 && (
          <div className="mt-4">
            <div className="text-sm font-semibold text-orange-400 mb-2">Waived Issues (Audited)</div>
            <div className="space-y-2">
              {r!.issues.waived.slice(0, 3).map((issue) => (
                <IssueCard key={issue.id} issue={issue} variant="waived" />
              ))}
              {r!.issues.waived.length > 3 && (
                <div className="text-xs text-gray-500">
                  ...and {r!.issues.waived.length - 3} more
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Factory Receipts */}
      <div className="p-4 border-b border-gray-700">
        <div className="font-bold text-white mb-2">Factory Receipts</div>
        {(r?.receipts.stations?.length ?? 0) === 0 ? (
          <div className="text-gray-500 text-sm">No receipts recorded.</div>
        ) : (
          <div className="grid gap-2">
            {r!.receipts.stations.map((station) => (
              <StationCard key={station.stationId} station={station} />
            ))}
          </div>
        )}
      </div>

      {/* Exports */}
      <div className="p-4">
        <div className="font-bold text-white mb-2">Export Bundles</div>
        <div className="text-sm text-gray-300">
          Count: <span className="font-bold">{r?.exports.count ?? 0}</span>
          {r?.exports.lastExportId && (
            <span className="text-gray-500 ml-2">
              | ID: <span className="font-mono text-cyan-400">{r.exports.lastExportId}</span>
            </span>
          )}
        </div>

        {r?.exports.lastExportHash && (
          <div className="mt-1 text-xs text-gray-500">
            Hash: <span className="font-mono">{r.exports.lastExportHash.slice(0, 16)}...</span>
            {r.exports.lastArtifactCount !== undefined && (
              <span className="ml-2">| {r.exports.lastArtifactCount} artifacts</span>
            )}
            {r.exports.lastSpecStateAtExport && (
              <span className="ml-2">| State: {r.exports.lastSpecStateAtExport}</span>
            )}
          </div>
        )}

        {r?.exports.lastCreatedIso && (
          <div className="mt-1 text-xs text-gray-500">
            Created: {new Date(r.exports.lastCreatedIso).toLocaleString()}
          </div>
        )}

        {(r?.exports.count ?? 0) === 0 && (
          <div className="mt-2 text-xs text-orange-400">
            Generate an export bundle before requesting release.
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// STAT BADGE
// ============================================

function StatBadge({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: 'red' | 'orange' | 'green' | 'blue' | 'gray';
}) {
  const colorClass = {
    red: 'bg-red-900/30 text-red-400',
    orange: 'bg-orange-900/30 text-orange-400',
    green: 'bg-green-900/30 text-green-400',
    blue: 'bg-blue-900/30 text-blue-400',
    gray: 'bg-gray-800 text-gray-400',
  }[color];

  return (
    <div className={`px-2 py-1 rounded text-xs ${colorClass}`}>
      {label}: <span className="font-bold">{count}</span>
    </div>
  );
}

// ============================================
// ISSUE CARD
// ============================================

function IssueCard({
  issue,
  variant,
}: {
  issue: IssueItem;
  variant: 'blocking' | 'waived';
}) {
  const borderColor = variant === 'blocking' ? 'border-red-700/30' : 'border-orange-700/30';
  const bgColor = variant === 'blocking' ? 'bg-red-900/10' : 'bg-orange-900/10';

  return (
    <div className={`p-2 rounded-lg border ${borderColor} ${bgColor}`}>
      <div className="flex items-center gap-2">
        <span className="font-mono font-bold text-white text-xs">{issue.source.code}</span>
        <span className="text-xs text-gray-400">[{issue.source.domain}]</span>
      </div>
      <div className="text-xs text-gray-300 mt-1">{issue.source.message}</div>
      {variant === 'waived' && issue.waivedBy && (
        <div className="text-xs text-orange-300 mt-1">
          Waived by <span className="font-semibold">{issue.waivedBy}</span>
          {issue.waivedReason && <span>: {issue.waivedReason}</span>}
        </div>
      )}
    </div>
  );
}

// ============================================
// STATION CARD
// ============================================

function StationCard({ station }: { station: StationReceiptSummary }) {
  const verdictColor =
    station.lastVerdict === 'ACCEPTED' ? 'text-green-400' : 'text-red-400';
  const verdictBg =
    station.lastVerdict === 'ACCEPTED' ? 'bg-green-900/20' : 'bg-red-900/20';

  return (
    <div className={`p-3 rounded-lg border border-gray-700 ${verdictBg}`}>
      <div className="flex items-center justify-between">
        <div className="font-bold text-white">{station.stationId}</div>
        <div className={`font-bold ${verdictColor}`}>{station.lastVerdict}</div>
      </div>
      <div className="text-xs text-gray-400 mt-1">
        Receipt:{' '}
        <span className="font-mono">{station.lastReceiptHashHex?.slice(0, 16)}...</span>
        {station.inspector && (
          <span className="ml-2">| Inspector: {station.inspector}</span>
        )}
      </div>
      {station.timestampIso && (
        <div className="text-xs text-gray-500 mt-1">
          {new Date(station.timestampIso).toLocaleString()}
        </div>
      )}
    </div>
  );
}

export default ReleasePreflightPanel;
