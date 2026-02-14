/**
 * OneClickFactoryPackage.tsx - OneClick Release & Export UI
 *
 * Complete workflow for factory package:
 * 1. Preflight: Load head, check gate/collision, preview checklist
 * 2. Confirm: Type "RELEASE" to proceed
 * 3. Release: Commit RELEASED state (signed)
 * 4. Export: Build and download bundle
 * 5. Verify: Optional post-export verification
 *
 * NORTH STAR: Export requires RELEASED state
 */

import React, { useEffect, useCallback } from 'react';
import type { FactoryPackageState, UISnapshot } from '../../core/factoryPackage/factoryPackageStore';
import type { ExportArtifact } from '../../core/export/exportPipeline';
import {
  isStepBusy,
  getStepDescription,
  getStepColor,
  CONFIRM_TEXT_REQUIRED,
} from '../../core/factoryPackage/factoryPackageTypes';

// ============================================
// PROPS
// ============================================

export interface OneClickFactoryPackageProps {
  /** Factory package store hook */
  useStore: () => FactoryPackageState;

  /** Get current UI snapshot */
  getSnapshot: () => UISnapshot;

  /** Generate export artifacts */
  generateExports: () => Promise<ExportArtifact[]>;

  /** Optional className */
  className?: string;
}

// ============================================
// SUB-COMPONENTS
// ============================================

interface StatusBadgeProps {
  step: FactoryPackageState['step'];
}

function StatusBadge({ step }: StatusBadgeProps) {
  const color = getStepColor(step);
  const description = getStepDescription(step);

  return (
    <div className="flex items-center gap-2">
      <span
        className={`
          inline-block w-2 h-2 rounded-full
          ${step === 'DONE' ? 'bg-green-400' : ''}
          ${step === 'ERROR' ? 'bg-red-400' : ''}
          ${isStepBusy(step) ? 'bg-blue-400 animate-pulse' : ''}
          ${step === 'PREVIEW_READY' ? 'bg-amber-400' : ''}
          ${step === 'IDLE' ? 'bg-gray-400' : ''}
        `}
      />
      <span className={`text-sm font-medium ${color}`}>{description}</span>
    </div>
  );
}

interface PreflightPreviewProps {
  preview: FactoryPackageState['checklistPreview'];
  onCopyJson: () => void;
}

