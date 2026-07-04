# Requirements Overview — ทุกโปรเจกต์ใน `.kiro`

> รวบรวมจาก `.kiro/specs/` ทั้งหมด (requirements.md / design.md / tasks.md) + steering docs
> ณ วันที่ 3 กรกฎาคม 2026

---

## 1. ภาพรวมระบบ (Ecosystem)

ทั้งหมดเป็นระบบของ **DAPH Decor / Monolith Platform** แบ่งเป็น 3 ชั้นหลัก:

```
Knowledge Layer   → daph-obsidian-second-brain (Obsidian Vault + Knowledge_Export JSON)
       ↓
Intelligence/Action Layer → monolith-workflow-copilot, monolith-mcp-layer,
                            capture-spine, monolith-accounting
       ↓
Engagement Layer  → line-oa-commerce (LINE OA), design-hub-platform-phase2 (marketplace)
```

**หลักการร่วม (Invariants) ทุก spec:**
- **Human-in-the-loop เสมอ** — AI เสนอได้ (L0/L1) แต่มนุษย์ตัดสินใจ
- **Reuse-not-fork** — ต่อยอด primitive เดิม (C12 identity, A1 site topology, D2 autonomy, audit) ไม่สร้างซ้ำ
- **Append-only audit** — log แก้/ลบไม่ได้ (trigger reject UPDATE/DELETE)
- **Fail-safe** — governance ไม่พร้อม → block ไม่ใช่ปล่อยผ่าน; ข้อมูลสกัดไม่ได้ → ไม่เดา ไม่ใส่ placeholder
- **PDPA by architecture** — self-host (Typhoon OCR), ไม่ส่ง PII ออกนอกองค์กร, redaction ที่ boundary
- **Self-contained** — ทุกอย่างอยู่ใน `determined-williams/`

---

## 2. สรุปสถานะทุกโปรเจกต์

| # | Spec | Requirements | ความคืบหน้า Tasks | สถานะ |
|---|------|:---:|:---:|------|
| 1 | daph-obsidian-second-brain | 16 ข้อ | 55/55 (100%) | ✅ เสร็จสมบูรณ์ (Vault 224 ไฟล์) |
| 2 | line-oa-commerce | 13 ข้อ | 20/20 (100%) | ✅ เสร็จสมบูรณ์ รอ deploy/integrate |
| 3 | capture-spine | 11 ข้อ | 42/43 (98%) | ✅ เกือบเสร็จ (เหลือ pgTAP optional) — **งานล่าสุด 1 ก.ค.** |
| 4 | monolith-mcp-layer | 15 ข้อ (+4) | 43/49 (88%) | 🔵 ใกล้เสร็จ (เหลือ unit property tests) |
| 5 | monolith-workflow-copilot | 21 ข้อ | 113/134 (84%) | 🔵 กำลังพัฒนา (Phase 13–14) |
| 6 | monolith-accounting | 14 ข้อ | 37/103 (36%) | 🟡 กำลังพัฒนา — **งานล่าสุด 1 ก.ค.** |
| 7 | design-hub-platform-phase2 | 17 ข้อ | 0/10 phases | ⏸ รอ Owner ตัดสินใจ (OQ-1..7) |
| 8 | separate-monolith-tcck | 5 ข้อ | — | ✅ เสร็จ (บันทึกการตัดสินใจ ไม่มีโค้ด) |

**งานล่าสุดที่กำลังพัฒนา** (จากวันที่แก้ไฟล์): `monolith-accounting/tasks.md` และ `capture-spine/tasks.md` (1 ก.ค.), `monolith-workflow-copilot` และ `monolith-mcp-layer` (30 มิ.ย.), steering docs อัปเดตล่าสุด 1 ก.ค.

---

## 3. Requirements รายโปรเจกต์

### 3.1 DAPH Obsidian Second Brain ✅ (Knowledge Layer)

**เป้าหมาย:** Obsidian Vault เดียวรวมความรู้ 2 โดเมน — Hardware (เฟอร์นิเจอร์) + Process (QMS) — สะท้อนโมเดลกระบวนการจริง 3 กลุ่ม (Office 6 หน่วย / Factory 6 สถานี / Installation 16 ขั้น)

