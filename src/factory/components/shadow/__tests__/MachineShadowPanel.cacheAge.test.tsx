/**
 * MachineShadowPanel — cache-age-label Vitest tests
 *
 * Validates the freshness indicator rendered next to the HealthBadge:
 *   1. Amber (#f59e0b) + ⚠ icon when staleFeatures=true  (cacheAge=45 000 ms → "45 s ago")
 *   2. Grey  (#4b5563) + no icon when staleFeatures=false (cacheAge=30 000 ms → "30 s ago")
 *   3. Element absent when cacheAge=null
 *
 * Test file path: src/factory/components/shadow/__tests__/MachineShadowPanel.cacheAge.test.tsx
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MachineShadowPanel } from '../MachineShadowPanel';
import { useMachineShadowStore } from '../../../state/machineShadowStore';
import type { MaintenanceResponse } from '../../../api/digitalShadowApi';

// ─── Environment stub ─────────────────────────────────────────────────────────

vi.stubEnv('VITE_SHADOW_API_BASE', 'http://test-shadow:3001');

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../../api/digitalShadowApi', () => ({
  WwUnitState: { OFFLINE: 0, STANDBY: 1, READY: 2, WORKING: 3, ERROR: 4 },
  WW_STATE_LABEL:  { 0: 'OFFLINE', 1: 'STANDBY', 2: 'READY', 3: 'WORKING', 4: 'ERROR' },
  WW_STATE_COLOR:  { 0: '#6b7280', 1: '#f59e0b', 2: '#22c55e', 3: '#3b82f6', 4: '#ef4444' },
  HEALTH_COLOR: {
    HEALTHY:   '#22c55e',
    DEGRADING: '#84cc16',
    WARNING:   '#f59e0b',
    CRITICAL:  '#ef4444',
    FAILED:    '#7f1d1d',
  },
  fetchShadowHealth:         vi.fn().mockResolvedValue({ service: 'digital-shadow', version: '1.0.0', status: 'running', timestamp: new Date().toISOString(), uptime: 0, components: { opcua: { connected: false, machineCount: 0 }, mqtt: { connected: false, topicCount: 0 } } }),
  fetchAllMachines:          vi.fn().mockResolvedValue([]),
  fetchMachineState:         vi.fn().mockResolvedValue({}),
  fetchMachineMaintenance:   vi.fn().mockResolvedValue({}),
  openMachineEventStream:    vi.fn().mockReturnValue({ close: vi.fn(), addEventListener: vi.fn() }),
}));

// ─── Shared mock data ─────────────────────────────────────────────────────────

const mockMachine = {
  machineId: 'machine-01',
  timestamp: new Date().toISOString(),
  state: 2 as const,
  mode: 0,
  spindleSpeed: 0,
  feedRate: 0,
  toolId: 'T01',
  partCount: 0,
  alarms: [],
  connectionStatus: 'CONNECTED' as const,
};

const COMPONENT_TYPES = [
  'SPINDLE', 'BALL_SCREW_X', 'BALL_SCREW_Y', 'BALL_SCREW_Z',
  'LINEAR_GUIDE_X', 'LINEAR_GUIDE_Y', 'LINEAR_GUIDE_Z',
  'TOOL_HOLDER', 'VACUUM_PUMP', 'ATC_MAGAZINE',
] as const;

function makeMaintenance(
  cacheAge: number | null,
  staleFeatures: boolean | null,
): MaintenanceResponse {
  return {
    machineId: 'machine-01',
    assessedAt: new Date().toISOString(),
    operatingHours: 1000,
    overallHealth: 'HEALTHY',
    criticalCount: 0,
    warningCount: 0,
    cacheAge,
    staleFeatures,
    components: COMPONENT_TYPES.map((componentType) => ({
      componentType,
      healthScore: 0.9,
      status: 'HEALTHY' as const,
      remainingUsefulLife: 500,
      confidence: 0.95,
      rul: { median: 500, lowerBound: 400, upperBound: 600, survivalProbability: 0.9, hazardRate: 0.001, confidence: 0.95, method: 'WPHM' },
      contributingFactors: [],
    })),
  };
}

// ─── Store seed helper ────────────────────────────────────────────────────────

type StoreOverrides = Partial<ReturnType<typeof useMachineShadowStore.getState>>;

function seedStore(maintenance: MaintenanceResponse | null, overrides: StoreOverrides = {}) {
  useMachineShadowStore.setState({
    serviceHealth: null,
    serviceStatus: 'idle',
    serviceError: null,
    lastPollAt: null,
    machines: [mockMachine],
    machinesLoading: false,
    selectedMachineId: 'machine-01',
    maintenanceByMachineId: maintenance ? { 'machine-01': maintenance } : {},
    maintenanceLoading: false,
    maintenanceError: null,
    pollActive: false,
    activeEventSource: null,
    ...overrides,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MachineShadowPanel — cache-age-label', () => {
  beforeEach(() => {
    useMachineShadowStore.getState().stopPolling();
  });

  afterEach(() => {
    useMachineShadowStore.getState().stopPolling();
    vi.clearAllMocks();
  });

  // ── 1. Stale: amber color + ⚠ icon ─────────────────────────────────────────
  it('renders cache-age-label in amber with ⚠ icon when staleFeatures=true', async () => {
    // cacheAge=45 000 ms → formatCacheAge → "45 s ago"
    seedStore(makeMaintenance(45_000, true));

    await act(async () => {
      render(<MachineShadowPanel />);
    });

    const label = screen.getByTestId('cache-age-label');

    // Text content includes formatted age
    expect(label.textContent).toMatch(/features updated 45 s ago/i);

    // Stale icon is visible
    expect(screen.getByLabelText('Stale feature data')).toBeInTheDocument();

    // Amber colour (#f59e0b → rgb(245, 158, 11))
    expect(label).toHaveStyle({ color: 'rgb(245, 158, 11)' });
  });

  // ── 2. Fresh: grey color + no ⚠ icon ────────────────────────────────────────
  it('renders cache-age-label in grey without ⚠ icon when staleFeatures=false', async () => {
    // cacheAge=30 000 ms → formatCacheAge → "30 s ago"
    seedStore(makeMaintenance(30_000, false));

    await act(async () => {
      render(<MachineShadowPanel />);
    });

    const label = screen.getByTestId('cache-age-label');

    // Text content includes formatted age
    expect(label.textContent).toMatch(/features updated 30 s ago/i);

    // No stale icon
    expect(screen.queryByLabelText('Stale feature data')).not.toBeInTheDocument();

    // Grey colour (#4b5563 → rgb(75, 85, 99))
    expect(label).toHaveStyle({ color: 'rgb(75, 85, 99)' });
  });

  // ── 3. No cache data: label absent ──────────────────────────────────────────
  it('does not render cache-age-label when cacheAge is null', async () => {
    seedStore(makeMaintenance(null, null));

    await act(async () => {
      render(<MachineShadowPanel />);
    });

    expect(screen.queryByTestId('cache-age-label')).not.toBeInTheDocument();
  });
});
