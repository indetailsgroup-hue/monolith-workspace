/**
 * GateBlockerModal - Gate Enforcement Dialog
 *
 * Modal displayed when user attempts export/freeze/release
 * while Gate has blockers. Shows blockers and provides
 * one-click navigation to Safety tab.
 *
 * @version 1.0.0 - Phase B1: Gate Enforcement
 */

import React, { useCallback } from 'react';
import { useExportGate } from './useExportGate';
import { SEVERITY_COLORS } from './gateTypes';
import type { GateFinding } from './gateTypes';
import { useGateStore } from './gateStore';
import { openSafetyTab } from '../../designer/state/useIntentPanelStore';

// ============================================
// TYPES
// ============================================

export interface GateBlockerModalProps {
  /** Whether modal is open */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Action that was attempted (for messaging) */
  attemptedAction: 'freeze' | 'release' | 'export';
  /** Optional: Override blocker list */
  blockers?: GateFinding[];
}

// ============================================
// ICONS
// ============================================

const ShieldAlertIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286zm0 13.036h.008v.008H12v-.008z" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const ArrowRightIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
  </svg>
);

// ============================================
// ACTION MESSAGES
// ============================================

const ACTION_MESSAGES = {
  freeze: {
    title: 'Cannot Freeze Spec',
    description: 'The following issues must be resolved before freezing the spec for review.',
  },
  release: {
    title: 'Cannot Release for Production',
    description: 'The following blockers prevent release. Resolve them to generate factory output.',
  },
  export: {
    title: 'Cannot Export',
    description: 'Gate validation failed. Fix the blockers below to enable export.',
  },
};

// ============================================
// BLOCKER ITEM
// ============================================

function BlockerItem({
  finding,
  onSelect,
}: {
  finding: GateFinding;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full p-3 rounded-lg text-left transition-all
        bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40
        group"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
          <span className="text-red-400 text-xs">!</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-red-300 font-medium">{finding.message}</div>
          <div className="text-xs text-gray-500 mt-1 font-mono">{finding.code}</div>
          {finding.entityIds.length > 0 && (
            <div className="text-xs text-gray-600 mt-1">
              Affects {finding.entityIds.length} {finding.entityIds.length === 1 ? 'point' : 'points'}
            </div>
          )}
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400">
          <ArrowRightIcon className="w-4 h-4" />
        </div>
      </div>
    </button>
  );
}

// ============================================
// COMPONENT
// ============================================

export function GateBlockerModal({
  isOpen,
  onClose,
  attemptedAction,
  blockers: overrideBlockers,
}: GateBlockerModalProps) {
  const { blockers: gateBlockers, blockerCount } = useExportGate();
  const selectFinding = useGateStore((s) => s.selectFinding);

  // Use override or gate blockers
  const blockers = overrideBlockers ?? gateBlockers;
  const count = overrideBlockers?.length ?? blockerCount;

  // Get action-specific messaging
  const messages = ACTION_MESSAGES[attemptedAction];

  // Handle blocker click - select and navigate to Safety tab
  const handleBlockerSelect = useCallback((finding: GateFinding) => {
    selectFinding(finding.key, finding.entityIds);
    openSafetyTab();
    onClose();
  }, [selectFinding, onClose]);

  // Handle "Go to Safety" button
  const handleGoToSafety = useCallback(() => {
    // Select first blocker if available
    if (blockers.length > 0) {
      selectFinding(blockers[0].key, blockers[0].entityIds);
    }
    openSafetyTab();
    onClose();
  }, [blockers, selectFinding, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-surface-1 rounded-2xl shadow-2xl border border-red-500/30 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10 bg-gradient-to-r from-red-900/20 to-transparent">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                <ShieldAlertIcon className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">{messages.title}</h2>
                <p className="text-sm text-gray-400 mt-1">{messages.description}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Blocker List */}
        <div className="p-4 max-h-80 overflow-y-auto">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center justify-between">
            <span>Blockers ({count})</span>
            <span className="text-red-400">Must Fix</span>
          </div>
          <div className="space-y-2">
            {blockers.map((finding) => (
              <BlockerItem
                key={finding.key}
                finding={finding}
                onSelect={() => handleBlockerSelect(finding)}
              />
            ))}
            {blockers.length === 0 && (
              <div className="p-4 text-center text-gray-500 text-sm">
                No blockers found. Gate may not have run yet.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-surface-2/50 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            Click a blocker to navigate to it
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium
                bg-white/5 hover:bg-white/10 text-gray-300
                border border-white/10 hover:border-white/20
                transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGoToSafety}
              className="px-4 py-2 rounded-lg text-sm font-medium
                bg-red-500/20 hover:bg-red-500/30 text-red-300
                border border-red-500/30 hover:border-red-500/50
                transition-colors flex items-center gap-2"
            >
              Go to Safety Tab
              <ArrowRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GateBlockerModal;
