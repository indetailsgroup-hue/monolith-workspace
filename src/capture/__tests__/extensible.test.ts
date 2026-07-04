// Feature: capture-spine, Property 9: Extensible โดยไม่แก้ core (config-driven)
// Validates: Requirements 9.1, 9.2
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { canTransition, canPromote, canCommitBusiness } from "../state-machine";
import { evaluateGate } from "../verify-gate";
import { sortByPriority, allRulesTracePfmea, type VerifyRule } from "../verify-rules";

// จำลอง config ของ capture_type ใหม่ (เพิ่มผ่าน config row ไม่แก้ core)
interface CaptureTypeConfig {
  captureType: string;
  criticalFields: string[];
  verifyRules: VerifyRule[];
  commitTarget: string;
}

const arbRule: fc.Arbitrary<VerifyRule> = fc.record({
  checkpoint: fc.string({ minLength: 1, maxLength: 8 }),
  guards_against: fc.string({ maxLength: 8 }),
  method: fc.string({ maxLength: 8 }),
  pfmea_ref: fc.record({ source_file: fc.constant("F"), source_step: fc.constant("S") }),
  priority: fc.oneof(
    fc.record({ kind: fc.constant<"rpn">("rpn"), rpn: fc.integer({ min: 1, max: 500 }) }),
    fc.record({ kind: fc.constant<"severity_only">("severity_only"), sev: fc.integer({ min: 1, max: 10 }) }),
  ),
});
const arbConfig: fc.Arbitrary<CaptureTypeConfig> = fc.record({
  captureType: fc.string({ minLength: 1, maxLength: 20 }), // capture_type ใด ๆ
  criticalFields: fc.array(fc.string({ minLength: 1, maxLength: 6 }), { maxLength: 4 }),
  verifyRules: fc.array(arbRule, { maxLength: 6 }),
  commitTarget: fc.string({ minLength: 1, maxLength: 12 }),
});

describe("capture — Property 9 (extensible: core เป็น capture_type-agnostic)", () => {
  it("core state-machine ทำงานเหมือนกันทุก capture_type (ไม่ branch ตาม type)", () => {
    fc.assert(
      fc.property(arbConfig, (_cfg) => {
        // core ไม่รับ capture_type → behavior คงที่ไม่ว่า config ใด
        expect(canTransition("proposed", "approved")).toBe(true);
        expect(canTransition("emitted", "superseded")).toBe(true);
        expect(canPromote("approved")).toBe(true);
        expect(canCommitBusiness("emitted")).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("verify_rules ของ capture_type ใหม่ใด ๆ → sort + pfmea trace ได้โดยไม่แก้ core", () => {
    fc.assert(
      fc.property(arbConfig, (cfg) => {
        const sorted = sortByPriority(cfg.verifyRules);
        expect(sorted.length).toBe(cfg.verifyRules.length);
        // priority เรียงไม่เพิ่มขึ้น (เสี่ยงสูง→ต่ำ) — invariant เดียวทุก capture_type
        for (let i = 1; i < sorted.length; i++) {
          const score = (r: VerifyRule) => (r.priority.kind === "rpn" ? 1_000_000 + r.priority.rpn : r.priority.sev);
          expect(score(sorted[i - 1])).toBeGreaterThanOrEqual(score(sorted[i]));
        }
        expect(allRulesTracePfmea(cfg.verifyRules)).toBe(true); // arbRule ใส่ pfmea_ref เสมอ
      }),
      { numRuns: 200 },
    );
  });

  it("verify-gate ทำงานกับ critical_fields ของ config ใด ๆ", () => {
    fc.assert(
      fc.property(arbConfig, fc.boolean(), (cfg, suspicious) => {
        const gate = evaluateGate({
          hasCriticalFieldPending: cfg.criticalFields.length > 0,
          minConfidence: 1,
          confidenceThreshold: 0.7,
          isSuspicious: suspicious,
        });
        // mustConfirm สอดคล้องกับ input เสมอ (ไม่ขึ้นกับ capture_type)
        expect(gate.mustConfirm).toBe(cfg.criticalFields.length > 0 || suspicious);
      }),
      { numRuns: 200 },
    );
  });
});
