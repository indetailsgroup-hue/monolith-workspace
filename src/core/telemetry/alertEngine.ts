/**
 * alertEngine.ts - Rule-based Alert Engine with Cooldown
 *
 * PURPOSE:
 * - Detect performance issues automatically from telemetry events
 * - Apply cooldown to prevent alert spam
 * - Track alert counts and history
 * - Support flip-flop detection for jitter
 *
 * RULES:
 * - SAT_SLOW: ms > satSlowMs (default 5ms)
 * - CANDIDATES_HIGH: candidateCount > candidatesHigh (default 40)
 * - ENGAGE_FLIPFLOP: >4 toggles in 1.2s window
 * - DT_SPIKE: dtSec > dtSpikeSec (default 0.08s = 12.5 FPS)
 * - NEAR_ITEMS_HIGH: nearItems > nearItemsHigh (default 80)
 *
 * COOLDOWN:
 * - Each alert code has independent cooldown
 * - Prevents same alert from firing repeatedly
 * - Default 2-3 seconds per alert type
 */

import { TELEMETRY } from './telemetrySingleton';
import { nowMs } from './timer';
import type { TelemetryEvent, TelemetrySampleDrag, TelemetrySampleCollision, TelemetrySampleGate } from './telemetryTypes';
import type { AlertCode, TelemetryAlertEvent } from './alertTypes';
import { getAlertSeverity } from './alertTypes';

// ============================================
// CONFIGURATION
// ============================================

export interface AlertConfig {
  /** Enable/disable alert engine */
  enabled: boolean;

  // Thresholds
  /** SAT check time threshold (ms) */
  satSlowMs: number;

  /** Max candidates before alert */
  candidatesHigh: number;

  /** Flip-flop detection window (seconds) */
  engageFlipFlopWindowSec: number;

  /** Flip-flop count threshold */
  engageFlipFlopCount: number;

  /** Frame time spike threshold (seconds) */
  dtSpikeSec: number;

  /** Near items threshold */
  nearItemsHigh: number;

  /** Velocity spike threshold (mm/s) */
  velocitySpikeMmPerSec: number;

  /** Predictive clamp count threshold (per window) */
  predictiveClampCount: number;

  /** Predictive clamp window (seconds) */
  predictiveClampWindowSec: number;

  // Cooldown per alert code (seconds)
  cooldown: Partial<Record<AlertCode, number>>;
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  enabled: true,

  // Thresholds (tuned for cabinet scene)
  satSlowMs: 5,
  candidatesHigh: 40,
  engageFlipFlopWindowSec: 1.2,
  engageFlipFlopCount: 4,
  dtSpikeSec: 0.08, // 12.5 FPS
  nearItemsHigh: 80,
  velocitySpikeMmPerSec: 3000,
  predictiveClampCount: 5,
  predictiveClampWindowSec: 1.0,

  // Cooldowns
  cooldown: {
    SAT_SLOW: 2.0,
    CANDIDATES_HIGH: 2.0,
    ENGAGE_FLIPFLOP: 3.0,
    DT_SPIKE: 2.0,
    NEAR_ITEMS_HIGH: 2.0,
    VELOCITY_SPIKE: 1.5,
    PREDICTIVE_CLAMP: 2.0,
    GATE_FAILED: 1.0,
    COLLISION_HIT: 0.5,
  },
};

// ============================================
// ALERT ENGINE CLASS
// ============================================

export class AlertEngine {
  private cfg: AlertConfig;

  /** Last emit time per alert code */
  private lastEmitTsByCode: Record<string, number> = {};

  /** Running count per alert code */
  private countsByCode: Record<string, number> = {};

  /** Engage history for flip-flop detection */
  private engageHistory: Array<{ ts: number; engaged: boolean }> = [];

  /** Predictive clamp history */
  private clampHistory: number[] = [];

  /** Last velocity for spike detection */
  private lastSpeed: number = 0;

