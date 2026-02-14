/**
 * Packet Preview Modal - B3 Export Viewer
 *
 * Full-screen modal for previewing factory packet contents
 * before downloading. Shows all packet data with visual widgets.
 *
 * @version 1.0.0 - Phase B3: Export Viewer / Packet Preview UI
 */

import { useState } from 'react';
import type { PacketPreview } from '../useFactoryPacket';

// ============================================
// TYPES
// ============================================

export type PreviewTab = 'summary' | 'cutlist' | 'drillmap' | 'connectors' | 'gate';

interface PacketPreviewModalProps {
  /** Is modal open */
  open: boolean;
  /** Close callback */
  onClose: () => void;
  /** Preview data */
  preview: PacketPreview | null;
  /** Download callback */
  onDownload: () => void;
  /** Is download in progress */
  isDownloading?: boolean;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

// ============================================
// TAB BUTTON COMPONENT
// ============================================

interface TabButtonProps {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
  variant?: 'default' | 'success' | 'warning' | 'error';
}

function TabButton({ active, label, count, onClick, variant = 'default' }: TabButtonProps) {
  const variantColors = {
    default: active ? '#8b5cf6' : 'transparent',
    success: active ? '#22c55e' : 'transparent',
    warning: active ? '#f59e0b' : 'transparent',
    error: active ? '#ef4444' : 'transparent',
  };

  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 16px',
        background: variantColors[variant],
        border: `1px solid ${active ? variantColors[variant] : '#3a3a5a'}`,
        borderRadius: 6,
        color: active ? '#fff' : 'rgba(255,255,255,0.7)',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        transition: 'all 0.15s ease',
      }}
    >
      {label}
      {count !== undefined && (
        <span
          style={{
            padding: '2px 6px',
            background: active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
            borderRadius: 4,
            fontSize: 11,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ============================================
// SUMMARY TAB CONTENT
// ============================================

function SummaryTab({ preview }: { preview: PacketPreview }) {
  const { manifest, parsed, files, totalBytes } = preview;
  const gateStatus = parsed.gateResult?.passed ?? false;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Gate Status Banner */}
      <div
        style={{
          padding: 16,
          background: gateStatus
            ? 'rgba(34,197,94,0.1)'
            : 'rgba(239,68,68,0.1)',
          border: `1px solid ${gateStatus ? '#22c55e' : '#ef4444'}`,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: gateStatus ? '#22c55e' : '#ef4444',
            display: 'grid',
            placeItems: 'center',
            fontSize: 20,
          }}
        >
          {gateStatus ? '✓' : '✕'}
        </div>
        <div>
          <div style={{ fontWeight: 600, color: '#fff' }}>
            Safety Gate: {gateStatus ? 'PASSED' : 'FAILED'}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
            {gateStatus
              ? 'All manufacturing checks passed. Ready for production.'
              : `${parsed.gateResult?.summary?.blockerCount || 0} blockers must be resolved.`}
          </div>
        </div>
      </div>

      {/* Packet Info Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <InfoCard label="Job ID" value={manifest.jobId} mono />
        <InfoCard label="Project ID" value={manifest.projectId} />
        <InfoCard label="Created" value={formatDate(preview.createdAt)} />
        <InfoCard label="Tool Version" value={manifest.toolVersion} />
      </div>

      {/* Files Summary */}
      <div>
        <h4 style={{ margin: '0 0 12px', color: '#fff', fontSize: 14 }}>
          Package Contents
        </h4>
        <div
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid #3a3a5a',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          {files.map((file, i) => (
            <div
              key={file.path}
              style={{
                padding: '10px 14px',
                borderBottom: i < files.length - 1 ? '1px solid #3a3a5a' : 'none',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#8b5cf6' }}>
                {file.path}
              </span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                {formatBytes(file.sizeBytes)}
              </span>
            </div>
          ))}
          <div
            style={{
              padding: '10px 14px',
              background: 'rgba(139,92,246,0.1)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontWeight: 600, color: '#fff' }}>Total</span>
            <span style={{ fontWeight: 600, color: '#8b5cf6' }}>
              {formatBytes(totalBytes)}
            </span>
          </div>
        </div>
      </div>

      {/* Content Hash */}
      <div>
        <h4 style={{ margin: '0 0 8px', color: '#fff', fontSize: 14 }}>
          Content Hash (SHA-256)
        </h4>
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid #3a3a5a',
            borderRadius: 8,
            fontFamily: 'monospace',
            fontSize: 11,
            color: 'rgba(255,255,255,0.7)',
            wordBreak: 'break-all',
          }}
        >
          {preview.contentHash}
        </div>
      </div>
    </div>
  );
}

// ============================================
// CUT LIST TAB CONTENT
// ============================================

function CutListTab({ preview }: { preview: PacketPreview }) {
  const cutlist = preview.parsed.cutlist;
  if (!cutlist || cutlist.rows.length === 0) {
    return <EmptyState message="No cut list data available" />;
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Summary */}
      <div style={{ display: 'flex', gap: 16 }}>
        <StatCard label="Total Rows" value={cutlist.summary.totalRows} />
        <StatCard label="Total Parts" value={cutlist.summary.totalParts} />
        <StatCard
          label="Materials"
          value={Object.keys(cutlist.summary.byMaterial).length}
        />
      </div>

      {/* Table */}
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid #3a3a5a',
          borderRadius: 8,
          overflow: 'auto',
          maxHeight: 400,
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'rgba(139,92,246,0.1)' }}>
              <th style={thStyle}>#</th>
              <th style={thStyle}>Part ID</th>
              <th style={thStyle}>Material</th>
              <th style={thStyle}>Qty</th>
              <th style={thStyle}>Finish W</th>
              <th style={thStyle}>Finish H</th>
              <th style={thStyle}>Cut W</th>
              <th style={thStyle}>Cut H</th>
              <th style={thStyle}>Grain</th>
            </tr>
          </thead>
          <tbody>
            {cutlist.rows.map((row) => (
              <tr key={row.partId} style={{ borderBottom: '1px solid #3a3a5a' }}>
                <td style={tdStyle}>{row.rowNo}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#8b5cf6' }}>
                  {row.partId.slice(0, 12)}
                </td>
                <td style={tdStyle}>{row.materialId}</td>
                <td style={tdStyle}>{row.qty}</td>
                <td style={tdStyle}>{row.finishW}</td>
                <td style={tdStyle}>{row.finishH}</td>
                <td style={{ ...tdStyle, fontWeight: 600, color: '#22c55e' }}>
                  {row.cutW}
                </td>
                <td style={{ ...tdStyle, fontWeight: 600, color: '#22c55e' }}>
                  {row.cutH}
                </td>
                <td style={tdStyle}>{row.grain}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================
// DRILL MAP TAB CONTENT
// ============================================

function DrillMapTab({ preview }: { preview: PacketPreview }) {
  const drillmap = preview.parsed.drillmap;
  if (!drillmap || drillmap.panels.length === 0) {
    return <EmptyState message="No drill map data available" />;
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Summary */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <StatCard label="Total Drills" value={drillmap.summary.totalDrills} />
        <StatCard label="Total Bores" value={drillmap.summary.totalBores} />
        <StatCard label="Panels" value={drillmap.panels.length} />
        <StatCard label="Tools" value={drillmap.tools.length} />
      </div>

      {/* By Purpose */}
      <div>
        <h4 style={{ margin: '0 0 12px', color: '#fff', fontSize: 14 }}>
          By Purpose
        </h4>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {Object.entries(drillmap.summary.byPurpose).map(([purpose, count]) => (
            <div
              key={purpose}
              style={{
                padding: '8px 14px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid #3a3a5a',
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>{purpose}: </span>
              <span style={{ fontWeight: 600, color: '#fff' }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tools */}
      <div>
        <h4 style={{ margin: '0 0 12px', color: '#fff', fontSize: 14 }}>
          Required Tools
        </h4>
        <div
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid #3a3a5a',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          {drillmap.tools.map((tool, i) => (
            <div
              key={tool.toolId}
              style={{
                padding: '10px 14px',
                borderBottom: i < drillmap.tools.length - 1 ? '1px solid #3a3a5a' : 'none',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <span style={{ color: '#fff', fontWeight: 500 }}>{tool.name}</span>
                <span style={{ marginLeft: 10, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                  {tool.diameter}mm {tool.type}
                </span>
              </div>
              <span style={{ fontSize: 12, color: '#8b5cf6' }}>
                {tool.usageCount} uses
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Panels */}
      <div>
        <h4 style={{ margin: '0 0 12px', color: '#fff', fontSize: 14 }}>
          Panels ({drillmap.panels.length})
        </h4>
        <div style={{ display: 'grid', gap: 10 }}>
          {drillmap.panels.map((panel) => (
            <div
              key={panel.panelId}
              style={{
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid #3a3a5a',
                borderRadius: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'monospace', color: '#8b5cf6' }}>
                  {panel.panelId}
                </span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                  {panel.role}
                </span>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                {panel.dimensions[0]} × {panel.dimensions[1]} × {panel.dimensions[2]} mm
                &nbsp;·&nbsp;
                <span style={{ color: '#22c55e' }}>{panel.points.length} points</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// CONNECTORS TAB CONTENT
// ============================================

function ConnectorsTab({ preview }: { preview: PacketPreview }) {
  const connectors = preview.parsed.connectorsMinifix;
  if (!connectors || connectors.minifix.length === 0) {
    return <EmptyState message="No connector data available" />;
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Summary */}
      <div style={{ display: 'flex', gap: 16 }}>
        <StatCard label="Total Pairs" value={connectors.summary.totalPairs} />
        <StatCard label="Valid" value={connectors.summary.validPairs} color="#22c55e" />
        <StatCard label="Warning" value={connectors.summary.warningPairs} color="#f59e0b" />
        <StatCard label="Error" value={connectors.summary.errorPairs} color="#ef4444" />
      </div>

      {/* Pairs List */}
      <div>
        <h4 style={{ margin: '0 0 12px', color: '#fff', fontSize: 14 }}>
          Minifix Pairs
        </h4>
        <div
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid #3a3a5a',
            borderRadius: 8,
            maxHeight: 400,
            overflow: 'auto',
          }}
        >
          {connectors.minifix.map((pair, i) => {
            const statusColor =
              pair.status === 'VALID' ? '#22c55e' :
              pair.status === 'WARNING' ? '#f59e0b' : '#ef4444';

            return (
              <div
                key={pair.id}
                style={{
                  padding: '12px 14px',
                  borderBottom: i < connectors.minifix.length - 1 ? '1px solid #3a3a5a' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'monospace', color: '#8b5cf6', fontSize: 13 }}>
                    {pair.id}
                  </span>
                  <span
                    style={{
                      padding: '2px 8px',
                      background: `${statusColor}20`,
                      border: `1px solid ${statusColor}`,
                      borderRadius: 4,
                      fontSize: 11,
                      color: statusColor,
                      fontWeight: 600,
                    }}
                  >
                    {pair.status}
                  </span>
                </div>
                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)' }}>
                    <div style={{ marginBottom: 4, color: '#fff', fontWeight: 500 }}>Cam Housing</div>
                    <div>Panel: {pair.cam.panelId.slice(0, 12)}</div>
                    <div>Ø{pair.cam.diameter}mm × {pair.cam.depth}mm</div>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.6)' }}>
                    <div style={{ marginBottom: 4, color: '#fff', fontWeight: 500 }}>Bolt</div>
                    <div>Panel: {pair.bolt.panelId.slice(0, 12)}</div>
                    <div>Ø{pair.bolt.diameter}mm × {pair.bolt.depth}mm</div>
                  </div>
                </div>
                {pair.issues && pair.issues.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#f59e0b' }}>
                    {pair.issues.join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================
// GATE TAB CONTENT
// ============================================

function GateTab({ preview }: { preview: PacketPreview }) {
  const gate = preview.parsed.gateResult;
  if (!gate) {
    return <EmptyState message="No gate result available" />;
  }

  const { blockers, warnings, info } = gate.findings;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Summary */}
      <div style={{ display: 'flex', gap: 16 }}>
        <StatCard
          label="Status"
          value={gate.passed ? 'PASSED' : 'FAILED'}
          color={gate.passed ? '#22c55e' : '#ef4444'}
        />
        <StatCard label="Blockers" value={gate.summary.blockerCount} color="#ef4444" />
        <StatCard label="Warnings" value={gate.summary.warningCount} color="#f59e0b" />
        <StatCard label="Info" value={gate.summary.infoCount} color="#3b82f6" />
      </div>

      {/* Metadata */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <InfoCard label="Policy Version" value={gate.policyVersion} />
        <InfoCard label="Run At" value={gate.runAt} />
      </div>

      {/* Blockers */}
      {blockers.length > 0 && (
        <FindingsSection title="Blockers" findings={blockers} color="#ef4444" />
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <FindingsSection title="Warnings" findings={warnings} color="#f59e0b" />
      )}

      {/* Info */}
      {info.length > 0 && (
        <FindingsSection title="Information" findings={info} color="#3b82f6" />
      )}

      {/* All Clear */}
      {blockers.length === 0 && warnings.length === 0 && info.length === 0 && (
        <div
          style={{
            padding: 24,
            textAlign: 'center',
            background: 'rgba(34,197,94,0.1)',
            border: '1px solid #22c55e',
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
          <div style={{ color: '#22c55e', fontWeight: 600 }}>All Checks Passed</div>
        </div>
      )}
    </div>
  );
}

// ============================================
// SHARED COMPONENTS
// ============================================

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontWeight: 600,
  color: '#fff',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  color: 'rgba(255,255,255,0.8)',
};

function InfoCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid #3a3a5a',
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          color: '#fff',
          fontFamily: mono ? 'monospace' : 'inherit',
          fontSize: mono ? 12 : 14,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div
      style={{
        padding: '12px 16px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid #3a3a5a',
        borderRadius: 8,
        minWidth: 100,
      }}
    >
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, color: color || '#fff' }}>
        {value}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: 40,
        textAlign: 'center',
        color: 'rgba(255,255,255,0.5)',
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>
      {message}
    </div>
  );
}

function FindingsSection({
  title,
  findings,
  color,
}: {
  title: string;
  findings: Array<{ key: string; code: string; message: string; entityIds: string[] }>;
  color: string;
}) {
  return (
    <div>
      <h4 style={{ margin: '0 0 12px', color, fontSize: 14 }}>
        {title} ({findings.length})
      </h4>
      <div style={{ display: 'grid', gap: 8 }}>
        {findings.map((f) => (
          <div
            key={f.key}
            style={{
              padding: '12px 14px',
              background: `${color}10`,
              border: `1px solid ${color}40`,
              borderRadius: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: 'monospace', color, fontSize: 12 }}>{f.code}</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{f.key}</span>
            </div>
            <div style={{ color: '#fff', fontSize: 13 }}>{f.message}</div>
            {f.entityIds.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                Affects: {f.entityIds.join(', ')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// MAIN MODAL COMPONENT
// ============================================

export function PacketPreviewModal({
  open,
  onClose,
  preview,
  onDownload,
  isDownloading = false,
}: PacketPreviewModalProps) {
  const [activeTab, setActiveTab] = useState<PreviewTab>('summary');

  if (!open || !preview) return null;

  const gateStatus = preview.parsed.gateResult?.passed ?? false;
  const blockerCount = preview.parsed.gateResult?.summary?.blockerCount ?? 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: '90%',
          maxWidth: 900,
          maxHeight: '90vh',
          background: '#1a1a2e',
          border: '1px solid #3a3a5a',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #3a3a5a',
            background: gateStatus
              ? 'rgba(34,197,94,0.1)'
              : 'rgba(239,68,68,0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ margin: 0, color: '#fff', fontSize: 18 }}>
              Factory Packet Preview
            </h2>
            <div style={{ marginTop: 4, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
              Job: {preview.jobId}
            </div>
          </div>
          <div
            style={{
              padding: '8px 16px',
              background: gateStatus ? '#22c55e' : '#ef4444',
              borderRadius: 6,
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {gateStatus ? 'GATE PASSED' : `${blockerCount} BLOCKER${blockerCount !== 1 ? 'S' : ''}`}
          </div>
        </div>

        {/* Tabs */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid #3a3a5a',
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <TabButton
            active={activeTab === 'summary'}
            label="Summary"
            onClick={() => setActiveTab('summary')}
          />
          <TabButton
            active={activeTab === 'cutlist'}
            label="Cut List"
            count={preview.parsed.cutlist?.rows?.length}
            onClick={() => setActiveTab('cutlist')}
          />
          <TabButton
            active={activeTab === 'drillmap'}
            label="Drill Map"
            count={preview.parsed.drillmap?.panels?.length}
            onClick={() => setActiveTab('drillmap')}
          />
          <TabButton
            active={activeTab === 'connectors'}
            label="Connectors"
            count={preview.parsed.connectorsMinifix?.minifix?.length}
            onClick={() => setActiveTab('connectors')}
          />
          <TabButton
            active={activeTab === 'gate'}
            label="Gate Result"
            count={blockerCount > 0 ? blockerCount : undefined}
            onClick={() => setActiveTab('gate')}
            variant={gateStatus ? 'success' : 'error'}
          />
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: 20, overflow: 'auto' }}>
          {activeTab === 'summary' && <SummaryTab preview={preview} />}
          {activeTab === 'cutlist' && <CutListTab preview={preview} />}
          {activeTab === 'drillmap' && <DrillMapTab preview={preview} />}
          {activeTab === 'connectors' && <ConnectorsTab preview={preview} />}
          {activeTab === 'gate' && <GateTab preview={preview} />}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid #3a3a5a',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            {preview.files.length} files · {formatBytes(preview.totalBytes)} uncompressed
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={onClose}
              style={{
                padding: '10px 20px',
                background: 'transparent',
                border: '1px solid #3a3a5a',
                borderRadius: 6,
                color: 'rgba(255,255,255,0.7)',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
            <button
              onClick={onDownload}
              disabled={isDownloading}
              style={{
                padding: '10px 24px',
                background: gateStatus ? '#22c55e' : '#8b5cf6',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: isDownloading ? 'wait' : 'pointer',
                opacity: isDownloading ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {isDownloading ? 'Downloading...' : 'Download ZIP'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PacketPreviewModal;