**Requirements (16 ข้อ — เสร็จทั้งหมด):**

1. สแกน/บัญชีไฟล์สองโดเมน จัดประเภท Domain/Type/Units/Status
2. โมเดล 3 กลุ่มกระบวนการย่อย (Office → Factory → Installation)
3. โครงสร้าง PARA สองโดเมน (01-Projects / 02-Areas / 03-Resources / 04-Archives)
4. Index_Note ต่อเอกสาร + frontmatter + embed ไฟล์ต้นฉบับ
5. Document_Set เชื่อมชุดเอกสาร (SOS ↔ JES ↔ PFMEA ↔ Process Control Plan)
6. Master Process Matrix (`สำหรับคุณชุ.xlsx`) เป็นแผนที่กระบวนการหลัก
7. แปลง/จัดการไฟล์ `.xls` (BIFF) ที่อ่านไม่ได้ ด้วย SheetJS
8. Home Dashboard + MOC ต่อหน่วย/กลุ่ม
9. มาตรฐานตั้งชื่อไฟล์ (kebab-case, owner ใน frontmatter)
10. จัดการไฟล์ขยะ/ซ้ำ/ฉบับร่าง — ย้ายไป Archives (non-destructive)
11. ระบบแท็ก (domain/group/unit/type/status)
12. อภิธานศัพท์ (SOS, JES, PFMEA, RPN, MC_Code, MOC, PARA, Pytha, MaxCut ฯลฯ)
13. Mermaid diagram ลำดับกระบวนการ
14. เทมเพลตโครงการลูกค้าใหม่
15. คำแนะนำปลั๊กอิน (Dataview / Templater / Excalidraw)
16. **Knowledge_Export** — JSON machine-readable (PFMEA 122 rows + process model 28 entries + RACI + approval_quorum) ให้ workflow-copilot บริโภค

**ผลลัพธ์:** Vault ที่ `determined-williams/daph-second-brain/` + `_knowledge-export.json` + `_move-log.md` (ย้อนกลับได้)

---

### 3.2 LINE OA Commerce (Module B5) ✅ (Engagement Layer)

**เป้าหมาย:** เชื่อม LINE Official Account กับการรับออเดอร์ / identity resolution / forecasting sync แบบ dual-vertical (MONOLITH เฟอร์นิเจอร์ + TCCK อาหาร) — 1 LINE OA ต่อ vertical ครอบคลุมทุกสาขา

**Requirements (13 ข้อ — implement ครบ + property tests P1–P31):**

1. **Webhook Ingestion + Signature** — HMAC-SHA256 ทุก webhook, per-channel secret (Supabase Vault), reject ถ้าตรวจไม่ผ่าน
2. **Webhook Idempotency** — บันทึก webhook_event_id ก่อน side effect, duplicate → ack โดยไม่ทำซ้ำ
3. **Conversation Routing** — สร้าง conversation ต่อ (line_user_id, vertical), resolve site_code ผ่าน postback/operator, auto-close 24 ชม.
4. **Outbound Reply/Push** — สถานะ pending → sent/failed, fallback reply→push, ไม่ leak token ใน log
5. **Message Templates + AI Constraints** — AI ทำได้เฉพาะ template-bound slot-filling (ห้าม free-text)
6. **Customer Identity** — 1 CustomerIdentity ต่อ (line_user_id, vertical)
7. **Merge Guardrail (R-03)** — **ห้าม auto-merge ข้าม channel เด็ดขาด** แม้ confidence 1.0 ต้อง manual review
8. **Order Intake** — stamp origin_channel_id='line_oa', ต้อง resolve site ก่อนเข้า lifecycle
9. **Brand Voice** — ข้อความ ≤200 ตัวอักษรต่อ segment ตาม guideline ของ vertical
10. **Forecasting Sync** — `record_input_sync(Sync_Source='line')` เฉพาะออเดอร์ที่ resolve site แล้ว
11. **D2 Autonomy Governance** — classify tier ก่อนทุก AI action, gated tier รอมนุษย์อนุมัติ
12. **Access Control** — RLS + `has_site_access()`, mutation ผ่าน SECURITY DEFINER RPC เท่านั้น
13. **Audit Trail** — append-only, `resolve_actor()`, ไม่บันทึก secret

