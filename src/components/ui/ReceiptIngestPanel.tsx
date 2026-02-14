/**
 * ReceiptIngestPanel.tsx - Factory Receipt Upload & Append
 *
 * FEATURES:
 * - Paste JSON receipt
 * - Upload .json file
 * - Drag & drop support
 * - Parse and validate structure
 * - Verify signature
 * - Append to manifest chain
 * - Callback to refresh timeline
 */

import React, { useState, useCallback } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { ReceiptIngestState } from '../../core/receiptIngest/receiptIngestStore';
import {
  selectCanVerify,
  selectCanAppend,
  selectIsComplete,
  selectCanFork,
  selectForkComplete,
} from '../../core/receiptIngest/receiptIngestStore';
import type { ApprovalSigner } from '../../core/trust/approvalSigner';

// ============================================
// CONSTANTS
// ============================================

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

// ============================================
// PROPS
// ============================================

interface ReceiptIngestPanelProps {
  /** Receipt ingest store */
  store: UseBoundStore<StoreApi<ReceiptIngestState>>;

  /** Callback when receipt is appended (to refresh timeline) */
  onAppended?: () => void;

  /** Callback when revision is forked from REJECTED receipt */
  onForked?: (newJobId: string) => void;

  /** Callback to navigate to a different job (for "Open new revision") */
  onOpenJob?: (newJobId: string) => void;

  /** Approval signer for fork operation (required for fork) */
  approvalSigner?: ApprovalSigner;

