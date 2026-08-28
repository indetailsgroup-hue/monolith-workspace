/**
 * machineShadowStore — Zustand store for Digital Shadow real-time data
 *
 * Polls @monolith/digital-shadow-service every POLL_INTERVAL_MS and
 * exposes machine health + RUL state to React components.
 * SSE stream at /machines/:id/events pushes live state/alarm events
 * whenever a machine is selected.
 *
 * @version 1.1.0
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  fetchShadowHealth,
  fetchAllMachines,
  fetchMachineMaintenance,
  openMachineEventStream,
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

  // SSE
  activeEventSource: EventSource | null;

  // Actions
  startPolling: () => void;
  stopPolling: () => void;
  selectMachine: (machineId: string | null) => void;
  loadMaintenance: (machineId: string) => Promise<void>;
  refreshOnce: () => Promise<void>;
  openEventStream: (machineId: string) => void;
  closeEventStream: () => void;
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

      activeEventSource: null,

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
        get().closeEventStream();
        set({ pollActive: false, serviceStatus: 'idle' });
      },

      // ── selectMachine ─────────────────────────────────────────────────────
      selectMachine: (machineId) => {
        set({ selectedMachineId: machineId });
        if (machineId) {
          void get().loadMaintenance(machineId);
          get().openEventStream(machineId);
        } else {
          get().closeEventStream();
        }
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

      // ── openEventStream ───────────────────────────────────────────────────
      openEventStream: (machineId) => {
        // Close any existing SSE connection first
        const { activeEventSource } = get();
        if (activeEventSource) {
          activeEventSource.close();
        }

        const es = openMachineEventStream(machineId);

        // Handle live state updates — merge into the machines array
        es.addEventListener('state', (e: Event) => {
          try {
            const envelope = JSON.parse((e as MessageEvent).data);
            const machineState = envelope.data as MachineShadowState;
            if (!machineState?.machineId) return;
            set((state) => ({
              machines: state.machines.map((m) =>
                m.machineId === machineState.machineId
                  ? { ...m, ...machineState }
                  : m
              ),
            }));
          } catch {
            // Ignore malformed frames
          }
        });

        // Handle alarm events — append alarm message to the machine
        es.addEventListener('alarm', (e: Event) => {
          try {
            const envelope = JSON.parse((e as MessageEvent).data);
            const alarmMessage = envelope.data?.message as string | undefined;
            const sourceId = (envelope.source ?? envelope.data?.machineId) as string | undefined;
            if (!alarmMessage || !sourceId) return;
            set((state) => ({
              machines: state.machines.map((m) =>
                m.machineId === sourceId
                  ? { ...m, alarms: [...m.alarms, alarmMessage] }
                  : m
              ),
            }));
          } catch {
            // Ignore malformed frames
          }
        });

        set({ activeEventSource: es });
      },

      // ── closeEventStream ──────────────────────────────────────────────────
      closeEventStream: () => {
        const { activeEventSource } = get();
        if (activeEventSource) {
          activeEventSource.close();
        }
        set({ activeEventSource: null });
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
