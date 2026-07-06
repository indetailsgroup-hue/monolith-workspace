// Feature: monolith-workflow-copilot — revision gate wiring (Req 21.3, 21.10, 21.12)
// mirrors fn_wf_gate_for_step + the reject-route decision in migration 0083.
import { describe, it, expect } from 'vitest';
import {
  gateForStep,
  isCustomerGate,
  rejectRoute,
  LOCKABLE_STEPS,
  type DesignGate,
} from '../gate-wiring';
import { CANONICAL_PROCESS_ORDER } from '../../domain/constants';

describe('gateForStep — step → gate mapping (Req 21.3)', () => {
  it('maps the four lockable steps to G1–G4', () => {
    expect(gateForStep('Designer')).toBe('G1');
    expect(gateForStep('3D_Presentation')).toBe('G2');
    expect(gateForStep('3D_Rendering_Final')).toBe('G3');
    expect(gateForStep('Production Planning')).toBe('G4');
  });

  it('returns null for non-lock steps', () => {
    for (const step of ['Sale', 'Area Measurement', 'Factory', 'Installation'] as const) {
      expect(gateForStep(step)).toBeNull();
    }
  });

  it('every canonical step is either lockable (G1–G4) or explicitly null — no gaps', () => {
    for (const step of CANONICAL_PROCESS_ORDER) {
      const g = gateForStep(step);
      expect(g === null || ['G1', 'G2', 'G3', 'G4'].includes(g)).toBe(true);
    }
    // exactly four lockable steps, each mapping to a distinct gate
    const gates = LOCKABLE_STEPS.map((s) => gateForStep(s));
    expect(new Set(gates)).toEqual(new Set<DesignGate>(['G1', 'G2', 'G3', 'G4']));
  });
});

describe('isCustomerGate (Req 21.3 — customer G1/G2/G3, internal G4)', () => {
  it('G1/G2/G3 are customer gates, G4 is internal', () => {
    expect(isCustomerGate('G1')).toBe(true);
    expect(isCustomerGate('G2')).toBe(true);
    expect(isCustomerGate('G3')).toBe(true);
    expect(isCustomerGate('G4')).toBe(false);
  });
});

describe('rejectRoute (Req 21.10 — scope_change → requote, else rework)', () => {
  it('routes scope_change to the re-quote path', () => {
    expect(rejectRoute('scope_change')).toBe('requote');
  });
  it('routes every other reason to plain rework', () => {
    expect(rejectRoute('customer_change')).toBe('rework');
    expect(rejectRoute('daph_defect')).toBe('rework');
    expect(rejectRoute('pm_judgment')).toBe('rework');
  });
});
