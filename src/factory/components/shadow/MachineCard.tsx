/**
 * MachineCard — compact card showing a single CNC machine's live status
 * v1.1.0 — overallHealth badge from live /maintenance Redis aggregation
 */
import React from 'react';
import { StateBadge, HealthBadge } from './HealthBadge';
import type { HealthStatus } from '../../api/digitalShadowApi';
import type { MachineShadowState } from '../../api/digitalShadowApi';
import { WwUnitState, WW_STATE_COLOR } from '../../api/digitalShadowApi';

interface MachineCardProps {
  machine: MachineShadowState;
  selected?: boolean;
  onClick?: () => void;
  /** Live Redis-aggregated overall health; undefined while not yet loaded. */
  overallHealth?: HealthStatus;
}

const CONNECTION_COLOR: Record<string, string> = {
  CONNECTED: '#22c55e',
  DEGRADED: '#f59e0b',
  DISCONNECTED: '#6b7280',
};

export function MachineCard({
  machine,
  selected = false,
  onClick,
  overallHealth,
}: MachineCardProps): React.ReactElement {
  const connColor = CONNECTION_COLOR[machine.connectionStatus] ?? '#6b7280';
  const stateColor = WW_STATE_COLOR[machine.state as WwUnitState] ?? '#6b7280';

  return (
    <button
      onClick={onClick}
      style={{
        all: 'unset',
        display: 'block',
        cursor: 'pointer',
        width: '100%',
        padding: '14px 16px',
        background: selected ? '#1e2a4a' : '#1a1a2e',
        border: `1px solid ${selected ? '#3b82f6' : '#2a2a3e'}`,
        borderRadius: 10,
        transition: 'border-color 0.15s, background 0.15s',
        boxSizing: 'border-box',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Connection dot */}
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: connColor,
              boxShadow: machine.connectionStatus === 'CONNECTED' ? `0 0 6px ${connColor}` : 'none',
              flexShrink: 0,
            }}
          />
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>
            {machine.machineId}
          </span>
        </div>
        <StateBadge state={machine.state as WwUnitState} size="sm" />
        {overallHealth !== undefined && (
          <HealthBadge status={overallHealth} size="sm" />
        )}
      </div>

      {/* Telemetry row */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginTop: 10,
          padding: '8px 10px',
          background: '#0d0d1a',
          borderRadius: 6,
        }}
      >
        <TelemetryItem label="RPM" value={machine.spindleSpeed.toLocaleString()} color={stateColor} />
        <TelemetryItem label="Feed" value={`${machine.feedRate} mm/m`} />
        <TelemetryItem label="Tool" value={machine.toolId || '—'} />
        <TelemetryItem label="Parts" value={machine.partCount.toLocaleString()} />
      </div>

      {/* Active alarms */}
      {machine.alarms.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {machine.alarms.slice(0, 2).map((alarm, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: '#ef4444',
                marginTop: 3,
              }}
            >
              <span>⚠</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {alarm}
              </span>
            </div>
          ))}
          {machine.alarms.length > 2 && (
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
              +{machine.alarms.length - 2} more alarms
            </div>
          )}
        </div>
      )}

      {/* Job context */}
      {machine.currentJobId && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#60a5fa' }}>
          Job: {machine.currentJobId}
          {machine.currentProgram ? ` · ${machine.currentProgram}` : ''}
        </div>
      )}
    </button>
  );
}

function TelemetryItem({
  label,
  value,
  color = '#9ca3af',
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  );
}

