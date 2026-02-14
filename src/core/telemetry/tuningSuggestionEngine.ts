/**
 * tuningSuggestionEngine.ts - Tuning Suggestion Generator
 *
 * PURPOSE:
 * - Generate actionable tuning suggestions from alerts
 * - Apply cooldown to prevent spam
 * - Use runtime context to propose specific values
 *
 * ALGORITHM:
 * 1. Receive ALERT event
 * 2. Match alert code to suggestion rules
 * 3. Calculate proposed values based on current context
 * 4. Apply cooldown per suggestion code
 * 5. Emit SUGGESTION event to telemetry
 *
 * RULES:
 * - NEAR_ITEMS_HIGH → ADJUST_NEAR_PADDING, ADJUST_CELL_SIZE
 * - SAT_SLOW → ADJUST_NEAR_PADDING, FIXED_STEP_TUNE
 * - CANDIDATES_HIGH → ADJUST_SNAP_THRESHOLD, INCREASE_STICKY_MARGIN
 * - ENGAGE_FLIPFLOP → INCREASE_STICKY_MARGIN, ADJUST_HYSTERESIS
 * - DT_SPIKE → ADJUST_LOOKAHEAD
 * - PREDICTIVE_CLAMP → ADJUST_LOOKAHEAD
 */

import type { TelemetryEvent } from './telemetryTypes';
import type { TelemetryAlertEvent, AlertCode } from './alertTypes';
import type { TuningSuggestionEvent, SuggestionCode, ProposedChange } from './tuningSuggestionTypes';
import { createProposedChange } from './tuningSuggestionTypes';
import { nowMs } from './timer';
import { TELEMETRY } from './telemetrySingleton';

// ============================================
// CONTEXT SNAPSHOT
// ============================================

/**
 * Current runtime configuration snapshot
 * Used to calculate proposed values
 */
export interface TuningContextSnapshot {
  // Collision
  nearPaddingMm: number;
  cellSizeMm: number;

  // Snap
  snapThresholdMm: number;
  engageThresholdMm: number;
  disengageThresholdMm: number;
  stickyScoreMargin: number;

  // Predictive
  lookaheadMinMs: number;
  lookaheadMaxMs: number;
  maxLookaheadMm: number;

  // Fixed-step
  fixedStepHz: number;
}

/**
 * Default context (sync with your actual config)
 */
export const DEFAULT_TUNING_CONTEXT: TuningContextSnapshot = {
  nearPaddingMm: 150,
  cellSizeMm: 500,
  snapThresholdMm: 300,
  engageThresholdMm: 50,
  disengageThresholdMm: 60,
  stickyScoreMargin: 0.08,
  lookaheadMinMs: 50,
  lookaheadMaxMs: 100,
  maxLookaheadMm: 140,
  fixedStepHz: 120,
};

// ============================================
// ENGINE CONFIG
// ============================================

export interface SuggestionEngineConfig {
  /** Enable/disable suggestion engine */
  enabled: boolean;

  /** Cooldown per suggestion code (seconds) */
  cooldownSec: number;

  /** Max suggestions per alert */
  maxPerAlert: number;
}

export const DEFAULT_SUGGESTION_CONFIG: SuggestionEngineConfig = {
  enabled: true,
  cooldownSec: 3.0,
  maxPerAlert: 2,
};

// ============================================
// ENGINE CLASS
// ============================================

export class TuningSuggestionEngine {
  private cfg: SuggestionEngineConfig;
  private ctx: TuningContextSnapshot;

  /** Last emit time per suggestion code */
  private lastEmitTsByCode: Record<string, number> = {};

  /** Running count per suggestion code */
  private countsByCode: Record<string, number> = {};

