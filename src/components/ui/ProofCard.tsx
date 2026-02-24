/**
 * ProofCard - P12 Authority Proof Display
 *
 * Read-only card showing proof bundle for dispute resolution:
 * - State: Current authoritative state with revision hashes
 * - Verify: Most recent verification result
 * - Export: Most recent successful export
 * - canExport: Current export eligibility
 *
 * Can be copied/screenshot for legal defensibility.
 *
 * @version 0.12.12
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  RefreshCw,
  Package,
  FileCheck,
  Clock,
  Hash,
} from 'lucide-react';
import { getProofBundle, type ProofBundle } from '../../core/api/stateApi';
import { useProjectStore } from '../../core/store/useProjectStore';

// ============================================
// Types
// ============================================

interface ProofCardProps {
  className?: string;
  compact?: boolean;
}

// ============================================
// Component
// ============================================

export function ProofCard({ className = '', compact = false }: ProofCardProps) {
  const [proof, setProof] = useState<ProofBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const projectId = useProjectStore((s) => s.metadata?.id);

  // Fetch proof bundle
  const fetchProof = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      const result = await getProofBundle(projectId);
      setProof(result);
    } catch (error) {
      console.error('[ProofCard] Failed to fetch proof:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Initial fetch
  useEffect(() => {
    fetchProof();
  }, [fetchProof]);

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    if (!proof) return;

    try {
      await navigator.clipboard.writeText(JSON.stringify(proof, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('[ProofCard] Failed to copy:', error);
    }
  }, [proof]);

  // Render loading state
  if (loading && !proof) {
    return (
      <div className={`bg-gray-800/50 rounded-lg p-4 ${className}`}>
        <div className="flex items-center gap-2 text-gray-400">
          <RefreshCw size={16} className="animate-spin" />
          <span className="text-sm">Loading proof...</span>
        </div>
      </div>
    );
  }

  // Render no project state
  if (!projectId) {
    return (
      <div className={`bg-gray-800/50 rounded-lg p-4 ${className}`}>
        <div className="flex items-center gap-2 text-gray-500">
          <Shield size={16} />
          <span className="text-sm">No project loaded</span>
        </div>
      </div>
    );
  }

  // Render error state
  if (proof && !proof.ok) {
    return (
      <div className={`bg-red-900/20 border border-red-500/30 rounded-lg p-4 ${className}`}>
        <div className="flex items-center gap-2 text-red-400">
          <XCircle size={16} />
          <span className="text-sm">Failed to load proof: {proof.error}</span>
        </div>
      </div>
    );
  }

  if (!proof) return null;

  // State color
  const stateColors: Record<string, string> = {
    DRAFT: 'text-green-400 bg-green-500/10 border-green-500/30',
    FROZEN: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    RELEASED: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  };

  // Verify verdict icons
  const verdictIcons: Record<string, JSX.Element> = {
    PASS: <CheckCircle2 size={14} className="text-green-400" />,
    PASS_WITH_WARN: <AlertTriangle size={14} className="text-amber-400" />,
    FAIL: <XCircle size={14} className="text-red-400" />,
  };

  // Format hash for display
  const formatHash = (hash?: string) => {
    if (!hash) return '—';
    return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
  };

  // Format timestamp
  const formatTime = (iso?: string) => {
    if (!iso) return '—';
    const date = new Date(iso);
    return date.toLocaleString('th-TH', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  };

  // Compact view
  if (compact) {
    return (
      <div
        className={`flex items-center gap-3 px-3 py-2 rounded-lg border bg-gray-800/50 border-gray-700/50 ${className}`}
        title="Click to view full proof"
      >
        <Shield size={14} className="text-purple-400" />
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded border ${stateColors[proof.state.specState]}`}
        >
          {proof.state.specState}
        </span>
        {proof.state.revisionId && (
          <span className="text-[10px] font-mono text-gray-500">
            {proof.state.revisionId.slice(0, 12)}
          </span>
        )}
        {proof.canExport && (
          <span title="Can Export">
            <CheckCircle2 size={12} className="text-green-400" />
          </span>
        )}
      </div>
    );
  }

  // Full view
  return (
    <div className={`bg-gray-800/50 border border-gray-700/50 rounded-lg ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-purple-400" />
          <span className="font-medium text-white">Authority Proof</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchProof}
            disabled={loading}
            className="p-1.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors"
            title="Copy JSON"
          >
            {copied ? (
              <CheckCircle2 size={14} className="text-green-400" />
            ) : (
              <Copy size={14} />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* State Section */}
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
            <Package size={12} />
            <span>STATE</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-1 text-xs font-semibold rounded border ${stateColors[proof.state.specState]}`}
              >
                {proof.state.specState}
              </span>
              {proof.canExport ? (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <CheckCircle2 size={12} />
                  Can Export
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <XCircle size={12} />
                  Cannot Export
                </span>
              )}
            </div>

            {proof.state.revisionId && (
              <div className="flex items-center gap-2 text-xs">
                <Hash size={12} className="text-gray-500" />
                <span className="text-gray-400">Revision:</span>
                <code className="font-mono text-gray-300 bg-gray-900/50 px-1 rounded">
                  {formatHash(proof.state.revisionId)}
                </code>
              </div>
            )}

            {proof.state.manifestSha256 && (
              <div className="flex items-center gap-2 text-xs">
                <Hash size={12} className="text-gray-500" />
                <span className="text-gray-400">Manifest:</span>
                <code className="font-mono text-gray-300 bg-gray-900/50 px-1 rounded">
                  {formatHash(proof.state.manifestSha256)}
                </code>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Clock size={12} />
              <span>Updated: {formatTime(proof.state.updatedAt)}</span>
            </div>
          </div>
        </div>

        {/* Verify Section */}
        {proof.latestVerify && (
          <div>
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
              <FileCheck size={12} />
              <span>LATEST VERIFY</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded bg-gray-900/30">
              {verdictIcons[proof.latestVerify.verdict]}
              <span className="text-sm font-medium text-white">
                {proof.latestVerify.verdict}
              </span>
              {proof.latestVerify.code && (
                <code className="text-xs text-gray-400">{proof.latestVerify.code}</code>
              )}
              <span className="ml-auto text-xs text-gray-500">
                {formatTime(proof.latestVerify.at)}
              </span>
            </div>
            {proof.latestVerify.summary && (
              <p className="mt-1 text-xs text-gray-400">{proof.latestVerify.summary}</p>
            )}
          </div>
        )}

        {/* Export Section */}
        {proof.latestExport && (
          <div>
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
              <Package size={12} />
              <span>LATEST EXPORT</span>
            </div>
            <div className="p-2 rounded bg-gray-900/30 space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 size={14} className="text-green-400" />
                <span className="text-white">{proof.latestExport.artifactName || 'Export'}</span>
                {proof.latestExport.dialect && (
                  <span className="px-1.5 py-0.5 text-[10px] bg-gray-700 rounded text-gray-300">
                    {proof.latestExport.dialect}
                  </span>
                )}
              </div>
              {proof.latestExport.artifactSha256 && (
                <div className="flex items-center gap-2 text-xs">
                  <Hash size={10} className="text-gray-500" />
                  <code className="font-mono text-gray-400">
                    {formatHash(proof.latestExport.artifactSha256)}
                  </code>
                </div>
              )}
              <div className="text-xs text-gray-500">
                {formatTime(proof.latestExport.at)}
              </div>
            </div>
          </div>
        )}

        {/* Warnings Section */}
        {proof.warnings && proof.warnings.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-xs text-amber-500 mb-2">
              <AlertTriangle size={12} />
              <span>WARNINGS ({proof.warnings.length})</span>
            </div>
            <div className="space-y-1">
              {proof.warnings.map((w, i) => (
                <div
                  key={i}
                  className="p-2 rounded bg-amber-900/20 border border-amber-500/30 text-xs"
                >
                  <code className="text-amber-400 font-mono">{w.code}</code>
                  <p className="text-amber-200/80 mt-0.5">{w.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fetched timestamp */}
        <div className="pt-2 border-t border-gray-700/30 text-[10px] text-gray-500 flex items-center justify-between">
          <span>Fetched: {formatTime(proof.fetchedAt)} | Job: {proof.jobId}</span>
          {proof.version && (
            <code className="text-gray-600 font-mono">{proof.version}</code>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProofCard;
