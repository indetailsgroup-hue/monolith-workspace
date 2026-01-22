/**
 * ToolHealthModal.tsx - Tool Health Detail Modal
 *
 * Shows detailed tool health information with material breakdown.
 * Opens when clicking on a tool in ToolHealthStrip.
 *
 * D6-E.2: Factory Intelligence UI
 * @version 1.0.0
 */

import React, { useEffect, useState } from 'react';
import type { ToolHealth, ToolUsageRecord } from '../../tooling';
import {
  getToolHealth,
  getToolUsageRecord,
  summarizeWearByMaterial,
  type WearSummary,
} from '../../tooling';

export interface ToolHealthModalProps {
  /** Tool ID to display */
  toolId: string;
  /** Whether modal is open */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
}

/**
 * Get color for tool health status.
 */
function getStatusColor(status: ToolHealth['status']): string {
  switch (status) {
    case 'OVER_LIMIT':
      return '#ef4444';
    case 'NEARING_LIMIT':
      return '#f59e0b';
    case 'OK':
      return '#22c55e';
  }
}

/**
 * Get label for tool health status.
 */
function getStatusLabel(status: ToolHealth['status']): string {
  switch (status) {
    case 'OVER_LIMIT':
      return 'Over Limit';
    case 'NEARING_LIMIT':
      return 'Nearing Limit';
    case 'OK':
      return 'OK';
  }
}

export function ToolHealthModal({
  toolId,
  isOpen,
  onClose,
}: ToolHealthModalProps): React.ReactElement | null {
  const [health, setHealth] = useState<ToolHealth | null>(null);
  const [record, setRecord] = useState<ToolUsageRecord | null>(null);
  const [summary, setSummary] = useState<WearSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const [h, r] = await Promise.all([
          getToolHealth(toolId),
          getToolUsageRecord(toolId),
        ]);

        if (mounted) {
          setHealth(h);
          setRecord(r);
          setSummary(r ? summarizeWearByMaterial(r) : null);
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setHealth(null);
          setRecord(null);
          setSummary(null);
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [toolId, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          backgroundColor: '#1a1a2e',
          border: '1px solid #3a3a5a',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #3a3a5a',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: '#fff',
            }}
          >
            Tool: {toolId}
          </h3>
          <button
            onClick={onClose}
            style={{
              padding: '4px 8px',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#888',
              fontSize: 18,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px' }}>
          {loading ? (
            <div style={{ color: '#888', textAlign: 'center' }}>Loading...</div>
          ) : health ? (
            <>
              {/* Status Badge */}
              <HealthStatusBadge health={health} />

              {/* Stats Grid */}
              {record && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                    marginTop: 20,
                  }}
                >
                  <StatBox label="Total Holes" value={record.totalHoles.toLocaleString()} />
                  <StatBox
                    label="Total Depth"
                    value={`${(record.totalDepthMm / 1000).toFixed(1)} m`}
                  />
                  <StatBox
                    label="Wear Units"
                    value={Math.round(health.wearUnits).toLocaleString()}
                  />
                  <StatBox
                    label="Max Wear"
                    value={Math.round(health.maxWearUnits).toLocaleString()}
                  />
                </div>
              )}

              {/* Material Breakdown */}
              {summary && summary.items.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h4
                    style={{
                      margin: '0 0 12px',
                      fontSize: 12,
                      fontWeight: 500,
                      color: '#888',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Wear by Material
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {summary.items.map((item) => (
                      <MaterialBar key={item.material} item={item} />
                    ))}
                  </div>
                </div>
              )}

              {/* Last Job */}
              {record?.lastJobId && (
                <div
                  style={{
                    marginTop: 20,
                    padding: '8px 12px',
                    backgroundColor: '#2a2a4a',
                    borderRadius: '6px',
                    fontSize: 11,
                    color: '#888',
                  }}
                >
                  Last used in job: <span style={{ color: '#aaa' }}>{record.lastJobId}</span>
                </div>
              )}
            </>
          ) : (
            <div style={{ color: '#888', textAlign: 'center' }}>Tool not found</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Health Status Badge
// ============================================================================

interface HealthStatusBadgeProps {
  health: ToolHealth;
}

function HealthStatusBadge({ health }: HealthStatusBadgeProps): React.ReactElement {
  const color = getStatusColor(health.status);
  const wearPct = Math.round(100 - health.healthPct);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        backgroundColor: `${color}15`,
        border: `1px solid ${color}40`,
        borderRadius: '8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: color,
          }}
        />
        <span style={{ fontSize: 14, fontWeight: 600, color }}>
          {getStatusLabel(health.status)}
        </span>
      </div>
      <span style={{ fontSize: 24, fontWeight: 700, color }}>{wearPct}%</span>
    </div>
  );
}

// ============================================================================
// Stat Box
// ============================================================================

interface StatBoxProps {
  label: string;
  value: string;
}

function StatBox({ label, value }: StatBoxProps): React.ReactElement {
  return (
    <div
      style={{
        padding: '10px 12px',
        backgroundColor: '#2a2a4a',
        borderRadius: '6px',
      }}
    >
      <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>{value}</div>
    </div>
  );
}

// ============================================================================
// Material Bar
// ============================================================================

interface MaterialBarProps {
  item: WearSummary['items'][number];
}

function MaterialBar({ item }: MaterialBarProps): React.ReactElement {
  // Material colors
  const materialColors: Record<string, string> = {
    HPL: '#ef4444',
    MELAMINE: '#f59e0b',
    PLYWOOD: '#3b82f6',
    MDF: '#22c55e',
    HMR: '#8b5cf6',
    UNKNOWN: '#888',
  };

  const color = materialColors[item.material] || '#888';

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 4,
          fontSize: 11,
        }}
      >
        <span style={{ color: '#aaa' }}>{item.material}</span>
        <span style={{ color: '#888' }}>
          {Math.round(item.wearUnits)} ({Math.round(item.percent)}%)
        </span>
      </div>
      <div
        style={{
          height: 6,
          backgroundColor: '#2a2a4a',
          borderRadius: '3px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${item.percent}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: '3px',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}

export default ToolHealthModal;
