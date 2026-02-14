/**
 * telemetryStore.ts - Ring Buffer Telemetry Store
 *
 * PURPOSE:
 * - Store telemetry events in fixed-size ring buffer
 * - O(1) insertion, no memory growth
 * - Cheap counters for aggregations
 * - Enable/disable at runtime
 *
 * DESIGN:
 * - Ring buffer overwrites oldest events when full
 * - Counters track cumulative values
 * - Snapshot returns recent events (newest first)
 * - Zero performance impact when disabled
 */

import type { TelemetryEvent, TelemetryLevel } from './telemetryTypes';

// ============================================
// CONFIGURATION
// ============================================

export interface TelemetryConfig {
  /** Enable/disable telemetry */
  enabled: boolean;

  /** Ring buffer size */
  ringSize: number;

  /** Minimum level to record (filter out DEBUG in production) */
  minLevel: TelemetryLevel;
}

export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  enabled: false,
  ringSize: 800,
  minLevel: 'INFO',
};

// ============================================
// LEVEL ORDERING
// ============================================

const LEVEL_ORDER: Record<TelemetryLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// ============================================
// STORE CLASS
// ============================================

export class TelemetryStore {
  private cfg: TelemetryConfig;
  private ring: (TelemetryEvent | undefined)[];
  private idx: number = 0;
  private filled: boolean = false;

  /** Counters for aggregations */
  counters: Record<string, number> = {};

  /** Last event of each kind (for quick access) */
  private lastByKind: Record<string, TelemetryEvent> = {};

  constructor(cfg: Partial<TelemetryConfig> = {}) {
    this.cfg = { ...DEFAULT_TELEMETRY_CONFIG, ...cfg };
    this.ring = new Array(this.cfg.ringSize);
  }

  // ============================================
  // CONFIGURATION
  // ============================================

  setEnabled(enabled: boolean): void {
    this.cfg.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.cfg.enabled;
  }

  setMinLevel(level: TelemetryLevel): void {
    this.cfg.minLevel = level;
  }

  getConfig(): TelemetryConfig {
    return { ...this.cfg };
  }

  // ============================================
  // PUSH EVENTS
  // ============================================

  /**
   * Push event to ring buffer
   * Returns false if disabled or filtered
   */
  push(ev: TelemetryEvent): boolean {
    if (!this.cfg.enabled) return false;

    // Level filter
    if (LEVEL_ORDER[ev.level] < LEVEL_ORDER[this.cfg.minLevel]) {
      return false;
    }

    // Store in ring
    this.ring[this.idx] = ev;
    this.idx = (this.idx + 1) % this.ring.length;
    if (this.idx === 0) this.filled = true;

    // Track last by kind
    this.lastByKind[ev.kind] = ev;

    return true;
  }

  // ============================================
  // COUNTERS
  // ============================================

  /**
   * Increment counter
   */
  inc(key: string, by: number = 1): void {
    if (!this.cfg.enabled) return;
    this.counters[key] = (this.counters[key] ?? 0) + by;
  }

  /**
   * Set counter to specific value
   */
  set(key: string, value: number): void {
    if (!this.cfg.enabled) return;
    this.counters[key] = value;
  }

  /**
   * Get counter value
   */
  get(key: string): number {
    return this.counters[key] ?? 0;
  }

  // ============================================
  // QUERY
  // ============================================

  /**
   * Get recent events (newest first)
   */
  snapshot(limit: number = 200): TelemetryEvent[] {
    if (!this.cfg.enabled) return [];

    const out: TelemetryEvent[] = [];
    const n = this.filled ? this.ring.length : this.idx;
    if (n === 0) return out;

    // Iterate backwards from current position (newest first)
    for (let i = 0; i < Math.min(limit, n); i++) {
      const j = (this.idx - 1 - i + this.ring.length) % this.ring.length;
      const ev = this.ring[j];
      if (ev) out.push(ev);
    }

    return out;
  }

  /**
   * Get events of specific kind
   */
  snapshotByKind(kind: string, limit: number = 50): TelemetryEvent[] {
    return this.snapshot(limit * 4).filter(ev => ev.kind === kind).slice(0, limit);
  }

  /**
   * Get last event of specific kind
   */
  lastOfKind<T extends TelemetryEvent>(kind: string): T | null {
    return (this.lastByKind[kind] as T) ?? null;
  }

  /**
   * Get total event count
   */
  totalCount(): number {
    return this.filled ? this.ring.length : this.idx;
  }

  // ============================================
  // RESET
  // ============================================

  /**
   * Clear all events and counters
   */
  reset(): void {
    this.idx = 0;
    this.filled = false;
    this.counters = {};
    this.lastByKind = {};
    this.ring = new Array(this.ring.length);
  }

  /**
   * Clear events but keep counters
   */
  clearEvents(): void {
    this.idx = 0;
    this.filled = false;
    this.lastByKind = {};
    this.ring = new Array(this.ring.length);
  }

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * Get event count by kind
   */
  countByKind(): Record<string, number> {
    const counts: Record<string, number> = {};

    const n = this.filled ? this.ring.length : this.idx;
    for (let i = 0; i < n; i++) {
      const ev = this.ring[i];
      if (ev) {
        counts[ev.kind] = (counts[ev.kind] ?? 0) + 1;
      }
    }

    return counts;
  }

  /**
   * Get event count by level
   */
  countByLevel(): Record<TelemetryLevel, number> {
    const counts: Record<TelemetryLevel, number> = {
      DEBUG: 0,
      INFO: 0,
      WARN: 0,
      ERROR: 0,
    };

    const n = this.filled ? this.ring.length : this.idx;
    for (let i = 0; i < n; i++) {
      const ev = this.ring[i];
      if (ev) {
        counts[ev.level]++;
      }
    }

    return counts;
  }
}

// ============================================
// FACTORY
// ============================================

/**
 * Create telemetry store with custom config
 */
export function createTelemetryStore(cfg: Partial<TelemetryConfig> = {}): TelemetryStore {
  return new TelemetryStore(cfg);
}
