/**
 * nfpGcodeHeader.test.ts — S18 l5-cnc-safety Slice 3 (G-code)
 *
 * ADR-065 Q3: while SHADOW_MODE is on, EVERY G-code dialect must carry a
 * NOT-FOR-PRODUCTION comment header so no program near a machine is unlabeled.
 *
 * The label is a safety marking, not an informational comment — it must be
 * emitted even when includeComments is false.
 */

import { describe, it, expect } from 'vitest';
import { fanucPostProcessor } from '../dialects/fanuc';
import { biesseIsoPostProcessor } from '../dialects/biesseIso';
import { heidenhainPostProcessor } from '../dialects/heidenhain';
import { weekePostProcessor } from '../dialects/weeke';
import { mprPostProcessor } from '../dialects/mpr';
import { cixPostProcessor } from '../dialects/cix';
import { xxlPostProcessor } from '../dialects/xxl';
import type { PostProcessor } from '../types';
import { KDT_MACHINE } from '../../machine/presets/kdt';
import {
  SHADOW_MODE_NOT_FOR_PRODUCTION,
  NOT_FOR_PRODUCTION_LABEL,
} from '../../../core/config/shadowMode';
import type { OperationGraph, DrillOperation } from '../../operation/operationTypes';

// ============================================================================
// Fixtures
// ============================================================================

const drillOp: DrillOperation = {
  type: 'DRILL',
  id: 'drill-nfp-001',
  sourceId: 'point-nfp-001',
  toolId: 'DRILL_5',
  position: { x: 100, y: 100, z: 0 },
  depth: 13,
  throughHole: false,
  feedRate: 500,
};

const opGraph: OperationGraph = {
  machineId: 'KDT',
  safeZ: 50,
  rapidZ: 60,
  operations: [drillOp],
  metadata: {
    jobId: 'job-nfp-gcode',
    sourceContentHash: 'hash-nfp',
    builtAt: '2026-01-01T00:00:00Z',
    toolVersion: 'test@1.0.0',
  },
  toolsUsed: ['DRILL_5'],
};

const ALL_PROCESSORS: PostProcessor[] = [
  fanucPostProcessor,
  biesseIsoPostProcessor,
  heidenhainPostProcessor,
  weekePostProcessor,
  mprPostProcessor,
  cixPostProcessor,
  xxlPostProcessor,
];

// ============================================================================
// Tests
// ============================================================================

describe('G-code NFP header — every dialect (ADR-065 Q3)', () => {
  it('shadow mode is on during dogfood', () => {
    expect(SHADOW_MODE_NOT_FOR_PRODUCTION).toBe(true);
  });

  it.each(ALL_PROCESSORS.map((p) => [p.dialect, p] as const))(
    '%s output contains the NOT-FOR-PRODUCTION header while SHADOW_MODE is on',
    (_dialect, processor) => {
      const result = processor.post(opGraph, KDT_MACHINE, { programName: 'NFPTEST' });

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        expect(result.gcode).toContain(NOT_FOR_PRODUCTION_LABEL);
      }
    }
  );

  it.each(ALL_PROCESSORS.map((p) => [p.dialect, p] as const))(
    '%s emits the NFP label even with includeComments: false (safety marking, not a comment)',
    (_dialect, processor) => {
      const result = processor.post(opGraph, KDT_MACHINE, {
        programName: 'NFPTEST',
        includeComments: false,
      });

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        expect(result.gcode).toContain(NOT_FOR_PRODUCTION_LABEL);
      }
    }
  );
});