  /** Optional class name */
  className?: string;
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ReceiptIngestPanel({
  store,
  onAppended,
  onForked,
  onOpenJob,
  approvalSigner,
  className = '',
}: ReceiptIngestPanelProps) {
  const state = store();
  const [dragOver, setDragOver] = useState(false);

  const canVerify = selectCanVerify(state);
  const canAppend = selectCanAppend(state);
  const isComplete = selectIsComplete(state);
  const canFork = selectCanFork(state);
  const forkComplete = selectForkComplete(state);

  // Check if this is a REJECTED receipt
  const isRejected = state.parsed?.receipt.verdict === 'REJECTED';

  // File upload handler
  const handleFile = useCallback(
    async (file: File) => {
      state.setError(null);

      // Size check
      if (file.size > MAX_FILE_SIZE_BYTES) {
        state.setError('File too large (max 2MB)');
        return;
      }

      // Type check
      const nameOk = file.name.toLowerCase().endsWith('.json');
      const mimeOk =
        !file.type || file.type === 'application/json' || file.type === 'text/json';

      if (!nameOk && !mimeOk) {
        state.setError('Unsupported file type. Please upload a .json file.');
        return;
      }

      try {
        const text = await file.text();
        state.setRawText(text);
        state.parse();
      } catch (e) {
        state.setError(e instanceof Error ? e.message : 'Failed to read file');
      }
    },
    [state]
  );

  // Drag & drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        await handleFile(file);
      }
    },
    [handleFile]
  );

  // Append handler with callback
  const handleAppend = useCallback(async () => {
    await state.append();
    // Check if append was successful and call onAppended
    const newState = store.getState();
    if (newState.appendedHeadHash && onAppended) {
      onAppended();
    }
  }, [state, store, onAppended]);

  // Fork handler with callback
  const handleFork = useCallback(async () => {
    if (!approvalSigner) {
      state.setError('No approval signer provided. Cannot fork.');
      return;
    }
    await state.forkRevision({ approvalSigner });
    // Check if fork was successful and call onForked
    const newState = store.getState();
    if (newState.forkResult?.ok && newState.forkResult.newJobId && onForked) {
      onForked(newState.forkResult.newJobId);
    }
  }, [state, store, onForked, approvalSigner]);

  // Open new revision handler
  const handleOpenNewRevision = useCallback(() => {
    const newJobId = state.forkResult?.newJobId;
    if (newJobId && onOpenJob) {
      onOpenJob(newJobId);
    }
  }, [state.forkResult?.newJobId, onOpenJob]);

  return (
    <div
      className={`bg-gray-900 rounded-xl border transition-colors ${
        dragOver
          ? 'border-green-500 bg-green-900/10'
          : 'border-gray-700'
      } ${className}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">
              Upload Factory Receipt
            </h3>
            <div className="text-xs text-gray-500 mt-1">Job: {state.jobId}</div>
          </div>

          {/* Upload Button */}
          <label className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg cursor-pointer transition-colors">
            Upload .json
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  await handleFile(file);
                }
                e.currentTarget.value = '';
              }}
            />
          </label>
        </div>

        {/* Drop zone hint */}
        {dragOver && (
          <div className="mt-3 p-4 border-2 border-dashed border-green-500 rounded-lg text-center">
            <span className="text-green-400">Drop .json file here</span>
          </div>
        )}
      </div>

      {/* Error Display */}
      {(state.error || state.parseError) && (
        <div className="mx-4 mt-4 p-3 bg-red-900/30 border border-red-700 rounded-lg">
          <div className="text-red-400 text-sm">
            {state.error || state.parseError}
          </div>
        </div>
      )}

      {/* Text Area */}
      <div className="p-4">
        <div className="text-sm text-gray-400 mb-2">
          Paste SignedFactoryReceipt JSON or drop a file:
        </div>
        <textarea
          value={state.rawText}
          onChange={(e) => state.setRawText(e.target.value)}
          placeholder='{"receipt":{"version":"1.0",...},"receiptHashHex":"...","signatureHex":"...","keyId":"...","algo":"Ed25519"}'
          className="w-full h-40 p-3 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs font-mono resize-none focus:outline-none focus:border-gray-600"
        />
      </div>

      {/* Status Display */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-4 text-xs">
          {/* Parse Status */}
          <StatusBadge
            label="Parsed"
            ok={!!state.parsed}
            pending={!state.parsed && !state.parseError}
          />

          {/* Verdict Badge (show after parse) */}
          {state.parsed && (
            <VerdictBadge verdict={state.parsed.receipt.verdict} />
          )}

          {/* Verify Status */}
          <StatusBadge
            label="Verified"
            ok={state.verification?.ok === true}
            error={state.verification?.ok === false}
            pending={!state.verification}
            reason={state.verification?.ok === false ? state.verification.reason : undefined}
          />

          {/* Append Status */}
          <StatusBadge
            label="Appended"
            ok={!!state.appendedHeadHash}
            pending={!state.appendedHeadHash}
          />

          {/* Fork Status (for REJECTED) */}
          {isRejected && (
            <StatusBadge
              label="Forked"
              ok={forkComplete}
              pending={!forkComplete}
            />
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-gray-700 flex items-center gap-3">
        <button
          disabled={state.loading || !state.rawText.trim()}
          onClick={() => state.parse()}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
        >
          Parse
        </button>

        <button
          disabled={!canVerify}
          onClick={() => state.verify()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
        >
          Verify Signature
        </button>

        <button
          disabled={!canAppend}
          onClick={handleAppend}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
        >
          Append to Chain
        </button>

        {/* Fork button (only for REJECTED) */}
        {isRejected && (
          <button
            disabled={!canFork || !approvalSigner}
            onClick={handleFork}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
            title={!approvalSigner ? 'Approval signer required' : 'Create new revision from this rejected receipt'}
          >
            Fork Revision
          </button>
        )}

        <div className="flex-1" />

        <button
          disabled={state.loading}
          onClick={() => state.reset()}
          className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Append Success Message */}
      {isComplete && (
        <div className="mx-4 mb-4 p-3 bg-green-900/30 border border-green-700 rounded-lg">
          <div className="text-green-400 text-sm flex items-center gap-2">
            <span>Receipt appended successfully!</span>
          </div>
          <div className="text-xs text-gray-400 mt-1 font-mono">
            New HEAD: {state.appendedHeadHash?.slice(0, 20)}...
          </div>
        </div>
      )}

      {/* Fork Success Message */}
      {forkComplete && state.forkResult && (
        <div className="mx-4 mb-4 p-3 bg-orange-900/30 border border-orange-700 rounded-lg">
          <div className="text-orange-400 text-sm flex items-center justify-between">
            <span>Revision forked successfully!</span>
            {/* Open new revision button */}
            {onOpenJob && state.forkResult.newJobId && (
              <button
                onClick={handleOpenNewRevision}
                className="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white text-xs rounded-lg transition-colors"
              >
                Open New Revision
              </button>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-2 space-y-1">
            <div>
              New Job ID: <span className="font-mono text-orange-300">{state.forkResult.newJobId}</span>
            </div>
            <div>
              Revision: <span className="text-orange-300">R{state.forkResult.newRevisionNumber}</span>
            </div>
            <div className="font-mono text-gray-500">
              Genesis: {state.forkResult.genesisHash?.slice(0, 20)}...
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {state.loading && (
        <div className="absolute inset-0 bg-gray-900/50 flex items-center justify-center rounded-xl">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-500 border-t-transparent" />
        </div>
      )}
    </div>
  );
}

// ============================================
// STATUS BADGE
// ============================================

function StatusBadge({
  label,
  ok,
  error,
  pending,
  reason,
}: {
  label: string;
  ok?: boolean;
  error?: boolean;
  pending?: boolean;
  reason?: string;
}) {
  let colorClass = 'bg-gray-700 text-gray-400';
  let icon = '○';

  if (ok) {
    colorClass = 'bg-green-900/30 text-green-400';
    icon = '✓';
  } else if (error) {
    colorClass = 'bg-red-900/30 text-red-400';
    icon = '✗';
  }

  return (
    <div className={`px-2 py-1 rounded ${colorClass}`} title={reason}>
      <span className="mr-1">{icon}</span>
      {label}
    </div>
  );
}

// ============================================
// VERDICT BADGE
// ============================================

function VerdictBadge({ verdict }: { verdict: string }) {
  if (verdict === 'ACCEPTED') {
    return (
      <div className="px-2 py-1 rounded bg-green-900/50 text-green-400 font-semibold">
        ACCEPTED
      </div>
    );
  }

  if (verdict === 'REJECTED') {
    return (
      <div className="px-2 py-1 rounded bg-red-900/50 text-red-400 font-semibold">
        REJECTED
      </div>
    );
  }

  return (
    <div className="px-2 py-1 rounded bg-gray-700 text-gray-400">
      {verdict}
    </div>
  );
}

export default ReceiptIngestPanel;