---

### 3.3 Capture Spine ✅ 98% (งานล่าสุด)

**เป้าหมาย:** Pipeline วงปิดแปลง input ดิบ (ภาพ/เอกสาร/ข้อความจาก LINE/Gmail/app) → structured record → **มนุษย์ verify** → commit เข้า business layer — OCR/LLM self-host ทั้งหมด (PDPA by architecture) ขยาย capture type ใหม่ด้วย config เท่านั้น

**Requirements (11 ข้อ):**

1. **Ingest + Idempotency** — สร้าง Capture_Artifact (proposed), idempotency_key = hash, ซ้ำ → คืน artifact เดิม
2. **On-prem OCR + Extraction** — Typhoon self-host 2 stage (OCR → typed fields + confidence + provenance) ห้ามส่งออกนอกองค์กร
3. **Validation vs Master** — ตรวจกับ vendor/material master, ไม่พบ → mark unverified (ไม่ block)
4. **Human Verify Gate** — field สำคัญ/confidence ต่ำ/suspicious → บังคับมนุษย์ confirm ก่อน commit
5. **Lifecycle** — proposed → approved → emitted → superseded (ตาม TCCK agent_artifact), terminal immutable
6. **Fail-safe ไม่เดา** — สกัดไม่ได้ → ไม่เติม placeholder; governance/storage ไม่พร้อม → block
7. **Audit append-only** — ไม่บันทึก PII/secret
8. **RLS + RPC** — reuse C12 (`resolve_actor()`, SECURITY DEFINER)
9. **Config-driven Extensibility** — capture_type ใหม่ = เพิ่ม row ใน `capture_type_config` ไม่แก้ core (seed 8 types)
10. **Anti-Fraud Signals** — flag VAT mismatch / vendor ไม่อยู่ใน master / total anomaly / duplicate (ไม่ auto-reject)
11. **Verify Rules ต่อ Type** — seed จาก PFMEA, trace `pfmea_ref`, จัด priority ตาม RPN

**สถานะล่าสุด:** L3 commit-target adapters ครบ 5 seam — installation_proof → Work_Item, expense_document → ledger, material_receipt → actual_purchase_price, spec_draft → Released_Spec, site_survey → SiteSurveyZone (migrations ถึง 0074, 202 vitest เขียว) เหลือ task 1.4 (pgTAP, optional)

---

### 3.4 Monolith MCP Layer 🔵 88%

**เป้าหมาย:** เปิด Monolith เป็น MCP Server ให้ AI client query ความรู้ / สร้าง Work_Item / บันทึก Approval ผ่าน MCP Tool มาตรฐาน — **ทุก action อยู่ใต้ governance เดิม** (wrap ไม่ fork)

**Requirements (15 ข้อ + 4 tracked):**

1. **Tool Catalog** — read_tool / write_tool / approval_tool พร้อม schema, discovery กรองตามสิทธิ์
2. **Server Identity + Client Auth** — Client_Credential → Principal ผ่าน `resolve_actor()`, re-check ทุก invocation
3. **Per-Tool Authorization** — C12_Role + `has_site_access()` ก่อน invoke, ห้าม service_role จาก client
4. **Autonomy Enforcement** — Read auto ได้; Write/Approval ต้องผ่าน Human_Approval_Gate; classify ไม่ได้ → ถือว่าต้องมนุษย์
5. **Human-in-the-Loop** — Write/Approval → Pending_Invocation เข้าสู่ workflow อนุมัติเดิม (`rpc_record_approval_decision`)
6. **Knowledge Query Tool** — read-only + Source_Provenance + low-confidence mark
7. **Work Item Creation Tool** — ผ่าน gate, ตรวจ Process_Step กับ Knowledge_Export
8. **Approval Recording Tool** — idempotent, ยืนยันผู้ตัดสินผ่าน `resolve_actor()`
9. **PII Redaction** — Redaction_Policy ที่ Data_Minimization_Boundary, fail-safe ถ้า redact ไม่ได้
10. **PDPA Consent + Cross-Border** — ตรวจ Consent_Record, suppress ถ้าไม่มี consent
11. **MCP_Audit_Log** — append-only ทุก invocation (tool, principal, tier, result)
12. **Fail-Safe** — governance ไม่พร้อม → block ไม่ auto-pass
13. **Schema Validation** — round-trip serialize↔parse ต้องได้ค่าเดิม
14. **Reuse-not-Fork + Self-Contained**
15. **Rate-Limiting + Cost Control** — จำกัดต่อ Principal/Client/Tool_Class, atomic counter, Throttling_Event

