// Feature: repair-intelligence-phase0 — deny-only capability boundary (Task 5).
//
// Phase 0 grants NOTHING beyond the Trust Kernel itself: every later-phase
// Repair capability (evidence, OCR, AI, review, diagnosis, prescription,
// professional/commercial/execution authority, R8-R12, native mobile, BIM
// authoring) and every unproven governance claim evaluates to a single stable
// denial. No input can produce allowed: true.
import { describe, expect, it } from 'vitest';
import { TRUST_REASON_CODES } from '../reasonCodes.js';
import {
  REPAIR_PHASE0_BLOCKED_CAPABILITIES,
  evaluateRepairPhase0Capability,
} from '../repair/phase0Policy.js';

describe('Repair Phase 0 deny-only boundary', () => {
  it('blocks every later-phase capability with one stable code', () => {
    for (const capability of REPAIR_PHASE0_BLOCKED_CAPABILITIES) {
      expect(evaluateRepairPhase0Capability(capability)).toEqual({
        allowed: false,
        phase: 'PHASE_0',
        capability,
        code: 'REPAIR_PHASE_NOT_ENABLED',
      });
    }
  });

  it('contains R8 through R12 and all commercial/execution authorities', () => {
    expect(REPAIR_PHASE0_BLOCKED_CAPABILITIES).toEqual(expect.arrayContaining([
      'R8', 'R9', 'R10', 'R11', 'R12',
      'PROFESSIONAL_SIGNOFF', 'WORK_ORDER', 'PROCUREMENT', 'PAYMENT',
      'AUTOMATED_DIAGNOSIS', 'REPAIR_PRESCRIPTION', 'EXECUTION_AUTHORITY',
    ]));
  });

  it('keeps unproven governance claims blocked', () => {
    expect(REPAIR_PHASE0_BLOCKED_CAPABILITIES).toEqual(expect.arrayContaining([
      'EXPERT_LABEL_GATE_B_CLAIM',
      'IMMUTABLE_INFRASTRUCTURE_CLAIM',
    ]));
    expect(TRUST_REASON_CODES).toContain('REPAIR_PHASE_NOT_ENABLED');
  });
});
