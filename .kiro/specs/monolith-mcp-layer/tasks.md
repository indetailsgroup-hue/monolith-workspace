# Implementation Plan: MCP Layer (Monolith)

## Overview

แผนการสร้าง MCP Layer — เปิดเผยความสามารถ Monolith เป็น MCP Tool ภายใต้ธรรมาภิบาลเดิม โดย **ห่อหุ้ม (wrap) ไม่ fork** C12 / workflow-copilot (Approval/Work_Item/Knowledge_Export) / D2 / audit

แนวทาง: **DB-first → SECURITY DEFINER RPC → RLS via C12 → append-only audit → property-based test → Edge Function (MCP server)** บน Supabase/PostgreSQL + Deno Edge Functions; pure logic ใน `src/mcp/` เพื่อ PBT แบบ deterministic

> **Discipline:** reuse-not-fork (ไม่สร้าง auth/approval/audit ใหม่); human-in-the-loop (Write/Approval → Pending_Invocation ผ่าน `rpc_record_approval_decision`); fail-safe เมื่อ governance ไม่พร้อม; redact PII ที่ boundary; ทุก input/เนื้อหาภายนอก = Untrusted_Content
>
> **OPEN GATE-1:** migration ใหม่ของ mcp-layer ต้องรัน `supabase db reset` เขียวก่อนถือ task done — **supabase CLI 2.108.0 + Docker พร้อมในเครื่องนี้** (C12+line_oa substrate เขียวแล้ว verified; ไม่ใช่ข้อจำกัด environment)
>
> **DEP:** พึ่ง `monolith-workflow-copilot` (Phase 1: Approval_Request / `rpc_record_approval_decision` / Work_Item / Knowledge_Export query) + C12/D2 จาก `line-oa-commerce`

การทดสอบ: **Vitest + fast-check** (Correctness Property 1–19 → 1 property test/ข้อ, ≥ 100 iteration, tag `// Feature: monolith-mcp-layer, Property N: ...`), **pgTAP/DB-harness** สำหรับ RLS/immutability/atomic counter; งานทดสอบเป็น sub-task ทางเลือก (`*`)

## Tasks

- [ ] 1. Scaffold + data layer (tables + RLS + audit immutability)
  - [x] 1.1 สร้าง migration `0001_mcp_init.sql`: enums (tool_class, invocation status, scope_kind) + `mcp_tool_registry` + `tool_invocation` + `pending_invocation` + `mcp_idempotency_record` (PK (idempotency_key, principal), CHECK len 1–255) + `mcp_rate_limit_counter` (PK atomic) — เปิด RLS `SELECT TO authenticated USING is_governance_role() OR has_site_access(site_code)`, ไม่มี client write policy
    - _Requirements: 1.1, 1.3, 2.5, 14.2, 15.7, 16.1, 17.1_
  - [x] 1.2 สร้าง migration `0002_mcp_audit.sql`: `mcp_audit_log` (append-only) + trigger `trg_mcp_audit_immutable` raise บน UPDATE/DELETE + `REVOKE UPDATE, DELETE`
    - _Requirements: 11.2_
  - [x] 1.3 seed `mcp_tool_registry` 3 tools (query_knowledge=Read, create_work_item=Write, record_approval_decision=Approval) + Tool_Class + requires_approval + input/output schema + default_autonomy_tier
    - _Requirements: 1.1, 1.3, 1.6_
  - [ ]* 1.4 pgTAP: RLS reuse C12, audit append-only reject UPDATE/DELETE, idempotency unique, rate_limit_counter atomic upsert
    - **[OPEN GATE-1]** `supabase db reset` เขียว
    - _Requirements: 11.2, 14.2, 15.7, 17.1_

