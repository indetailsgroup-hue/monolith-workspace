/**
 * machineShadowStore — SSE alarm listener tests
 *
 * Verifies that the `alarm` EventSource event handler in `openEventStream`
 * appends the alarm message to the correct machine's `alarms` array and
 * leaves all other machines unaffected.
 *
 * File path: src/factory/state/__tests__/machineShadowStore.sse.test.ts
 *
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMachineShadowStore } from '../machineShadowStore';
import type { MachineShadowState } from '../../api/digitalShadowApi';

// ─── Mock EventSource ─────────────────────────────────────────────────────────
//
// Backed by EventTarget so that `addEventListener('alarm', …)` works via the
// standard DOM event dispatch path — matching exactly how the store registers
// its handlers.

class MockEventSource extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  readyState = MockEventSource.CONNECTING;
  url: string;
  onopen: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;

  constructor(url: string) {
    super();
    this.url = url;
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }

  /**
   * Test helper: fire a named SSE event (e.g. 'alarm', 'state').
   * `data` is serialised to JSON automatically unless a raw string is passed.
   */
  fireEvent(type: string, data: unknown): void {
    const raw = typeof data === 'string' ? data : JSON.stringify(data);
    this.dispatchEvent(new MessageEvent(type, { data: raw }));
  }
}

// ─── Module-level handle to the last created mock ─────────────────────────────

let lastMockEs: MockEventSource | null = null;

// ─── Mock digitalShadowApi ────────────────────────────────────────────────────

vi.mock('../../api/digitalShadowApi', () => ({
  WwUnitState: { OFFLINE: 0, STANDBY: 1, READY: 2, WORKING: 3, ERROR: 4 },
  WW_STATE_LABEL: {
    0: 'OFFLINE', 1: 'STANDBY', 2: 'READY', 3: 'WORKING', 4: 'ERROR',
  },
  WW_STATE_COLOR: {
    0: '#6b7280', 1: '#f59e0b', 2: '#22c55e', 3: '#3b82f6', 4: '#ef4444',
  },
  HEALTH_COLOR: {
    HEALTHY: '#22c55e', DEGRADING: '#84cc16', WARNING: '#f59e0b',
    CRITICAL: '#ef4444', FAILED: '#7f1d1d',
  },
  fetchShadowHealth:       vi.fn().mockResolvedValue({}),
  fetchAllMachines:        vi.fn().mockResolvedValue([]),
  fetchMachineMaintenance: vi.fn().mockResolvedValue({}),
  openMachineEventStream:  vi.fn((machineId: string) => {
    lastMockEs = new MockEventSource(`mock://events/${machineId}`);
    return lastMockEs;
  }),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMachine(id: string): MachineShadowState {
  return {
    machineId:        id,
    timestamp:        new Date().toISOString(),
    state:            3,   // WwUnitState.WORKING
    mode:             1,
    spindleSpeed:     3000,
    feedRate:         500,
    toolId:           'T01',
    partCount:        42,
    alarms:           [],
    connectionStatus: 'CONNECTED',
  };
}

const SEED_MACHINES = [makeMachine('machine-1'), makeMachine('machine-2')];

// ─── Helper: seed store + open stream ─────────────────────────────────────────

function seedAndOpen(targetId = 'machine-1'): MockEventSource {
  useMachineShadowStore.setState({
    machines:          SEED_MACHINES.map((m) => ({ ...m, alarms: [] })),
    activeEventSource: null,
  });
  useMachineShadowStore.getState().openEventStream(targetId);
  return lastMockEs!;
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

afterEach(() => {
  lastMockEs?.close();
  lastMockEs = null;
  useMachineShadowStore.setState({
    machines:          [],
    activeEventSource: null,
    selectedMachineId: null,
  });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('machineShadowStore — SSE alarm listener', () => {

  it('appends alarm message to the target machine alarms array', () => {
    const es = seedAndOpen('machine-1');

    es.fireEvent('alarm', {
      id:        'evt-001',
      stream:    'ds:machine:alarm',
      type:      'alarm',
      source:    'machine-1',
      timestamp: Date.now(),
      data: { machineId: 'machine-1', message: 'Vibration threshold exceeded' },
    });

    const target = useMachineShadowStore
      .getState()
      .machines.find((m) => m.machineId === 'machine-1')!;

    expect(target.alarms).toEqual(['Vibration threshold exceeded']);
  });

  it('does NOT modify alarms on any other machine', () => {
    const es = seedAndOpen('machine-1');

    es.fireEvent('alarm', {
      source: 'machine-1',
      data:   { machineId: 'machine-1', message: 'Coolant level low' },
    });

    const other = useMachineShadowStore
      .getState()
      .machines.find((m) => m.machineId === 'machine-2')!;

    expect(other.alarms).toEqual([]);
  });

  it('accumulates multiple alarm messages in arrival order', () => {
    const es = seedAndOpen('machine-1');

    const fire = (msg: string) =>
      es.fireEvent('alarm', {
        source: 'machine-1',
        data:   { machineId: 'machine-1', message: msg },
      });

    fire('Alarm A');
    fire('Alarm B');
    fire('Alarm C');

    const target = useMachineShadowStore
      .getState()
      .machines.find((m) => m.machineId === 'machine-1')!;

    expect(target.alarms).toEqual(['Alarm A', 'Alarm B', 'Alarm C']);
  });

  it('ignores alarm events with missing message field (no store mutation)', () => {
    const es = seedAndOpen('machine-1');

    es.fireEvent('alarm', { source: 'machine-1', data: {} }); // no `message`

    const target = useMachineShadowStore
      .getState()
      .machines.find((m) => m.machineId === 'machine-1')!;

    expect(target.alarms).toEqual([]);
  });

  it('ignores alarm events that carry invalid JSON', () => {
    const es = seedAndOpen('machine-1');

    // fireEvent with a raw non-JSON string bypasses serialisation
    es.dispatchEvent(new MessageEvent('alarm', { data: 'not-valid-json' }));

    const target = useMachineShadowStore
      .getState()
      .machines.find((m) => m.machineId === 'machine-1')!;

    expect(target.alarms).toEqual([]);
  });

  it('resolves machineId from envelope.data.machineId when top-level source is absent', () => {
    const es = seedAndOpen('machine-1');

    // Omit the top-level `source` field — store should fall back to data.machineId
    es.fireEvent('alarm', {
      data: { machineId: 'machine-1', message: 'Fallback source path' },
    });

    const target = useMachineShadowStore
      .getState()
      .machines.find((m) => m.machineId === 'machine-1')!;

    expect(target.alarms).toEqual(['Fallback source path']);
  });

  it('does not mutate machines when alarm source matches no known machineId', () => {
    const es = seedAndOpen('machine-1');

    es.fireEvent('alarm', {
      source: 'unknown-machine-99',
      data:   { machineId: 'unknown-machine-99', message: 'Ghost alarm' },
    });

    const machines = useMachineShadowStore.getState().machines;
    machines.forEach((m) => {
      expect(m.alarms).toEqual([]);
    });
  });
});
