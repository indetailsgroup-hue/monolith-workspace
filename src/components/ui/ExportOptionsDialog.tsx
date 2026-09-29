/**
 * ExportOptionsDialog.tsx
 *
 * Modal dialog for CNC export configuration and execution (Phase 6.2).
 *
 * Connects to:
 *   GET  /factory/export/options          — load dialect/profile/mode/target options
 *   POST /factory/jobs/:jobId/export      — trigger gated export, receive SHA256 ZIP
 *
 * Reuses:
 *   - ExportConfigurator (dialect/profile/mode/target selectors)
 *   - ExportActions       (export button, progress, result + SHA256 copy)
 *   - ExportLockBanner    (gate enforcement UI)
 *   - fetchExportOptionsApi / runGatedExportApi / downloadExportApi
 *   - colors from src/core/theme/colors.ts
 *
 * @version 1.0.0
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { colors } from '../../core/theme/colors';
import {
  ExportConfigurator,
  ExportActions,
  isVerifyPassed,
  ExportLockBanner,
} from '../../factory/components/export';
import type {
  ExportRequest,
  ExportOptionsResponse,
  ExportResponseSuccess,
  ExportResponseError,
  ExportStatus,
} from '../../factory/components/export';
import type { VerifyApiResponse } from '../../factory/types/job';
import {
  fetchExportOptionsApi,
  runGatedExportApi,
  downloadExportApi,
  getFilenameFromHeaders,
  triggerBrowserDownload,
} from '../../factory/api/exportApi';

// ============================================================================
// Types
// ============================================================================

export interface ExportOptionsDialogProps {
  /** Whether the dialog is visible */
  open: boolean;
  /** Factory job ID to export */
  jobId: string;
  /** Verify result from the factory job (needed for gate check) */
  verifyResult?: VerifyApiResponse | null;
  /** Job status — forwarded to ExportLockBanner */
  jobStatus?: string;
  /** Called when dialog should close */
  onClose: () => void;
  /** Optional callback after a successful export */
  onExportSuccess?: (result: ExportResponseSuccess) => void;
}

// ============================================================================
// Component
// ============================================================================