- [ ] 2. Pure logic core (`src/mcp/`)
  - [x] 2.1 `src/mcp/authz.ts`: Tool_Authorization eval (C12 role + site access + active site) — re-derive จาก Principal เท่านั้น (กัน confused deputy)
    - _Requirements: 3.1, 3.2, 3.4, 3.6, 19.3_
  - [x] 2.2 `src/mcp/autonomy.ts`: จัด Autonomy_Tier ตาม Tool_Class (Read auto / Write+Approval → human gate); classify-fail → ถือว่าต้อง human approval (fail-safe)
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 12.3_
  - [x] 2.3 `src/mcp/schema.ts`: validate input/output ตาม Tool schema + round-trip (serialize↔parse)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_
  - [x] 2.4 `src/mcp/redaction.ts`: บังคับ Redaction_Policy (config) ที่ boundary + data minimization; redact-fail → block
    - _Requirements: 9.1, 9.2, 9.3, 9.5_
  - [x] 2.5 `src/mcp/ratelimit.ts`: ประเมิน Rate_Limit_Policy + Cost_Budget ต่อ scope (atomic semantics) + default fail-safe
    - _Requirements: 15.1, 15.2, 15.3, 15.5, 15.6, 15.8_
  - [x] 2.6 `src/mcp/idempotency.ts`: (Idempotency_Key, Principal) replay/conflict/empty-or-too-long logic
    - _Requirements: 17.2, 17.4, 17.7, 17.8_
  - [x] 2.7 `src/mcp/expiry.ts`: Invocation_Expiry compute + decision-wins-race resolution
    - _Requirements: 16.1, 16.6, 16.7_
  - [x] 2.8 `src/mcp/untrusted.ts`: ปฏิบัติ input/external content เป็น Untrusted_Content (ไม่ตีความเป็นคำสั่ง) + Source_Provenance trace/unverified mark
    - _Requirements: 19.1, 19.2, 19.4, 19.5_

- [ ] 3. RPCs: read + invocation + pending lifecycle (SECURITY DEFINER)
  - [x] 3.1 `rpc_mcp_invoke_read` (`0010_rpc_mcp_invoke_read.sql`): authz → autonomy → execute Read_Tool (wrap Knowledge_Export query, read-only) → คืน result + Source_Provenance + low-confidence mark; audit
    - _Requirements: 3.1, 6.1, 6.2, 6.3, 6.4, 6.5, 19.4, 19.5_
  - [x] 3.2 `rpc_mcp_create_pending` (`0011_rpc_mcp_create_pending.sql`): Write/Approval → สร้าง Pending_Invocation + Approval_Request (reuse workflow) **no side effects**; idempotent (Idempotency_Key, Principal); audit
    - _Requirements: 5.1, 5.5, 5.6, 7.2, 8.2, 17.2, 17.9_
  - [x] 3.3 `rpc_mcp_resolve_pending` (`0012_rpc_mcp_resolve_pending.sql`): on approved → execute capability เดิม (create Work_Item / record decision ผ่าน `rpc_record_approval_decision`) → executed; on rejected → rejected ไม่เปลี่ยนสถานะ
    - _Requirements: 5.3, 5.4, 7.5, 8.3_
  - [x] 3.4 `rpc_mcp_expire_pending` (`0013_rpc_mcp_expire_pending.sql`): sweep พ้น expiry → expired (no side effects) + audit; decision-wins-race guard; reject approve ให้ expired
    - _Requirements: 16.2, 16.4, 16.5, 16.6, 16.7_
  - [x] 3.5 `rpc_mcp_check_rate_limit` (`0014_rpc_mcp_rate_limit.sql`): atomic upsert counter + บังคับเพดาน/budget; เกิน → Throttling_Event audit (no side effects)
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.7_
  - [x] 3.6 ขยาย model-provenance + injection-detection audit ใน `rpc_mcp_audit` (`0015_rpc_mcp_audit.sql`): บันทึก Model_Provenance (unknown-fallback, scrub secret), injection detection; append-only, คงรายการเสมอ
    - _Requirements: 11.1, 11.3, 11.4, 18.1, 18.2, 18.4, 18.5, 18.6, 18.8, 19.6_

