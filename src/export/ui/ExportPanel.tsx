/**
 * Export Panel - Factory Export UI
 *
 * Step 7 of Plasticity-Style Modeling Layer:
 * - Shows verify/policy gate status
 * - Export only when RELEASED + verify + policy pass
 * - Downloads exported files
 *
 * v1.0: Initial export panel
 */

import { useState } from 'react';
import type { ReleaseBundle } from '../../core/manufacturing/release/types';
import { toArtifactBundle } from '../artifactBundle';
import { exportOnlyReleased, type ExportOnlyReleasedResult } from '../exporters/exportService';
import { DEFAULT_EXPORT_POLICY } from '../policy/defaultPolicy';
import { useSpecState } from '../../core/store/useSpecStore';

interface ExportPanelProps {
  /** Release bundle to export */
  releaseBundle: ReleaseBundle | null;
}

export function ExportPanel({ releaseBundle }: ExportPanelProps) {
  const specState = useSpecState();

  const [jobName, setJobName] = useState('job_001');
  const [result, setResult] = useState<ExportOnlyReleasedResult | null>(null);

  const canExport = releaseBundle !== null && specState === 'RELEASED';

  const runExport = () => {
    if (!releaseBundle) return;

    const artifactBundle = toArtifactBundle(releaseBundle);

    const r = exportOnlyReleased({
      specState,
      artifactBundle,
      request: { format: 'CUTLIST_CSV', jobName },
      policy: DEFAULT_EXPORT_POLICY,
    });

    setResult(r);

    // Download files if export succeeded
    if (r.ok && r.exportFiles?.length) {
      for (const f of r.exportFiles) {
        const blob = new Blob([String(f.content)], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = f.path.split('/').pop() || 'export.csv';
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  };

  return (
    <div
      style={{
        background: 'rgba(34,197,94,0.05)',
        border: '1px solid #3a3a5a',
        borderRadius: 8,
        marginTop: 16,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #3a3a5a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Factory Export</span>
          <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            Export only when SpecState = <strong>RELEASED</strong> and Verify+Policy pass
          </div>
        </div>
        <div
          style={{
            padding: '4px 10px',
            background:
              specState === 'RELEASED'
                ? 'rgba(34,197,94,0.2)'
                : 'rgba(255,255,255,0.05)',
            border: `1px solid ${specState === 'RELEASED' ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 4,
            fontSize: 11,
            color: specState === 'RELEASED' ? '#22c55e' : 'rgba(255,255,255,0.4)',
          }}
        >
          {specState}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: 16 }}>
        {/* Job name input */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: 'block',
              marginBottom: 6,
              fontSize: 12,
              color: 'rgba(255,255,255,0.6)',
            }}
          >
            Job Name
          </label>
          <input
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid #3a3a5a',
              borderRadius: 6,
              color: '#fff',
              fontSize: 14,
            }}
          />
        </div>

        {/* No bundle warning */}
        {!releaseBundle && (
          <div
            style={{
              padding: 12,
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 6,
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 13, color: '#f59e0b' }}>
              No release bundle. Build Release first (Step 6).
            </div>
          </div>
        )}

        {/* Export button */}
        <button
          onClick={runExport}
          disabled={!canExport}
          style={{
            width: '100%',
            padding: '12px 20px',
            background: canExport ? '#22c55e' : 'rgba(34,197,94,0.3)',
            border: 'none',
            borderRadius: 6,
            color: canExport ? '#fff' : 'rgba(255,255,255,0.5)',
            fontSize: 14,
            fontWeight: 600,
            cursor: canExport ? 'pointer' : 'not-allowed',
          }}
        >
          Export CUTLIST_CSV
        </button>

        {/* Result display */}
        {result && (
          <div style={{ marginTop: 16 }}>
            {/* Overall status */}
            <div
              style={{
                padding: '8px 12px',
                background: result.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${result.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                borderRadius: 6,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: result.ok ? '#22c55e' : '#ef4444',
                }}
              >
                {result.ok ? 'EXPORT OK' : `BLOCKED: ${result.error}`}
              </div>
            </div>

            {/* Verify Report */}
            <div
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid #3a3a5a',
                borderRadius: 6,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#fff',
                  marginBottom: 8,
                }}
              >
                Verify Report
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: result.gate.verify.ok ? '#22c55e' : '#ef4444',
                  marginBottom: 8,
                }}
              >
                {result.gate.verify.ok ? 'PASS' : 'FAIL'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {result.gate.verify.issues.map((issue, idx) => (
                  <div key={idx} style={{ fontSize: 11 }}>
                    <span
                      style={{
                        color:
                          issue.severity === 'ERROR'
                            ? '#ef4444'
                            : issue.severity === 'WARN'
                              ? '#f59e0b'
                              : '#22c55e',
                        fontWeight: 600,
                      }}
                    >
                      {issue.severity}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.6)', marginLeft: 6 }}>
                      {issue.code}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>
                      {issue.message}
                    </span>
                    {issue.path && (
                      <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 6 }}>
                        ({issue.path})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Policy Report */}
            <div
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid #3a3a5a',
                borderRadius: 6,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#fff',
                  marginBottom: 8,
                }}
              >
                Policy Report
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: result.gate.policy.ok ? '#22c55e' : '#ef4444',
                  marginBottom: 8,
                }}
              >
                {result.gate.policy.ok ? 'ALLOW' : 'DENY'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {result.gate.policy.decisions.map((d, idx) => (
                  <div key={idx} style={{ fontSize: 11 }}>
                    <span
                      style={{
                        color: d.effect === 'ALLOW' ? '#22c55e' : '#ef4444',
                        fontWeight: 600,
                      }}
                    >
                      {d.effect}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>
                      {d.reason}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Exported Files */}
            {result.exportFiles && result.exportFiles.length > 0 && (
              <div
                style={{
                  background: 'rgba(34,197,94,0.05)',
                  border: '1px solid rgba(34,197,94,0.2)',
                  borderRadius: 6,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#22c55e',
                    marginBottom: 8,
                  }}
                >
                  Exported Files
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {result.exportFiles.map((f) => (
                    <div key={f.path} style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                      <span style={{ color: '#fff' }}>{f.path}</span>
                      <span style={{ marginLeft: 8 }}>{f.bytes} bytes</span>
                      <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 10 }}>
                        {f.hash}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ExportPanel;
