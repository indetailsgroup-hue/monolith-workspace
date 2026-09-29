/**
 * ComponentHealthTable — table showing all 10 CNC components with RUL gauges
 */
import React from 'react';
import { RULGauge } from './RULGauge';
import { HealthBadge } from './HealthBadge';
import type { MaintenanceResponse, ComponentHealthResult, HealthStatus } from '../../api/digitalShadowApi';

interface ComponentHealthTableProps {
  maintenance: MaintenanceResponse;
}

// Characteristic scale (η) by component type — hours
const COMPONENT_SCALE: Record<string, number> = {
  SPINDLE: 8000,
  BALL_SCREW_X: 12000,
  BALL_SCREW_Y: 12000,
  BALL_SCREW_Z: 10000,
  LINEAR_GUIDE_X: 15000,
  LINEAR_GUIDE_Y: 15000,
  LINEAR_GUIDE_Z: 12000,
  TOOL_HOLDER: 2000,
  VACUUM_PUMP: 6000,
  ATC_MAGAZINE: 10000,
};

export function ComponentHealthTable({
  maintenance,
}: ComponentHealthTableProps): React.ReactElement {
  const sorted = [...maintenance.components].sort(
    (a, b) => a.remainingUsefulLife - b.remainingUsefulLife
  );

  return (
    <div
      style={{
        background: '#111827',
        borderRadius: 10,
        border: '1px solid #2a2a3e',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 80px 100px 120px 1fr',
          padding: '8px 16px',
          background: '#0d0d1a',
          borderBottom: '1px solid #2a2a3e',
          gap: 8,
        }}
      >
        {['Component', 'Health', 'RUL (h)', 'Confidence', 'Risk Factors'].map((h) => (
          <span key={h} style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {h}
          </span>
        ))}
      </div>

      {/* Rows */}
      {sorted.map((comp, idx) => (
        <ComponentRow
          key={comp.componentType}
          comp={comp}
          scale={COMPONENT_SCALE[comp.componentType] ?? 10000}
          isLast={idx === sorted.length - 1}
        />
      ))}

      {/* Summary footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 16px',
          background: '#0d0d1a',
          borderTop: '1px solid #2a2a3e',
        }}
      >
        <span style={{ fontSize: 11, color: '#6b7280' }}>
          Assessed: {new Date(maintenance.assessedAt).toLocaleString()}
        </span>
        <div style={{ display: 'flex', gap: 12 }}>
          {maintenance.criticalCount > 0 && (
            <span style={{ fontSize: 11, color: '#ef4444' }}>
              {maintenance.criticalCount} CRITICAL
            </span>
          )}
          {maintenance.warningCount > 0 && (
            <span style={{ fontSize: 11, color: '#f59e0b' }}>
              {maintenance.warningCount} WARNING
            </span>
          )}
          {maintenance.criticalCount === 0 && maintenance.warningCount === 0 && (
            <span style={{ fontSize: 11, color: '#22c55e' }}>All Healthy</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ComponentRow({
  comp,
  scale,
  isLast,
}: {
  comp: ComponentHealthResult;
  scale: number;
  isLast: boolean;
}): React.ReactElement {
  const criticalFactors = comp.contributingFactors.filter((f) => f.severity === 'high');

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px 100px 120px 1fr',
        padding: '10px 16px',
        borderBottom: isLast ? 'none' : '1px solid #1e1e2e',
        alignItems: 'center',
        gap: 8,
        background:
          comp.status === 'CRITICAL' || comp.status === 'FAILED'
            ? '#1a0d0d'
            : comp.status === 'WARNING'
            ? '#1a140d'
            : 'transparent',
      }}
    >
      {/* Component name */}
      <span style={{ fontSize: 12, color: '#e5e7eb', fontWeight: 600 }}>
        {comp.componentType.replace(/_/g, ' ')}
      </span>

      {/* Health badge */}
      <HealthBadge status={comp.status as HealthStatus} size="sm" />

      {/* RUL gauge + hours */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <RULGauge
          rulHours={comp.remainingUsefulLife}
          scaleHours={scale}
          confidence={comp.confidence}
          status={comp.status}
          size={48}
        />
      </div>

      {/* Confidence bar */}
      <div>
        <div
          style={{
            height: 4,
            borderRadius: 2,
            background: '#1a1a2e',
            overflow: 'hidden',
            marginBottom: 3,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.round(comp.confidence * 100)}%`,
              background:
                comp.confidence > 0.7
                  ? '#22c55e'
                  : comp.confidence > 0.4
                  ? '#f59e0b'
                  : '#ef4444',
              borderRadius: 2,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
        <span style={{ fontSize: 10, color: '#6b7280' }}>
          {Math.round(comp.confidence * 100)}%
        </span>
      </div>

      {/* Risk factors */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {criticalFactors.length === 0 ? (
          <span style={{ fontSize: 10, color: '#374151' }}>—</span>
        ) : (
          criticalFactors.slice(0, 3).map((f) => (
            <span
              key={f.feature}
              style={{
                fontSize: 9,
                padding: '2px 6px',
                background: '#ef444422',
                border: '1px solid #ef444444',
                color: '#ef4444',
                borderRadius: 4,
                textTransform: 'uppercase',
                letterSpacing: 0.3,
              }}
            >
              {f.feature}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