  constructor(cfg: AlertConfig = DEFAULT_ALERT_CONFIG) {
    this.cfg = { ...cfg };
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

  setConfig(cfg: Partial<AlertConfig>): void {
    this.cfg = {
      ...this.cfg,
      ...cfg,
      cooldown: { ...this.cfg.cooldown, ...(cfg.cooldown ?? {}) },
    };
  }

  getConfig(): AlertConfig {
    return { ...this.cfg };
  }

  // ============================================
  // EVENT PROCESSING
  // ============================================

  /**
   * Process telemetry event and check for alerts
   */
  onEvent(ev: TelemetryEvent): void {
    if (!this.cfg.enabled || !TELEMETRY.isEnabled()) return;

    switch (ev.kind) {
      case 'DRAG_TICK':
        this.processDragTick(ev as TelemetrySampleDrag);
        break;
      case 'COLLISION_CHECK':
        this.processCollisionCheck(ev as TelemetrySampleCollision);
        break;
      case 'GATE_RESULT':
        this.processGateResult(ev as TelemetrySampleGate);
        break;
    }
  }

  // ============================================
  // DRAG TICK RULES
  // ============================================

  private processDragTick(ev: TelemetrySampleDrag): void {
    const ts = ev.ts;

    // DT spike (frame hitch)
    if (ev.dtSec >= this.cfg.dtSpikeSec) {
      this.emit('DT_SPIKE', 'Frame hitch / dt spike',
        `dt=${(ev.dtSec * 1000).toFixed(1)}ms exceeds ${(this.cfg.dtSpikeSec * 1000).toFixed(0)}ms`,
        { dtMs: ev.dtSec * 1000, fps: ev.fps ?? 0 },
        `Target: ${(1 / this.cfg.dtSpikeSec).toFixed(0)} FPS minimum`
      );
    }

    // Candidates high
    if ((ev.candidateCount ?? 0) >= this.cfg.candidatesHigh) {
      this.emit('CANDIDATES_HIGH', 'Candidate count high',
        `candidates=${ev.candidateCount} exceeds ${this.cfg.candidatesHigh}`,
        { candidateCount: ev.candidateCount ?? 0 },
        'Consider reducing snapThreshold or anchor count'
      );
    }

    // Engage flip-flop
    if (typeof ev.engaged === 'boolean') {
      this.trackEngage(ts, ev.engaged);
      if (this.detectFlipFlop(ts)) {
        this.emit('ENGAGE_FLIPFLOP', 'Snap engagement flip-flop',
          `>${this.cfg.engageFlipFlopCount} toggles within ${this.cfg.engageFlipFlopWindowSec}s`,
          { toggles: this.cfg.engageFlipFlopCount },
          'Increase hysteresis gap (engage/disengage delta)'
        );
      }
    }

    // Velocity spike
    const speed = ev.speed ?? 0;
    if (this.lastSpeed > 0 && speed > this.lastSpeed * 3 && speed > this.cfg.velocitySpikeMmPerSec) {
      this.emit('VELOCITY_SPIKE', 'Velocity spike detected',
        `speed=${speed.toFixed(0)}mm/s (was ${this.lastSpeed.toFixed(0)}mm/s)`,
        { speed, lastSpeed: this.lastSpeed },
        'Check for teleport or dt calculation issues'
      );
    }
    this.lastSpeed = speed;

    // Predictive clamp tracking
    if (ev.predClamped) {
      this.trackClamp(ts);
      if (this.detectFrequentClamp(ts)) {
        this.emit('PREDICTIVE_CLAMP', 'Predictive delta clamped frequently',
          `>${this.cfg.predictiveClampCount} clamps in ${this.cfg.predictiveClampWindowSec}s`,
          { clampCount: this.cfg.predictiveClampCount },
          'User is dragging very fast; consider increasing maxLookaheadMm'
        );
      }
    }
  }

  // ============================================
  // COLLISION RULES
  // ============================================

  private processCollisionCheck(ev: TelemetrySampleCollision): void {
    // SAT slow
    if (ev.ms >= this.cfg.satSlowMs) {
      this.emit('SAT_SLOW', 'Collision check slow',
        `phase=${ev.phase} took ${ev.ms.toFixed(2)}ms (>${this.cfg.satSlowMs}ms)`,
        { ms: ev.ms, satPairsTried: ev.satPairsTried, nearItems: ev.nearItems },
        'Reduce nearPaddingMm or increase cellSizeMm'
      );
    }

    // Near items high
    if (ev.nearItems >= this.cfg.nearItemsHigh) {
      this.emit('NEAR_ITEMS_HIGH', 'Near-field density high',
        `nearItems=${ev.nearItems} exceeds ${this.cfg.nearItemsHigh}`,
        { nearItems: ev.nearItems },
        'Increase cellSizeMm or reduce nearPaddingMm'
      );
    }

    // Collision hit
    if (ev.satHits > 0) {
      this.emit('COLLISION_HIT', 'Collision detected',
        `${ev.satHits} collision(s) in ${ev.phase} phase`,
        { satHits: ev.satHits, phase: ev.phase === 'PREVIEW' ? 1 : 2 },
        undefined
      );
    }
  }

  // ============================================
  // GATE RULES
  // ============================================

  private processGateResult(ev: TelemetrySampleGate): void {
    if (!ev.ok) {
      this.emit('GATE_FAILED', 'Manufacturing gate failed',
        `errors=${ev.errorCount}, warnings=${ev.warnCount}`,
        { errorCount: ev.errorCount, warnCount: ev.warnCount },
        'Check constraint violations in gate result'
      );
    }
  }

  // ============================================
  // EMIT ALERT
  // ============================================

  private emit(
    code: AlertCode,
    title: string,
    detail: string,
    metrics: Record<string, number>,
    suggestion?: string
  ): void {
    const now = nowMs();
    const cooldown = this.cfg.cooldown[code] ?? 2.0;
    const lastEmit = this.lastEmitTsByCode[code] ?? -Infinity;

    // Check cooldown
    if ((now - lastEmit) < cooldown * 1000) {
      return;
    }

    // Update tracking
    this.lastEmitTsByCode[code] = now;
    this.countsByCode[code] = (this.countsByCode[code] ?? 0) + 1;

    // Create alert event
    const alert: TelemetryAlertEvent = {
      ts: now,
      level: getAlertSeverity(code),
      kind: 'ALERT',
      code,
      title,
      detail,
      metrics,
      count: this.countsByCode[code],
      cooldownSec: cooldown,
      suggestion,
    };

    // Push to telemetry
    TELEMETRY.push(alert as any);
    TELEMETRY.inc(`alert.${code}`);
  }

  // ============================================
  // FLIP-FLOP DETECTION
  // ============================================

  private trackEngage(ts: number, engaged: boolean): void {
    this.engageHistory.push({ ts, engaged });

    // Keep only last 3 seconds
    const cutoff = ts - 3000;
    while (this.engageHistory.length > 0 && this.engageHistory[0].ts < cutoff) {
      this.engageHistory.shift();
    }
  }

  private detectFlipFlop(nowTs: number): boolean {
    const windowMs = this.cfg.engageFlipFlopWindowSec * 1000;
    const cutoff = nowTs - windowMs;

    const recent = this.engageHistory.filter(e => e.ts >= cutoff);
    if (recent.length < 3) return false;

    // Count state transitions
    let toggles = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].engaged !== recent[i - 1].engaged) {
        toggles++;
      }
    }

    return toggles >= this.cfg.engageFlipFlopCount;
  }

  // ============================================
  // CLAMP DETECTION
  // ============================================

  private trackClamp(ts: number): void {
    this.clampHistory.push(ts);

    // Keep only recent
    const cutoff = ts - this.cfg.predictiveClampWindowSec * 1000;
    while (this.clampHistory.length > 0 && this.clampHistory[0] < cutoff) {
      this.clampHistory.shift();
    }
  }

  private detectFrequentClamp(nowTs: number): boolean {
    const windowMs = this.cfg.predictiveClampWindowSec * 1000;
    const cutoff = nowTs - windowMs;

    const recent = this.clampHistory.filter(t => t >= cutoff);
    return recent.length >= this.cfg.predictiveClampCount;
  }

  // ============================================
  // RESET
  // ============================================

  reset(): void {
    this.lastEmitTsByCode = {};
    this.countsByCode = {};
    this.engageHistory = [];
    this.clampHistory = [];
    this.lastSpeed = 0;
  }

  // ============================================
  // QUERY
  // ============================================

  getAlertCounts(): Record<string, number> {
    return { ...this.countsByCode };
  }

  getTotalAlerts(): number {
    return Object.values(this.countsByCode).reduce((a, b) => a + b, 0);
  }
}

// ============================================
// FACTORY
// ============================================

/**
 * Create alert engine with custom config
 */
export function createAlertEngine(cfg: Partial<AlertConfig> = {}): AlertEngine {
  return new AlertEngine({ ...DEFAULT_ALERT_CONFIG, ...cfg });
}