*Tracked เพิ่มเติม:* Idempotency key, Pending expiry ≤5 นาที (decision-wins-race), Model Provenance, Untrusted Content guard (กัน prompt injection)

**สถานะ:** vitest 214 ผ่าน (workflow 125 + mcp 45 + edge 44), db reset 0001–0048 เขียว — เหลือ pgTAP optional + unit property tests บางส่วน

---

### 3.5 Monolith Workflow, Approvals & AI Copilot 🔵 84%

**เป้าหมาย:** ชั้นกลาง Intelligence + Action — จัดการ handoff งาน 8 phase (Sale → Installation), หาผู้อนุมัติจาก RACI, อนุมัติคลิกเดียวผ่าน LINE Flex, แจ้งเตือนกัน noise, AI Copilot เชิงแนะนำ (PFMEA/RPN) — มนุษย์ตัดสินใจเสมอ

**Requirements (21 ข้อ):**

1. **Identity Binding** — Employee × LINE_User_Id × C12_Role, revoke ทันที, escalate เมื่อไม่มี binding
2. **Handoff Engine** — บังคับลำดับ canonical (`canonical_order` 0..n-1), ขั้นอนุมัติ block จนกว่า approved
3. **Responsibility Resolution** — หา Approver จาก RACI_Map + C12_Role, fail-safe → executive_owner
4. **One-Click Approval** — LINE Flex + Encrypted_Postback, ผู้กด ≠ ผู้เสนอ, idempotent
5. **AI Copilot Advisory** — เตือนความเสี่ยง PFMEA/RPN + เสนอ 2–3 ตัวเลือกพร้อมข้อดี/ข้อเสีย, L0/L1 เท่านั้น
6. **Notification Model** — direct push / group / Quiet_Hours / daily digest / mute, ไทย ≤200 ตัวอักษร
7. **Field-Team Access** — LINE rich menu แสดง step ปัจจุบัน + checklist จาก SOS/JES, บันทึก Capture_Item
8. **Escalation Rules** — ตามประเภทงาน (design → Designer Lead; RPN/budget เกิน → executive_owner)
9. **Audit Trail** — append-only, ลบ secret
10. **Access Control** — RLS + `has_site_access()`, mutation ผ่าน SECURITY DEFINER RPC
11. **Knowledge Import** — validate Knowledge_Export, invalid → keep last-good, read-only
12. **Business Continuity** — snapshot knowledge ต่อ Capture_Item, capture-once-reuse
13. **SLA & Reminder** — เตือน 50% / 100% / timeout → escalate executive_owner
14. **Delegation** — Acting_Approver ช่วงเวลา [start, end]
15. **Multi-Approver Quorum** — unanimous / first_response / majority
16. **Optimistic Locking** — version counter, state transition atomic
17. **Notification Retry** — exponential backoff, idempotent
18. **Delivery Failure Handling** — audit + escalate หัวหน้า section
19. **Action Type Registry** — action_type ↔ risk_class ↔ max_allowed_tier (ไม่ hardcode)
20. **Customer as Approver** — primary_customer_approver 1 คน/โปรเจกต์, design/3D = {design_team + customer} unanimous
21. **Revision Discipline & Design Locks** — G1–G4 lock, scope_change → re-quote approval, Revision_Reason 3 ประเภท

**สถานะ:** 113/134 tasks — เหลือ Phase 13 (Notification delivery RPC + retry) และ Phase 14 (Delegation routing) + property tests ที่เหลือ

---

### 3.6 Monolith Accounting & AI Orchestration 🟡 36% (งานล่าสุด)