  constructor(
    ctx: TuningContextSnapshot = DEFAULT_TUNING_CONTEXT,
    cfg: SuggestionEngineConfig = DEFAULT_SUGGESTION_CONFIG
  ) {
    this.ctx = { ...ctx };
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

  setContext(ctx: Partial<TuningContextSnapshot>): void {
    this.ctx = { ...this.ctx, ...ctx };
  }

  getContext(): TuningContextSnapshot {
    return { ...this.ctx };
  }

  setConfig(cfg: Partial<SuggestionEngineConfig>): void {
    this.cfg = { ...this.cfg, ...cfg };
  }

  // ============================================
  // EVENT PROCESSING
  // ============================================

  /**
   * Process telemetry event and generate suggestions if applicable
   */
  onEvent(ev: TelemetryEvent): void {
    if (!this.cfg.enabled || !TELEMETRY.isEnabled()) return;
    if (ev.kind !== 'ALERT') return;

    const alert = ev as TelemetryAlertEvent;
    const suggestions = this.generateSuggestions(alert);

    // Emit up to maxPerAlert suggestions
    const toEmit = suggestions.slice(0, this.cfg.maxPerAlert);
    for (const suggestion of toEmit) {
      this.emitSuggestion(suggestion);
    }
  }

  // ============================================
  // SUGGESTION GENERATION
  // ============================================

  private generateSuggestions(alert: TelemetryAlertEvent): Omit<TuningSuggestionEvent, 'ts' | 'level' | 'count'>[] {
    const metrics = alert.metrics ?? {};

    switch (alert.code) {
      case 'NEAR_ITEMS_HIGH':
        return this.suggestForNearItemsHigh(metrics);

      case 'SAT_SLOW':
        return this.suggestForSatSlow(metrics);

      case 'CANDIDATES_HIGH':
        return this.suggestForCandidatesHigh(metrics);

      case 'ENGAGE_FLIPFLOP':
        return this.suggestForEngageFlipFlop(metrics);

      case 'DT_SPIKE':
        return this.suggestForDtSpike(metrics);

      case 'PREDICTIVE_CLAMP':
        return this.suggestForPredictiveClamp(metrics);

      case 'VELOCITY_SPIKE':
        return this.suggestForVelocitySpike(metrics);

      default:
        return [];
    }
  }

  // ============================================
  // SUGGESTION RULES
  // ============================================

  private suggestForNearItemsHigh(metrics: Record<string, number>): Omit<TuningSuggestionEvent, 'ts' | 'level' | 'count'>[] {
    const nearItems = metrics.nearItems ?? 0;
    const suggestions: Omit<TuningSuggestionEvent, 'ts' | 'level' | 'count'>[] = [];

    // Primary: Reduce nearPaddingMm by 20%
    const fromPad = this.ctx.nearPaddingMm;
    const toPad = Math.max(60, Math.round(fromPad * 0.8));

    const confidence = nearItems >= 120 ? 0.85 : 0.7;

    suggestions.push({
      kind: 'SUGGESTION',
      fromAlert: 'NEAR_ITEMS_HIGH',
      code: 'ADJUST_NEAR_PADDING',
      title: 'Reduce near-field padding',
      rationale: `Near-field density is high (nearItems=${nearItems}). Reducing nearPaddingMm limits broad-phase candidate set and lowers SAT workload.`,
      proposed: {
        nearPaddingMm: createProposedChange(fromPad, toPad, 'mm'),
      },
      confidence,
      priority: 8,
      expectedImpact: `Reduce nearItems by ~${Math.round(20)}%`,
    });

    // Secondary: Increase cellSizeMm by 25%
    const fromCell = this.ctx.cellSizeMm;
    const toCell = Math.min(1000, Math.round(fromCell * 1.25));

    suggestions.push({
      kind: 'SUGGESTION',
      fromAlert: 'NEAR_ITEMS_HIGH',
      code: 'ADJUST_CELL_SIZE',
      title: 'Increase spatial hash cell size',
      rationale: `If density remains high after reducing padding, increasing cellSizeMm can reduce cell boundary churn and smooth membership updates.`,
      proposed: {
        cellSizeMm: createProposedChange(fromCell, toCell, 'mm'),
      },
      confidence: confidence - 0.15,
      priority: 5,
      expectedImpact: 'Fewer cells to check, faster spatial queries',
    });

    return suggestions;
  }

  private suggestForSatSlow(metrics: Record<string, number>): Omit<TuningSuggestionEvent, 'ts' | 'level' | 'count'>[] {
    const ms = metrics.ms ?? 0;
    const satPairs = metrics.satPairsTried ?? 0;
    const nearItems = metrics.nearItems ?? 0;
    const suggestions: Omit<TuningSuggestionEvent, 'ts' | 'level' | 'count'>[] = [];

    const confidence = ms >= 10 ? 0.9 : 0.75;

    // Primary: Reduce nearPaddingMm
    const fromPad = this.ctx.nearPaddingMm;
    const toPad = Math.max(60, Math.round(fromPad * 0.85));

    suggestions.push({
      kind: 'SUGGESTION',
      fromAlert: 'SAT_SLOW',
      code: 'ADJUST_NEAR_PADDING',
      title: 'Reduce nearPaddingMm to cut SAT pairs',
      rationale: `Collision checks are slow (time=${ms.toFixed(2)}ms, satPairs=${satPairs}, nearItems=${nearItems}). Smaller nearPaddingMm reduces broad-phase candidates.`,
      proposed: {
        nearPaddingMm: createProposedChange(fromPad, toPad, 'mm'),
      },
      confidence,
      priority: 9,
      expectedImpact: `Reduce SAT pairs from ${satPairs} to ~${Math.round(satPairs * 0.7)}`,
    });

    // Secondary: Lower fixedStepHz if still slow
    const fromHz = this.ctx.fixedStepHz;
    const toHz = Math.max(60, Math.round(fromHz * 0.8));

    suggestions.push({
      kind: 'SUGGESTION',
      fromAlert: 'SAT_SLOW',
      code: 'FIXED_STEP_TUNE',
      title: 'Lower fixed-step Hz',
      rationale: `If SAT remains expensive, reducing fixedStepHz reduces collision/snap recomputation frequency while preserving deterministic behavior.`,
      proposed: {
        fixedStepHz: createProposedChange(fromHz, toHz, 'Hz'),
      },
      confidence: confidence - 0.2,
      priority: 4,
      expectedImpact: 'Fewer updates per second, lower CPU load',
    });

    return suggestions;
  }

  private suggestForCandidatesHigh(metrics: Record<string, number>): Omit<TuningSuggestionEvent, 'ts' | 'level' | 'count'>[] {
    const count = metrics.candidateCount ?? 0;
    const suggestions: Omit<TuningSuggestionEvent, 'ts' | 'level' | 'count'>[] = [];

    const confidence = count >= 80 ? 0.85 : 0.7;

    // Primary: Reduce snapThresholdMm
    const fromSnap = this.ctx.snapThresholdMm;
    const toSnap = Math.max(100, Math.round(fromSnap * 0.85));

    suggestions.push({
      kind: 'SUGGESTION',
      fromAlert: 'CANDIDATES_HIGH',
      code: 'ADJUST_SNAP_THRESHOLD',
      title: 'Reduce snapThresholdMm',
      rationale: `Candidate set is large (candidates=${count}). Lower snapThresholdMm reduces candidates and prevents selection ambiguity.`,
      proposed: {
        snapThresholdMm: createProposedChange(fromSnap, toSnap, 'mm'),
      },
      confidence,
      priority: 7,
      expectedImpact: `Reduce candidates from ${count} to ~${Math.round(count * 0.7)}`,
    });

    // Secondary: Increase stickyScoreMargin
    const fromSticky = this.ctx.stickyScoreMargin;
    const toSticky = Math.min(0.2, +(fromSticky + 0.03).toFixed(3));

    suggestions.push({
      kind: 'SUGGESTION',
      fromAlert: 'CANDIDATES_HIGH',
      code: 'INCREASE_STICKY_MARGIN',
      title: 'Increase sticky margin',
      rationale: `Large candidate sets can cause frequent switching. Higher stickyScoreMargin stabilizes selection.`,
      proposed: {
        stickyScoreMargin: createProposedChange(fromSticky, toSticky),
      },
      confidence: confidence - 0.1,
      priority: 5,
      expectedImpact: 'More stable candidate selection',
    });

    return suggestions;
  }

  private suggestForEngageFlipFlop(metrics: Record<string, number>): Omit<TuningSuggestionEvent, 'ts' | 'level' | 'count'>[] {
    const suggestions: Omit<TuningSuggestionEvent, 'ts' | 'level' | 'count'>[] = [];

    // Primary: Increase stickyScoreMargin
    const fromSticky = this.ctx.stickyScoreMargin;
    const toSticky = Math.min(0.25, +(fromSticky + 0.04).toFixed(3));

    suggestions.push({
      kind: 'SUGGESTION',
      fromAlert: 'ENGAGE_FLIPFLOP',
      code: 'INCREASE_STICKY_MARGIN',
      title: 'Increase stickyScoreMargin',
      rationale: `Engagement toggled rapidly. Raising stickyScoreMargin makes the system less eager to auto-switch candidates near equal scores.`,
      proposed: {
        stickyScoreMargin: createProposedChange(fromSticky, toSticky),
      },
      confidence: 0.8,
      priority: 8,
      expectedImpact: 'Reduce candidate switching jitter',
    });

    // Secondary: Increase hysteresis gap
    const currentGap = this.ctx.disengageThresholdMm - this.ctx.engageThresholdMm;
    const newGap = currentGap + 15;

    suggestions.push({
      kind: 'SUGGESTION',
      fromAlert: 'ENGAGE_FLIPFLOP',
      code: 'ADJUST_HYSTERESIS',
      title: 'Increase hysteresis gap',
      rationale: `Increase the gap between engage (${this.ctx.engageThresholdMm}mm) and disengage (${this.ctx.disengageThresholdMm}mm) thresholds to reduce flip-flop.`,
      proposed: {
        disengageThresholdMm: createProposedChange(
          this.ctx.disengageThresholdMm,
          this.ctx.engageThresholdMm + newGap,
          'mm'
        ),
      },
      confidence: 0.75,
      priority: 6,
      expectedImpact: `Increase hysteresis gap from ${currentGap}mm to ${newGap}mm`,
    });

    return suggestions;
  }

  private suggestForDtSpike(metrics: Record<string, number>): Omit<TuningSuggestionEvent, 'ts' | 'level' | 'count'>[] {
    const suggestions: Omit<TuningSuggestionEvent, 'ts' | 'level' | 'count'>[] = [];

    const dtMs = (metrics.dtMs ?? 0);

    // Reduce max lookahead to prevent jumpiness during hitches
    const fromMax = this.ctx.lookaheadMaxMs;
    const toMax = Math.max(this.ctx.lookaheadMinMs, Math.round(fromMax * 0.85));

    suggestions.push({
      kind: 'SUGGESTION',
      fromAlert: 'DT_SPIKE',
      code: 'ADJUST_LOOKAHEAD',
      title: 'Reduce max lookahead',
      rationale: `Frame hitches detected (dt=${dtMs.toFixed(1)}ms). Slightly reducing maxLookaheadMs can prevent predictive snapping from overcompensating during spikes.`,
      proposed: {
        lookaheadMaxMs: createProposedChange(fromMax, toMax, 'ms'),
      },
      confidence: 0.6,
      priority: 4,
      expectedImpact: 'More stable behavior during frame hitches',
    });

    return suggestions;
  }

  private suggestForPredictiveClamp(metrics: Record<string, number>): Omit<TuningSuggestionEvent, 'ts' | 'level' | 'count'>[] {
    const suggestions: Omit<TuningSuggestionEvent, 'ts' | 'level' | 'count'>[] = [];

    // Increase max lookahead mm
    const fromMax = this.ctx.maxLookaheadMm;
    const toMax = Math.min(200, Math.round(fromMax * 1.25));

    suggestions.push({
      kind: 'SUGGESTION',
      fromAlert: 'PREDICTIVE_CLAMP',
      code: 'ADJUST_LOOKAHEAD',
      title: 'Increase max lookahead distance',
      rationale: `Predictive delta is being clamped frequently. Users may be dragging faster than the current maxLookaheadMm (${fromMax}mm) allows.`,
      proposed: {
        maxLookaheadMm: createProposedChange(fromMax, toMax, 'mm'),
      },
      confidence: 0.65,
      priority: 5,
      expectedImpact: 'Allow larger predictive deltas for fast drags',
    });

    return suggestions;
  }

  private suggestForVelocitySpike(metrics: Record<string, number>): Omit<TuningSuggestionEvent, 'ts' | 'level' | 'count'>[] {
    // Velocity spikes are usually data issues, not config issues
    // Just suggest checking input handling
    return [];
  }

  // ============================================
  // EMIT SUGGESTION
  // ============================================

  private emitSuggestion(partial: Omit<TuningSuggestionEvent, 'ts' | 'level' | 'count'>): void {
    const now = nowMs();
    const code = partial.code;
    const lastEmit = this.lastEmitTsByCode[code] ?? -Infinity;

    // Check cooldown
    if ((now - lastEmit) < this.cfg.cooldownSec * 1000) {
      return;
    }

    // Update tracking
    this.lastEmitTsByCode[code] = now;
    this.countsByCode[code] = (this.countsByCode[code] ?? 0) + 1;

    // Create full event
    const suggestion: TuningSuggestionEvent = {
      ts: now,
      level: 'INFO',
      ...partial,
      count: this.countsByCode[code],
    };

    // Push to telemetry
    TELEMETRY.push(suggestion as any);
    TELEMETRY.inc(`suggestion.${code}`);
  }

  // ============================================
  // RESET
  // ============================================

  reset(): void {
    this.lastEmitTsByCode = {};
    this.countsByCode = {};
  }

  // ============================================
  // QUERY
  // ============================================

  getSuggestionCounts(): Record<string, number> {
    return { ...this.countsByCode };
  }

  getTotalSuggestions(): number {
    return Object.values(this.countsByCode).reduce((a, b) => a + b, 0);
  }
}

// ============================================
// FACTORY
// ============================================

/**
 * Create suggestion engine with custom config
 */
export function createTuningSuggestionEngine(
  ctx: Partial<TuningContextSnapshot> = {},
  cfg: Partial<SuggestionEngineConfig> = {}
): TuningSuggestionEngine {
  return new TuningSuggestionEngine(
    { ...DEFAULT_TUNING_CONTEXT, ...ctx },
    { ...DEFAULT_SUGGESTION_CONFIG, ...cfg }
  );
}
