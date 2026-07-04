// Feature: monolith-mcp-layer, Property 4: Autonomy enforcement ต่อ Tool_Class
// Validates: Requirements 4.1, 4.2, 4.3, 4.5, 12.3 (รวม G2 fix — Read auto เฉพาะ auto-tier)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { decideAutonomy, requiresHumanGate, isAutoTier } from '../autonomy';
import type { AutonomyLadderTier } from '../../workflow/autonomy/registry';
import type { ToolClass } from '../domain/types';

const TIERS: AutonomyLadderTier[] = [
  'L0_advisory',
  'L1_propose',
  'L2_auto_within_guardrail',
  'L3_auto_with_notify',
];
const arbTier = fc.constantFrom(...TIERS);
const arbToolClass = fc.constantFrom<ToolClass | undefined>(
  'Read_Tool',
  'Write_Tool',
  'Approval_Tool',
  undefined,
);

describe('mcp autonomy — Property 4', () => {
  it('Write/Approval/unknown → human_gate เสมอ (Req 4.3/4.5/12.3 fail-safe)', () => {
    fc.assert(
      fc.property(arbToolClass, arbTier, (tc, tier) => {
        const d = decideAutonomy(tc, tier);
        if (tc !== 'Read_Tool') expect(d.route).toBe('human_gate');
      }),
      { numRuns: 300 },
    );
  });

  it('G2: Read_Tool → auto เฉพาะเมื่อ tier เป็น auto-tier (L2/L3); มิฉะนั้น human_gate (Req 4.2)', () => {
    fc.assert(
      fc.property(arbTier, (tier) => {
        const d = decideAutonomy('Read_Tool', tier);
        if (isAutoTier(tier)) expect(d.route).toBe('auto');
        else expect(d.route).toBe('human_gate');
      }),
      { numRuns: 200 },
    );
  });

  it('auto ไม่เคยเกิดกับ Tool_Class ที่ต้อง human gate (invariant)', () => {
    fc.assert(
      fc.property(arbToolClass, arbTier, (tc, tier) => {
        const d = decideAutonomy(tc, tier);
        if (d.route === 'auto') {
          expect(tc).toBe('Read_Tool');
          expect(isAutoTier(tier)).toBe(true);
          expect(requiresHumanGate(tc)).toBe(false);
        }
      }),
      { numRuns: 300 },
    );
  });
});