**เป้าหมาย:** ระบบบัญชี self-hosted ในไทย แทน SaaS ต่างประเทศ — ขยายจากต้นแบบ `monolith_accounting.html` (บัญชีคู่/ผังบัญชี/งบการเงิน/ภาษี) + AI orchestration บน Capture Spine

**Requirements (14 ข้อ):**

1. **ผู้ใช้ไม่จำกัด** — ไม่มี per-seat licensing, สิทธิ์ตามบทบาท
2. **Multi-currency ≥160 สกุล** — เก็บต้นทาง + หลัก, ปัด 2 ตำแหน่ง (plug "ผลต่างปัดเศษ" — ADR-022)
3. **Bank Feed + Auto-reconciliation** — จับคู่วันที่+จำนวน, idempotent ตาม bankTxnId
4. **Manufacturing** — BOM, Job Costing, เบิกวัตถุดิบ (ปฏิเสธถ้าไม่พอ)
5. **Multi-book Ledger** — internal/external, TFRS (DBD2554) หรือ IFRS, book แยกไม่ปนกัน (ADR-026)
6. **Audit Trail append-only**
7. **e-Tax Invoice** — PDF/A-3 + XML + ลายเซ็น XAdES/X.509 qualified cert (ETDA — ADR-025), VAT 7%
8. **WHT Export** — ภ.ง.ด.3 / ภ.ง.ด.53 (RD Prep format)
9. **MCP Server ภาษาธรรมชาติ** — สร้างใบแจ้งหนี้ / ค้นหนี้ค้าง / กระทบยอด
10. **AI-OCR (Typhoon self-host)** — draft entry, มนุษย์ยืนยัน field วิกฤต
11. **PDM Sync (SolidWorks)** — webhook BOM/revision, idempotent
12. **BIM → BOQ → ใบเสนอราคา** — นำเข้า Revit
13. **User-scoped Authorization** — OAuth2 + RLS, AI ทำงานในสิทธิ์ผู้ใช้ ห้ามยกระดับ
14. **Data Residency + PDPA** — Thai_Data_Center (ISO 27001), 100% on-prem ตัด foreign-SaaS (ADR-021)

**สถานะ:** 37/103 tasks — ทำแล้ว: Ledger + multi-currency, Manufacturing/BOM/Job Costing, WHT, Bank Feed, eTax VAT/เลขที่ใบกำกับ (277 vitest) | เหลือ: Capture Spine integration, MCP tools, PDPA, IAM/RLS ที่เหลือ, adapters — มี 26 Correctness Properties (SPINE-1..9, ACC-1..15, AUTHZ-1..2)

---

### 3.7 Design Hub Platform — Phase 2 ⏸ รอ Owner

**เป้าหมาย:** ขยาย Design Hub เป็น marketplace สาธารณะ — catalog สินค้า 6 หมวด, design-to-manufacturing ผ่าน Released_Spec, UGC (idea books/reviews), Learning Center, trust/payment/governance

**Requirements (17 ข้อ):**

1. สมัครสมาชิก Email/OAuth (อายุ ≥13, ToS/Privacy gate)
2. จัดการโปรไฟล์ + ปิดบัญชี (ชั่วคราว/ถาวร, ซ่อน content, reactivate ได้)
3. โปรไฟล์มืออาชีพ + verify ใบอนุญาต/ผู้มีอำนาจ
4. External Actor Roles (C12 additive: general_user, professional_owner, professional_member)
5. Marketplace 6 หมวด (Built_In / Furniture / Prop / Curtain / Wallpaper / Appliances) + Prohibited Products Policy
6. การซื้อ + Seller Indemnification (Vendor รับผิดต่อ line item)
7. Revenue Sharing — 2% ของมูลค่าผลิต (design sharing), 50% ของค่าออกแบบ (from scratch)
8. **The Bible Catalog** — grammar รหัสเฟอร์นิเจอร์ parametric (DKC/DC/DWD, กว้าง 300–1200mm step 50mm) parse/format round-trip
9. Key Plan + Design-to-Manufacturing — handoff เฉพาะ RELEASED specs ผ่าน Gate (ไม่ compute geometry ใน Phase 2)
10. UGC / Idea Books — user เป็นเจ้าของ content, public-by-default
11. Platform IP + Acceptable Use
12. Copyright/Trademark Takedown — non-destructive removal
13. Rating & Review มืออาชีพ
14. PDPA — 3 ช่องทางเก็บข้อมูล, DSAR, ลบข้อมูลเด็ก <13
15. Learning Center — mentoring / workshops / 3D curriculum
16. Design Competitions + Co-Working Space booking (conflict detection)
17. Multi-Brand Data Isolation — RLS reuse C12, append-only audit

