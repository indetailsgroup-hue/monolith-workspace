/**
 * machineShadowStore — Zustand store for Digital Shadow real-time data
 *
 * Polls @monolith/digital-shadow-service every POLL_INTERVAL_MS and
 * exposes machine health + RUL state to React components.
 *
 * @version 1.0.0
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  fetchShadowHealth,
  fetchAllMachines,
  fetchMachineMaintenance,
  type ShadowHealthResponse,
  type MachineShadowState,
  type MaintenanceResponse,
} from '../api/digitalShadowApi';

// ─── Constants ───────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5_000;

// ─── Types ───────────────────────────────────────────────────────────────────

export type ServiceStatus = 'idle' | 'connecting' | 'live' | 'error';

export interface MachineShadowStoreState {
  // Service
  serviceHealth: ShadowHealthResponse | null;
  serviceStatus: ServiceStatus;
  serviceError: string | null;
  lastPollAt: string | null;

  // Machines list
  machines: MachineShadowState[];
  machinesLoading: boolean;

  // Selected machine + its maintenance assessment
  selectedMachineId: string | null;
  maintenanceByMachineId: Record<string, MaintenanceResponse>;
  maintenanceLoading: boolean;
  maintenanceError: string | null;

  // Polling lifecycle
  pollActive: boolean;

  // Actions
  startPolling: () => void;
  stopPolling: () => void;
  selectMachine: (machineId: string | null) => void;
  loadMaintenance: (machineId: string) => Promise<void>;
  refreshOnce: () => Promise<void>;
}

// ─── Module-level poll timer ─────────────────────────────────────────────────

let _pollTimer: ReturnType<typeof setInterval> | null = null;

// ─── Store ───────────────────────────────────────────────────────────────────

export const useMachineShadowStore = create<MachineShadowStoreState>()(
  devtools(
    (set, get) => ({
      serviceHealth: null,
      serviceStatus: 'idle',
      serviceError: null,
      lastPollAt: null,

      machines: [],
      machinesLoading: false,

      selectedMachineId: null,
      maintenanceByMachineId: {},
      maintenanceLoading: false,
      maintenanceError: null,

      pollActive: false,

      // ── refreshOnce ──────────────────────────────────────────────────────
      refreshOnce: async () => {
        set({ machinesLoading: true, serviceError: null });
        try {
          const [health, machines] = await Promise.all([
            fetchShadowHealth(),
            fetchAllMachines(),
          ]);
          set({
            serviceHealth: health,
            serviceStatus: 'live',
            machines,
            machinesLoading: false,
            lastPollAt: new Date().toISOString(),
          });
        } catch (err) {
          set({
            serviceStatus: 'error',
            serviceError:
              err instanceof Error ? err.message : 'Connection failed',
            machinesLoading: false,
          });
        }
      },

      // ── startPolling ─────────────────────────────────────────────────────
      startPolling: () => {
        if (_pollTimer) return; // already running
        set({ pollActive: true, serviceStatus: 'connecting' });
        void get().refreshOnce();
        _pollTimer = setInterval(
          () => void get().refreshOnce(),
          POLL_INTERVAL_MS
        );
      },

      // ── stopPolling ──────────────────────────────────────────────────────
      stopPolling: () => {
        if (_pollTimer) {
          clearInterval(_pollTimer);
          _pollTimer = null;
        }
        set({ pollActive: false, serviceStatus: 'idle' });
      },

      // ── selectMachine ─────────────────────────────────────────────────────
      selectMachine: (machineId) => {
        set({ selectedMachineId: machineId });
        if (machineId) void get().loadMaintenance(machineId);
      },

      // ── loadMaintenance ───────────────────────────────────────────────────
      loadMaintenance: async (machineId) => {
        set({ maintenanceLoading: true, maintenanceError: null });
        try {
          const data = await fetchMachineMaintenance(machineId);
          set((state) => ({
            maintenanceByMachineId: {
              ...state.maintenanceByMachineId,
              [machineId]: data,
            },
            maintenanceLoading: false,
          }));
        } catch (err) {
          set({
            maintenanceError:
              err instanceof Error ? err.message : 'Failed to load maintenance data',
            maintenanceLoading: false,
          });
        }
      },
    }),
    { name: 'MachineShadowStore' }
  )
);

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectSelectedMachine = (state: MachineShadowStoreState) => {
  if (!state.selectedMachineId) return null;
  return (
    state.machines.find((m) => m.machineId === state.selectedMachineId) ?? null
  );
};

export const selectSelectedMaintenance = (state: MachineShadowStoreState) => {
  if (!state.selectedMachineId) return null;
  return state.maintenanceByMachineId[state.selectedMachineId] ?? null;
};
