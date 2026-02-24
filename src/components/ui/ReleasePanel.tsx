/**
 * ReleasePanel.tsx - Spec State Control Panel
 *
 * UI component for managing spec state transitions:
 * - Freeze (DRAFT → FROZEN)
 * - Release (FROZEN → RELEASED)
 * - Export Bundle (RELEASED only)
 *
 * NORTH STAR: Export requires RELEASED state
 */

import React, { useEffect, useCallback } from 'react';
import type { SpecState } from '../../core/spec/specState';
import type { ExportArtifact } from '../../core/export/exportPipeline';
import { getStateColor, getStateIcon } from './specActions';

// ============================================
// TYPES
// ============================================

export interface SnapshotData {
  selectionPreview: any[];
  selectionIds: string[];
  activeId: string | null;
  collision: any | null;
  runGatePerCabinet: (cab: any) => { ok: boolean; issues: any[] };
  commitAll: (cabs: any[]) => void;
}

export interface ReleasePanelProps {
  /** Job ID */
  jobId: string;

  /** Current spec state */
  specState: SpecState;

  /** HEAD hash (truncated for display) */
  headHash: string | null;

  /** Loading state */
  loading: boolean;

  /** Error message */
  error: string | null;

  /** Get current selection snapshot */
  getSnapshot: () => SnapshotData;

  /** Generate export artifacts */
  generateExports: () => Promise<ExportArtifact[]>;

  /** Freeze callback */
  onFreeze: (snapshot: SnapshotData) => Promise<boolean>;

  /** Release callback */
  onRelease: (snapshot: SnapshotData) => Promise<boolean>;

  /** Unfreeze callback */
  onUnfreeze: (snapshot: SnapshotData) => Promise<boolean>;

  /** Export callback */
  onExport: (
    generateExports: () => Promise<ExportArtifact[]>
  ) => Promise<{ blob: Blob; filename: string } | null>;

  /** Refresh callback */
  onRefresh: () => Promise<void>;

  /** Optional className */
  className?: string;
}

// ============================================
// COMPONENT
// ============================================

export function ReleasePanel({
  jobId,
  specState,
  headHash,
  loading,
  error,
  getSnapshot,
  generateExports,
  onFreeze,
  onRelease,
  onUnfreeze,
  onExport,
  onRefresh,
  className = '',
}: ReleasePanelProps) {
  // Refresh on mount
  useEffect(() => {
    onRefresh();
  }, []);

  // Handlers
  const handleFreeze = useCallback(async () => {
    const snapshot = getSnapshot();
    await onFreeze(snapshot);
  }, [getSnapshot, onFreeze]);

  const handleRelease = useCallback(async () => {
    const snapshot = getSnapshot();
    await onRelease(snapshot);
  }, [getSnapshot, onRelease]);

  const handleUnfreeze = useCallback(async () => {
    const snapshot = getSnapshot();
    await onUnfreeze(snapshot);
  }, [getSnapshot, onUnfreeze]);

  const handleExport = useCallback(async () => {
    const result = await onExport(generateExports);
    if (result) {
      // Download the bundle
      downloadBlob(result.blob, result.filename);
    }
  }, [onExport, generateExports]);

  return (
    <div
      className={`
        p-4 rounded-xl border border-white/10
        bg-gradient-to-b from-gray-800/50 to-gray-900/50
        ${className}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Release Control</h3>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ⟳ Refresh
        </button>
      </div>

      {/* Status */}
      <div className="space-y-2 mb-4">
        {/* Spec State Badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">State:</span>
          <span
            className={`
              text-xs px-2 py-1 rounded-full border
              ${getStateColor(specState)}
            `}
          >
            {getStateIcon(specState)} {specState}
          </span>
        </div>

        {/* HEAD Hash */}
        {headHash && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">HEAD:</span>
            <span className="text-xs font-mono text-gray-300">
              {headHash.slice(0, 16)}...
            </span>
          </div>
        )}

        {/* Job ID */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Job:</span>
          <span className="text-xs font-mono text-gray-300">{jobId}</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-2 rounded bg-red-900/30 border border-red-500/50">
          <span className="text-xs text-red-300">{error}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {/* Freeze Button */}
        {specState === 'DRAFT' && (
          <button
            onClick={handleFreeze}
            disabled={loading}
            className="
              px-4 py-2 rounded-lg text-sm font-medium
              bg-amber-600/20 hover:bg-amber-600/40
              text-amber-300 border border-amber-500/50
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
            "
          >
            ❄️ Freeze
          </button>
        )}

        {/* Unfreeze Button */}
        {specState === 'FROZEN' && (
          <button
            onClick={handleUnfreeze}
            disabled={loading}
            className="
              px-4 py-2 rounded-lg text-sm font-medium
              bg-blue-600/20 hover:bg-blue-600/40
              text-blue-300 border border-blue-500/50
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
            "
          >
            ↩️ Unfreeze
          </button>
        )}

        {/* Release Button */}
        {specState === 'FROZEN' && (
          <button
            onClick={handleRelease}
            disabled={loading}
            className="
              px-4 py-2 rounded-lg text-sm font-medium
              bg-green-600/20 hover:bg-green-600/40
              text-green-300 border border-green-500/50
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
            "
          >
            ✅ Release
          </button>
        )}

        {/* Export Button */}
        <button
          onClick={handleExport}
          disabled={loading || specState !== 'RELEASED'}
          className={`
            px-4 py-2 rounded-lg text-sm font-medium
            transition-colors
            ${
              specState === 'RELEASED'
                ? 'bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 border border-cyan-500/50'
                : 'bg-gray-700/30 text-gray-500 border border-gray-600/50 cursor-not-allowed'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
          title={specState !== 'RELEASED' ? 'Export requires RELEASED state' : ''}
        >
          📦 Export Bundle
        </button>
      </div>

      {/* Info */}
      {specState !== 'RELEASED' && (
        <div className="mt-3 text-xs text-gray-500">
          {specState === 'DRAFT' && '• Freeze to lock geometry for review'}
          {specState === 'FROZEN' && '• Release to enable export to factory'}
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
          <span className="animate-spin">⏳</span>
          Processing...
        </div>
      )}
    </div>
  );
}

// ============================================
// HELPERS
// ============================================

/**
 * Download blob as file
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default ReleasePanel;