**Blocker:** รอคำตอบ Owner OQ-1..7 (site codes, roles, pricing, Bible grammar scope, custom sizes) + ต้องผ่านทนาย/นักบัญชีไทยก่อน production (payment/tax/IP/PDPA)

---

### 3.8 Separate Monolith-TCCK ✅ (Decision Record)

**เป้าหมาย:** บันทึกการตัดสินใจ **ไม่ทำ** แพลตฟอร์ม SaaS ร่วม MONOLITH+TCCK (พบว่าไม่เคยผูกกันจริง — canonical promoted = 0)

**Requirements (5 ข้อ — เสร็จทั้งหมด):** บันทึกการตัดสินใจ + เหตุผล / archive เอกสารเดิมโดยไม่ลบ / แยกที่จัดเก็บอิสระ / Decision_Log append-only ทั้งสองโครงการ / ยืนยันไม่มี Cross_Project_Coupling

ผลพลอยได้: **ADR-016** port C12/A1 foundation เข้า `determined-williams` (deploy-verified 29 มิ.ย. 2026)

---

## 4. เอกสารประกอบอื่น

### 4.1 Archived Specs (`specs/_archived/`)
- `obsidian-second-brain` → แทนด้วย `daph-obsidian-second-brain` (25 มิ.ย.)
- `monolith-tcck-separation` → แทนด้วย `separate-monolith-tcck` (25 มิ.ย.)

### 4.2 Owner Decisions ค้าง (`specs/_owner-decisions/`) — **สิ่งที่ blocking งานถัดไป**

| หัวข้อรอตัดสินใจ | ปลดล็อกอะไร |
|---|---|
| 1. Vendor Master | L2 fraud detection (`vendor not in master`) |
| 2. Material Master | L2 ตรวจ material_receipt ตรงสเปค |
| 3. Ledger schema | L3 adapter accounting |
| 4. ราคาซื้อจริง | costing seam + PO match |
| 5. Released_Spec | spec gate/state |
| 6. MCP exposure ของ capture | Write_Tool wrapping |
| 7. auto-approve / OCR policy | autonomy tier policy |

มีฟอร์มให้กรอก: `owner-decisions-form.html` / `generate-owner-form.gs`

### 4.3 Steering (`steering/`)
- **architecture-decisions.md** — ADR-001..027 (Accepted ทั้งหมด; ADR-017..027 ยังมีงาน implement ค้าง)
- **ubiquitous-language.md** — คำศัพท์ร่วม 3 Bounded Contexts, ลำดับกระบวนการ canonical (Office 6 → Factory 6 → Installation 16), C12 roles, D2 Autonomy Ladder, Posting_Rule/Suspense_Account/Book ฯลฯ

---

## 5. สิ่งที่ควรทำต่อ (Next Actions)

1. **monolith-accounting** — เดินหน้า Capture Spine integration + MCP tools + PDPA (66 tasks ค้าง)
2. **monolith-workflow-copilot** — ปิด Phase 13 (Notification delivery/retry) + Phase 14 (Delegation routing)
3. **monolith-mcp-layer** — ปิด unit property tests ที่เหลือ + pgTAP (optional)
4. **Owner decisions** — กรอกฟอร์ม 7 ข้อ เพื่อปลดล็อก capture-spine L2/L3 ที่ค้าง + design-hub-phase2 ทั้งโปรเจกต์
5. **design-hub-platform-phase2** — เริ่ม WO-0 ได้ทันทีที่ตอบ OQ-1..7 + นัดทนาย/นักบัญชีเรื่อง payment/tax/PDPA