export function ExportOptionsDialog({
  open,
  jobId,
  verifyResult = null,
  jobStatus = 'PENDING',
  onClose,
  onExportSuccess,
}: ExportOptionsDialogProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  // Options from API
  const [options, setOptions] = useState<ExportOptionsResponse | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  // Export state
  const [exportConfig, setExportConfig] = useState<ExportRequest | null>(null);
  const [exportStatus, setExportStatus] = useState<ExportStatus>('IDLE');
  const [lastExport, setLastExport] = useState<ExportResponseSuccess | undefined>(undefined);
  const [exportError, setExportError] = useState<ExportResponseError | undefined>(undefined);

  // Gate: export is only allowed when verify passed
  const exportAllowed = isVerifyPassed(verifyResult);

  // ── Load options when dialog opens ─────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    // Reset per-session export state
    setExportStatus('IDLE');
    setLastExport(undefined);
    setExportError(undefined);

    let cancelled = false;
    setOptionsLoading(true);
    setOptionsError(null);

    fetchExportOptionsApi()
      .then(({ data }) => {
        if (!cancelled) {
          setOptions(data);
          setOptionsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setOptionsError(
            err instanceof Error ? err.message : 'Failed to load export options'
          );
          setOptionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  // ── Keyboard: Escape closes ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && exportStatus !== 'EXPORTING') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, exportStatus, onClose]);

  // ── Backdrop click ──────────────────────────────────────────────────────────
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current && exportStatus !== 'EXPORTING') {
        onClose();
      }
    },
    [exportStatus, onClose]
  );

  // ── Trigger export ──────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!exportConfig || !exportAllowed || exportStatus === 'EXPORTING') return;

    setExportStatus('EXPORTING');
    setExportError(undefined);

    try {
      const { response, sha256 } = await runGatedExportApi(jobId, exportConfig);

      if (!response.ok) {
        setExportStatus('ERROR');
        setExportError(response as ExportResponseError);
        return;
      }

      const success = response as ExportResponseSuccess;
      // Patch sha256 from header when backend returns it there instead of body
      if (sha256 && !success.sha256) {
        (success as { sha256: string }).sha256 = sha256;
      }

      setLastExport(success);
      setExportStatus('DONE');
      onExportSuccess?.(success);
    } catch (err: unknown) {
      setExportStatus('ERROR');
      setExportError({
        ok: false,
        code: 'E_EXPORT_INTERNAL',
        message: err instanceof Error ? err.message : 'Export failed',
      });
    }
  }, [exportConfig, exportAllowed, exportStatus, jobId, onExportSuccess]);

  // ── Download last export ────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    if (!lastExport?.downloadPath) return;
    try {
      const { blob, headers } = await downloadExportApi(lastExport.downloadPath);
      const filename = getFilenameFromHeaders(
        headers,
        lastExport.filename ?? `export-${jobId}.zip`
      );
      triggerBrowserDownload(blob, filename);
    } catch (err) {
      console.error('[ExportOptionsDialog] download error:', err);
    }
  }, [lastExport, jobId]);

  // ── Nothing to render when closed ──────────────────────────────────────────
  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          backgroundColor: colors.bg.secondary,
          borderRadius: 12,
          border: `1px solid ${colors.border.default}`,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          width: '100%',
          maxWidth: 560,
          margin: 16,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 80px)',
          animation: 'eoFadeIn 0.15s ease-out',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${colors.border.subtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              aria-hidden="true"
              style={{ fontSize: 20, display: 'flex', alignItems: 'center' }}
            >
              ⚙️
            </span>
            <h2
              id="export-dialog-title"
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 600,
                color: colors.text.primary,
              }}
            >
              Export CNC Program
            </h2>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            disabled={exportStatus === 'EXPORTING'}
            aria-label="Close export dialog"
            style={{
              background: 'none',
              border: 'none',
              cursor: exportStatus === 'EXPORTING' ? 'not-allowed' : 'pointer',
              color: colors.text.muted,
              fontSize: 18,
              lineHeight: 1,
              padding: '4px 6px',
              borderRadius: 6,
              opacity: exportStatus === 'EXPORTING' ? 0.4 : 1,
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              if (exportStatus !== 'EXPORTING') {
                e.currentTarget.style.color = colors.text.primary;
                e.currentTarget.style.background = colors.bg.hover;
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = colors.text.muted;
              e.currentTarget.style.background = 'none';
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div
          style={{
            padding: '16px 20px',
            overflowY: 'auto',
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* Gate banner — shown when verify has not passed */}
          <ExportLockBanner
            verifyResult={verifyResult}
            jobStatus={jobStatus}
          />

          {/* Options load error */}
          {optionsError && (
            <div
              role="alert"
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                backgroundColor: '#1a0a0a',
                border: `1px solid ${colors.error.border}`,
                color: colors.error.text,
                fontSize: 13,
              }}
            >
              ⚠ {optionsError}
            </div>
          )}

          {/* Dialect / profile / mode / target configurator */}
          <ExportConfigurator
            options={options}
            optionsLoading={optionsLoading}
            exportAllowed={exportAllowed}
            onConfigChange={setExportConfig}
          />

          {/* Export button, progress, result, SHA256 copy */}
          <ExportActions
            config={exportConfig}
            exportAllowed={exportAllowed}
            status={exportStatus}
            lastExport={lastExport}
            error={exportError}
            onExport={handleExport}
            onDownload={handleDownload}
          />
        </div>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: `1px solid ${colors.border.subtle}`,
            display: 'flex',
            justifyContent: 'flex-end',
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            disabled={exportStatus === 'EXPORTING'}
            style={{
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 8,
              border: `1px solid ${colors.border.default}`,
              backgroundColor: 'transparent',
              color: colors.text.secondary,
              cursor: exportStatus === 'EXPORTING' ? 'not-allowed' : 'pointer',
              opacity: exportStatus === 'EXPORTING' ? 0.5 : 1,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (exportStatus !== 'EXPORTING') {
                e.currentTarget.style.backgroundColor = colors.bg.hover;
                e.currentTarget.style.color = colors.text.primary;
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = colors.text.secondary;
            }}
          >
            {exportStatus === 'DONE' ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes eoFadeIn {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1);    }
        }
      `}</style>
    </div>
  );
}

export default ExportOptionsDialog;