function PreflightPreview({ preview, onCopyJson }: PreflightPreviewProps) {
  if (!preview) {
    return (
      <div className="text-sm text-gray-500 italic">
        No preview available. Run preflight first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Gate Summary */}
      <div
        className={`
          p-3 rounded-lg border
          ${preview.gate.ok
            ? 'bg-green-900/20 border-green-500/30'
            : 'bg-red-900/20 border-red-500/30'
          }
        `}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Gate Validation</span>
          <span
            className={`
              text-xs px-2 py-0.5 rounded
              ${preview.gate.ok
                ? 'bg-green-600/30 text-green-300'
                : 'bg-red-600/30 text-red-300'
              }
            `}
          >
            {preview.gate.ok ? 'PASS' : 'BLOCKED'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="text-gray-400">
            Errors: <span className="text-red-400">{preview.gate.errorCount}</span>
          </div>
          <div className="text-gray-400">
            Warnings: <span className="text-amber-400">{preview.gate.warningCount}</span>
          </div>
        </div>

        {preview.gate.perCabinetErrors.length > 0 && (
          <div className="mt-2 text-xs text-red-300">
            <div className="font-medium mb-1">Cabinet Errors:</div>
            <ul className="space-y-0.5 max-h-20 overflow-y-auto">
              {preview.gate.perCabinetErrors.slice(0, 5).map((err) => (
                <li key={err.id} className="font-mono">
                  {err.id}: {err.codes.join(', ')}
                </li>
              ))}
              {preview.gate.perCabinetErrors.length > 5 && (
                <li className="text-gray-500">
                  ... and {preview.gate.perCabinetErrors.length - 5} more
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Collision Summary */}
      <div
        className={`
          p-3 rounded-lg border
          ${!preview.collision.blocked
            ? 'bg-green-900/20 border-green-500/30'
            : 'bg-red-900/20 border-red-500/30'
          }
        `}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Collision Check</span>
          <span
            className={`
              text-xs px-2 py-0.5 rounded
              ${!preview.collision.blocked
                ? 'bg-green-600/30 text-green-300'
                : 'bg-red-600/30 text-red-300'
              }
            `}
          >
            {preview.collision.blocked ? 'BLOCKED' : 'PASS'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
          <div>Pairs: {preview.collision.pairCount}</div>
          {preview.collision.worstPenetrationMm !== undefined && (
            <div>
              Worst: {preview.collision.worstPenetrationMm.toFixed(1)}mm
            </div>
          )}
        </div>
      </div>

      {/* Verification */}
      <div className="p-3 rounded-lg border border-gray-600/30 bg-gray-800/30">
        <div className="text-sm font-medium mb-2">Chain Verification</div>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
          <div className="font-mono truncate" title={preview.verification.keyIdApproval}>
            Approval: {preview.verification.keyIdApproval?.slice(0, 12) ?? 'N/A'}...
          </div>
          <div className="font-mono truncate" title={preview.verification.keyIdManifest}>
            Manifest: {preview.verification.keyIdManifest?.slice(0, 12) ?? 'N/A'}...
          </div>
        </div>
      </div>

      {/* Previous Exports */}
      {preview.exports.length > 0 && (
        <div className="p-3 rounded-lg border border-gray-600/30 bg-gray-800/30">
          <div className="text-sm font-medium mb-2">
            Previous Exports ({preview.exports.length})
          </div>
          <ul className="space-y-1 text-xs text-gray-400 max-h-16 overflow-y-auto">
            {preview.exports.slice(0, 3).map((exp, i) => (
              <li key={i} className="font-mono">
                [{exp.kind}] {exp.filename}
              </li>
            ))}
            {preview.exports.length > 3 && (
              <li className="text-gray-500">... and {preview.exports.length - 3} more</li>
            )}
          </ul>
        </div>
      )}

      {/* Copy JSON */}
      <button
        onClick={onCopyJson}
        className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
      >
        Copy Preview JSON
      </button>
    </div>
  );
}

interface ConfirmationInputProps {
  value: string;
  onChange: (value: string) => void;
  required: string;
  disabled: boolean;
}

function ConfirmationInput({
  value,
  onChange,
  required,
  disabled,
}: ConfirmationInputProps) {
  const isValid = value.trim().toUpperCase() === required;

  return (
    <div className="space-y-2">
      <div className="text-sm text-gray-400">
        Type <span className="font-mono font-bold text-white">{required}</span> to confirm
        release:
      </div>

      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={`Type ${required}`}
        className={`
          w-full px-3 py-2 rounded-lg
          bg-gray-800 border transition-colors
          outline-none font-mono text-center text-lg
          ${isValid
            ? 'border-green-500/50 text-green-300'
            : 'border-gray-600 text-gray-300'
          }
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
      />

      {value && !isValid && (
        <div className="text-xs text-amber-400">
          Type exactly: {required}
        </div>
      )}
    </div>
  );
}

interface VerifyResultDisplayProps {
  result: FactoryPackageState['verifyResult'];
}

function VerifyResultDisplay({ result }: VerifyResultDisplayProps) {
  if (!result) {
    return (
      <div className="text-sm text-gray-500 italic">
        Verification not run yet.
      </div>
    );
  }

  return (
    <div
      className={`
        p-3 rounded-lg border
        ${result.ok
          ? 'bg-green-900/20 border-green-500/30'
          : 'bg-red-900/20 border-red-500/30'
        }
      `}
    >
      <div className="flex items-center gap-2">
        <span className={result.ok ? 'text-green-400' : 'text-red-400'}>
          {result.ok ? '✓ Verified' : '✗ Failed'}
        </span>
        {result.fileCount !== undefined && (
          <span className="text-xs text-gray-400">
            ({result.fileCount} files checked)
          </span>
        )}
      </div>

      {!result.ok && result.reason && (
        <div className="mt-1 text-xs text-red-300">{result.reason}</div>
      )}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function OneClickFactoryPackage({
  useStore,
  getSnapshot,
  generateExports,
  className = '',
}: OneClickFactoryPackageProps) {
  const state = useStore();

  // Run preflight on mount
  useEffect(() => {
    if (state.step === 'IDLE') {
      state.preflight(getSnapshot);
    }
  }, []);

  // Handlers
  const handleRefreshPreflight = useCallback(() => {
    state.preflight(getSnapshot);
  }, [state, getSnapshot]);

  const handleCopyPreviewJson = useCallback(() => {
    if (state.checklistPreview) {
      navigator.clipboard.writeText(JSON.stringify(state.checklistPreview, null, 2));
    }
  }, [state.checklistPreview]);

  const handleRun = useCallback(() => {
    state.run({
      getSnapshot,
      generateExports,
      verifyAfter: true,
    });
  }, [state, getSnapshot, generateExports]);

  // Computed
  const isBusy = isStepBusy(state.step);
  const canConfirm =
    state.confirmText.trim().toUpperCase() === CONFIRM_TEXT_REQUIRED;
  const canRun =
    state.step === 'PREVIEW_READY' &&
    canConfirm &&
    state.checklistPreview?.gate.ok &&
    !state.checklistPreview?.collision.blocked;

  return (
    <div
      className={`
        rounded-xl border border-white/10
        bg-gradient-to-b from-gray-800/50 to-gray-900/50
        overflow-hidden
        ${className}
      `}
    >
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-white">
            📦 Factory Package
          </h3>
          <StatusBadge step={state.step} />
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>Job: {state.jobId}</span>
          {state.headHash && (
            <span className="font-mono">
              HEAD: {state.headHash.slice(0, 12)}...
            </span>
          )}
        </div>
      </div>

      {/* Error */}
      {state.error && (
        <div className="p-4 bg-red-900/20 border-b border-red-500/30">
          <div className="flex items-center justify-between">
            <span className="text-sm text-red-300">{state.error}</span>
            <button
              onClick={state.clearError}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-4 space-y-6">
        {/* Section 1: Preflight Preview */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-white">
              1. Preflight Checklist
            </h4>
            <button
              onClick={handleRefreshPreflight}
              disabled={isBusy}
              className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ⟳ Refresh
            </button>
          </div>

          <PreflightPreview
            preview={state.checklistPreview}
            onCopyJson={handleCopyPreviewJson}
          />
        </section>

        {/* Section 2: Confirmation */}
        <section>
          <h4 className="text-sm font-semibold text-white mb-3">
            2. Strict Confirmation
          </h4>

          <ConfirmationInput
            value={state.confirmText}
            onChange={state.setConfirmText}
            required={CONFIRM_TEXT_REQUIRED}
            disabled={isBusy}
          />
        </section>

        {/* Section 3: Action */}
        <section>
          <h4 className="text-sm font-semibold text-white mb-3">
            3. Release & Export
          </h4>

          <div className="space-y-3">
            <button
              onClick={handleRun}
              disabled={isBusy || !canRun}
              className={`
                w-full py-3 px-4 rounded-lg font-medium text-sm
                transition-all
                ${canRun
                  ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }
                disabled:opacity-50
              `}
            >
              {isBusy ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">⏳</span>
                  {getStepDescription(state.step)}
                </span>
              ) : (
                '✅ Confirm Release & Export Bundle'
              )}
            </button>

            {/* Blocking reasons */}
            {state.step === 'PREVIEW_READY' && !canRun && (
              <div className="text-xs text-amber-400 space-y-1">
                {!canConfirm && (
                  <div>• Type "{CONFIRM_TEXT_REQUIRED}" to enable</div>
                )}
                {state.checklistPreview && !state.checklistPreview.gate.ok && (
                  <div>• Gate validation failed - fix errors first</div>
                )}
                {state.checklistPreview?.collision.blocked && (
                  <div>• Collision blocked - fix collisions first</div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Section 4: Verification */}
        <section>
          <h4 className="text-sm font-semibold text-white mb-3">
            4. Post-Export Verification
          </h4>

          <VerifyResultDisplay result={state.verifyResult} />
        </section>

        {/* Done state */}
        {state.step === 'DONE' && (
          <div className="p-4 bg-green-900/20 rounded-lg border border-green-500/30">
            <div className="flex items-center gap-2 text-green-300">
              <span className="text-xl">🎉</span>
              <span className="font-medium">Factory Package Complete!</span>
            </div>
            {state.zipFilename && (
              <div className="mt-2 text-sm text-gray-400">
                Downloaded: {state.zipFilename}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 bg-gray-900/50 border-t border-white/5">
        <div className="text-xs text-gray-500 text-center">
          Export requires RELEASED state • Chain verified before export
        </div>
      </div>
    </div>
  );
}

export default OneClickFactoryPackage;
