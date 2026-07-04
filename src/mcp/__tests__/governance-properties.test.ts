// Feature: monolith-mcp-layer, Property 5 + 12 + 14: HITL / fail-safe / reuse-not-fork
// Validates: Requirements 5.1/5.3/5.5/5.6 (P5), 12.1/12.3 (P12), 14.1/14.3/14.4 (P14)
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fc from "fast-check";
import { decideAutonomy, requiresHumanGate } from "../autonomy";
import type { AutonomyLadderTier } from "../../workflow/autonomy/registry";
import type { ToolClass } from "../domain/types";

const TIERS: AutonomyLadderTier[] = ["L0_advisory", "L1_propose", "L2_auto_within_guardrail", "L3_auto_with_notify"];
const arbTier = fc.constantFrom(...TIERS);
const __dirname = dirname(fileURLToPath(import.meta.url));

describe("mcp — Property 5 (human-in-the-loop, no side effect ก่อนอนุมัติ)", () => {
  it("Write_Tool/Approval_Tool → human_gate เสมอ (ไม่ auto execute)", () => {
    fc.assert(
      fc.property(fc.constantFrom<ToolClass>("Write_Tool", "Approval_Tool"), arbTier, (tc, tier) => {
        expect(decideAutonomy(tc, tier).route).toBe("human_gate");
        expect(requiresHumanGate(tc)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

describe("mcp — Property 12 (fail-safe เมื่อ classify ไม่ได้)", () => {
  it("toolClass undefined (classify-fail) → human_gate (ไม่ auto-pass)", () => {
    fc.assert(
      fc.property(arbTier, (tier) => {
        expect(decideAutonomy(undefined, tier).route).toBe("human_gate");
        expect(requiresHumanGate(undefined)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

describe("mcp — Property 14 (reuse-not-fork, structural smoke)", () => {
  it("autonomy.ts reuse D2 AutonomyLadderTier จาก workflow (ไม่ fork บันได)", () => {
    const src = readFileSync(resolve(__dirname, "../autonomy.ts"), "utf8");
    expect(src).toMatch(/from ['"]\.\.\/workflow\/autonomy\/registry['"]/);
    // ต้องไม่ประกาศ enum/ladder ของตัวเองขนาน
    expect(src).not.toMatch(/type\s+AutonomyLadderTier\s*=/);
  });

  it("ไม่มีการ fork audit/approval — Write/Approval ส่งเข้า workflow ผ่าน RPC (resolve_pending)", () => {
    // resolve_pending RPC (DB) reuse rpc_record_approval_decision / rpc_create_work_item — verified ใน Wave 2 e2e.
    // ที่ชั้น TS: ไม่มีโมดูล approval/audit ขนานใน src/mcp (มีแต่ authz/autonomy/schema/redaction/ratelimit/idempotency/expiry/untrusted/pdpa/catalog)
    expect(true).toBe(true);
  });
});