- [x] 4. Checkpoint — ตรวจ data + RPC + pure logic
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Edge Functions (MCP server + cleanup)
  - [x] 5.1 `supabase/functions/mcp-server/index.ts`: นำเสนอ MCP_Server_Identity + ยืนยัน Client_Credential → ผูก Principal (`resolve_actor`); discovery (Tool_Catalog filtered authz); invoke pipeline = schema-validate → rate-limit → autonomy classify → (Read: invoke_read / Write+Approval: create_pending) → redact → audit; Untrusted_Content guard; credential เพิกถอน → reject
    - _Requirements: 1.2, 2.1, 2.2, 2.3, 2.6, 9.1, 13.1, 19.1, 19.2, 19.3_
  - [x] 5.2 `supabase/functions/mcp-pending-cleanup/index.ts`: cron ≤ 5 นาที เรียก `rpc_mcp_expire_pending`
    - _Requirements: 16.4_
  - [x] 5.3 wire approval callback: เมื่อ workflow บันทึก Approval_Decision ของ Pending_Invocation → เรียก `rpc_mcp_resolve_pending` (async result กลับ client)
    - _Requirements: 5.2, 5.3, 8.1_

- [ ] 6. PDPA consent + cross-border control
  - [x] 6.1 `src/mcp/pdpa.ts` + wire ใน mcp-server: ตรวจ Consent_Record (reuse แหล่งเดิม) + จัดประเภท Cross_Border_Transfer; ขาด consent / cross-border ไม่มีมาตรการ → ระงับ fail-safe; audit
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 7. Property-based tests (Correctness Property 1–19)
  - [x]* 7.1 **Property 1: Tool_Catalog กรองตามสิทธิ์** — **Validates: Requirements 1.2, 1.5** (`src/mcp/__tests__/catalog.test.ts` — filterToolCatalog)
  - [x]* 7.2 **Property 2: Server identity + client auth ผูก Principal** — **Validates: Requirements 2.2, 2.5, 2.6** (transport: `mcp-server/index.test.ts` auth-binding — 401 missing-auth, JWT forwarded, SERVER_IDENTITY)
  - [x]* 7.3 **Property 3: Per-tool authorization (C12 + site access)** — **Validates: Requirements 3.1, 3.2, 3.4, 3.6** (เขียนแล้ว `src/mcp/__tests__/authz.test.ts` — รวม G1 fix)
  - [x]* 7.4 **Property 4: Autonomy enforcement ต่อ Tool_Class** — **Validates: Requirements 4.1, 4.2, 4.3, 4.5** (เขียนแล้ว `src/mcp/__tests__/autonomy.test.ts` — รวม G2 fix)
  - [x]* 7.5 **Property 5: Human-in-the-loop — ไม่มี side effect ก่อนอนุมัติ** — **Validates: Requirements 5.1, 5.3, 5.4, 5.5, 5.6** (`governance-properties.test.ts` Write/Approval→human_gate; no-side-effect ก่อน approve = DB e2e Wave 2 create_pending→0 work_item)
  - [x]* 7.6 **Property 6: Knowledge read-only + provenance + low-confidence** — **Validates: Requirements 6.1, 6.3, 6.4, 6.5** (provenance pure = `untrusted.test.ts` markProvenance; read-only + low_confidence/stale = DB e2e Wave 2/0047)
  - [x]* 7.7 **Property 7: Work_Item creation ผ่าน gate + reject ขั้นไม่รู้จัก** — **Validates: Requirements 7.2, 7.3, 7.4, 7.5** (DB e2e Wave 2: create_pending no side-effect→resolve approved→work_item created)
  - [x]* 7.8 **Property 8: Approval recording ผ่าน resolve_actor + idempotent** — **Validates: Requirements 8.3, 8.4, 8.5** (idempotent pure = `idempotency.test.ts` 7.17; resolve_actor + reuse rpc_record_approval_decision = DB Wave 2 resolve_pending)
  - [x]* 7.9 **Property 9: PII redaction fail-safe ที่ boundary** — **Validates: Requirements 9.1, 9.3, 9.4** (`src/mcp/__tests__/redaction.test.ts`)
  - [x]* 7.10 **Property 10: PDPA consent + cross-border fail-safe** — **Validates: Requirements 10.1, 10.2, 10.3** (`src/mcp/__tests__/pdpa.test.ts`)
  - [x]* 7.11 **Property 11: Audit completeness (append-only, redacted)** — **Validates: Requirements 11.1, 11.2, 11.3, 11.6** (DB: mcp_audit_log append-only trigger verified Wave 0 + ทุก RPC เขียน rpc_mcp_audit; unknown-fallback verified)
  - [x]* 7.12 **Property 12: Fail-safe เมื่อ governance ไม่พร้อม** — **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5** (`governance-properties.test.ts` classify-fail→human_gate; audit-write-fail→tx rollback = RPC fail-safe)
  - [x]* 7.13 **Property 13: I/O schema validation + round-trip** — **Validates: Requirements 13.1, 13.2, 13.4, 13.5** (`src/mcp/__tests__/schema.test.ts`)
  - [x]* 7.14 **Property 14: Reuse-not-fork (structural smoke)** — **Validates: Requirements 14.1, 14.3, 14.4** (`governance-properties.test.ts` — autonomy.ts import D2 จาก workflow, ไม่ fork ladder/audit/approval)
  - [x]* 7.15 **Property 15: Rate-limit + cost atomic (no overshoot)** — **Validates: Requirements 15.1, 15.2, 15.3, 15.6, 15.7, 15.8** (`src/mcp/__tests__/ratelimit.test.ts`)
  - [x]* 7.16 **Property 16: Pending expiry + cleanup (no side effects, decision-wins-race)** — **Validates: Requirements 16.2, 16.3, 16.4, 16.6, 16.7** (`src/mcp/__tests__/expiry.test.ts`)
  - [x]* 7.17 **Property 17: Write_Tool idempotency (conflict-reject)** — **Validates: Requirements 17.2, 17.7, 17.8, 17.9** (`src/mcp/__tests__/idempotency.test.ts`)
  - [x]* 7.18 **Property 18: Model provenance (unknown-fallback, untrusted)** — **Validates: Requirements 18.1, 18.2, 18.5, 18.6, 18.7** (`src/mcp/__tests__/untrusted.test.ts` — pure markProvenance; unknown-fallback ของ rpc_mcp_audit verified ใน Wave 2 e2e)
  - [x]* 7.19 **Property 19: Prompt-injection / tool-poisoning defense** — **Validates: Requirements 19.2, 19.3, 19.4, 19.5, 19.6** (`src/mcp/__tests__/untrusted.test.ts` + authz re-derive ใน 7.3)

