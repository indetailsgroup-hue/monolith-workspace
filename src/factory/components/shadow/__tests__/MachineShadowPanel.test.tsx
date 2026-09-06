/**
 * MachineShadowPanel — Vitest integration tests
 *
 * Validates:
 *  1. ComponentHealthTable renders all 10 ComponentType display names
 *  2. Error banner appears when serviceError is set
 *  3. pollActive is true after mount and false after unmount
 *
 * Test file path: src/factory/components/shadow/__tests__/MachineShadowPanel.test.tsx
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MachineShadowPanel } from '../MachineShadowPanel';
import { useMachineShadowStore } from '../../../state/machineShadowStore';
import type { MaintenanceResponse } from '../../../api/digitalShadowApi';

// ─── Environment mock ─────────────────────────────────────────────────────────

vi.stubEnv('VITE_SHADOW_API_BASE', 'http://test-shadow:3001');

// ─── Module mock ─────────────────────────────────────────────────────────────
// Mock the entire digitalShadowApi so no real network calls occur.

vi.mock('../../../api/digitalShadowApi', () => ({
  WwUnitState: { OFFLINE: 0, STANDBY: 1, READY: 2, WORKING: 3, ERROR: 4 },
  WW_STATE_LABEL: {
    0: 'OFFLINE',
    1: 'STANDBY',
    2: 'READY',
    3: 'WORKING',
    4: 'ERROR',
  },
  WW_STATE_COLOR: {
    0: '#6b7280',
    1: '#f59e0b',
    2: '#22c55e',
    3: '#3b82f6',
    4: '#ef4444',
  },
  HEALTH_COLOR: {
    HEALTHY: '#22c55e',
    DEGRADING: '#84cc16',
    WARNING: '#f59e0b',
    CRITICAL: '#ef4444',
    FAILED: '#7f1d1d',
  },
  fetchShadowHealth: vi.fn().mockResolvedValue({
    service: 'digital-shadow',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    uptime: 0,
    components: {
      opcua: { connected: false, machineCount: 0 },
      mqtt: { connected: false, topicCount: 0 },
    },
  }),
  fetchAllMachines: vi.fn().mockResolvedValue([]),
  fetchMachineState: vi.fn().mockResolvedValue({}),
  fetchMachineMaintenance: vi.fn().mockResolvedValue({}),
  openMachineEventStream: vi.fn().mockReturnValue({
    close: vi.fn(),
    addEventListener: vi.fn(),
  }),
}));

// ─── Constants ───────────────────────────────────────────────────────────────

const ALL_COMPONENT_TYPES = [
  'SPINDLE',
  'BALL_SCREW_X',
  'BALL_SCREW_Y',
  'BALL_SCREW_Z',
  'LINEAR_GUIDE_X',
  'LINEAR_GUIDE_Y',
  'LINEAR_GUIDE_Z',
  'TOOL_HOLDER',
  'VACUUM_PUMP',
  'ATC_MAGAZINE',
] as const;

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockMachine = {
  machineId: 'machine-01',
  timestamp: new Date().toISOString(),
  state: 2 as const, // READY
  mode: 0,
  spindleSpeed: 0,
  feedRate: 0,
  toolId: 'T01',
  partCount: 0,
  alarms: [],
  connectionStatus: 'CONNECTED' as const,
};

const mockMaintenance: MaintenanceResponse = {
  machineId: 'machine-01',
  assessedAt: new Date().toISOString(),
  operatingHours: 1000,
  overallHealth: 'HEALTHY',
  criticalCount: 0,
  warningCount: 0,
  cacheAge: null,
  staleFeatures: null,
  components: ALL_COMPONENT_TYPES.map((componentType) => ({
    componentType,
    healthScore: 0.9,
    status: 'HEALTHY' as const,
    remainingUsefulLife: 500,
    confidence: 0.95,
    rul: {
      median: 500,
      lowerBound: 400,
      upperBound: 600,
      survivalProbability: 0.9,
      hazardRate: 0.001,
      confidence: 0.95,
      method: 'WPHM',
    },
    contributingFactors: [],
  })),
};

// ─── Store seed helper ────────────────────────────────────────────────────────

type StoreOverrides = Partial<ReturnType<typeof useMachineShadowStore.getState>>;

function seedStore(overrides: StoreOverrides = {}) {
  useMachineShadowStore.setState({
    serviceHealth: null,
    serviceStatus: 'idle',
    serviceError: null,
    lastPollAt: null,
    machines: [mockMachine],
    machinesLoading: false,
    selectedMachineId: 'machine-01',
    maintenanceByMachineId: { 'machine-01': mockMaintenance },
    maintenanceLoading: false,
    maintenanceError: null,
    pollActive: false,
    activeEventSource: null,
    startPolling: () => useMachineShadowStore.setState({ pollActive: true }),
    stopPolling: () => useMachineShadowStore.setState({ pollActive: false }),
    ...overrides,
  });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('MachineShadowPanel', () => {
  beforeEach(() => {
    seedStore();
    // Ensure any lingering poll timer is cleared before each test
    useMachineShadowStore.getState().stopPolling();
  });

  afterEach(() => {
    useMachineShadowStore.getState().stopPolling();
    vi.clearAllMocks();
  });

  // ── 1. ComponentHealthTable ───────────────────────────────────────────────

  describe('ComponentHealthTable', () => {
    it('renders all 10 component display names', async () => {
      await act(async () => {
        render(<MachineShadowPanel />);
      });

      for (const componentType of ALL_COMPONENT_TYPES) {
        const displayName = componentType.replace(/_/g, ' ');
        expect(
          screen.getByText(new RegExp(`^${displayName}$`, 'i')),
          `Expected to find "${displayName}" in the rendered DOM`
        ).toBeInTheDocument();
      }
    });
  });

  // ── 2. Error banner ───────────────────────────────────────────────────────

  describe('error banner', () => {
    it('shows error banner when serviceError is set', async () => {
      seedStore({ serviceError: 'ECONNREFUSED 127.0.0.1:3001' });

      await act(async () => {
        render(<MachineShadowPanel />);
      });

      expect(
        screen.getByText(/Cannot reach digital-shadow-service/i)
      ).toBeInTheDocument();
    });

    it('does not show error banner when serviceError is null', async () => {
      await act(async () => {
        render(<MachineShadowPanel />);
      });

      expect(
        screen.queryByText(/Cannot reach digital-shadow-service/i)
      ).not.toBeInTheDocument();
    });
  });

  // ── 3. Polling lifecycle ──────────────────────────────────────────────────

  describe('polling lifecycle', () => {
    it('sets pollActive = true after mount', async () => {
      await act(async () => {
        render(<MachineShadowPanel />);
      });

      expect(useMachineShadowStore.getState().pollActive).toBe(true);
    });

    it('sets pollActive = false after unmount', async () => {
      let unmount!: () => void;

      await act(async () => {
        const result = render(<MachineShadowPanel />);
        unmount = result.unmount;
      });

      // Confirm still active before unmount
      expect(useMachineShadowStore.getState().pollActive).toBe(true);

      await act(async () => {
        unmount();
      });

      expect(useMachineShadowStore.getState().pollActive).toBe(false);
    });
  });
});
