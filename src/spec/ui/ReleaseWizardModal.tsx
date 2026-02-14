/**
 * ReleaseWizardModal
 *
 * Confirmation dialog for FROZEN → RELEASED transition
 * Generates signed factory package
 *
 * @version 1.2.0 - Phase B4: Added Preflight checks
 */

import React, { useState, useEffect } from 'react';
import { useSpecStore } from '../SpecStoreProvider';
import { useExportGate } from '../../gate/ui';
import {
  runPreflight,
  type PreflightResult,
  type PreflightCheck,
} from '../runPreflight';

// Shared modal styles
const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  width: 640,
  maxWidth: '90vw',
  maxHeight: '90vh',
  overflow: 'auto',
  background: '#1a1a2e',
  borderRadius: 12,
  padding: 24,
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  color: '#fff',
};

export function ReleaseWizardModal() {
  const open = useSpecStore((s) => s.modals.releaseOpen);
  const close = useSpecStore((s) => s.closeRelease);
  const doc = useSpecStore((s) => s.doc);
  const release = useSpecStore((s) => s.release);
  const busy = useSpecStore((s) => s.async.busy);
  const error = useSpecStore((s) => s.async.error);

  const [typed, setTyped] = useState('');
  const [acknowledgeWaivers, setAcknowledgeWaivers] = useState(false);

  // B4: Preflight state
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightRunning, setPreflightRunning] = useState(false);

  // Reset state when modal opens and run preflight
  useEffect(() => {
    if (open) {
      setTyped('');
      setAcknowledgeWaivers(false);
      setPreflight(null);

      // Run preflight when modal opens
      setPreflightRunning(true);
      runPreflight({ acknowledgeWaivers: false })
        .then((result) => {
          setPreflight(result);
        })
        .catch((err) => {
          console.error('[ReleaseWizard] Preflight error:', err);
        })
        .finally(() => {
          setPreflightRunning(false);
        });
    }
  }, [open]);

  // Re-run preflight when acknowledge changes
  useEffect(() => {
    if (open && !preflightRunning && preflight) {
      setPreflightRunning(true);
      runPreflight({ acknowledgeWaivers })
        .then((result) => {
          setPreflight(result);
        })
        .finally(() => {
          setPreflightRunning(false);
        });
    }
  }, [acknowledgeWaivers]);

  // Safety Gate enforcement (Phase B1)
  const safetyGate = useExportGate();

  if (!open) return null;
  if (doc.state !== 'FROZEN') return null;

  const report = doc.lastGate;
  const specGatePass = !!report && report.blockers.length === 0;
  // Combined gate: Spec Gate + Safety Gate (Phase B1)
  const safetyGatePass = safetyGate.hasRun && safetyGate.blockerCount === 0;

  // B4: Preflight check determines release eligibility
  const preflightPass = preflight?.ok === true;
  const hasWarnings = preflight?.summary.warned ? preflight.summary.warned > 0 : false;
  const canRelease = specGatePass && safetyGatePass && preflightPass;
  const typedCorrect = typed === 'RELEASE';

  // Helper to render preflight check icon
  const getCheckIcon = (status: PreflightCheck['status']) => {
    switch (status) {
      case 'PASS':
        return '✓';
      case 'FAIL':
        return '✗';
      case 'WARN':
        return '⚠';
      case 'SKIPPED':
        return '○';
      default:
        return '?';
    }
  };

  const getCheckColor = (status: PreflightCheck['status']) => {
    switch (status) {
      case 'PASS':
        return '#10b981';
      case 'FAIL':
        return '#ef4444';
      case 'WARN':
        return '#f59e0b';
      case 'SKIPPED':
        return 'rgba(255,255,255,0.4)';
      default:
        return '#fff';
    }
  };

  const handleRelease = async () => {
    await release(typed);
  };

  return (
    <div style={backdropStyle} onClick={close}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0, marginBottom: 16, color: '#8b5cf6' }}>
          Release & Generate Factory Package
        </h2>

        {!report ? (
          <div
            style={{
              padding: 24,
              background: 'rgba(239,68,68,0.1)',
              borderRadius: 8,
              textAlign: 'center',
            }}
          >
            <p style={{ color: '#ef4444', margin: 0 }}>
              Run Gate first. Release requires a passing Gate report.
            </p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div
              style={{
                padding: 16,
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 8,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                    Snapshot
                  </div>
                  <div style={{ fontFamily: 'monospace' }}>
                    {doc.snapshot.snapshotId}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                    Gate Report
                  </div>
                  <div style={{ fontFamily: 'monospace' }}>
                    {report.gateReportId}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 24,
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <div>
                  <span
                    style={{
                      padding: '4px 12px',
                      background: specGatePass ? '#10b981' : '#ef4444',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {specGatePass ? 'Spec Gate Passed' : 'Spec Gate Failed'}
                  </span>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Blockers: {report.blockers.length}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Warnings: {report.warnings.length}
                </div>
              </div>

              {/* Safety Gate Status (Phase B1) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <span
                  style={{
                    padding: '4px 12px',
                    background: safetyGatePass ? '#10b981' : '#ef4444',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {safetyGatePass ? 'Safety Gate Passed' : safetyGate.hasRun ? 'Safety Gate Failed' : 'Safety Gate Not Run'}
                </span>
                {safetyGate.hasRun && (
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                    {safetyGate.blockerCount} blocker(s), {safetyGate.warningCount} warning(s)
                  </span>
                )}
                {safetyGate.blockerCount > 0 && (
                  <button
                    onClick={() => {
                      safetyGate.openFirstBlocker();
                      close();
                    }}
                    style={{
                      marginLeft: 'auto',
                      padding: '4px 8px',
                      background: 'transparent',
                      border: '1px solid rgba(239,68,68,0.5)',
                      borderRadius: 4,
                      color: '#ef4444',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    View Safety Issues
                  </button>
                )}
              </div>
            </div>

            {/* B4: Preflight Checks */}
            <div
              style={{
                padding: 16,
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 8,
                marginBottom: 20,
              }}
            >
              <h4 style={{ margin: 0, marginBottom: 12, color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: 8 }}>
                Preflight Checks
                {preflightRunning && (
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                    Running...
                  </span>
                )}
              </h4>

              {preflight ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {preflight.checks.map((check) => (
                    <div
                      key={check.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        padding: 8,
                        background: 'rgba(255,255,255,0.02)',
                        borderRadius: 4,
                        borderLeft: `3px solid ${getCheckColor(check.status)}`,
                      }}
                    >
                      <span
                        style={{
                          color: getCheckColor(check.status),
                          fontWeight: 600,
                          fontSize: 14,
                          width: 20,
                          textAlign: 'center',
                        }}
                      >
                        {getCheckIcon(check.status)}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>
                          {check.name}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                          {check.message}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Summary */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 16,
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: '1px solid rgba(255,255,255,0.05)',
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: '#10b981' }}>
                      ✓ {preflight.summary.passed} passed
                    </span>
                    <span style={{ color: '#ef4444' }}>
                      ✗ {preflight.summary.failed} failed
                    </span>
                    <span style={{ color: '#f59e0b' }}>
                      ⚠ {preflight.summary.warned} warned
                    </span>
                  </div>

                  {/* Acknowledge Waivers */}
                  {hasWarnings && !preflightPass && (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 8,
                        padding: 8,
                        background: 'rgba(245,158,11,0.1)',
                        borderRadius: 4,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={acknowledgeWaivers}
                        onChange={(e) => setAcknowledgeWaivers(e.target.checked)}
                        style={{ accentColor: '#f59e0b' }}
                      />
                      <span style={{ color: '#f59e0b', fontSize: 13 }}>
                        I acknowledge the warnings and wish to proceed
                      </span>
                    </label>
                  )}
                </div>
              ) : (
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
                  Running preflight checks...
                </div>
              )}
            </div>

            {/* Type Confirmation */}
            {canRelease && (
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: 8,
                    color: 'rgba(255,255,255,0.7)',
                  }}
                >
                  Type <strong style={{ color: '#8b5cf6' }}>RELEASE</strong> to
                  confirm
                </label>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="Type RELEASE"
                  style={{
                    width: '100%',
                    padding: 12,
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${
                      typedCorrect
                        ? '#10b981'
                        : typed.length > 0
                        ? '#ef4444'
                        : 'rgba(255,255,255,0.1)'
                    }`,
                    borderRadius: 6,
                    color: '#fff',
                    fontSize: 16,
                    fontFamily: 'monospace',
                    textAlign: 'center',
                    letterSpacing: 2,
                  }}
                />
              </div>
            )}

            {/* Warning for blockers */}
            {!canRelease && (
              <div
                style={{
                  padding: 16,
                  background: 'rgba(239,68,68,0.1)',
                  borderRadius: 8,
                  marginBottom: 20,
                }}
              >
                <p style={{ color: '#ef4444', margin: 0 }}>
                  Cannot release:
                  {!specGatePass && ` ${report.blockers.length} spec blocker(s)`}
                  {!specGatePass && (!safetyGatePass || !preflightPass) && ' and'}
                  {!safetyGatePass && ` ${safetyGate.blockerCount} safety blocker(s)`}
                  {!safetyGatePass && !preflightPass && ' and'}
                  {!preflightPass && ` ${preflight?.summary.failed || 0} preflight failure(s)`}
                  {' must be resolved first.'}
                </p>
              </div>
            )}

            {/* What happens */}
            <div
              style={{
                padding: 16,
                background: 'rgba(139,92,246,0.1)',
                borderRadius: 8,
                marginBottom: 20,
              }}
            >
              <h4 style={{ margin: 0, marginBottom: 8, color: '#8b5cf6' }}>
                What happens when you release:
              </h4>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 20,
                  color: 'rgba(255,255,255,0.7)',
                }}
              >
                <li>Factory artifacts are generated (DXF, CSV, CNC code)</li>
                <li>A signed manifest is created with file hashes</li>
                <li>The release is recorded in the audit trail</li>
                <li>The package becomes available for download</li>
              </ul>
            </div>
          </>
        )}

        {/* Error Display */}
        {error && (
          <div
            style={{
              padding: 12,
              background: 'rgba(239,68,68,0.2)',
              borderRadius: 6,
              marginBottom: 16,
              color: '#ef4444',
            }}
          >
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button
            onClick={close}
            disabled={busy}
            style={{
              padding: '10px 20px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 6,
              color: '#fff',
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleRelease}
            disabled={!canRelease || !typedCorrect || busy}
            style={{
              padding: '10px 20px',
              background:
                canRelease && typedCorrect ? '#8b5cf6' : 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontWeight: 600,
              cursor:
                !canRelease || !typedCorrect || busy
                  ? 'not-allowed'
                  : 'pointer',
              opacity: !canRelease || !typedCorrect || busy ? 0.5 : 1,
            }}
          >
            {busy ? 'Releasing...' : 'Release & Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}
