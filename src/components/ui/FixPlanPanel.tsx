/**
 * FixPlanPanel.tsx - Issue Pack Viewer & Resolution UI
 *
 * FEATURES:
 * - View all issues from rejected receipts
 * - Update issue status (OPEN -> IN_PROGRESS -> RESOLVED)
 * - WAIVE issues with strict audit (via WaiveModal)
 * - Track blocking status for release gating
 * - Assign owner and add notes
 *
 * BLOCKING RULES:
 * - ERROR + (OPEN | IN_PROGRESS) = Blocked
 * - RESOLVED or WAIVED = Not blocking
 * - Release button should check blocked status
 */

import React, { useEffect, useState, useCallback } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { FixPlanState } from '../../core/fixPlan/fixPlanStore';
import type { IssueItem, IssueStatus } from '../../core/issues/issueTypes';
import { WaiveModal } from './WaiveModal';
import { UnwaiveModal } from './UnwaiveModal';

// ============================================
// PROPS
// ============================================

interface FixPlanPanelProps {
  /** Fix plan store */
  store: UseBoundStore<StoreApi<FixPlanState>>;

  /** Optional class name */
  className?: string;
}

// ============================================
// MAIN COMPONENT
// ============================================

export function FixPlanPanel({ store, className = '' }: FixPlanPanelProps) {
  const state = store();

  // Load on mount
  useEffect(() => {
    state.load();
  }, []);

  if (state.loading && state.issues.length === 0) {
    return (
      <div className={`bg-gray-900 rounded-xl border border-gray-700 p-4 ${className}`}>
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-orange-500 border-t-transparent" />
          <span className="text-gray-400">Loading Fix Plan...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-900 rounded-xl border border-gray-700 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Fix Plan (Issue Pack)
              {state.blocked.blocked && (
                <span className="px-2 py-0.5 bg-red-900/50 text-red-400 text-xs rounded-full font-semibold">
                  BLOCKED
                </span>
              )}
            </h3>
            <div className="text-xs text-gray-500 mt-1 font-mono">
              HEAD: {state.headHash?.slice(0, 16)}...
            </div>
          </div>

          {/* Status Badge */}
          <div className={`px-3 py-1.5 rounded-lg font-bold text-sm ${
            state.blocked.blocked
              ? 'bg-red-900/30 text-red-400'
              : 'bg-green-900/30 text-green-400'
          }`}>
            {state.blocked.blocked
              ? `BLOCKED (${state.blocked.count})`
              : 'CLEAR'}
          </div>
        </div>

        {/* Summary Stats */}
        {state.issues.length > 0 && (
          <div className="flex items-center gap-4 mt-3 text-xs">
            <StatBadge
              label="Total"
              count={state.summary.total}
              color="gray"
            />
            <StatBadge
              label="Open"
              count={state.summary.byStatus['OPEN'] || 0}
              color="orange"
            />
            <StatBadge
              label="In Progress"
              count={state.summary.byStatus['IN_PROGRESS'] || 0}
              color="blue"
            />
            <StatBadge
              label="Resolved"
              count={state.summary.byStatus['RESOLVED'] || 0}
              color="green"
            />
            <StatBadge
              label="Waived"
              count={state.summary.byStatus['WAIVED'] || 0}
              color="orange"
            />
          </div>
        )}
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

      {/* Issues List */}
      <div className="p-4">
        {state.issues.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            No issues found. This job has no issue packs.
          </div>
        ) : (
          <div className="space-y-3">
            {state.issues.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                loading={state.loading}
                onStatusChange={(status) => state.setIssueStatus(issue.id, status)}
                onMetaChange={(patch) => state.setIssueMeta(issue.id, patch)}
                onWaive={(args) => state.waiveIssue(issue.id, args)}
                onUnwaive={(args) => state.unwaiveIssue(issue.id, args)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Blocking Message */}
      {state.blocked.blocked && (
        <div className="mx-4 mb-4 p-3 bg-red-900/20 border border-red-700/30 rounded-lg">
          <div className="text-red-400 text-sm font-semibold">
            Release Blocked
          </div>
          <div className="text-xs text-red-300 mt-1">
            {state.blocked.summary}
          </div>
          <div className="text-xs text-gray-400 mt-2">
            Resolve or Waive (strict) all blocking issues before release.
          </div>
        </div>
      )}

      {/* Refresh Button */}
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={() => state.load()}
          disabled={state.loading}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
        >
          {state.loading ? 'Refreshing...' : 'Refresh'}
        </button>
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
  color: 'gray' | 'orange' | 'blue' | 'green';
}) {
  const colorClass = {
    gray: 'bg-gray-800 text-gray-400',
    orange: 'bg-orange-900/30 text-orange-400',
    blue: 'bg-blue-900/30 text-blue-400',
    green: 'bg-green-900/30 text-green-400',
  }[color];

  return (
    <div className={`px-2 py-1 rounded ${colorClass}`}>
      {label}: <span className="font-bold">{count}</span>
    </div>
  );
}

// ============================================
// ISSUE ROW
// ============================================

interface IssueRowProps {
  issue: IssueItem;
  loading: boolean;
  onStatusChange: (status: IssueStatus) => void;
  onMetaChange: (patch: { owner?: string; note?: string }) => void;
  onWaive: (args: { waivedBy: string; waivedReason: string }) => void;
  onUnwaive: (args: {
    unwaivedBy: string;
    unwaivedReason: string;
    nextStatus: Exclude<IssueStatus, 'WAIVED'>;
  }) => void;
}

function IssueRow({
  issue,
  loading,
  onStatusChange,
  onMetaChange,
  onWaive,
  onUnwaive,
}: IssueRowProps) {
  const [showWaiveModal, setShowWaiveModal] = useState(false);
  const [showUnwaiveModal, setShowUnwaiveModal] = useState(false);
  const [owner, setOwner] = useState(issue.owner ?? '');
  const [note, setNote] = useState(issue.note ?? '');

  // Status colors
  const statusColor = {
    OPEN: 'bg-orange-900/50 text-orange-400',
    IN_PROGRESS: 'bg-blue-900/50 text-blue-400',
    RESOLVED: 'bg-green-900/50 text-green-400',
    WAIVED: 'bg-gray-700 text-gray-400',
  }[issue.status];

  // Severity colors
  const severityColor = {
    ERROR: 'text-red-400',
    WARNING: 'text-yellow-400',
    INFO: 'text-blue-400',
  }[issue.severity];

  // Handle status select change
  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as IssueStatus;

    if (newStatus === 'WAIVED') {
      // Open modal for strict waive flow
      setShowWaiveModal(true);
      return;
    }

    onStatusChange(newStatus);
  };

  // Handle save meta
  const handleSaveMeta = () => {
    onMetaChange({
      owner: owner.trim() || undefined,
      note: note.trim() || undefined,
    });
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Severity Badge */}
          <span className={`text-xs font-bold ${severityColor}`}>
            {issue.severity}
          </span>

          {/* Code */}
          <span className="font-mono font-bold text-white">
            {issue.source.code}
          </span>

          {/* Domain */}
          <span className="text-xs text-gray-500">
            [{issue.source.domain}]
          </span>
        </div>

        {/* Status Badge */}
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${statusColor}`}>
          {issue.status}
        </span>
      </div>

      {/* Message */}
      <div className="mt-2 text-gray-300 text-sm">
        {issue.source.message}
      </div>

      {/* Timestamps */}
      <div className="mt-2 text-xs text-gray-500">
        Created: {new Date(issue.createdAtIso).toLocaleString()} |
        Updated: {new Date(issue.updatedAtIso).toLocaleString()}
      </div>

      {/* WAIVED Details */}
      {issue.status === 'WAIVED' && issue.waivedBy && (
        <div className="mt-3 p-2 bg-gray-900/50 rounded-lg text-xs">
          <div className="text-gray-400">
            <span className="font-semibold">Waived By:</span>{' '}
            <span className="text-orange-300">{issue.waivedBy}</span>
            {issue.waivedAtIso && (
              <span className="text-gray-500 ml-2">
                @ {new Date(issue.waivedAtIso).toLocaleString()}
              </span>
            )}
          </div>
          {issue.waivedReason && (
            <div className="mt-1 text-gray-300">
              <span className="font-semibold text-gray-400">Reason:</span>{' '}
              {issue.waivedReason}
            </div>
          )}
        </div>
      )}

      {/* UNWAIVED Details (if previously waived then unwaived) */}
      {issue.unwaivedBy && (
        <div className="mt-3 p-2 bg-cyan-900/20 border border-cyan-700/30 rounded-lg text-xs">
          <div className="text-cyan-400 font-semibold mb-1">UNWAIVED (Reopened)</div>
          <div className="text-gray-400">
            <span className="font-semibold">Unwaived By:</span>{' '}
            <span className="text-cyan-300">{issue.unwaivedBy}</span>
            {issue.unwaivedAtIso && (
              <span className="text-gray-500 ml-2">
                @ {new Date(issue.unwaivedAtIso).toLocaleString()}
              </span>
            )}
          </div>
          {issue.unwaivedReason && (
            <div className="mt-1 text-gray-300">
              <span className="font-semibold text-gray-400">Reason:</span>{' '}
              {issue.unwaivedReason}
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="mt-4 flex items-center gap-3 flex-wrap">
        {/* Status Select - disabled for WAIVED (must use UNWAIVE button) */}
        {issue.status === 'WAIVED' ? (
          <button
            onClick={() => setShowUnwaiveModal(true)}
            disabled={loading}
            className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            UNWAIVE (Reopen)
          </button>
        ) : (
          <select
            value={issue.status}
            onChange={handleStatusChange}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-gray-500 disabled:opacity-50"
          >
            <option value="OPEN">OPEN</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="RESOLVED">RESOLVED</option>
            <option value="WAIVED">WAIVED (strict)</option>
          </select>
        )}

        {/* Owner Input */}
        <input
          type="text"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="Owner"
          disabled={loading}
          className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500 w-32 disabled:opacity-50"
        />

        {/* Note Input */}
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note"
          disabled={loading}
          className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500 flex-1 min-w-[200px] disabled:opacity-50"
        />

        {/* Save Meta Button */}
        <button
          onClick={handleSaveMeta}
          disabled={loading}
          className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
        >
          Save
        </button>
      </div>

      {/* Waive Modal */}
      {showWaiveModal && (
        <WaiveModal
          issueCode={issue.source.code}
          issueMessage={issue.source.message}
          loading={loading}
          onCancel={() => setShowWaiveModal(false)}
          onConfirm={(args) => {
            setShowWaiveModal(false);
            onWaive(args);
          }}
        />
      )}

      {/* Unwaive Modal */}
      {showUnwaiveModal && (
        <UnwaiveModal
          issueCode={issue.source.code}
          issueMessage={issue.source.message}
          originalWaivedBy={issue.waivedBy}
          originalWaivedReason={issue.waivedReason}
          loading={loading}
          onCancel={() => setShowUnwaiveModal(false)}
          onConfirm={(args) => {
            setShowUnwaiveModal(false);
            onUnwaive(args);
          }}
        />
      )}
    </div>
  );
}

export default FixPlanPanel;
