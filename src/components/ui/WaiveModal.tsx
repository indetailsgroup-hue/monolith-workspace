/**
 * WaiveModal.tsx - Strict WAIVE Confirmation Modal
 *
 * WAIVE POLICY:
 * - User must type "WAIVE" to confirm
 * - User must provide waivedBy (who approved)
 * - User must provide waivedReason (min 8 chars)
 * - This ensures audit trail for all waivers
 *
 * DEFENSE-IN-DEPTH:
 * - UI validation (this modal)
 * - Service validation (TrustChainService.updateIssue)
 * Both must pass for waiver to succeed.
 */

import React, { useState, useMemo } from 'react';
import { WAIVE_REASON_MIN_LENGTH } from '../../core/issues/issueValidation';

// ============================================
// PROPS
// ============================================

interface WaiveModalProps {
  /** Issue code being waived */
  issueCode: string;

  /** Issue message for context */
  issueMessage?: string;

  /** Cancel callback */
  onCancel: () => void;

  /** Confirm callback with audit fields */
  onConfirm: (args: { waivedBy: string; waivedReason: string }) => void;

  /** Loading state (during submission) */
  loading?: boolean;
}

// ============================================
// COMPONENT
// ============================================

export function WaiveModal({
  issueCode,
  issueMessage,
  onCancel,
  onConfirm,
  loading = false,
}: WaiveModalProps) {
  const [typed, setTyped] = useState('');
  const [waivedBy, setWaivedBy] = useState('');
  const [waivedReason, setWaivedReason] = useState('');

  // Validation
  const isTypedValid = typed.trim().toUpperCase() === 'WAIVE';
  const isWaivedByValid = waivedBy.trim().length > 0;
  const isReasonValid = waivedReason.trim().length >= WAIVE_REASON_MIN_LENGTH;
  const canConfirm = isTypedValid && isWaivedByValid && isReasonValid && !loading;

  // Reason character count display
  const reasonLength = waivedReason.trim().length;
  const reasonColor = reasonLength >= WAIVE_REASON_MIN_LENGTH ? 'text-green-400' : 'text-gray-500';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="w-[520px] max-w-[92vw] bg-gray-900 border border-gray-700 rounded-xl p-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">WAIVE Issue</h3>
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
          <div className="font-mono text-orange-400 font-bold">{issueCode}</div>
          {issueMessage && (
            <div className="text-gray-300 text-sm mt-1">{issueMessage}</div>
          )}
        </div>

        <hr className="border-gray-700 my-4" />

        {/* Waived By */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-white mb-2">
            Waived By <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={waivedBy}
            onChange={(e) => setWaivedBy(e.target.value)}
            placeholder="e.g., QC-Lead, PM-A, Designer-01"
            disabled={loading}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 disabled:opacity-50"
          />
          <div className="text-xs text-gray-500 mt-1">
            Who approved this waiver (audited)
          </div>
        </div>

        {/* Waive Reason */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-white mb-2">
            Waive Reason <span className="text-red-400">*</span>
          </label>
          <textarea
            value={waivedReason}
            onChange={(e) => setWaivedReason(e.target.value)}
            placeholder="Explain why this issue is acceptable to waive. Be specific about the risk acceptance."
            disabled={loading}
            className="w-full h-24 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 resize-none disabled:opacity-50"
          />
          <div className={`text-xs mt-1 ${reasonColor}`}>
            {reasonLength}/{WAIVE_REASON_MIN_LENGTH} characters minimum
          </div>
        </div>

        {/* Type WAIVE Confirmation */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-white mb-2">
            Type <span className="font-mono bg-gray-800 px-2 py-0.5 rounded">WAIVE</span> to confirm
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type WAIVE"
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
              waivedBy: waivedBy.trim(),
              waivedReason: waivedReason.trim(),
            })}
            disabled={!canConfirm}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            {loading ? 'Processing...' : 'Confirm WAIVE'}
          </button>
        </div>

        {/* Audit Notice */}
        <div className="mt-4 p-3 bg-orange-900/20 border border-orange-700/30 rounded-lg">
          <div className="text-xs text-orange-300">
            WAIVE is audited (who/why/when) and will remain in the manifest chain permanently.
            This action cannot be undone but the waiver details are fully traceable.
          </div>
        </div>
      </div>
    </div>
  );
}

export default WaiveModal;
