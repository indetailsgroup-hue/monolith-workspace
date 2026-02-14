/**
 * UnwaiveModal.tsx - Strict UNWAIVE Confirmation Modal
 *
 * UNWAIVE POLICY:
 * - User must type "UNWAIVE" to confirm
 * - User must provide unwaivedBy (who reopened)
 * - User must provide unwaivedReason (min 8 chars)
 * - User must select target status (OPEN, IN_PROGRESS, RESOLVED)
 * - This ensures audit trail for all unwaive operations
 *
 * DEFENSE-IN-DEPTH:
 * - UI validation (this modal)
 * - Service validation (TrustChainService.unwaiveIssue)
 * Both must pass for unwaive to succeed.
 */

import React, { useState } from 'react';
import { UNWAIVE_REASON_MIN_LENGTH } from '../../core/issues/issueValidation';
import type { IssueStatus } from '../../core/issues/issueTypes';

// ============================================
// PROPS
// ============================================

interface UnwaiveModalProps {
  /** Issue code being unwaived */
  issueCode: string;

  /** Issue message for context */
  issueMessage?: string;

  /** Original waived by (for audit display) */
  originalWaivedBy?: string;

  /** Original waived reason (for audit display) */
  originalWaivedReason?: string;

  /** Cancel callback */
  onCancel: () => void;

  /** Confirm callback with audit fields */
  onConfirm: (args: {
    unwaivedBy: string;
    unwaivedReason: string;
    nextStatus: Exclude<IssueStatus, 'WAIVED'>;
  }) => void;

  /** Loading state (during submission) */
  loading?: boolean;
}

// ============================================
// COMPONENT
// ============================================

export function UnwaiveModal({
  issueCode,
  issueMessage,
  originalWaivedBy,
  originalWaivedReason,
  onCancel,
  onConfirm,
  loading = false,
}: UnwaiveModalProps) {
  const [typed, setTyped] = useState('');
  const [unwaivedBy, setUnwaivedBy] = useState('');
  const [unwaivedReason, setUnwaivedReason] = useState('');
  const [nextStatus, setNextStatus] = useState<Exclude<IssueStatus, 'WAIVED'>>('OPEN');

  // Validation
  const isTypedValid = typed.trim().toUpperCase() === 'UNWAIVE';
  const isUnwaivedByValid = unwaivedBy.trim().length > 0;
  const isReasonValid = unwaivedReason.trim().length >= UNWAIVE_REASON_MIN_LENGTH;
  const canConfirm = isTypedValid && isUnwaivedByValid && isReasonValid && !loading;

  // Reason character count display
  const reasonLength = unwaivedReason.trim().length;
  const reasonColor = reasonLength >= UNWAIVE_REASON_MIN_LENGTH ? 'text-green-400' : 'text-gray-500';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="w-[560px] max-w-[92vw] bg-gray-900 border border-gray-700 rounded-xl p-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">UNWAIVE Issue (Reopen)</h3>
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-gray-400 hover:text-white text-xl px-2"
          >
            &times;
          </button>
        </div>

        {/* Issue Info */}
        <div className="mt-3 p-3 bg-gray-800 rounded-lg">
          <div className="font-mono text-cyan-400 font-bold">{issueCode}</div>
          {issueMessage && (
            <div className="text-gray-300 text-sm mt-1">{issueMessage}</div>
          )}
        </div>

        {/* Original WAIVE Info (audit context) */}
        {(originalWaivedBy || originalWaivedReason) && (
          <div className="mt-3 p-3 bg-orange-900/20 border border-orange-700/30 rounded-lg">
            <div className="text-xs text-orange-400 font-semibold mb-1">Original WAIVE:</div>
            {originalWaivedBy && (
              <div className="text-xs text-gray-300">
                <span className="text-gray-500">By:</span> {originalWaivedBy}
              </div>
            )}
            {originalWaivedReason && (
              <div className="text-xs text-gray-300 mt-1">
                <span className="text-gray-500">Reason:</span> {originalWaivedReason}
              </div>
            )}
          </div>
        )}

        <hr className="border-gray-700 my-4" />

        {/* Target Status */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-white mb-2">
            Reopen As <span className="text-red-400">*</span>
          </label>
          <div className="flex gap-2">
            {(['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setNextStatus(status)}
                disabled={loading}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  nextStatus === status
                    ? status === 'OPEN'
                      ? 'bg-red-600 text-white'
                      : status === 'IN_PROGRESS'
                      ? 'bg-yellow-600 text-white'
                      : 'bg-green-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                } disabled:opacity-50`}
              >
                {status.replace('_', ' ')}
              </button>
            ))}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Status after reopening the issue
          </div>
        </div>

        {/* Unwaived By */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-white mb-2">
            Unwaived By <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={unwaivedBy}
            onChange={(e) => setUnwaivedBy(e.target.value)}
            placeholder="e.g., QC-Lead, PM-A, Designer-01"
            disabled={loading}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 disabled:opacity-50"
          />
          <div className="text-xs text-gray-500 mt-1">
            Who is reopening this waived issue (audited)
          </div>
        </div>

        {/* Unwaive Reason */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-white mb-2">
            Unwaive Reason <span className="text-red-400">*</span>
          </label>
          <textarea
            value={unwaivedReason}
            onChange={(e) => setUnwaivedReason(e.target.value)}
            placeholder="Explain why this issue needs to be reopened. What changed? Why can't the waiver stand?"
            disabled={loading}
            className="w-full h-24 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 resize-none disabled:opacity-50"
          />
          <div className={`text-xs mt-1 ${reasonColor}`}>
            {reasonLength}/{UNWAIVE_REASON_MIN_LENGTH} characters minimum
          </div>
        </div>

        {/* Type UNWAIVE Confirmation */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-white mb-2">
            Type <span className="font-mono bg-gray-800 px-2 py-0.5 rounded">UNWAIVE</span> to confirm
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type UNWAIVE"
            disabled={loading}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white font-mono placeholder-gray-500 focus:outline-none focus:border-gray-600 disabled:opacity-50"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({
              unwaivedBy: unwaivedBy.trim(),
              unwaivedReason: unwaivedReason.trim(),
              nextStatus,
            })}
            disabled={!canConfirm}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            {loading ? 'Processing...' : 'Confirm UNWAIVE'}
          </button>
        </div>

        {/* Audit Notice */}
        <div className="mt-4 p-3 bg-cyan-900/20 border border-cyan-700/30 rounded-lg">
          <div className="text-xs text-cyan-300">
            UNWAIVE is audited (who/why/when) and preserves the original WAIVE audit fields.
            The full WAIVE → UNWAIVE history will remain in the manifest chain.
          </div>
        </div>
      </div>
    </div>
  );
}

export default UnwaiveModal;
