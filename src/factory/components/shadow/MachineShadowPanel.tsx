/**
 * MachineShadowPanel — Digital Shadow dashboard panel
 *
 * Left column: machine list with live state
 * Right column: selected machine details + component health table
 *
 * @version 1.1.0  — overallHealth pre-fetch + badge wired into MachineCard
 */
import React, { useEffect } from 'react';
import {
  useMachineShadowStore,
  selectSelectedMachine,
  selectSelectedMaintenance,
} from '../../state/machineShadowStore';
import { MachineCard } from './MachineCard';
import { ComponentHealthTable } from './ComponentHealthTable';
import { HealthBadge, StateBadge } from './HealthBadge';
import type { HealthStatus } from '../../api/digitalShadowApi';
import { WwUnitState } from '../../api/digitalShadowApi';

export function MachineShadowPanel(): React.ReactElement {
  const {
    machines,
    machinesLoading,
    serviceStatus,
    serviceError,
    serviceHealth,
    lastPollAt,
    selectedMachineId,
    maintenanceByMachineId,
    maintenanceLoading,
    maintenanceError,
    pollActive,
    startPolling,
    stopPolling,
    selectMachine,
    loadMaintenance,
  } = useMachineShadowStore();

  const selectedMachine = useMachineShadowStore(selectSelectedMachine);
  const maintenance = useMachineShadowStore(selectSelectedMaintenance);

  // Start polling on mount, stop on unmount
  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  // Pre-fetch maintenance for every machine so the factory grid shows health
  // badges without requiring the user to click each machine first.
  useEffect(() => {
    if (machines.length === 0) return;
    machines.forEach((m) => {
      // Skip if already loaded to avoid re-fetching on every poll cycle
      if (!maintenanceByMachineId[m.machineId]) {
        void loadMaintenance(m.machineId);
      }
    });
  }, [machines, maintenanceByMachineId, loadMaintenance]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0a0a15',
        color: '#fff',
      }}
    >
      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          background: '#0d0d1a',
          borderBottom: '1px solid #1e1e2e',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Digital Shadow</span>
          <ServiceStatusPill status={serviceStatus} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {lastPollAt && (
            <span style={{ fontSize: 11, color: '#4b5563' }}>
              Updated {new Date(lastPollAt).toLocaleTimeString()}
            </span>
          )}
          {serviceHealth && (
            <span style={{ fontSize: 11, color: '#4b5563' }}>
              v{serviceHealth.version} · uptime {Math.round(serviceHealth.uptime / 60)}m
            </span>
          )}
          <button
            onClick={pollActive ? stopPolling : startPolling}
            style={{
              padding: '4px 12px',
              fontSize: 11,
              borderRadius: 6,
              border: '1px solid #3a3a5a',
              background: pollActive ? '#1a2a1a' : '#1a1a2e',
              color: pollActive ? '#22c55e' : '#9ca3af',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {pollActive ? '⏸ Live' : '▶ Start'}
          </button>
        </div>
      </div>

      {/* ── Error Banner ─────────────────────────────────────────────────── */}
      {serviceError && (
        <div
          style={{
            padding: '8px 20px',
            background: '#1a0d0d',
            borderBottom: '1px solid #ef444444',
            color: '#ef4444',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>⚠</span>
          <span>Cannot reach digital-shadow-service: {serviceError}</span>
          <span style={{ color: '#6b7280', marginLeft: 4 }}>
            — check VITE_SHADOW_API_BASE
          </span>
        </div>
      )}

      {/* ── Content (machine list + detail) ──────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ─ Left: machine list ─ */}
        <div
          style={{
            width: 300,
            flexShrink: 0,
            borderRight: '1px solid #1e1e2e',
            overflowY: 'auto',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, paddingLeft: 4 }}>
            {machines.length} Machine{machines.length !== 1 ? 's' : ''}
          </div>

          {machinesLoading && machines.length === 0 && (
            <div style={{ color: '#4b5563', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
              Connecting…
            </div>
          )}

          {!machinesLoading && machines.length === 0 && !serviceError && (
            <div style={{ color: '#4b5563', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
              No machines registered
            </div>
          )}

          {machines.map((m) => (
            <MachineCard
              key={m.machineId}
              machine={m}
              selected={m.machineId === selectedMachineId}
              onClick={() => selectMachine(m.machineId)}
              overallHealth={maintenanceByMachineId[m.machineId]?.overallHealth}
            />
          ))}
        </div>

        {/* ─ Right: detail pane ─ */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {!selectedMachine && (
            <EmptyDetail />
          )}

          {selectedMachine && (
            <>
              {/* Machine header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#fff' }}>
                    {selectedMachine.machineId}
                  </h2>
                  {selectedMachine.currentProgram && (
                    <div style={{ fontSize: 12, color: '#60a5fa', marginTop: 3 }}>
                      Running: {selectedMachine.currentProgram}
                    </div>
                  )}
                </div>
                <StateBadge state={selectedMachine.state as WwUnitState} />
              </div>

              {/* Live telemetry strip */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 10,
                  marginBottom: 20,
                }}
              >
                {[
                  { label: 'Spindle RPM', value: selectedMachine.spindleSpeed.toLocaleString(), unit: 'rpm' },
                  { label: 'Feed Rate', value: selectedMachine.feedRate.toLocaleString(), unit: 'mm/min' },
                  { label: 'Active Tool', value: selectedMachine.toolId || '—', unit: '' },
                  { label: 'Parts Made', value: selectedMachine.partCount.toLocaleString(), unit: 'pcs' },
                ].map(({ label, value, unit }) => (
                  <TelemetryCard key={label} label={label} value={value} unit={unit} />
                ))}
              </div>

              {/* Component Health Table */}
              <div style={{ marginBottom: 16 }}>
                <SectionTitle>Predictive Maintenance — Component RUL</SectionTitle>

                {maintenanceLoading && (
                  <div style={{ color: '#4b5563', fontSize: 12, padding: 20, textAlign: 'center' }}>
                    Loading maintenance data…
                  </div>
                )}

                {maintenanceError && (
                  <div style={{ color: '#ef4444', fontSize: 12, padding: 12, background: '#1a0d0d', borderRadius: 8 }}>
                    ⚠ {maintenanceError}
                  </div>
                )}

                {maintenance && !maintenanceLoading && (
                  <>
                    {/* Overall health summary */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>Overall:</span>
                      <HealthBadge status={maintenance.overallHealth as HealthStatus} />
                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                        Op hours: {maintenance.operatingHours.toLocaleString()} h
                      </span>
                    </div>
                    <ComponentHealthTable maintenance={maintenance} />
                  </>
                )}

                {!maintenance && !maintenanceLoading && !maintenanceError && (
                  <div style={{ color: '#4b5563', fontSize: 12, padding: 20, textAlign: 'center' }}>
                    Select a machine to load RUL predictions
                  </div>
                )}
              </div>

              {/* Active alarms detail */}
              {selectedMachine.alarms.length > 0 && (
                <div>
                  <SectionTitle>Active Alarms ({selectedMachine.alarms.length})</SectionTitle>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selectedMachine.alarms.map((alarm, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '8px 12px',
                          background: '#1a0d0d',
                          border: '1px solid #ef444433',
                          borderRadius: 6,
                          fontSize: 12,
                          color: '#ef4444',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span>⚠</span>
                        <span>{alarm}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ServiceStatusPill({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    idle: { color: '#6b7280', label: 'Idle' },
    connecting: { color: '#f59e0b', label: 'Connecting' },
    live: { color: '#22c55e', label: 'Live' },
    error: { color: '#ef4444', label: 'Error' },
  };
  const { color, label } = map[status] ?? { color: '#6b7280', label: status };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 10,
        fontWeight: 700,
        color,
        background: color + '18',
        border: `1px solid ${color}44`,
        borderRadius: 20,
        padding: '2px 8px',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: color,
          boxShadow: status === 'live' ? `0 0 5px ${color}` : 'none',
        }}
      />
      {label}
    </span>
  );
}

function TelemetryCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        background: '#111827',
        border: '1px solid #1e2e3e',
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{value}</span>
        {unit && <span style={{ fontSize: 11, color: '#6b7280' }}>{unit}</span>}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        margin: '0 0 10px',
        fontSize: 12,
        fontWeight: 700,
        color: '#6b7280',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        paddingBottom: 6,
        borderBottom: '1px solid #1e1e2e',
      }}
    >
      {children}
    </h3>
  );
}

function EmptyDetail() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
        color: '#374151',
      }}
    >
      <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18" />
      </svg>
      <span style={{ fontSize: 13 }}>Select a machine to view details</span>
    </div>
  );
}

