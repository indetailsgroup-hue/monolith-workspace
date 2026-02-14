// src/core/manufacturing/post/ir/traceMap.v1.ts
/**
 * Trace Map Contracts.
 *
 * Maps IR move indices to semantic manufacturing context.
 * Generated alongside IRProgram during build.
 *
 * Provides verifier with:
 * - Operation/pass identification
 * - Stage classification (ROUGH/FINISH/THROUGH)
 * - Tool identification
 * - Perimeter parameter (s) for tab checking
 *
 * v0.10.8.1 - Toolpath Verifier
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Trace move kind.
 */
export type TraceKind = "CUT" | "RAPID" | "ENTRY" | "EXIT" | "DWELL" | "TOOL_CHANGE";

/**
 * Manufacturing stage.
 */
export type TraceStage = "ROUGH" | "FINISH" | "THROUGH";

/**
 * IR Trace entry.
 *
 * Semantic context for a single IR move.
 */
export interface IRTrace {
  /** Move index in IRProgram.moves */
  moveIndex: number;

  /** Move kind classification */
  kind: TraceKind;

  /** Operation ID */
  opId?: string;

  /** Pass ID (within operation) */
  passId?: string;

  /** Manufacturing stage */
  stage?: TraceStage;

  /** Tool ID used */
  toolId?: string;

  /** Part/panel ID */
  partId?: string;

  /**
   * Perimeter parameter (0..1) for profile moves.
   * 0 = profile start, 1 = profile end (closed loop returns to 0)
   * Used for tab zone checking.
   */
  s?: number;

  /**
   * Z level intent (target Z for this move).
   * Useful for depth verification.
   */
  zIntent?: number;

  /** Additional metadata */
  meta?: Record<string, unknown>;
}

/**
 * Trace Map.
 *
 * Complete trace data for an IR program.
 * Parallel array aligned with IRProgram.moves.
 */
export interface TraceMap {
  /** Trace map version */
  version: "1.0";

  /** Job ID (must match IRProgram) */
  jobId: string;

  /** Sheet ID (must match IRProgram) */
  sheetId: string;

  /** Trace entries (aligned with IR moves) */
  traces: IRTrace[];

  /** Audit fingerprint */
  auditFp: string;

  /** Generation timestamp */
  generatedAt?: string;

  /** Generator version */
  generatorVersion?: string;
}

// =============================================================================
// BUILDER
// =============================================================================

/**
 * Trace map builder.
 */
export class TraceMapBuilder {
  private traces: IRTrace[] = [];
  private jobId: string;
  private sheetId: string;

  constructor(jobId: string, sheetId: string) {
    this.jobId = jobId;
    this.sheetId = sheetId;
  }

  /**
   * Add trace entry.
   */
  addTrace(trace: Omit<IRTrace, "moveIndex">): void {
    this.traces.push({
      ...trace,
      moveIndex: this.traces.length,
    });
  }

  /**
   * Add rapid move trace.
   */
  addRapid(opId?: string, toolId?: string): void {
    this.addTrace({ kind: "RAPID", opId, toolId });
  }

  /**
   * Add cut move trace.
   */
  addCut(
    opId: string,
    passId: string,
    stage: TraceStage,
    toolId: string,
    s?: number,
    zIntent?: number
  ): void {
    this.addTrace({
      kind: "CUT",
      opId,
      passId,
      stage,
      toolId,
      s,
      zIntent,
    });
  }

  /**
   * Add entry move trace.
   */
  addEntry(opId: string, passId: string, stage: TraceStage, toolId: string): void {
    this.addTrace({
      kind: "ENTRY",
      opId,
      passId,
      stage,
      toolId,
    });
  }

  /**
   * Add exit move trace.
   */
  addExit(opId: string, passId: string, stage: TraceStage, toolId: string): void {
    this.addTrace({
      kind: "EXIT",
      opId,
      passId,
      stage,
      toolId,
    });
  }

  /**
   * Add tool change trace.
   */
  addToolChange(toolId: string): void {
    this.addTrace({ kind: "TOOL_CHANGE", toolId });
  }

  /**
   * Add dwell trace.
   */
  addDwell(): void {
    this.addTrace({ kind: "DWELL" });
  }

  /**
   * Add placeholder trace (for header/footer moves).
   */
  addPlaceholder(): void {
    this.addTrace({ kind: "RAPID" });
  }

  /**
   * Get current trace count.
   */
  getCount(): number {
    return this.traces.length;
  }

  /**
   * Build trace map.
   */
  build(auditFp: string): TraceMap {
    return {
      version: "1.0",
      jobId: this.jobId,
      sheetId: this.sheetId,
      traces: this.traces,
      auditFp,
      generatedAt: new Date().toISOString(),
      generatorVersion: "0.10.8.1",
    };
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create empty trace map.
 */
export function createEmptyTraceMap(
  jobId: string,
  sheetId: string,
  moveCount: number
): TraceMap {
  const traces: IRTrace[] = [];
  for (let i = 0; i < moveCount; i++) {
    traces.push({ moveIndex: i, kind: "RAPID" });
  }

  return {
    version: "1.0",
    jobId,
    sheetId,
    traces,
    auditFp: "",
  };
}

/**
 * Validate trace map against IR program.
 */
export function validateTraceMap(
  traceMap: TraceMap,
  irMoveCount: number,
  irJobId: string,
  irSheetId: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (traceMap.traces.length !== irMoveCount) {
    errors.push(
      `Trace count (${traceMap.traces.length}) != IR move count (${irMoveCount})`
    );
  }

  if (traceMap.jobId !== irJobId) {
    errors.push(`Job ID mismatch: trace=${traceMap.jobId}, ir=${irJobId}`);
  }

  if (traceMap.sheetId !== irSheetId) {
    errors.push(`Sheet ID mismatch: trace=${traceMap.sheetId}, ir=${irSheetId}`);
  }

  // Check move index alignment
  for (let i = 0; i < traceMap.traces.length; i++) {
    if (traceMap.traces[i].moveIndex !== i) {
      errors.push(`Trace ${i} has wrong moveIndex: ${traceMap.traces[i].moveIndex}`);
      break; // Only report first misalignment
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get traces for a specific operation.
 */
export function getTracesForOp(traceMap: TraceMap, opId: string): IRTrace[] {
  return traceMap.traces.filter((t) => t.opId === opId);
}

/**
 * Get traces for a specific stage.
 */
export function getTracesForStage(
  traceMap: TraceMap,
  stage: TraceStage
): IRTrace[] {
  return traceMap.traces.filter((t) => t.stage === stage);
}

/**
 * Get cut traces with s-parameter.
 */
export function getCutTracesWithS(traceMap: TraceMap): IRTrace[] {
  return traceMap.traces.filter(
    (t) => t.kind === "CUT" && t.s !== undefined
  );
}

/**
 * Find trace by move index.
 */
export function getTraceAtIndex(
  traceMap: TraceMap,
  moveIndex: number
): IRTrace | undefined {
  return traceMap.traces[moveIndex];
}
