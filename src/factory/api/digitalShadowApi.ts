/**
 * Digital Shadow API Client
 * Connects to @monolith/digital-shadow-service HTTP endpoints.
 *
 * Base URL: VITE_SHADOW_API_BASE env var (default http://localhost:3001)
 *
 * @version 1.0.0
 */

const SHADOW_BASE =
  (import.meta as any).env?.VITE_SHADOW_API_BASE ?? 'http://localhost:3001';

// ─── WwUnitState enum mirror (OPC-40550-1) ───────────────────────────────────

export enum WwUnitState {
  OFFLINE = 0,
  STANDBY = 1,
  READY = 2,
  WORKING = 3,
  ERROR = 4,
}

export const WW_STATE_LABEL: Record<WwUnitState, string> = {
  [WwUnitState.OFFLINE]: 'OFFLINE',
  [WwUnitState.STANDBY]: 'STANDBY',
  [WwUnitState.READY]: 'READY',
  [WwUnitState.WORKING]: 'WORKING',
  [WwUnitState.ERROR]: 'ERROR',
};

export const WW_STATE_COLOR: Record<WwUnitState, string> = {
  [WwUnitState.OFFLINE]: '#6b7280',
  [WwUnitState.STANDBY]: '#f59e0b',
  [WwUnitState.READY]: '#22c55e',
  [WwUnitState.WORKING]: '#3b82f6',
  [WwUnitState.ERROR]: '#ef4444',
};

// ─── HealthStatus mirror ─────────────────────────────────────────────────────

export type HealthStatus = 'HEALTHY' | 'DEGRADING' | 'WARNING' | 'CRITICAL' | 'FAILED';

export const HEALTH_COLOR: Record<HealthStatus, string> = {
  HEALTHY: '#22c55e',
  DEGRADING: '#84cc16',
  WARNING: '#f59e0b',
  CRITICAL: '#ef4444',
  FAILED: '#7f1d1d',
};

// ─── Response shapes ─────────────────────────────────────────────────────────

export interface ShadowHealthResponse {
  service: string;
  version: string;
  status: 'running' | 'degraded' | 'error';
  timestamp: string;
  uptime: number;
  components: {
    opcua: { connected: boolean; machineCount: number };
    mqtt: { connected: boolean; topicCount: number };
  };
}

export interface MachineShadowState {
  machineId: string;
  timestamp: string;
  state: WwUnitState;
  mode: number;
  currentJobId?: string;
  currentProgram?: string;
  spindleSpeed: number;
  feedRate: number;
  toolId: string;
  partCount: number;
  errorCode?: string;
  alarms: string[];
  connectionStatus: 'CONNECTED' | 'DEGRADED' | 'DISCONNECTED';
}

export interface RULEstimate {
  median: number;        // hours
  lowerBound: number;
  upperBound: number;
  survivalProbability: number; // 0–1
  hazardRate: number;
  confidence: number;    // 0–1
  method: string;
}

export interface ComponentHealthResult {
  componentType: string;
  healthScore: number;   // 0–1
  status: HealthStatus;
  remainingUsefulLife: number; // hours
  confidence: number;
  rul: RULEstimate;
  contributingFactors: Array<{
    feature: string;
    value: number;
    threshold: number;
    severity: 'low' | 'medium' | 'high';
  }>;
}

export interface MaintenanceResponse {
  machineId: string;
  assessedAt: string;
  operatingHours: number;
  components: ComponentHealthResult[];
  overallHealth: HealthStatus;
  criticalCount: number;
  warningCount: number;
  /** Milliseconds since the oldest cached feature timestamp; null when cache is empty. */
  cacheAge: number | null;
  /**
   * True  — at least one feature hash is older than the 300 s Redis TTL.
   * False — all feature hashes are fresh.
   * null  — cacheAge is null (no cached features at all).
   */
  staleFeatures: boolean | null;
}

// ─── Internal fetch helper ───────────────────────────────────────────────────

async function shadowFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${SHADOW_BASE}${path}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Shadow API ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

// ─── Exported API functions ──────────────────────────────────────────────────

export async function fetchShadowHealth(
  signal?: AbortSignal
): Promise<ShadowHealthResponse> {
  return shadowFetch<ShadowHealthResponse>('/health', signal);
}

export async function fetchAllMachines(
  signal?: AbortSignal
): Promise<MachineShadowState[]> {
  const res = await shadowFetch<{ machines: MachineShadowState[] }>(
    '/machines',
    signal
  );
  return res.machines ?? [];
}

export async function fetchMachineState(
  machineId: string,
  signal?: AbortSignal
): Promise<MachineShadowState> {
  return shadowFetch<MachineShadowState>(`/machines/${machineId}`, signal);
}

export async function fetchMachineMaintenance(
  machineId: string,
  signal?: AbortSignal
): Promise<MaintenanceResponse> {
  return shadowFetch<MaintenanceResponse>(
    `/machines/${machineId}/maintenance`,
    signal
  );
}

// ─── SSE ─────────────────────────────────────────────────────────────────────

/**
 * Open a Server-Sent Events stream for real-time machine state/alarm events.
 * The returned EventSource emits:
 *   - `state`  — EventEnvelope<MachineShadowState>
 *   - `alarm`  — EventEnvelope<{ machineId: string; message: string }>
 *
 * Callers must call `.close()` when done (e.g. on component unmount or
 * machine deselection) to release the HTTP connection.
 */
export function openMachineEventStream(machineId: string): EventSource {
  return new EventSource(`${SHADOW_BASE}/machines/${machineId}/events`);
}