- [x] 8. Final checkpoint — ตรวจ MCP Layer ครบ
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- **Wave 0 (tasks 1.1–1.3) — BUILT + deploy-verified (Phase 2 เริ่ม):** migrations on-disk = `0036_mcp_init.sql` / `0037_mcp_audit.sql` / `0038_mcp_registry_seed.sql` (ต่อ global sequence ของ workflow-copilot 0001–0035 ใน supabase/migrations folder เดียวกัน — แผน tasks.md 0001/0002 map → 0036/0037/0038). enums: `mcp_tool_class`{Read/Write/Approval_Tool}, `mcp_invocation_status`{executed,pending,rejected,expired,throttled,error}, `mcp_pending_status`{pending,executed,rejected,expired}, `mcp_scope_kind`{Principal,MCP_Client,Tool_Class}. 6 ตาราง RLS เปิดครบ + SELECT TO authenticated (reuse C12), ไม่มี client write policy. mcp_audit_log append-only (trigger + REVOKE). seed 3 tools (requires_approval สอดคล้อง Tool_Class ผ่าน CHECK). verify (db reset เขียว 0001–0038 + e2e): 6 tables RLS=t, 4 enums ถูก, 3 seed ถูก, audit UPDATE ถูก reject, Read_Tool+requires_approval ถูก CHECK reject.
- **⚠️ DESIGN FIX (evidence-based):** design.md ระบุ `principal uuid` แต่ C12 `resolve_actor()` คืน **text** (email-based; เหมือน `workflow_audit_log.performed_by text`) → ใช้ `principal text` ในทุกตาราง (tool_invocation/mcp_idempotency_record/mcp_audit_log) ตามหลัก reuse-not-fork. ควร sync design.md ตาม (uuid → text).
- **RLS micro-decisions (design ไม่ได้ระบุตารางที่ไม่มี site_code):** mcp_tool_registry = `USING (true)` (catalog; กรองสิทธิ์ที่ discovery/Property 1); pending_invocation = derive site ผ่าน join tool_invocation; mcp_idempotency_record = `principal = resolve_actor()` (principal-scoped); mcp_rate_limit_counter = governance-only.
- **scrutinize Wave 0 → fix F1 (0039, deploy-verified):** F1 (MEDIUM) `pending_invocation.approval_request_id` ไม่มี FK → เพิ่ม `0039_mcp_pending_approval_fk.sql` (additive ALTER ADD CONSTRAINT → `approval_request(id)`, ON DELETE NO ACTION). verify: FK มีจริง + orphan approval_request_id ถูก reject (foreign_key_violation). F2 (query_knowledge tier=L2 ขณะ phase clamp ≤ L1) = ปล่อยตาม design — Read_Tool read-only ไม่ขัดเจตนา clamp (กัน autonomous business mutation); คนละ registry. F3–F6 ผ่าน (RLS/idempotency/rate-limit/audit/denormalized tool_class ตั้งใจ).
- **Wave 1 (tasks 2.1–2.8) — BUILT (pure logic core `src/mcp/`):** 8 โมดูล deterministic (PBT-ready) + `src/mcp/domain/types.ts` (ToolClass/InvocationStatus/PendingStatus/ScopeKind/Principal). reuse-not-fork: `autonomy.ts` import `AutonomyLadderTier` จาก `workflow/autonomy/registry` (ไม่ fork D2). โมดูล: authz (re-derive role+site+active, governance ข้ามไซต์เฉพาะ active), autonomy (Read→auto / Write+Approval+unknown→human_gate fail-safe), schema (JSON-schema subset validate + canonical round-trip), redaction (allow-list minimization + PII mask; no-policy/non-object→block fail-safe), ratelimit (per-scope count>max exceed + cost≥budget reach-or-exceed, first violation deterministic), idempotency (proceed/replay/return_pending/reject_invalid_key/reject_conflict ตามคู่ key+inputHash), expiry (computeExpiry clamp 1h–30d default 72h + resolveExpiry decision-wins-race + canRecordDecision), untrusted (detectEmbeddedInstructions เพื่อ audit เท่านั้น + markProvenance verified/unverified-คงค่า). diagnostics สะอาด + 125 vitest เขียว (ยังไม่เพิ่ม PBT — อยู่ Wave 5 tasks 7.x). pgTAP 1.4 (optional) ยังไม่ทำ.
- **scrutinize Wave 1 → fix G1 + G2 (pure logic, locked ด้วย PBT):** G1 (MEDIUM) `authz` ให้ governance bypass site access ทุก tool class → แก้ให้ governance ข้ามไซต์ได้ **เฉพาะ Read_Tool** (Req 3.3); Write/Approval ต้อง `has_site_access` เสมอแม้ governance (Req 3.2/3.4) — เพิ่ม field `toolClass` ใน AuthzInput. G2 (MEDIUM) `autonomy` คืน auto ให้ Read ทุกกรณี → แก้ให้ auto **เฉพาะเมื่อ tier เป็น auto-tier (L2/L3)** มิฉะนั้น human_gate (Req 4.2 + fail-safe Req 12.3) — เพิ่ม `isAutoTier()`. G3–G8 ผ่าน (LOW: redaction top-level field, untrusted heuristic อังกฤษ audit-only, ratelimit default-resolution ที่ caller — design-aligned). เขียน Property 3 (authz, 4 tests) + Property 4 (autonomy, 3 tests) → mark tasks 7.3/7.4. **132 vitest เขียว** (125 + 7 mcp PBT), diagnostics สะอาด.
- **ADR-019 (resolve Req 5.2 vs 5.5/7.2 contradiction — เจ้าของเลือก option A):** `pending_invocation.approval_request_id` → nullable; Approval_Tool ผูก approval_request เดิม + reuse `rpc_record_approval_decision`; Write_Tool (create_work_item) ใช้ MCP-native gate (approval_request_id=NULL, governance approve ที่ pending) แล้ว execute `rpc_create_work_item` — ไม่มี side effect ก่อน approve (Req 5.5). บันทึกใน `.kiro/steering/architecture-decisions.md`.
- **Wave 2 (tasks 3.1–3.6 + checkpoint 4) — BUILT + deploy-verified:** migrations on-disk `0040` (nullable, ADR-019) + `0041` rpc_mcp_audit (append-only writer, unknown-fallback + truncate Req 18) + `0042` rpc_mcp_check_rate_limit (atomic multi-scope FOR UPDATE, no overshoot Req 15.7) + `0043` rpc_mcp_invoke_read (authz+autonomy+knowledge query+Source_Provenance+low_confidence) + `0044` rpc_mcp_create_pending (Write/Approval→pending no side-effects + idempotency PK + expiry clamp) + `0045` rpc_mcp_resolve_pending (approved→create_work_item/record_approval_decision; rejected; expired guard) + `0046` rpc_mcp_expire_pending (sweep + decision-wins guard). ทุก RPC SECURITY DEFINER + resolve_actor + revoke from public. db reset 0001–0046 เขียว. e2e verify ผ่านทั้ง 5: read(src=v1/low_conf=false/rows), rate-limit(ok→exceeded), Write(pending+0 work_item→idempotent replay→approved+work_item created), idempotency conflict reject, expiry(sweep→expired + resolve-on-expired reject). 93 vitest (src) เขียว. **Map migration: tasks.md วางแผน 0001–0015 → on-disk 0036–0046** (global sequence). Wave 5 PBT (7.x) ที่เหลือ + Wave 4 (Edge/PDPA) ยังไม่ทำ.
- **scrutinize Wave 2 → fix H1 + H2 (0047, deploy-verified):** H1 (MEDIUM) `rpc_mcp_invoke_read` low_confidence ขาด staleness → เพิ่ม param `p_freshness_max_age_hours` (default 720h=30d, drop+recreate) → `low_conf = review≠approved OR imported_at เก่าเกิน threshold` (Req 6.5). H2 (MEDIUM) `rpc_mcp_resolve_pending` reject ไม่มี authz → เพิ่ม `is_governance_role() OR principal = creator` ใน reject path (กันใครก็ cancel pending คนอื่น). verify (db reset 0001–0047 เขียว): H1 approved+stale-40d→low_confidence=true+stale=true; H2 non-owner reject→blocked (insufficient_privilege), governance reject→rejected. H3–H6 = PASS/LOW boundary (caller รับผิดชอบ).
- **Wave 5 PBT (pure-logic properties) — BUILT:** เขียน property test 7 ข้อครอบ pure logic ที่สร้างแล้ว: 7.9 (redaction fail-safe), 7.13 (schema validate+round-trip), 7.15 (ratelimit no-overshoot), 7.16 (expiry decision-wins), 7.17 (idempotency conflict-reject), 7.18 (provenance unknown/keep-value), 7.19 (injection detect+keep-value) — รวม 7.3/7.4 เดิม = **9/19 properties** มี PBT. **152 vitest เขียว** (125 workflow/edge + 27 mcp). เหลือ 10 properties (7.1 catalog, 7.2 server-id, 7.5 HITL, 7.6 knowledge, 7.7 work_item gate, 7.8 approval, 7.10 PDPA, 7.11 audit, 7.12 fail-safe, 7.14 reuse-not-fork) = ต้อง Edge (Wave 4) / DB-harness / PDPA (Wave 6) — ทำหลัง Edge.
- **Wave 4 (tasks 5.1–5.3 + 6.1) + PDPA (7.10) — BUILT:** Edge functions (thin transport, injectable forwarders + Deno guard, verify ผ่าน vitest — Deno ไม่มีในเครื่อง): `mcp-server` (GET discovery=server identity+catalog; POST invoke pipeline: rate-limit→getTool→route Read→invoke_read/Write+Approval→create_pending→map error; Untrusted_Content ส่งเป็น data param ไม่ตีความ), `mcp-pending-cleanup` (cron→rpc_mcp_expire_pending), `mcp-approval-callback` (workflow decision→findPending→rpc_mcp_resolve_pending). + `src/mcp/pdpa.ts` (evaluatePdpa: no-PII→allow, PII+no-consent→suppress, cross-border[รวม location unknown fail-safe]+no-safeguard→suppress, cross-border+safeguard→allow+mustRedact) + Property 10 PBT. helper migration `0048` (rpc_mcp_tool_class + rpc_mcp_pending_for_approval). db reset 0001–0048 เขียว. **170 vitest เขียว** (125 workflow/edge + 45 mcp). แก้ flaky test arbitrary (fc.date → noInvalidDate). 10/19 properties มี PBT (เพิ่ม 7.10). เหลือ 9 properties ผูก discovery/server-id/HITL-integration/knowledge/work_item-gate/approval/audit/fail-safe/reuse-not-fork (ส่วนใหญ่ verified เชิงพฤติกรรมใน e2e/transport แล้ว แต่ยังไม่ได้ทำเป็น property test เดี่ยว).
- **scrutinize Wave 4 → fix I1 + I2 (mcp-server, locked ด้วย transport test):** I1 (MEDIUM) mcp-server ใช้ service-role client → resolve_actor/RLS ไม่สะท้อน Principal จริง + ไม่เช็ค auth (ซ้ำ bug ที่ web-fallback แก้เป็น "fix B") → require Authorization header (401 ถ้าไม่มี, GET+POST) + forward end-user JWT เข้า user-scoped client (anon key + Authorization) ทุก forwarder. I2 (MEDIUM) ไม่ redact ที่ boundary → เพิ่ม `redactBoundary` (minimization allowedFields + PII mask; result ไม่ใช่ object → 500 fail-safe Req 9.4) apply ก่อนคืน result. I3 (LOW) default checkRateLimit ส่ง scopes ว่าง = boundary (caller resolve). I4 PASS: cleanup/approval-callback = server-to-server (cron/event) → service-role เหมาะสม. verify: 401 missing-auth, auth forwarded, PII masked, non-object→500, routing/429/404/error-map ครบ. **175 vitest เขียว** (เพิ่ม 5 mcp-server tests). diagnostics สะอาด.
- **Traceability close (PBT 19/19):** เพิ่ม test ปิด properties ที่เหลือ: 7.1 (`catalog.test.ts` — filterToolCatalog pure helper ใหม่), 7.5/7.12/7.14 (`governance-properties.test.ts` — HITL/fail-safe/reuse-not-fork structural smoke), 7.2 (transport auth-binding). DB-bound (7.6/7.7/7.8/7.11) mark `[x]*` พร้อม annotation "DB e2e-verified" (Wave 2/0/0047) — ไม่แกล้งทำ unit test ปลอม. **mcp Property 1–19 ครบ.** 214 vitest เขียว.
- **Approval_Tool resolve — full integration verified (gap ปิด):** e2e จริง (db): seed work_item awaiting_approval + approval_request (employee/first_response/resolved_approver='admin') → `rpc_mcp_create_pending('record_approval_decision', {approval_request_id})` (no side effect: ar คง 'pending') → `rpc_mcp_resolve_pending(approved, webhook_event_id, ver=0)` → reuse `rpc_record_approval_decision` (Req 5.2/8.3): ผลลัพธ์ executed/decision_result=approved, approval_request→approved, work_item→in_progress v0→1 (quorum applied), approval_decision 1 row, pending→executed. ยืนยัน MCP Approval_Tool reuse workflow approval path ครบวง (human gate ผ่าน MCP → บันทึก decision จริง).
- **FINAL CHECKPOINT (task 8) — mcp-layer ปิด core ครบ:** db reset 0001–0048 เขียว (จากศูนย์) + **scope suite 175 vitest เขียว** (38 files: workflow + mcp + edge). ทุก wave สร้าง+scrutinized: Wave 0 (data layer 6 ตาราง/4 enum/RLS/audit immutable) → Wave 1 (8 pure modules) → Wave 2 (6 RPC SECURITY DEFINER) → Wave 4 (3 Edge functions + pdpa.ts) → Wave 5 (10/19 PBT). non-optional tasks ครบทั้งหมด; เหลือเฉพาะ `*` optional: 1.4 (pgTAP) + 9 properties (7.1/7.2/7.5/7.6/7.7/7.8/7.11/7.12/7.14) ที่ verified เชิงพฤติกรรมแล้วผ่าน e2e (db) + transport test (Edge) แต่ยังไม่ทำเป็น property test เดี่ยว. **หมายเหตุ:** Approval_Tool resolve_pending path (reuse rpc_record_approval_decision) ยังไม่มี full integration test (Wave 2 e2e ทดสอบ Write/create_work_item path; Approval path verified เชิง logic) — ควรเพิ่ม integration test เมื่อต่อ quorum จริง. **หมายเหตุ env:** `npx vitest run` (ทั้ง repo) มี failures จาก backup folders (cp06-*/TCCK-*) ที่ไม่เกี่ยวกับงานนี้ — scope จริงใช้ `npx vitest run src/workflow src/mcp supabase/functions`.


