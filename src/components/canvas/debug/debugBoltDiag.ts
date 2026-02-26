/**
 * debugBoltDiag — 1-line bolt invariant smoke log
 *
 * Pure function, no THREE dependency.
 * Enable via: VITE_DEBUG_BOLT_DIAG=1 npm run dev
 */

export interface BoltDiagLineInput {
  pairKeyV2: string;
  cornerType: string;
  dot_toPocket: number;
  dot_modelFwd: number;
}

/**
 * Log a single bolt invariant line.
 * Output: [BOLT-DIAG] pair2-TOP_LEFT-A-37 TOP_LEFT dot_toPocket=1.000 dot_modelFwd=-1.000
 */
export function logBoltDiagLine(input: BoltDiagLineInput): void {
  const { pairKeyV2, cornerType, dot_toPocket, dot_modelFwd } = input;
  // eslint-disable-next-line no-console
  console.log(
    `[BOLT-DIAG] ${pairKeyV2} ${cornerType} dot_toPocket=${dot_toPocket.toFixed(3)} dot_modelFwd=${dot_modelFwd.toFixed(3)}`,
  );
}
