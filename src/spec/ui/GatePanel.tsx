/**
 * GatePanel
 *
 * Gate validation controls and report display
 * Only active in FROZEN state
 */

import React from 'react';
import { useSpecStore } from '../SpecStoreProvider';
import type { GateIssue, Severity } from '../types';

export function GatePanel() {
  const doc = useSpecStore((s) => s.doc);
  const gateUi = useSpecStore((s) => s.gateUi);
  const setPolicy = useSpecStore((s) => s.setGatePolicyVersion);
  const setMachine = useSpecStore((s) => s.setMachineProfile);
  const runGate = useSpecStore((s) => s.runGate);
  const createRevision = useSpecStore((s) => s.createRevisionToEdit);

  if (doc.state !== 'FROZEN') {
    return (
      <div style={{ padding: 24, color: 'rgba(255,255,255,0.6)' }}>
        <h3 style={{ color: '#fff', marginBottom: 12 }}>Gate</h3>
        <p>Freeze first to create an immutable snapshot for gate validation.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h3 style={{ color: '#fff', marginBottom: 16 }}>Gate Validation</h3>

      {/* Gate Controls */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'flex-end',
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <label style={{ display: 'block', marginBottom: 6, color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
            Policy Version
          </label>
          <input
            value={gateUi.selectedPolicyVersion}
            onChange={(e) => setPolicy(e.target.value)}
            style={{
              padding: '8px 12px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              color: '#fff',
              width: 150,
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 6, color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
            Machine Profile (optional)
          </label>
          <input
            value={gateUi.selectedMachineProfileId ?? ''}
            onChange={(e) => setMachine(e.target.value || undefined)}
            placeholder="e.g. KDT-1325"
            style={{
              padding: '8px 12px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              color: '#fff',
              width: 150,
            }}
          />
        </div>

        <button
          onClick={runGate}
          disabled={gateUi.isRunning}
          style={{
            padding: '10px 24px',
            background: '#3b82f6',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontWeight: 600,
            cursor: gateUi.isRunning ? 'not-allowed' : 'pointer',
            opacity: gateUi.isRunning ? 0.7 : 1,
          }}
        >
          {gateUi.isRunning ? 'Running...' : 'Run Gate'}
        </button>
      </div>

      {/* Error Display */}
      {gateUi.lastError && (
        <div
          style={{
            padding: 12,
            background: 'rgba(239,68,68,0.2)',
            borderRadius: 6,
            marginBottom: 16,
            color: '#ef4444',
          }}
        >
          {gateUi.lastError}
        </div>
      )}

      {/* Gate Report */}
      <GateReportView onCreateRevision={createRevision} />
    </div>
  );
}

// ============================================
// GATE REPORT VIEW
// ============================================

interface GateReportViewProps {
  onCreateRevision: () => void;
}

function GateReportView({ onCreateRevision }: GateReportViewProps) {
  const doc = useSpecStore((s) => s.doc);

  if (doc.state !== 'FROZEN') return null;

  const report = doc.lastGate;
  if (!report) {
    return (
      <div
        style={{
          padding: 24,
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 8,
          textAlign: 'center',
          color: 'rgba(255,255,255,0.6)',
        }}
      >
        No Gate report yet. Run Gate to validate this snapshot.
      </div>
    );
  }

  const blockers = report.blockers.length;
  const warnings = report.warnings.length;
  const info = report.info.length;
  const passed = blockers === 0;

  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          padding: 16,
          background: passed ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <span
          style={{
            padding: '6px 16px',
            background: passed ? '#10b981' : '#ef4444',
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 600,
            color: '#fff',
          }}
        >
          {passed ? 'PASSED' : 'FAILED'}
        </span>

        <span style={{ color: blockers > 0 ? '#ef4444' : 'rgba(255,255,255,0.6)' }}>
          Blockers: {blockers}
        </span>
        <span style={{ color: warnings > 0 ? '#f59e0b' : 'rgba(255,255,255,0.6)' }}>
          Warnings: {warnings}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.6)' }}>Info: {info}</span>

        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          {report.policyVersion} • {new Date(report.runAt).toLocaleString()}
        </span>
      </div>

      {/* Content */}
      <div style={{ padding: 16 }}>
        {/* Blockers present - show fix action */}
        {blockers > 0 && (
          <div
            style={{
              padding: 16,
              background: 'rgba(239,68,68,0.1)',
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <p style={{ margin: 0, color: '#ef4444', marginBottom: 12 }}>
              Gate failed: {blockers} blocker(s) must be resolved before release.
            </p>
            <button
              onClick={onCreateRevision}
              style={{
                padding: '8px 16px',
                background: '#ef4444',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Create Revision to Fix Blockers
            </button>
          </div>
        )}

        {/* Issues Lists */}
        <IssueList title="Blockers" issues={report.blockers} severity="BLOCKER" />
        <IssueList title="Warnings" issues={report.warnings} severity="WARNING" />
        <IssueList title="Info" issues={report.info} severity="INFO" />

        {/* Metrics */}
        {report.metrics && Object.keys(report.metrics).length > 0 && (
          <div style={{ marginTop: 20 }}>
            <h4 style={{ margin: 0, marginBottom: 12, color: 'rgba(255,255,255,0.9)' }}>
              Metrics
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
              {Object.entries(report.metrics).map(([key, value]) => (
                <div
                  key={key}
                  style={{
                    padding: 12,
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: 6,
                  }}
                >
                  <div style={{ fontSize: 20, fontWeight: 600, color: '#fff' }}>
                    {typeof value === 'number' ? value.toLocaleString() : value}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'capitalize' }}>
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// ISSUE LIST
// ============================================

interface IssueListProps {
  title: string;
  issues: GateIssue[];
  severity: Severity;
}

function IssueList({ title, issues, severity }: IssueListProps) {
  if (issues.length === 0) return null;

  const colors: Record<Severity, string> = {
    BLOCKER: '#ef4444',
    WARNING: '#f59e0b',
    INFO: '#3b82f6',
  };

  return (
    <div style={{ marginTop: 20 }}>
      <h4 style={{ margin: 0, marginBottom: 12, color: colors[severity] }}>
        {title} ({issues.length})
      </h4>
      <div style={{ display: 'grid', gap: 8 }}>
        {issues.map((issue) => (
          <div
            key={issue.id}
            style={{
              padding: 12,
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${colors[severity]}33`,
              borderRadius: 8,
            }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span
                style={{
                  padding: '2px 8px',
                  background: `${colors[severity]}22`,
                  border: `1px solid ${colors[severity]}44`,
                  borderRadius: 999,
                  fontSize: 11,
                  color: colors[severity],
                }}
              >
                {severity}
              </span>
              <div style={{ flex: 1 }}>
                <strong style={{ color: '#fff' }}>{issue.code}</strong>
                <span style={{ color: 'rgba(255,255,255,0.7)', marginLeft: 8 }}>
                  {issue.message}
                </span>
              </div>
            </div>

            {issue.partIds && issue.partIds.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                Affected parts: {issue.partIds.join(', ')}
              </div>
            )}

            {issue.context && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                {Object.entries(issue.context)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(' • ')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