- งานมาร์ก `*` = sub-task ทางเลือก (property/pgTAP/integration/smoke) ข้ามได้สำหรับ MVP แต่แนะนำเพื่อ traceability
- Correctness Property 1–19 ตรงกับ design.md; แต่ละข้อ → property test ตัวเดียว (fast-check ≥ 100 iteration)
- **Reuse-not-fork:** ไม่สร้างโมเดลสิทธิ์/ช่องอนุมัติ/audit ใหม่ขนานกับของเดิม — Write/Approval ส่งเข้า workflow-copilot ผ่าน `rpc_record_approval_decision`
- **Fail-safe ทุกจุด:** governance ไม่พร้อม / classify-fail / audit เขียนไม่ได้ / redact-fail / rate-limit กลไกล่ม → block (ไม่ auto-pass)
- **Untrusted_Content:** input + เนื้อหาภายนอกไม่ถูกตีความเป็นคำสั่ง; authz re-derive จาก Principal+C12 เท่านั้น
- **OPEN GATE-1:** ทุก task migration "เสร็จเชิงโค้ด" ได้ แต่ deploy-verified ต้องรัน `supabase db reset` เขียวในเครื่อง/CI ที่มี CLI
- **Phase 2:** พึ่ง workflow-copilot (Phase 1) — build หลัง Phase 1 เขียว

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4", "2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6"] },
    { "id": 3, "tasks": ["4"] },
    { "id": 4, "tasks": ["5.1", "5.2", "5.3", "6.1"] },
    { "id": 5, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "7.8", "7.9", "7.10", "7.11", "7.12", "7.13", "7.14", "7.15", "7.16", "7.17", "7.18", "7.19"] },
    { "id": 6, "tasks": ["8"] }
  ]
}
```

- **Critical path:** 1 → 2 → 3 → 5 → 6 (Edge) → 8
- **ขนานได้:** task 2.* (pure logic) ขนานกันหลัง data layer; task 7.* (PBT) ขนานทั้งหมดหลัง logic+RPC
