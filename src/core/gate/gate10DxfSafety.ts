/**
 * Gate 10 DXF Safety
 *
 * Safety validation for DXF output from operation graphs.
 */

export interface G10Result {
  ok: boolean;
  status: 'PASS' | 'FAIL';
  issues: Array<{ code: string; message: string; severity: string }>;
  dxf?: string;
}

export function assertDxfSafety(dxf: string, _provenance?: Record<string, unknown>): G10Result {
  const issues: G10Result['issues'] = [];
  if (!dxf || dxf.trim().length === 0) {
    issues.push({ code: 'G10_EMPTY_DXF', message: 'DXF output is empty', severity: 'ERROR' });
  }
  const ok = issues.length === 0;
  return { ok, status: ok ? 'PASS' : 'FAIL', issues, dxf };
}

export function createOperationGraphProvenance(
  _packet: unknown,
  _opGraph?: unknown,
  _panelId?: string
): Record<string, unknown> {
  return { source: 'operationGraph', timestamp: Date.now() };
}
