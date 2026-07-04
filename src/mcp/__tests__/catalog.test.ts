// Feature: monolith-mcp-layer, Property 1: Tool_Catalog กรองตามสิทธิ์
// Validates: Requirements 1.2, 1.5
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { filterToolCatalog, isInCatalog, type CatalogTool, type CatalogContext } from "../catalog";
import type { ToolClass } from "../domain/types";

const arbTool: fc.Arbitrary<CatalogTool> = fc.record({
  toolName: fc.string({ minLength: 1, maxLength: 10 }),
  toolClass: fc.constantFrom<ToolClass>("Read_Tool", "Write_Tool", "Approval_Tool"),
  requiredRoles: fc.array(fc.constantFrom("designer", "production", "finance"), { maxLength: 3 }),
});
const arbCtx: fc.Arbitrary<CatalogContext> = fc.record({
  principalRoles: fc.array(fc.constantFrom("designer", "production", "finance", "sale"), { maxLength: 4 }),
  isGovernance: fc.boolean(),
});

// toolName เป็น identity ใน registry → unique เสมอ (สะท้อน invariant จริง; กัน false-flaky จากชื่อซ้ำ)
const arbTools = fc.uniqueArray(arbTool, { maxLength: 8, selector: (t) => t.toolName });

describe("mcp catalog — Property 1", () => {
  it("ผลลัพธ์ ⊆ ทุก tool และทุกตัวที่คืน = authorized (Req 1.2)", () => {
    fc.assert(
      fc.property(arbTools, arbCtx, (tools, ctx) => {
        const filtered = filterToolCatalog(tools, ctx);
        expect(filtered.length).toBeLessThanOrEqual(tools.length);
        for (const t of filtered) {
          const authorized = ctx.isGovernance || t.requiredRoles.length === 0 || t.requiredRoles.some((r) => ctx.principalRoles.includes(r));
          expect(authorized).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("tool ที่ไม่ authorized ต้องไม่อยู่ใน catalog (Req 1.5)", () => {
    fc.assert(
      fc.property(arbTools, arbCtx, (tools, ctx) => {
        const filtered = filterToolCatalog(tools, ctx);
        for (const t of tools) {
          const authorized = ctx.isGovernance || t.requiredRoles.length === 0 || t.requiredRoles.some((r) => ctx.principalRoles.includes(r));
          if (!authorized) expect(isInCatalog(filtered, t.toolName)).toBe(false);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("governance เห็นทุก tool", () => {
    fc.assert(
      fc.property(arbTools, (tools) => {
        const filtered = filterToolCatalog(tools, { principalRoles: [], isGovernance: true });
        expect(filtered.length).toBe(tools.length);
      }),
      { numRuns: 100 },
    );
  });
});
