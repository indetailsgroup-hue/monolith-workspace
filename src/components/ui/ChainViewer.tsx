/**
 * ChainViewer.tsx - Manifest Chain Timeline UI
 *
 * FEATURES:
 * - Timeline view showing all manifests in chain
 * - Click to select and view details
 * - Diff view showing changes between versions
 * - Navigation with keyboard (up/down arrows)
 * - Copy manifest JSON
 *
 * NORTH STAR: Full audit trail visibility
 */

import React, { useEffect, useCallback, useMemo } from 'react';
import type { ChainState } from '../../core/store/useChainStore';
import {
  selectManifest,
  selectDiff,
  selectIndex,
  selectIsAtHead,
  selectIsAtGenesis,
} from '../../core/store/useChainStore';
import {
  hasDiffChanges,
  formatDiffSummary,
  type ManifestDiff,
} from '../../core/manifest/manifestDiff';
import type { SignedJobManifest } from '../../core/trust/manifestChainTypes';

// ============================================
// PROPS
// ============================================

export interface ChainViewerProps {
  /** Chain store state (from useStore hook) */
  state: ChainState;
  /** Optional className */
  className?: string;
}

// ============================================
// SUB-COMPONENTS
// ============================================

interface TimelineItemProps {
  manifest: SignedJobManifest;
  index: number;
  isHead: boolean;
  isGenesis: boolean;
  isSelected: boolean;
  onClick: () => void;
}

function TimelineItem({
  manifest,
  index,
  isHead,
  isGenesis,
  isSelected,
  onClick,
}: TimelineItemProps) {
  const trust = manifest.signedTrust?.trust;
  const gateOk = !!trust?.gate?.ok;
  const hasExports = (manifest.exports?.length ?? 0) > 0;

  // Format timestamp
  const timestamp = manifest.createdIso
    ? new Date(manifest.createdIso).toLocaleString()
    : 'Unknown';

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left p-3 rounded-lg border transition-all
        ${
          isSelected
            ? 'bg-blue-900/30 border-blue-500'
            : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
        }
      `}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {/* Index badge */}
          <span className="text-xs font-mono text-gray-500">#{index}</span>

          {/* HEAD badge */}
          {isHead && (
            <span className="text-xs px-1.5 py-0.5 bg-green-700 text-green-100 rounded">
              HEAD
            </span>
          )}

          {/* Genesis badge */}
          {isGenesis && (
            <span className="text-xs px-1.5 py-0.5 bg-purple-700 text-purple-100 rounded">
              GENESIS
            </span>
          )}
        </div>

        {/* Gate status */}
        <span
          className={`text-xs px-1.5 py-0.5 rounded ${
            gateOk ? 'bg-green-700/50 text-green-200' : 'bg-red-700/50 text-red-200'
          }`}
        >
          {gateOk ? 'GATE OK' : 'BLOCKED'}
        </span>
      </div>

      {/* Hash */}
      <div className="font-mono text-xs text-gray-400 mb-1">
        {manifest.manifestHashHex.slice(0, 16)}...
      </div>

      {/* Timestamp */}
      <div className="text-xs text-gray-500">{timestamp}</div>

      {/* Exports indicator */}
      {hasExports && (
        <div className="text-xs text-cyan-400 mt-1">
          {manifest.exports?.length} export(s)
        </div>
      )}
    </button>
  );
}

interface DiffViewProps {
  diff: ManifestDiff | null;
}

function DiffView({ diff }: DiffViewProps) {
  if (!diff) {
    return (
      <div className="text-gray-500 text-sm italic">Select a manifest to view diff</div>
    );
  }

  if (!hasDiffChanges(diff)) {
    return <div className="text-gray-500 text-sm italic">No changes from previous</div>;
  }

  return (
    <div className="space-y-3">
      {/* Selection changes */}
      {diff.addedSelectionIds.length > 0 && (
        <div>
          <div className="text-xs text-green-400 mb-1">
            + {diff.addedSelectionIds.length} selected
          </div>
          <div className="text-xs text-gray-500 font-mono">
            {diff.addedSelectionIds.slice(0, 3).join(', ')}
            {diff.addedSelectionIds.length > 3 && '...'}
          </div>
        </div>
      )}

      {diff.removedSelectionIds.length > 0 && (
        <div>
          <div className="text-xs text-red-400 mb-1">
            - {diff.removedSelectionIds.length} deselected
          </div>
          <div className="text-xs text-gray-500 font-mono">
            {diff.removedSelectionIds.slice(0, 3).join(', ')}
            {diff.removedSelectionIds.length > 3 && '...'}
          </div>
        </div>
      )}

      {/* Gate change */}
      {diff.gateOkChanged && (
        <div className="text-xs">
          <span className="text-gray-400">Gate: </span>
          <span className={diff.gateOkChanged.from ? 'text-green-400' : 'text-red-400'}>
            {diff.gateOkChanged.from ? 'OK' : 'BLOCKED'}
          </span>
          <span className="text-gray-500"> → </span>
          <span className={diff.gateOkChanged.to ? 'text-green-400' : 'text-red-400'}>
            {diff.gateOkChanged.to ? 'OK' : 'BLOCKED'}
          </span>
        </div>
      )}

      {/* Exports added */}
      {diff.exportAdded.length > 0 && (
        <div>
          <div className="text-xs text-cyan-400 mb-1">
            + {diff.exportAdded.length} export(s)
          </div>
          {diff.exportAdded.map((e, i) => (
            <div key={i} className="text-xs text-gray-500 font-mono">
              [{e.kind}] {e.filename}
            </div>
          ))}
        </div>
      )}

      {/* Collision change */}
      {diff.collisionBlockedChanged && (
        <div className="text-xs">
          <span className="text-gray-400">Collision: </span>
          <span className={diff.collisionBlockedChanged.to ? 'text-red-400' : 'text-green-400'}>
            {diff.collisionBlockedChanged.to ? 'BLOCKED' : 'OK'}
          </span>
        </div>
      )}

      {/* Error count change */}
      {diff.errorCountChanged && (
        <div className="text-xs">
          <span className="text-gray-400">Errors: </span>
          <span className="text-red-400">{diff.errorCountChanged.from}</span>
          <span className="text-gray-500"> → </span>
          <span className="text-red-400">{diff.errorCountChanged.to}</span>
        </div>
      )}
    </div>
  );
}

interface ManifestDetailProps {
  manifest: SignedJobManifest | null;
  onCopyJson: () => void;
}

function ManifestDetail({ manifest, onCopyJson }: ManifestDetailProps) {
  if (!manifest) {
    return (
      <div className="text-gray-500 text-sm italic">
        Select a manifest to view details
      </div>
    );
  }

  const trust = manifest.signedTrust?.trust;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-white">Manifest Details</h4>
        <button
          onClick={onCopyJson}
          className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded"
        >
          Copy JSON
        </button>
      </div>

      {/* Hash */}
      <div>
        <div className="text-xs text-gray-500 mb-1">Manifest Hash</div>
        <div className="font-mono text-xs text-gray-300 break-all">
          {manifest.manifestHashHex}
        </div>
      </div>

      {/* Prev Hash */}
      <div>
        <div className="text-xs text-gray-500 mb-1">Previous Hash</div>
        <div className="font-mono text-xs text-gray-300 break-all">
          {manifest.prevManifestHashHex ?? '(genesis)'}
        </div>
      </div>

      {/* Job ID */}
      <div>
        <div className="text-xs text-gray-500 mb-1">Job ID</div>
        <div className="font-mono text-xs text-gray-300">{manifest.jobId}</div>
      </div>

      {/* Created */}
      <div>
        <div className="text-xs text-gray-500 mb-1">Created</div>
        <div className="text-xs text-gray-300">
          {manifest.createdIso
            ? new Date(manifest.createdIso).toLocaleString()
            : 'Unknown'}
        </div>
        {manifest.createdBy && (
          <div className="text-xs text-gray-500">by {manifest.createdBy}</div>
        )}
      </div>

      {/* Gate Summary */}
      {trust?.gate && (
        <div>
          <div className="text-xs text-gray-500 mb-1">Gate Status</div>
          <div
            className={`text-xs ${trust.gate.ok ? 'text-green-400' : 'text-red-400'}`}
          >
            {trust.gate.ok ? 'OK' : 'BLOCKED'}
          </div>
          {trust.gate.errorCount !== undefined && trust.gate.errorCount > 0 && (
            <div className="text-xs text-red-400">
              {trust.gate.errorCount} error(s)
            </div>
          )}
          {trust.gate.warningCount !== undefined && trust.gate.warningCount > 0 && (
            <div className="text-xs text-amber-400">
              {trust.gate.warningCount} warning(s)
            </div>
          )}
        </div>
      )}

      {/* Collision Summary */}
      {trust?.collision && (
        <div>
          <div className="text-xs text-gray-500 mb-1">Collision Status</div>
          <div
            className={`text-xs ${
              trust.collision.blocked ? 'text-red-400' : 'text-green-400'
            }`}
          >
            {trust.collision.blocked ? 'BLOCKED' : 'OK'}
          </div>
          {trust.collision.pairCount !== undefined && trust.collision.pairCount > 0 && (
            <div className="text-xs text-gray-400">
              {trust.collision.pairCount} collision pair(s)
            </div>
          )}
        </div>
      )}

      {/* Exports */}
      {manifest.exports && manifest.exports.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-1">
            Exports ({manifest.exports.length})
          </div>
          <div className="space-y-1">
            {manifest.exports.map((e, i) => (
              <div key={i} className="text-xs">
                <span className="text-cyan-400">[{e.kind}]</span>{' '}
                <span className="text-gray-300">{e.filename}</span>
                <div className="text-gray-500 font-mono text-xs pl-2">
                  {e.contentHashHex.slice(0, 24)}...
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Keys */}
      <div>
        <div className="text-xs text-gray-500 mb-1">Signing Keys</div>
        <div className="text-xs text-gray-400">
          Manifest: {manifest.manifestKeyId ?? 'N/A'}
        </div>
        <div className="text-xs text-gray-400">
          Approval: {manifest.signedTrust?.keyId ?? 'N/A'}
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ChainViewer({ state, className = '' }: ChainViewerProps) {
  const { loading, error, chain, selectedHash, stats, reachedGenesis, select, selectPrevious, selectNext } = state;

  // Derived state using selectors
  const selectedManifest = useMemo(() => selectManifest(state), [state]);
  const diff = useMemo(() => selectDiff(state), [state]);
  const selectedIndex = useMemo(() => selectIndex(state), [state]);
  const isAtHead = useMemo(() => selectIsAtHead(state), [state]);
  const isAtGenesis = useMemo(() => selectIsAtGenesis(state), [state]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        selectNext();
      } else if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        selectPrevious();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectNext, selectPrevious]);

  // Copy JSON handler
  const handleCopyJson = useCallback(() => {
    if (selectedManifest) {
      navigator.clipboard.writeText(JSON.stringify(selectedManifest, null, 2));
    }
  }, [selectedManifest]);

  // Loading state
  if (loading) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="text-gray-400 animate-pulse">Loading chain...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  // Empty state
  if (chain.length === 0) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="text-gray-500 italic">No manifests in chain</div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header / Stats */}
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-lg font-medium text-white mb-2">Manifest Chain</h3>
        {stats && (
          <div className="flex flex-wrap gap-3 text-xs text-gray-400">
            <span>
              {stats.length} manifest{stats.length !== 1 ? 's' : ''}
            </span>
            <span>{stats.totalExports} export(s)</span>
            <span className="text-green-400">{stats.gateOkCount} OK</span>
            {stats.gateBlockedCount > 0 && (
              <span className="text-red-400">{stats.gateBlockedCount} blocked</span>
            )}
            {!reachedGenesis && (
              <span className="text-amber-400">(truncated)</span>
            )}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Timeline (left) */}
        <div className="w-1/3 border-r border-gray-700 overflow-y-auto p-3 space-y-2">
          {chain.map((manifest, i) => (
            <TimelineItem
              key={manifest.manifestHashHex}
              manifest={manifest}
              index={i}
              isHead={i === 0}
              isGenesis={reachedGenesis && i === chain.length - 1}
              isSelected={manifest.manifestHashHex === selectedHash}
              onClick={() => select(manifest.manifestHashHex)}
            />
          ))}
        </div>

        {/* Detail panel (right) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Navigation hint */}
          <div className="text-xs text-gray-600">
            Use ↑/↓ or j/k to navigate
          </div>

          {/* Diff section */}
          <div>
            <h4 className="text-sm font-medium text-white mb-2">
              Changes from Previous
            </h4>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <DiffView diff={diff} />
            </div>
          </div>

          {/* Detail section */}
          <div className="bg-gray-800/50 rounded-lg p-4">
            <ManifestDetail
              manifest={selectedManifest}
              onCopyJson={handleCopyJson}
            />
          </div>
        </div>
      </div>

      {/* Footer navigation */}
      <div className="p-3 border-t border-gray-700 flex items-center justify-between text-xs">
        <button
          onClick={selectNext}
          disabled={isAtHead}
          className={`px-3 py-1.5 rounded ${
            isAtHead
              ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
        >
          ← Newer
        </button>

        <span className="text-gray-500">
          {selectedIndex + 1} / {chain.length}
        </span>

        <button
          onClick={selectPrevious}
          disabled={isAtGenesis}
          className={`px-3 py-1.5 rounded ${
            isAtGenesis
              ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
        >
          Older →
        </button>
      </div>
    </div>
  );
}

export default ChainViewer;
