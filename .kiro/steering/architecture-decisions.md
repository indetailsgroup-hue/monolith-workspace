---
inclusion: always
---

# Architecture Decision Records — Monolith (DAPH Decor)

> บันทึกการตัดสินใจที่ **ย้อนกลับยาก / น่าประหลาดใจ / มี trade-off ชัดเจน** (แนวคิด ADR)
> เมื่อมีการตัดสินใจใหม่ที่เข้าเกณฑ์นี้ ให้เพิ่ม ADR ต่อท้าย (ห้ามแก้ ADR เก่าที่ Accepted — ใช้ Superseded แทน)
> รูปแบบแต่ละรายการ: **Status · Context · Decision · Consequences/Trade-off**
> คำศัพท์อ้างอิง `ubiquitous-language.md`; รายละเอียดเต็มอยู่ใน design.md ของแต่ละ spec

---

## ADR-001 — Obsidian เป็นชั้นความรู้แบบ static; workflow/approval อยู่บนแพลตฟอร์ม Monolith

- **Status:** Accepted
- **Context:** QMS (SOS/JES/PFMEA/RACI) เป็นเอกสารที่อ่านบ่อยแต่แก้ไม่บ่อย ส่วน workflow/approval ต้องการ state, transaction และความปลอดภัยระดับ row-level
- **Decision:** Obsidian Vault ทำหน้าที่เป็น **knowledge layer แบบ static** (ไม่มี logic รันไทม์); workflow, approval, notification, Copilot ทั้งหมดอยู่บน Monolith (Supabase/PostgreSQL)
- **Consequences:** ความรู้ versioned/diff-able ด้วย git และอ่านได้โดยไม่ต้องมีระบบรัน; แต่ workflow ต้อง **import** ความรู้เข้ามา (ดู ADR-009) ไม่ query Obsidian โดยตรง

## ADR-002 — Reuse primitive ของ `line-oa-commerce` แทนการ fork

- **Status:** Accepted
- **Context:** `line-oa-commerce` ส่งมอบ C12 security federation, audit log, D2 autonomy ladder, Postback contract, Message_Templates แล้ว
- **Decision:** `monolith-workflow-copilot` **อ้างอิงตามชื่อ** และยิงงานเข้า primitive เดิม — ไม่นิยาม/ไม่ fork ใหม่
- **Consequences:** ได้ security/audit/governance มาฟรีและสอดคล้องกันทั้งระบบ; แต่ผูกพันกับสัญญาของ `line-oa-commerce` — การเปลี่ยน primitive ต้นทางกระทบโมดูลนี้

## ADR-003 — ไม่มีการอนุมัติใดพึ่งพา LINE เพียงอย่างเดียว (web fallback)

- **Status:** Accepted (scope expansion จาก requirement เดิม)
- **Context:** LINE API / webhook อาจล่ม แต่การอนุมัติต้องดำเนินต่อได้ (Business Continuity, Req 18)
- **Decision:** เพิ่ม `web-fallback-api` ที่บันทึก Approval_Decision ผ่าน `rpc_record_approval_decision` **เส้นทางเดียวกับ LINE** (authz/idempotency/quorum เหมือนกันทุกประการ)
- **Consequences:** ระบบทนต่อ LINE ล่ม; แต่ขยาย scope เกิน requirement เดิม และต้องดูแลผิวสัมผัสการอนุมัติ 2 ช่องทางให้ logic ตรงกันเสมอ

## ADR-004 — mute มีผลเหนือ direct-responsibility bypass (เฉพาะ Quiet_Hours ที่ถูกข้าม)

- **Status:** Accepted
- **Context:** Direct_Responsibility_Item ควรทะลุ Quiet_Hours ได้ แต่ถ้าผู้ใช้ mute หมวดของตัวเองไว้ ระบบควรเคารพหรือไม่ — เป็นจุดกำกวมที่ตัดสินยาก
- **Decision:** **mute ชนะเสมอ** — ระงับแม้เป็น direct responsibility; มีเพียงเงื่อนไข **เวลา Quiet_Hours** เท่านั้นที่ direct responsibility ข้ามได้ (Req 6.5 vs 6.6)
- **Consequences:** ผู้ใช้ควบคุม noise ได้จริง (mute = เจตนาชัด); แต่มีความเสี่ยงพลาดงานด่วนถ้า mute หมวดสำคัญไว้ — จึงต้องสื่อสารความหมายของ mute ให้ชัด

## ADR-005 — Design draft sign-off ไม่ยกระดับสู่ผู้บริหารแม้ RPN/งบสูง

- **Status:** Accepted
- **Context:** เกณฑ์ escalation ทั่วไปยกระดับเมื่อ RPN > threshold หรือ budget > ceiling แต่การเซ็นอนุมัติแบบร่างงานออกแบบเป็นงานเชิงวิชาชีพของทีมออกแบบ
- **Decision:** Design draft sign-off ไป **หัวหน้า Designer เสมอ** ไม่ยกระดับสู่ executive_owner แม้เข้าเงื่อนไข RPN/budget (Req 8.4)
- **Consequences:** การตัดสินใจเชิงออกแบบอยู่กับผู้เชี่ยวชาญ ไม่ถูกแทรกโดยผู้บริหาร; แต่เป็นข้อยกเว้นพิเศษของกฎ escalation ที่ต้องระบุไว้ชัดในโค้ดและเทสต์

## ADR-006 — Non-destructive: ไม่ลบ/ไม่แก้ต้นฉบับ; junk/draft เก็บใน Archives

- **Status:** Accepted
- **Context:** Vault_Builder ต้องจัดระเบียบไฟล์จำนวนมากจากโฟลเดอร์จริงของผู้ใช้ ความเสี่ยงคือทำต้นฉบับหาย
- **Decision:** ปฏิบัติการเป็น **copy เข้า Vault** เท่านั้น; ไฟล์ junk/draft **ย้ายไป Archives** ไม่เคยลบ; ต้นฉบับคงอยู่ (ใช้ robocopy `/E /XO` / copy non-destructive)
- **Consequences:** ปลอดภัยและย้อนกลับได้เสมอ มี `_move-log.md` ตรวจสอบได้; แต่มีไฟล์ซ้ำซ้อนและพื้นที่ใช้เพิ่มขึ้น

## ADR-007 — ใช้ SheetJS อ่าน/แปลง `.xls` (ไม่ใช้ exceljs)

- **Status:** Accepted
- **Context:** ไฟล์ต้นทางบางส่วนเป็น `.xls` (BIFF เก่า); `exceljs` อ่าน BIFF ไม่ได้
- **Decision:** ใช้ **SheetJS (xlsx)** สำหรับการอ่าน/แปลง `.xls` → รูปแบบที่ประมวลผลต่อได้
- **Consequences:** รองรับ legacy `.xls` ครบ; แต่เพิ่ม dependency หนึ่งตัวและต้องระวังความต่างของ API ระหว่าง SheetJS กับ exceljs ในส่วนอื่น

## ADR-008 — สร้าง ERP แบบ phased (ไม่สร้างครบ 5 โมดูลพร้อมกัน)

- **Status:** Accepted
- **Context:** DAPH ต้องการ AI-Native ERP แต่การสร้าง CRM/Manufacturing/Procurement/Finance พร้อมกันมีความเสี่ยงและช้า
- **Decision:** **Phase 1** = Workflow & Copilot Engine (สเปกปัจจุบัน) เป็นกระดูกสันหลังกลาง; **Phase 2** = CRM/Manufacturing/Procurement ที่ป้อนงานเข้าเครื่องยนต์กลาง; **Phase 3** = Finance & Costing ที่บริโภคเหตุการณ์ที่อนุมัติแล้ว
- **Consequences:** ส่งมอบคุณค่าได้เร็วและทุกโมดูลได้ core (C12/audit/D2/SLA/quorum) มาฟรี; แต่ต้องออกแบบ Phase 1 ให้เป็น extension point ตั้งแต่ต้น (ดู design.md §ERP Extension Points) และยอมรับว่ายังไม่ครบ ERP เต็มในระยะแรก

## ADR-009 — Vault_Builder ปล่อย Knowledge_Export แบบ machine-readable ให้ workflow บริโภค (read-only)

- **Status:** Accepted
- **Context:** workflow ต้องใช้ process model + RACI + PFMEA/RPN + quorum + freshness แต่ไม่ควร query Obsidian โดยตรง (ADR-001)
- **Decision:** Vault_Builder **emit Knowledge_Export** (JSON machine-readable: PFMEA rows, canonical process model, RACI_Map, Approval_Quorum, Knowledge_Freshness); `monolith-workflow-copilot` **query เท่านั้น ไม่เขียนกลับ** (Req 11) import ผ่าน `rpc_import_knowledge` พร้อม validate + last-good fallback
- **Consequences:** แยกชั้นความรู้กับชั้นปฏิบัติอย่างสะอาด เปลี่ยนฝั่งใดฝั่งหนึ่งได้อิสระตราบใดที่สัญญา export คงเดิม; แต่ความสดของข้อมูล (freshness/trust) กลายเป็น first-class concern ที่ Copilot ต้องแสดงเสมอ (Req 17) และ export ต้องผ่าน schema validation เข้มงวด

## ADR-010 — โมเดล 3D สองขั้น (3D_Presentation ก่อน PP, 3D_Rendering_Final หลัง PP)

- **Status:** Accepted
- **Context:** ลำดับ canonical ของ Office ขัดกันระหว่างแหล่งต้นฉบับสองชุดที่ authoritative ทั้งคู่ — SOS/JES/PFMEA Main Process (`_daph_extract/1.SOS_DAPH_Main_Process.xlsx.txt` ฯลฯ) วาง 3D Model (Doc 004) **ก่อน** Production Planning (005); แต่ Master Matrix (`สำหรับคุณชุ.xlsx`) วาง "3D rendering" (งาน "Recheck all 3D final from Production Planning") **หลัง** Production Planning ตรวจแล้วพบว่าจริง ๆ คำว่า "3D" หมายถึงงานสองช่วงคนละความหมาย: (1) 3D ตอนออกแบบเสนอลูกค้า และ (2) 3D rendering สุดท้ายที่ render จากโมเดลที่ Production Planning ขึ้น แต่เอกสารไม่ได้แยกชื่อให้ชัด ทำให้ handoff engine ที่บังคับลำดับ strict + ปฏิเสธการข้ามขั้น (workflow Req 2.5) จะ route ผิดถ้าไม่ตัดสิน
- **Decision:** แยก "3D" เป็นสองหน่วยที่ชื่อชัดเจน และกำหนดลำดับ canonical Office เป็น **6 หน่วย**: `Sale → Area Measurement → Designer → 3D_Presentation → Production Planning → 3D_Rendering_Final` โดย `3D_Presentation` = SOS 004 ฝั่งออกแบบ (ก่อน PP), `3D_Rendering_Final` = render สุดท้ายจาก Master Matrix (หลัง PP) ทั้งคู่นิยามใน `ubiquitous-language.md`
- **Consequences:** ลำดับสอดคล้องกับเอกสารต้นฉบับทั้งสองชุดโดยไม่ทิ้งข้อมูลใด และ workflow route ถูกต้อง; แต่ `3D_Rendering_Final` ไม่มีชีต SOS/JES แยกของตัวเอง (มาจาก Master Matrix เท่านั้น) จึงต้องระวังตอน build Document_Set/Knowledge_Export ว่าหน่วยนี้อาจไม่มีเอกสารมาตรฐานครบเท่าหน่วยอื่น; นอกจากนี้ daph vault ที่ build ไว้เดิม (Office = 5 หน่วย) ต้อง re-run vault-builder หลังอัปเดต constants เพื่อให้สะท้อนโมเดล 6 หน่วย

## ADR-011 — RPN ที่ยังไม่ประเมิน = fail-safe สู่ human review (ห้ามปฏิบัติเหมือน "ความเสี่ยงต่ำ")

- **Status:** Accepted
- **Context:** ตรวจ PFMEA ต้นฉบับพบว่ามีเพียงฝั่ง Factory (`DAPH PFMEA.xlsx`) ที่กรอก OCC/DET/RPN ครบ (84–280); ฝั่ง Office/Designer/Production Planning/Installation มีแค่ SEV หรือว่าง → RPN = 0/null workflow Req 8 escalate เมื่อ `RPN > RPN_Threshold` — ถ้า RPN = null เงื่อนไขจะไม่เป็นจริงตลอดกาล ทำให้ขั้นที่ "ยังไม่ประเมินความเสี่ยง" ถูกปฏิบัติเหมือน "ความเสี่ยงต่ำ" → escalation ไม่ทำงานในครึ่งหน้าของ value chain (อันตรายแบบ "ดูครบแต่ผิดเงียบ ๆ")
- **Decision:** Knowledge_Export พก field `rpn_status ∈ {computed, severity_only, not_assessed}` ต่อ PFMEA_Risk_Row และ Copilot/Escalation ต้องปฏิบัติแบบ fail-safe:
  - `computed` → ใช้ RPN ตามปกติ (escalate เมื่อ > threshold)
  - `severity_only` → ใช้เกณฑ์ SEV สำรอง (เสนอ: SEV ≥ 8 = ธงเตือน) + mark suggestion ว่า "ความเสี่ยงยังไม่ถูก quantify เต็ม — แนะนำ review"
  - `not_assessed` → แสดง "ยังไม่ประเมินความเสี่ยง" + default เป็น "ต้องมนุษย์ review" **ห้าม auto-pass**
- **Consequences:** escalation/Copilot ไม่เงียบในขั้นที่ข้อมูลความเสี่ยงยังไม่ครบ สอดคล้องกับ Req 5.7 (fail-safe block เมื่อกลไกไม่พร้อม) และ Req 17 (แสดง stale/low-confidence ไม่ซ่อน); แต่จะมีขั้นจำนวนมากที่เด้ง human review จนกว่าเจ้าของจะเติม OCC/DET จริง — เป็นภาระที่ยอมรับได้เพื่อความถูกต้อง (ดีกว่าปล่อยผ่านเงียบ ๆ) เติมค่าจริงภายหลังเปลี่ยน `rpn_status` เป็น `computed` ได้โดยไม่ต้อง re-architect

## ADR-012 — เก็บ raw SEV/OCC/DET + คำนวณทั้ง RPN และ Action Priority (dual-standard)

- **Status:** Accepted
- **Context:** AIAG-VDA FMEA ฉบับ 2019 เลิกใช้ RPN เป็นตัวตัดสินหลัก แล้วหันไปใช้ **Action Priority (AP = High/Medium/Low)** จาก lookup ของ (SEV, OCC, DET) เพราะ RPN มีจุดอ่อน (RPN เท่ากันแต่ความเสี่ยงจริงไม่เท่ากัน เช่น SEV สูง-OCC ต่ำ vs SEV ต่ำ-OCC สูง) แต่ข้อมูล PFMEA เดิมของ DAPH (Factory) บันทึกเป็น RPN (84–280) อยู่แล้ว
- **Decision:** Knowledge_Export เก็บ **raw `sev`/`occ`/`det`** เป็นแหล่งความจริง แล้วคำนวณ **ทั้ง `rpn` (=SEV×OCC×DET) และ `action_priority`** จากค่าดิบ; workflow-copilot Req 8 escalate ได้ด้วย AP (แนะนำ) หรือ RPN — เป็นกลางต่อมาตรฐาน AP logic ใช้แบบ band-based ตามหลัก AIAG-VDA (SEV สูงให้ priority ก่อน) เรียบเรียงใหม่ ไม่คัดลอกตารางลิขสิทธิ์ verbatim การกรอกค่า OCC/DET จริงใช้กรอบสเกล 1–10 ตาม AIAG-VDA/IATF-16949
- **Consequences:** รองรับทั้งข้อมูล RPN เดิม (Factory) และแนวทาง AP สมัยใหม่โดยไม่ต้อง migrate ข้อมูล; escalation แม่นขึ้น (ลดการ "ไล่ลด RPN" แบบผิดทาง); แต่ emitter/Copilot ต้องพก field มากขึ้น (sev/occ/det/rpn/action_priority/rpn_status) และต้อง map AP กับ rpn_status ให้สอดคล้องกับ fail-safe ของ ADR-011 (เมื่อ occ/det ไม่ครบ → AP คำนวณไม่ได้ → ใช้เส้นทาง severity_only/not_assessed)

## ADR-013 — เลือก PFMEA canonical แบบ per-unit (1 ฉบับต่อ Process_Step, ไม่ merge)

- **Status:** Accepted
- **Context:** มีไฟล์ PFMEA ~12 ฉบับรวม variant ซ้ำ (Main Process vs Revise 1, DAPH PFMEA vs P'Mean, Producting Planning vs (1), INSTALLATION vs P'oil) การ merge เสี่ยง double-count failure mode; การใช้ฉบับรวม Revise1 ล้วนทำให้ `3D_Rendering_Final` ว่างเปล่า (Revise1 มี 3D Model ขั้นเดียว); per-unit ล้วนก็เสีย SEV ของ Sale (Sale per-unit ไม่มี SEV)
- **Decision:** เลือก **1 ฉบับที่ดีที่สุดต่อ Process_Step** (`pfmea-canonical-map.ts`) ไม่ merge — บันทึก provenance (sourceFile + sourceStep) ต่อ row และ supersede ฉบับที่ไม่เลือก (ไม่ทิ้ง):
  - Sale → Main Process (Revise 1) section "1.Sales Process" (มี SEV=9)
  - Area Measurement / Designer → per-unit (รวย + มี SEV)
  - **3D_Presentation** → 3D Perspective section "1.3D Model" (+ "3.Contruction Drawing" *draft* ขอ DAPH ยืนยัน)
  - **3D_Rendering_Final** → 3D Perspective section "2.3D Rendering" (Furniture/Lighting/Material/Rendering — ตรง Master Matrix)
  - Production Planning → Producting Planning(1) (superset ของ 24-row variant)
  - Factory 6 สถานี → DAPH PFMEA.xlsx (ฉบับเดียวมี computed RPN 17 rows, max 280)
  - **Incoming Inspection → Laminate HPL (CONFIRMED จาก SOS):** `1.SOS_DAPH.xlsx` ชีต "1 SOS Laminate HPL" R3 = "1.Incoming Inspection / 2.Laminate HPL", R7 JES-001 element 2 = Incoming Inspection → เป็น sub-step ของสถานี Laminate HPL ตามนิยาม DAPH (ไม่ใช่การอนุมาน)
  - Installation 16 ขั้น → DAPH PFMEA, INSTALLATION.xlsx (จับคู่ตามชื่อหน่วย)
  - Superseded (เก็บไว้): P'Mean, Main Process (plain), Producting Planning (plain), Sale per-unit, INSTALLATION P'oil
- **Consequences:** ได้ "ครบที่สุด + ไม่ซ้ำ + 3D สองขั้นมีเนื้อหาจริงทั้งคู่" (3D_Rendering_Final 6 rows); section ที่ทับซ้อนใน Revise1 (Area/Designer/PP) ถูก mark unmapped ไม่ consume กัน double-count; เหลือ draft flag เดียว (Construction Drawing→3D_Presentation) ที่ DAPH ยืนยันภายหลังได้ผ่าน provenance + draft-guard โดยไม่ re-architect; emit แล้วได้ Knowledge_Export 122 PFMEA rows (computed 17 / severity_only 56 / not_assessed 49) ผ่าน schema validation

## ADR-014 — approval_quorum = `first_response` เป็น derived default (single-Accountable) ไม่ใช่ค่าจาก source

- **Status:** Accepted
- **Context:** DAPH ไม่เคยระบุ Approval_Quorum ในเอกสารต้นฉบับ (SOS/JES/PFMEA/Master Matrix ไม่มีแนวคิดนี้) แต่ workflow Req 15 ต้องการ quorum ต่อ Process_Step ที่ requiresApproval
- **Decision:** ตั้ง `approvalQuorum = 'first_response'` ให้ทุกขั้นที่ต้องอนุมัติ เป็น **derived default จาก convention "single-Accountable ต่อ step"** (RACI_Map ปัจจุบันมี Accountable คนเดียวต่อขั้น → first_response = ผลเดียวถือเป็นที่สุด สมเหตุผล) **ไม่ใช่นโยบายที่ DAPH กำหนด**
- **Consequences:** ถูกต้องตราบใดที่แต่ละขั้นมี Accountable คนเดียว; ถ้าภายหลัง DAPH กำหนดหลาย Approver ต่อขั้น (เช่น unanimous/majority) ต้องอัปเดต `process-model.ts` + RACI_Map และ re-emit — บันทึกไว้ที่นี่กันเข้าใจผิดว่าเป็นค่าจาก source; ไม่กระทบ fail-safe (ค่า quorum ไม่ถูกใช้จนกว่าจะถึง runtime Phase 4)

## ADR-015 — Vault คงชื่อ doc-unit ตาม source ("3D Perspective"); สะพานไป process step ทำเป็น explicit mapping

- **Status:** Accepted (supersede ผลพวง "re-run vault" ใน ADR-010 consequences — ไม่แก้ ADR-010 เดิม)
- **Context:** โมเดล 3D สองขั้น (ADR-010) ทำให้ process model มี `3D_Presentation` + `3D_Rendering_Final` แต่ vault เป็น **คลังเอกสารที่ซื่อตรงต่อ source** — เอกสารต้นฉบับชื่อ "DAPH PFMEA, 3D Perspective.xlsx" และชีต SOS "3D Perspective" จริง การ rename โฟลเดอร์ vault เป็น "3D Presentation" = editorialize ชื่อ source (ขัด fidelity ตระกูล ADR-006) และได้ correctness gain = 0 (ความหมาย process ถูกครบที่ฝั่ง Knowledge_Export แล้ว) แต่มี orphan risk > 0
- **Decision:** **คง vault doc-unit เป็น "3D Perspective"** (5 Office doc-units) ส่วน process model คง 6 ขั้น การเชื่อมสองฝั่งทำเป็น **explicit mapping** (ไม่ implicit):

  | process step (export) | vault doc-unit | section ในเอกสาร |
  |---|---|---|
  | `3D_Presentation` | `3D Perspective` | §1 "1.3D Model" |
  | `3D_Rendering_Final` | `3D Perspective` | §2 "2.3D Rendering" |

  และ Vault_Builder ใส่ **cross-reference note** ในโน้ต Index ของ "3D Perspective" ระบุว่าเอกสารนี้ครอบคลุม 2 process step (§1→Presentation, §2→Rendering_Final) เพื่อให้ผู้ใช้เห็นความเชื่อมทันที และ deep-link resolver ฝั่ง Phase 4 (Field_View Req 7.4) มี map ใช้
- **Consequences:** vault ซื่อตรงต่อ source + ไม่มี orphan + ไม่ต้อง re-run rename; ฝั่ง Phase 4 ที่ deep-link จาก step `3D_Presentation`/`3D_Rendering_Final` ต้อง resolve ผ่าน mapping นี้ (โน้ตปลายทางเดียวกัน คนละ section); mapping ตารางนี้คือสัญญาที่ทั้งสองฝั่งอ้าง

## ADR-016 — Port C12/A1 foundation เข้า determined-williams (standalone) แทนพึ่ง TCCK

- **Status:** Accepted — **deploy-verification CLOSED ✓** (29 มิ.ย. 2026; ดู Consequences)
- **Context:** Phase 4 Task 0 (verify-before-build) พบว่า `determined-williams/supabase/migrations/` มี `line_oa_*` 16 ไฟล์ที่ **อ้าง** C12/A1 helpers (`resolve_actor`, `has_any_app_role`, `has_site_access`, `is_governance_role`, `current_app_roles`, `get_active_site_codes`) ใน RLS+RPC แต่ **ไม่มีไฟล์ใด define** — helper จริงอยู่เฉพาะใน cp06-clean-cowork (TCCK) → bare `supabase db reset` จะ fail "function does not exist" (line_oa เองคอมเมนต์ยอมรับว่าเป็น external dep) และไม่มี `supabase/config.toml`
- **Decision (Option A):** port C12/A1 foundation เข้า determined-williams เป็น base migration `00000000000000_c12_foundation.sql` (shift หัว line_oa +1 เพื่อเปิด slot 0) + สร้าง `supabase/config.toml` standalone (project_id=determined-williams):
  - 6 JWT-helpers port ตรง ๆ จาก cp06 (reuse-not-fork; พึ่ง `auth.jwt()/uid()` ไม่มี table dep)
  - `is_governance_role()` **adapt role list เป็น DAPH** `{admin, operations, finance, executive_owner}` (Q2, หลักฐาน line-oa Glossary) — configuration ไม่ใช่ fork
  - `get_active_site_codes()` **single-column `(site_code text)` คืน `'BKK-HQ-01'`** (Q3 single-site, ตรง format `{CITY}-{AREA}-{SEQ}`; ไม่มี CHECK format ที่ DB; flippable เป็น locations query ถ้าขยายสาขา)
- **Consequences:** determined-williams deploy standalone ได้โดยไม่พึ่ง TCCK (รักษา self-contained invariant + ไม่ฟื้น coupling ที่ separate-monolith-tcck ตัดว่าไม่มี); completeness verified (helper ทุกตัวที่ line_oa เรียกถูก define ครบ) + ordering verified (C12 ก่อน consumer แรก migration 0002)
  - **DEPLOY-VERIFIED ✓ (29 มิ.ย. 2026 — gate CLOSED):** รัน `supabase db reset` จริงในเครื่องนี้ (supabase CLI 2.108.0 + Docker 29.1.2 + `supabase/config.toml`) → apply ครบทุก migration **exit 0** (C12 foundation + line_oa 17 ไฟล์, มีแค่ notice `pgcrypto already exists` benign). Deep-verify: helper C12 ครบ 6 ตัว callable (`current_app_roles, get_active_site_codes, has_any_app_role, has_site_access, is_governance_role, resolve_actor`); `get_active_site_codes()` คืน `BKK-HQ-01`. → static OK กลายเป็น deploy-verified จริง; **ไม่ใช่ env constraint อีกต่อไป** — migration ใหม่ของ Phase 4/Phase 2 ต้อง reset เขียวก่อนถือ task done
  - **PENDING owner:** รหัส Site_Code จริงของ DAPH HQ + แผนขยายสาขา (กระทบ flip get_active_site_codes); คอมเมนต์ `-- Depends on:` ใน 5 ไฟล์ที่ shift อ้าง neighbor เดิม (cosmetic)


## ADR-017 — Process model keyed by canonical_order; sub-step first-class; approval เฉพาะ requiresApproval

- **Status:** Accepted (grilling 29 มิ.ย. 2026) — **ยังไม่ implement** (กระทบ schema + RPC; ดู Consequences)
- **Context:** integration test 18.1 (consume Knowledge_Export จริงของ daph-second-brain) เปิดเผยว่า:
  - `processModel` มี **28 entries แต่ 18 distinct `processStep` names** — ชื่อซ้ำ **ทั้งหมดอยู่ใน group Installation** (งานติดตั้งย่อยที่ recur เช่น "การตรวจสอบ" หลายจังหวะ; hash 57574e4f×4, b91d12ad×4, fb6a4114×4)
  - `process_model` เดิมใช้ **PK = process_step (ชื่อ)** → ON CONFLICT ยุบ 28→18 → `canonical_order` มี gap → handoff "ขั้นถัดไปติดกัน" (cur_order+1) **พัง**
  - หลักฐานสำคัญ: `raciMap.entries` มี **accountable ครบทั้ง 28 sub-steps**; `requiresApproval=true` กระจายระดับ sub-step (Office 4 จุด: Designer/3D_Presentation/3D_Rendering_Final unanimous + Production Planning first_response; **Installation 2 จุด**: order 12 เริ่ม + order 27 จบ, first_response); Factory ไม่มี approval — **RACI + approval อยู่ที่ระดับ sub-step จริง ไม่ใช่ phase**
- **Decision (Option B + B3):** Process_Step identity = **`canonical_order`** (surrogate); `process_step` เป็น **label ซ้ำได้** (ไม่ใช่ PK)
  - process_model PK → `canonical_order` (หรือ surrogate id + unique canonical_order); `process_step` เป็นคอลัมน์ label
  - `work_item.current_step` → **`current_order int`** (ตำแหน่ง execution; handoff/adjacency อิง order)
  - **B3 fine-grained:** `current_order` ขยับทีละ sub-step; ลงขั้น `requiresApproval=true` → `rpc_resolve_approver` สร้าง Approval_Request + block; ขั้น checklist (req=false) → ไปต่อด้วย `rpc_record_capture` (capture-once / SOS-JES / Field_View ระดับ sub-step) ไม่รอ approval
  - resolve_approver อ่าน RACI accountable ของ **sub-step นั้น ๆ** (raciMap.entries by processStep ของ order; ถ้าชื่อซ้ำให้ผูกด้วย order ที่กำลังตัดสิน); quorum จาก approvalQuorum ของ sub-step
  - **รวม Approval_Request ที่ต้องอนุมัติจริง = 6 จุด** (Office 4 + Installation เริ่ม/จบ) จาก 28 ขั้น
- **Alternatives rejected:** (A/A2) handoff/approval ระดับ main phase + ยุบ Factory/Installation เป็น phase เดียว — **ปฏิเสธ** เพราะเสียความต่างของ approval "เริ่ม vs จบ" ของ Installation และฝืน RACI/approval ที่ละเอียดระดับ sub-step; (A2b) split Installation เป็น 2 phase — partial; (C) ให้ producer แก้ชื่อ unique — ผลักภาระ + ผิด consume-not-redefine
- **Consequences (impl ที่ค้าง — ยังไม่ทำ):**
  - **schema:** `process_model` re-key เป็น canonical_order; `work_item.current_step`→`current_order` (+ migration ปรับ); index/FK ที่อ้าง process_step ทบทวน
  - **RPC:** `rpc_create_work_item` (เริ่ม order=0), `rpc_handoff_work_item` (adjacency = order+1, ตรวจ requiresApproval ของ target → resolve_approver หรือ auto-advance), `rpc_resolve_approver` (RACI by order/sub-step), `rpc_import_knowledge` (process_model เก็บ 28 ขั้น order-keyed ไม่ collapse)
  - **pure logic:** `domain/constants.ts` CANONICAL_PROCESS_ORDER (8-step union) → derive จาก export ไม่ hardcode; `handoff/canonical.ts` adjacency อิง order; `ProcessStep` union แคบ → string + order
  - **spec:** requirements/design glossary "Process_Step" ต้องนิยามใหม่ (order-keyed, sub-step granularity) + canonical model ไม่ fix 8 ขั้น
  - **กระทบงานที่ทำไปแล้ว:** approval path (0014/0015/0023/0027/0028/0029/0030) ใช้ (work_item_id, process_step) เป็น scope ของ quorum → ต้องเปลี่ยนเป็น (work_item_id, current_order/gate) ; attempt-scoping ยังใช้ได้


## ADR-018 — Approver source: `approvers` array (unanimous) vs `accountable` (single); customer เติมเข้า set

- **Status:** Accepted (grilling 29 มิ.ย. 2026) — **ยังไม่ implement** (คู่กับ ADR-017)
- **Context:** เจาะ raciMap.entries ของ export จริง พบว่า:
  - **`accountable` เดียวกันทั้ง group** สำหรับ sub-steps ที่ชื่อซ้ำ (Installation ทุกขั้น = role เดียว, Factory ทุกขั้น = role เดียว) → name-based RACI lookup **ไม่ ambiguous** แม้ชื่อซ้ำ (ไม่ต้องผูก canonicalOrder)
  - Installation 2 approval gates (order 12 เริ่ม / 27 จบ) → `accountable` เดียวกัน → approver คนเดียวกันทั้งสอง gate (first_response)
  - **field `approvers` (array 2 คน)** ปรากฏ **เฉพาะ 3 ขั้น unanimous ของ Office** (Designer / 3D_Presentation / 3D_Rendering_Final); ขั้น first_response (Production Planning, Installation gates) ไม่มี `approvers` (=0)
  - บั๊กปัจจุบัน: `rpc_resolve_approver`/`accountableForStep` ใช้ `accountable` อย่างเดียว → ขั้น unanimous สร้าง 1 leg แทนที่จะเป็น 2 (ผิด quorum)
- **Decision (D1 — quorum-driven approver source):**
  - `quorum = unanimous` → approver set = **`approvers` array** จาก RACI entry ของ step
  - `quorum ∈ {first_response, majority(single)}` → approver = **`accountable`** (คนเดียว)
  - **Req 20.2 customer step** (Designer/3D_Presentation/3D_Rendering_Final): set = { ...export `approvers`, Customer_Approver } quorum unanimous
- **Requirement change (ต้องอัปเดต spec):** Req 20 ข้อ 2 เดิม "Approver set = { internal lead (RACI Accountable), Customer_Approver }" → แก้เป็น **"{ internal approvers จาก export `approvers` array (อาจ >1), Customer_Approver }"** (consume source จริง ไม่ fix ที่ 1 lead). กระทบ glossary "Customer_Approver"/"Approver set" + property CAR-2 (Property 36) ที่ปัจจุบัน assert {lead, customer} 2 ตัว → อาจเป็น {approvers..., customer}
- **Consequences (impl ค้าง):**
  - `import.ts accountableForStep` → เพิ่ม `approversForStep` (อ่าน `approvers` array); resolver เลือกตาม quorum
  - `rpc_resolve_approver` (SQL) อ่าน `approvers` เมื่อ unanimous, `accountable` เมื่อ single
  - `resolver/customer-approver.ts` + Property 36 ปรับให้รับ internal approvers set (ไม่ fix 1 lead)


## ADR-019 — MCP Write_Tool (create_work_item) ใช้ MCP-native approval gate; reuse rpc_record_approval_decision เฉพาะ Approval_Tool

- **Status:** Accepted (29 มิ.ย. 2026; resolve requirements contradiction Req 5.2 vs 5.5/7.2) — สำหรับ `monolith-mcp-layer`
- **Context:** ความขัดแย้งระหว่าง requirement ของ mcp-layer (ยืนยันด้วย schema จริงบน DB):
  - **Req 5.2** สั่งบันทึกผลอนุมัติของ *ทุก* Pending_Invocation ผ่าน `rpc_record_approval_decision` (reuse ไม่สร้าง path ใหม่)
  - **Req 5.5 / 7.2** สั่งห้ามสร้าง Work_Item ก่อนมนุษย์อนุมัติ (no side effects ก่อน approve)
  - `approval_request.work_item_id` = **NOT NULL** และ `rpc_record_approval_decision(approval_request_id, ...)` ทำงานบน approval_request ที่ผูก work_item ที่มีอยู่จริง
  - → **วน:** create_work_item ยังไม่มี work_item ให้ผูก approval_request แต่ Req 5.2 ต้องการ approval_request เพื่ออนุมัติ; ส่วน Approval_Tool ไม่มีปัญหา (approval_request มีอยู่แล้ว)
- **Decision (เจ้าของเลือก option A):**
  - `pending_invocation.approval_request_id` → **nullable** (migration 0040)
  - **Approval_Tool** (`record_approval_decision`): pending ผูก `approval_request_id` ที่มีอยู่; resolve → เรียก `rpc_record_approval_decision` (reuse path เดิมตาม Req 5.2)
  - **Write_Tool** (`create_work_item`): pending มี `approval_request_id = NULL` + **MCP-native gate** — governance/ผู้มีสิทธิ์ approve/reject ที่ตัว pending_invocation โดยตรง (บันทึก mcp_audit_log) แล้ว resolve → execute `rpc_create_work_item` เมื่อ approved; **ไม่มี side effect ก่อน approve** (Req 5.5 ✓)
- **Reconcile กับ Req 5.2:** Req 5.2's "ทุก pending ผ่าน rpc_record_approval_decision" → narrow scope เป็น **เฉพาะ Approval_Tool** (กรณีที่มี approval_request จริง); create_work_item ใช้ MCP-native gate เพราะ workflow approval_request เป็น work-item-centric ผูกหลังสร้างเท่านั้น. หลัก human-in-the-loop (Req 5.6) + reuse-not-fork ยังคงอยู่ — การ "สร้างจริง" reuse `rpc_create_work_item`, การ "อนุมัติ Approval_Tool" reuse `rpc_record_approval_decision`
- **Consequences:**
  - ได้ no-side-effects-before-approval ครบ (Req 5.5) + reuse primitive การสร้าง/บันทึกจริง; แต่มี approval surface 2 แบบ (workflow approval_request สำหรับ Approval_Tool, MCP-native pending gate สำหรับ create_work_item) ที่ต้องคุม authz ให้เทียบเท่า
  - MCP-native gate ต้อง re-check governance/authz ใน `rpc_mcp_resolve_pending` เอง (ไม่พึ่ง quorum ของ workflow); audit ทั้ง approve/reject ลง mcp_audit_log
  - ถ้าภายหลังต้องการให้ create_work_item เข้าสู่ quorum workflow เต็มรูป ต้อง re-model (เช่น proposed-work_item state) — บันทึกไว้กันเข้าใจผิด


## ADR-020 — monolith-accounting = Phase 3 Finance & Costing (consumer, reuse-not-fork); dual-path posting

- **Status:** Accepted (grill-with-docs 1 ก.ค. 2026) — **ยังไม่ implement** (กระทบ rebase design.md/tasks.md ของ monolith-accounting; ดู Consequences)
- **Context:** สเปก `monolith-accounting` (requirements/design/tasks generate แล้ว) ออกแบบ "Capture Spine" + MCP_Server + human-verify + audit + IAM ขึ้นมาใหม่ทั้งหมดในตัวเอง แต่ scrutinize + grilling พบว่าสิ่งเหล่านี้ **มีสเปกและโค้ดที่ build แล้ว**:
  - `capture-spine` (Phase 2) — `src/capture/{state-machine,verify-gate,idempotency,verify-rules,fraud-signal}.ts` + migration `0001/0002` (ติ๊ก done); นิยาม `commit_target` รวม **`ledger`** (expense_document: vendor/total/vat/wht → ledger) และ `actual_purchase_price` (material_receipt) อยู่แล้ว
  - `monolith-mcp-layer` — `src/mcp/{authz,pdpa,idempotency,ratelimit,redaction}.ts` (confused-deputy/OWASP MCP02)
  - `monolith-workflow-copilot` (Phase 1) — human verify/approval/SLA/audit (`src/workflow/`)
  - C12 + A1 — identity/RLS + role **`finance`** + Company→Brand→Location(site_code); `src/crypto/{ecdsaP256,ed25519}` สำหรับลายเซ็นดิจิทัล
  - ADR-008 จองตำแหน่ง **Phase 3 = Finance & Costing ที่บริโภคเหตุการณ์ที่อนุมัติแล้ว** ไว้ตั้งแต่ต้น และ invariant "reuse ไม่ fork" เป็นข้อบังคับ (ubiquitous-language.md)
- **Decision (grill Q1–Q3):**
  1. **Q1 Positioning:** monolith-accounting = **Phase 3 Finance & Costing consumer** — reuse-not-fork; ไม่สร้าง Capture Spine/MCP/verify-audit/IAM ชุดที่สอง
  2. **Q2 New surface (8 ชั้นการเงินที่ build จริง):** Ledger_Engine (บัญชีคู่/COA/งบ/อัตราส่วน, seed `ธุระกิจ/monolith_accounting.html`), Currency_Service (multi-currency/FX), Multi_Book_Ledger (statutory DBD2554/IFRS; มิติ book/entity reuse A1 Company/Brand), Cost accounting (job cost→ledger + inventory valuation, ทับบน CAM engine `src/core/manufacturing/` ไม่ rebuild), eTax_Generator (PDF/A-3+XML; **แก้โดย ADR-025** — ต้องใช้ XAdES/X.509 ไม่ใช่ src/crypto), WHT_Export_Service (ภ.ง.ด.3/53 RD Prep), Bank_Feed_Connector, BIM→BOQ→quotation (เฉพาะ**ชั้นราคา**; reuse Released_Spec/spec_draft ของ CAM/spine)
  3. **Q3 Commit boundary (dual-path, one-directional):**
     - **document-sourced:** spine `rpc_capture_promote` (emit) → เรียก posting API ของ accounting แบบ idempotent (ใช้ artifact idempotency_key) สำหรับ `commit_target ∈ {ledger, actual_purchase_price}`; accounting อ่านเฉพาะข้อมูล **emitted** ไม่รัน OCR/verify เอง
     - **draft ย้ายไป spine:** สถานะร่างของรายการเอกสารอยู่ที่ artifact lifecycle (proposed/approved) ของ spine → accounting สร้างเฉพาะ journal entry `posted` จาก artifact ที่ emitted → **ตัด Req 10 (OCR→draft) + Property SPINE-1/SPINE-2 ออกจาก accounting** (เป็น invariant ของ spine)
     - **non-document (bank feed/manual/ปรับปรุงสิ้นเดือน/ค่าเสื่อม):** accounting มี posting API ของตัวเองที่บังคับบัญชีคู่ (debit=credit) โดยตรง ไม่ผ่าน spine
     - accounting **ไม่เขียนกลับเข้า spine**; spine เรียก accounting ผ่านสัญญา posting เท่านั้น
- **Alternatives rejected:** (B) standalone monolith เดี่ยว — ปฏิเสธ เพราะ fork ซ้ำ invariant/PDPA governance สองชุด ขัด reuse-not-fork และ ADR-008; (C) ยุบ accounting เข้า capture-spine — ปฏิเสธ เพราะ Ledger/งบ/ภาษี/FX เป็น bounded context การเงินที่ใหญ่พอมี lifecycle ของตัวเอง
- **Consequences (rebase ที่ค้าง — ยังไม่ทำ):**
  - **design.md/tasks.md ของ monolith-accounting ต้อง rebase:** ตัด component Capture Spine Orchestrator, MCP_Server, OCR_Service, IAM_Service, Audit_Trail_Service (ที่ซ้ำ) และ property SPINE-1..9 ส่วนใหญ่ + AUTHZ-1/2 (เป็นของ spine/mcp/workflow-copilot) เหลือ property เชิงบัญชี (ACC-1..15) + สัญญา posting
  - **requirements.md:** Req 9 (MCP), Req 10 (OCR→draft), Req 13 (user-scoped authz) เปลี่ยนจาก "สร้าง" เป็น "อ้างอิง dependency"; เพิ่ม requirement ใหม่: **Journal_Posting_Contract** (spine→ledger idempotent) + non-document posting path
  - ได้ประโยชน์: ตัดงานซ้ำ ~40% ของ tasks เดิม, invariant แหล่งเดียว (spine เป็นเจ้าของ verify/idempotency/audit), PDPA governance ไม่ซ้อน
  - ต้องนิยามสัญญา posting ให้ชัด (idempotency key = artifact key; หน่วยเงิน; commit_target routing) และ FX rounding ต้องไม่ทำลาย invariant บัญชีคู่ (ดู ADR ถัดไป)
  - เดิม design.md อ้าง `workflow-copilot` เป็น prerequisite ลอย ๆ อยู่แล้ว — ADR นี้ทำให้ชัดว่าเป็น dependency เชิงสถาปัตยกรรม ไม่ใช่ของที่ต้อง build


## ADR-021 — Finance_Context เป็น on-prem 100%; commerce/foreign-SaaS egress ไม่อยู่ใน accounting

- **Status:** Accepted (grill-with-docs 1 ก.ค. 2026) — ยังไม่ implement (rebase design.md)
- **Context:** design เดิมของ monolith-accounting มี "Optional Adapters" ไป Lazada/Shopee/monday/ClickUp (SaaS ต่างประเทศ) ขณะที่ Property SPINE-8 ประกาศ "ไม่มี PII ออกนอก Thai_Data_Center" committed records ของ e-commerce มักมี PII ลูกค้า (ชื่อ/ที่อยู่จัดส่ง) → cross-border transfer ที่ขัด PDPA-by-architecture; อีกทั้ง commerce เป็นโดเมนของ `line-oa-commerce` (Engagement context) ที่เป็นเจ้าของ customer identity + ฐานความยินยอม
- **Decision (grill Q4):** **ตัด foreign-SaaS adapters ออกจาก scope ของ monolith-accounting ทั้งหมด**
  - accounting ทำงาน **on-prem 100%** ใน Thai_Data_Center — ตัวมันเองไม่ egress PII → SPINE-8 ไม่ขัดอีก
  - การเชื่อม commerce/e-commerce = ความรับผิดชอบของ `line-oa-commerce`
  - หากจำเป็นต้องส่งข้อมูลการเงินออกจริง ให้ผ่าน **egress boundary ที่ชัดเจน**: อยู่นอก closed loop, redact PII (reuse `src/mcp/redaction.ts` + `src/mcp/pdpa.ts`), log ทุกครั้ง, cross-border = fail-closed จนกว่าจะมีฐานกฎหมาย (งานทนาย — น่าจะฐาน "สัญญา" ตาม DEFERRED_ITEMS)
- **Consequences:** SPINE-8 กลายเป็นจริงโดยโครงสร้าง (accounting ไม่มี egress path); ตัด "Optional Integration (Work OS / e-commerce)" section + Optional Adapter Tests ออกจาก design/tasks; ถ้าเจ้าของต้องการ push งบ/รายงานออกภายนอกภายหลัง ต้อง design egress adapter แยกที่มี redaction + lawful-basis gate

## ADR-022 — FX conversion: ปัดเศษต่อบรรทัด (2 ตำแหน่ง) + บัญชีผลต่างการปัดเศษ (rounding-difference account)

- **Status:** Accepted (grill-with-docs 1 ก.ค. 2026) — ยังไม่ implement
- **Context:** Property ACC-2 กำหนดให้แปลงและปัดเศษ *แต่ละบรรทัด* เป็น 2 ตำแหน่ง; Property ACC-1 กำหนด `sum(baseDebit) = sum(baseCredit)` การปัดทีละบรรทัดแยกกันทำให้เกิด rounding drift → สองฝั่งไม่เท่ากันได้ 1-2 สตางค์ (ACC-1 กับ ACC-2 ขัดกันเองเมื่อรันจริง) — ปัญหาคลาสสิกของ multi-currency ledger
- **Decision (grill Q5):** ใช้ **บัญชีผลต่างจากการปัดเศษอัตราแลกเปลี่ยน (FX rounding difference account)** เป็น plug:
  - แปลงและปัดแต่ละบรรทัดเป็น 2 ตำแหน่งตาม ACC-2
  - คำนวณ residual = sum(baseDebit) − sum(baseCredit); ถ้า ≠ 0 ลง residual เข้าบัญชี FX rounding difference (รายได้/ค่าใช้จ่ายปรับปรุง) → entry สมดุลเสมอ
  - ACC-1 เป็นจริง **โดยโครงสร้าง**; ACC-2 ยังจริง (บรรทัดจริงปัด 2 ตำแหน่ง)
  - **property ใหม่ (ACC-1b):** |residual| ≤ (จำนวนบรรทัด × 0.01) — กันไม่ให้ plug ใหญ่ผิดปกติ (จับ bug rate/logic)
- **Consequences:** double-entry สมดุลเสมอในสกุลหลักแม้มี FX; ต้องเพิ่มบัญชี "ผลต่างจากการปัดเศษอัตราแลกเปลี่ยน" ในผังบัญชี (COA) และเพิ่ม property ACC-1b ใน design; ผู้ตรวจสอบเห็น residual แยกได้ (โปร่งใส)

## ADR-023 — Idempotency reuse primitive เดียว; PDM sync ย้ายออกจาก Finance_Context

- **Status:** Accepted (grill-with-docs 1 ก.ค. 2026) — ยังไม่ implement
- **Context:** scrutinize พบ Property SPINE-3 (idempotent) ครอบทั้ง bank txn (Req 3.4) และ PDM event (Req 11.5) แต่ทดสอบครั้งเดียวใน Bank Feed section ด้วย bank-txn generator → PDM webhook idempotency path ไม่ถูก exercise จริง; อีกทั้งภายใต้ ADR-020 (reuse) มี `src/capture/idempotency.ts` (hash-based) เป็น primitive อยู่แล้ว และ PDM (part/revision/BOM จาก SolidWorks) เป็น engineering master data ไม่ใช่การเงิน
- **Decision (grill Q6):**
  - **Idempotency:** reuse `src/capture/idempotency.ts` เป็นกลไกกลางของ ingest idempotency ทั้งหมด (bank txn id, artifact key); **แต่ละ connector มี idempotency test เฉพาะของตัวเอง** (ปิด coverage seam — ไม่รวบ SPINE-3 เป็น test เดียว)
  - **PDM sync (Req 11):** ย้ายออกจาก monolith-accounting → เป็น engineering/manufacturing master data (โดเมน CAM/`src/core/manufacturing` หรือ capture-spine `material_receipt`); accounting **บริโภคเฉพาะ BOM cost** เพื่อทำ job costing
  - **Bank feed:** ยังอยู่ใน accounting (finance connector) reuse idempotency primitive + test เฉพาะ
- **Consequences:** ตัด Req 11 (PDM sync mechanics) + Property ACC-13 (PDM upsert/revision) ออกจาก accounting scope (ไปสเปกอื่น); idempotency ไม่ถูก build ซ้ำ; coverage ของ idempotency ครบต่อ connector; accounting เหลือ dependency "BOM cost feed" แทนการรับ webhook PDM เอง


## ADR-024 — Ledger_Engine เป็น DB-first; Journal_Posting_Contract ผ่าน posting_rule config + fail-closed suspense; posting actor = ตัวตนจริง

- **Status:** Accepted (grill-with-docs รอบ 2, 1 ก.ค. 2026) — ยังไม่ implement
- **Context (verified):** ไม่มีโค้ด ledger/journal/costing ใน `src/` เลย (greenfield); `supabase/config.toml` มีจริง → ทั้งแพลตฟอร์มเป็น DB-first (Supabase/PostgreSQL + pure logic ใน `src/` + PBT) ADR-020 บอก "Ledger seed จาก monolith_accounting.html" แต่ไฟล์นั้นเป็น single-file localStorage app ฝั่ง client; และ artifact ที่ emitted จาก spine มีฟิลด์ **แบน** (expense_document: vendor/total/vat/wht/category) ไม่ใช่ debit/credit lines — ต้องมีตัวแปลงเป็น balanced entry
- **Decision:**
  - **Q7 Runtime:** Ledger_Engine ทำ **DB-first เหมือนทั้งแพลตฟอร์ม** — tables + SECURITY DEFINER RPC + RLS ผ่าน C12 + pure logic ใน `src/` + PBT (Vitest/fast-check); `ธุระกิจ/monolith_accounting.html` เป็น **reference สำหรับสูตร/COA/อัตราส่วนเท่านั้น** ไม่ใช่ runtime (กัน fork architecture style ที่สอง)
  - **Q8 Posting contract:** accounting เป็นเจ้าของตาราง **`posting_rule` (config, extensible)** keyed by `(capture_type, category)` → template Dr/Cr accounts + การแยก VAT input / WHT payable; spine `rpc_capture_promote` ส่ง emitted artifact → `rpc_post_journal_from_artifact` resolve rule → สร้าง entry สมดุล **idempotent** (key = artifact idempotency_key)
  - **no-rule → fail-closed:** ลงบัญชีพัก (suspense account) + ส่ง human review; **ไม่เดา mapping** (สอดคล้อง no-guess ของ spine)
  - **Q12 Posting actor:** actor ของ posting = ตัวตนจริงของคน verify artifact (C12 `resolve_actor`) ไม่ใช่ system account (กัน confused-deputy ตาม ADR-019)
- **Consequences:** ledger/costing สอดคล้อง DB-first pattern เดียวกับ capture-spine/workflow-copilot (reuse migration/RLS/PBT harness); ต้องออกแบบ `posting_rule` schema + seed ต่อ capture_type; suspense account เพิ่มใน COA; posting เป็น pure function (artifact + rule → balanced lines) ทดสอบด้วย PBT ได้; ต้องมี property "posted entry ทุกอันสมดุล + idempotent ต่อ artifact key"

## ADR-025 — e-Tax signature = XAdES + X.509 qualified cert (ETDA-approved CA); src/crypto เฉพาะ integrity ภายใน (corrects ADR-020)

- **Status:** Accepted (grill-with-docs รอบ 2, 1 ก.ค. 2026) — **refines/corrects ADR-020 (eTax sub-point)** — ยังไม่ implement
- **Context (verified via web):** e-Tax Invoice ไทยต้องลงลายมือชื่อดิจิทัลด้วย **qualified certificate จาก CA ที่ ETDA รับรอง** (esignglobal); มาตรฐานลายเซ็น XML = **XAdES** (มี repo ทางการ `github.com/ETDA/etax-xades`); เอกสาร PDF/A-3 หรือ XML + digital signature + electronic certificate (getharvest); เก็บ 5 ปีเพื่อ integrity/authenticity (edicom) → `src/crypto` (ed25519/ecdsaP256 raw) **ไม่ตรงมาตรฐาน** e-Tax ตามกฎหมาย
- **Decision (Q9):**
  - eTax_Generator ใช้ **XAdES/X.509 signer เฉพาะ** พร้อมใบรับรองจาก CA ที่ ETDA รับรอง (อ้างแนวทาง `ETDA/etax-xades`) — external dependency (cert file/HSM)
  - **`src/crypto` reuse เฉพาะ integrity ภายใน** (hash artifact/manifest) ไม่ใช่ลายเซ็น e-Tax ตามกฎหมาย
- **Consequences:** ADR-020 ข้อ "reuse src/crypto เซ็น e-Tax" ถูก **supersede** โดย ADR นี้; ต้องเพิ่ม dependency XAdES signer + จัดหาใบรับรอง CA (owner task, ก่อน go-live) + เก็บเอกสาร 5 ปี; integration test e-Tax ต้องตรวจ XAdES signature verify ได้ (ไม่ใช่ ed25519)
- **PENDING owner:** จัดหา qualified certificate จาก ETDA-approved CA + เลือก XAdES lib/HSM

## ADR-026 — Multi_Book เป็นแกน orthogonal กับ A1 topology (ไม่ใช่ book = brand)

- **Status:** Accepted (grill-with-docs รอบ 2, 1 ก.ค. 2026) — ยังไม่ implement
- **Context:** ADR-020 บอก "มิติ book/entity reuse A1 Company/Brand" กำกวมว่า book (internal/statutory/tax) เป็นแกนเดียวกับ Brand หรือไม่; DAPH = 1 Brand แต่ต้องมีทั้งบัญชีภายในและ statutory (มุมมองต่างกันของนิติบุคคลเดียว)
- **Decision (Q10):** book เป็น **แกน orthogonal** — A1 ให้ *นิติบุคคล* (Company/Brand/Location/site_code); book ให้ *มุมมองรายงาน* (internal/statutory/tax); นิติบุคคลหนึ่งมีได้หลาย book; journal entry ติดแท็กทั้ง `(entity จาก A1, book_id)`; statutory book ออกตาม DBD 2554 ตามประเภทนิติบุคคล
- **Consequences:** data model ledger ต้องมี book_id แยกจาก A1 entity id (สองมิติ); Property ACC-7 (Multi-Book Isolation) ยังคงอยู่แต่ scope = book_id ไม่ใช่ brand; รองรับหลายนิติบุคคล × หลาย book โดยไม่ปนกัน; RLS ต้องคุมทั้งสองมิติ

## ADR-027 — Job-cost data contract: accounting เจ้าของอัตราต้นทุน; CAM ส่งเฉพาะ job id + quantities

- **Status:** Accepted (grill-with-docs รอบ 2, 1 ก.ค. 2026) — ยังไม่ implement
- **Context (verified):** `src/core/manufacturing` (CAM engine) emit Released_Spec/Factory Packet แต่ `factoryPackageTypes.ts` เป็น **UI state machine** (release/export flow) ไม่มีข้อมูลต้นทุน; ราคาซื้อจริงมาจาก capture-spine `material_receipt` (commit_target=actual_purchase_price)
- **Decision (Q11):** job cost ประกอบจาก:
  - **ต้นทุนวัตถุดิบจริง** ← `material_receipt` (actual_purchase_price) จาก spine
  - **ปริมาณวัตถุดิบต่องาน** ← CAM export (cutlist/BOM ใน Released_Spec) แบบ **read-only**
  - **ค่าแรง/โสหุ้ย** ← **standard rate config (accounting เป็นเจ้าของ)** × เวลาที่ CAM รายงาน/กรอกมือ
  - accounting ทำ rollup + post เข้า ledger + variance (จริง vs มาตรฐาน) ภายหลัง; **ไม่คำนวณ geometry เอง**
  - **สัญญาจาก CAM = `job id + material quantities (cutlist)` เท่านั้น**; accounting เป็นเจ้าของ "อัตราต้นทุน"
- **Consequences:** accounting ไม่ผูกกับ internals ของ CAM engine (แค่ consume quantities); ต้องมี `cost_rate` config (labor/overhead) ที่ accounting เป็นเจ้าของ; รองรับ variance analysis (actual material vs standard); CAM engine ไม่ต้องรู้เรื่องบัญชี (แยก concern สะอาด)

## ADR-028 — Vendor master matching key = tax_id หลัก + ชื่อรอง (overturns default ใน 0064/0065)

- **Status:** Accepted (grill owner-decisions, 3 ก.ค. 2026; amended จาก scrutinize วันเดียวกัน) — implement เป็น **migration ใหม่ (0076+)** ห้ามแก้ 0064/0065 ที่ apply แล้ว (additive-first)
- **Context:** fraud check "vendor not in master" (Req 10) ที่ implement ไปแล้วจับคู่ด้วย `vendor_master.name` ซึ่งอ่อนแอสองทาง: ชื่อสะกดต่างเล็กน้อย → false positive, และผู้ปลอมเอกสารใช้ชื่อผู้ขายที่มีใน master → ผ่านการตรวจ; ขณะที่ใบกำกับภาษีไทยทุกใบมีเลขผู้เสียภาษี 13 หลัก (unique, OCR อ่านได้, ตรวจย้อนกับกรมสรรพากรได้)
- **Decision (owner, grill Q1):** จับคู่ด้วย **tax_id เป็นหลัก**; ถ้า OCR อ่าน tax_id ไม่ได้ (confidence ต่ำ/ไม่มีบนเอกสาร เช่น บิลเงินสด) → fallback จับคู่ด้วยชื่อ + mark unverified ตามเดิม; tax_id ตรงแต่ชื่อไม่ตรง → ผ่าน master check แต่เพิ่ม fraud signal `name_mismatch` ให้มนุษย์ดู
- **Consequences:** migration ใหม่: UPDATE `capture_type_config.master_refs` ของ expense_document เป็น multi-column lookup (tax_id → name) + แก้ logic ใน `rpc_capture_set_extraction` (CREATE OR REPLACE); `vendor_master.tax_id` เพิ่ม unique index (partial, WHERE tax_id IS NOT NULL — ปัจจุบันมี index แค่ name); signal `name_mismatch` เพิ่มได้เลยเพราะ fraud signal เป็น free-text ใน jsonb ไม่มี FK/seed constraint (verified 0065); เอกสารไม่มี tax_id ยังไหลผ่านได้ (mark-not-block ตามเดิม)

## ADR-029 — Material auto-upsert คงไว้ + needs_review queue + name normalization

- **Status:** Accepted (grill owner-decisions, 3 ก.ค. 2026) — additive ต่อ 0069/0070
- **Context:** adapter 0070 auto-สร้าง material ตอนรับของ (จับคู่ด้วยชื่อ, ไม่ governance-gated) — ชื่อสะกดต่างกันเล็กน้อยจะสร้าง material ซ้ำ → moving-average แตกสองสาย ต้นทุนเพี้ยน; แต่การบังคับ governance สร้างก่อนจะ block การรับของหน้างาน
- **Decision (owner, grill Q2):** คง auto-upsert (รับของไม่สะดุด) + เพิ่ม (1) **normalize ชื่อก่อนจับคู่** (trim, ยุบช่องว่างซ้ำ, case-fold) (2) material ที่ auto-สร้างติดธง `needs_review=true` เข้าคิวให้ governance ตรวจ/merge ภายหลัง (3) RPC merge material (โอน price history + ถัว moving-average ใหม่) เป็นเครื่องมือ governance
- **⚠ Identity constraint (scrutinize 3 ก.ค. 2026):** `material_code` derive จาก `md5(name)` **ของชื่อดิบ** (0069) — ถ้า normalize แล้ว hash เปลี่ยน วัสดุเดิมจะได้รหัสใหม่/ประวัติแตกสาย ดังนั้นต้อง (a) เพิ่มคอลัมน์ `name_normalized` + unique index บนคอลัมน์นี้ (แทน unique บน name ดิบ) (b) แถวใหม่ derive code จาก **normalized name** (c) แถวเก่าคงรหัสเดิม — จับคู่ผ่าน name_normalized ไม่ re-derive (d) merge RPC เป็นทางแก้สำหรับรหัสซ้ำที่เกิดก่อนหน้า
- **Consequences:** master ไม่ block operation แต่มีกลไกกันเน่า; migration ใหม่: คอลัมน์ `needs_review` + `name_normalized` + merge RPC + normalize function (ใช้ร่วมกับ vendor name fallback ของ ADR-028); คิวรีวิวควรโผล่ใน dashboard governance

## ADR-030 — Monolith ledger = operational source of truth; นักบัญชียื่นงบด้วยโปรแกรมของเขาผ่าน export seam

- **Status:** Accepted (grill owner-decisions, 3 ก.ค. 2026) — ratifies 0066–0068 + เพิ่ม export requirement
- **Context:** ledger ถูกสร้างใน Monolith แล้ว (COA 21 บัญชี, double-entry, posting template G-4) แต่การยื่นงบ/ภาษีจริงยังอยู่กับนักบัญชีภายนอกซึ่งมีโปรแกรมของตัวเอง — ถ้าบังคับให้ Monolith เป็นระบบบัญชีเดียวตั้งแต่วันแรก จะติดขัดกับ workflow ผู้สอบบัญชี และฟีเจอร์ statutory (DBD/e-Tax/ภ.ง.ด.) ใน monolith-accounting ยังไม่เสร็จ (36%)
- **Decision (owner, grill Q3):** Monolith เป็น **operational ledger หลัก** (ต้นทุน/กำไร realtime, expense capture → journal อัตโนมัติ) และมี **export (CSV/Excel) journal + เอกสารแนบ** ให้นักบัญชีนำไปลงโปรแกรมของเขาเพื่อยื่นงบ/ภาษี; ฟีเจอร์ statutory ของ monolith-accounting (e-Tax, ภ.ง.ด., DBD format) เป็นเป้าระยะยาว ไม่ block การใช้งาน ledger วันนี้
- **Consequences:** ต้องเพิ่ม export RPC/report (งวด + สถานะ posted เท่านั้น + อ้าง source_capture เพื่อ audit); ป้องกัน double-entry ซ้ำสองระบบด้วยการถือ export เป็น read-only snapshot (ไม่มี write-back); ADR-020/024 ไม่เปลี่ยน — แค่กำหนดขอบเขต "ใครยื่นงบ" ให้ชัด

## ADR-031 — Released_Spec gate confirmer = Designer Lead role (ผูก role ใน RPC, ไม่ใช่แค่ flag)

- **Status:** Accepted (grill owner-decisions, 3 ก.ค. 2026) — **ต้องแก้ adapter 0072** (ปัจจุบันใครมี site access ก็ promote ได้ถ้า gate_confirmed=true)
- **Context:** adapter spec_draft→Released_Spec บังคับแค่ `gate_confirmed=true` ใน payload — เป็น data flag ไม่ใช่ authorization; แบบที่หลุด gate ผิดคน = ผลิตผิดทั้งชิ้น (ย้อนยาก แพง); ADR-005 วางหลักไว้แล้วว่า design sign-off → Designer Lead เสมอ
- **Decision (owner, grill Q5; mechanism แก้สองรอบ — scrutinize + implement 3 ก.ค. 2026):** ผู้ยืนยัน gate = **หัวหน้า Designer (Designer Lead)** — "Designer Lead" **ไม่ใช่ C12 app role** (`has_any_app_role()` resolve ไม่ได้) ตัวตนนี้อยู่ในระบบเป็น **RACI accountable** ที่ approver-resolver ใช้ (0014: `raciMap → step → accountable` จาก knowledge_import current) → **กลไกที่ implement (0079):** `rpc_capture_promote` (commit_target=Released_Spec) ตรวจว่า `resolve_actor()` ∈ `raciMap.Designer.accountable` หรือเป็น governance; accountable ว่าง/ไม่มี knowledge_import → **fail-safe block** (Req 3.4 pattern); **ไม่เพิ่ม app role ใหม่ ไม่ hardcode role**
- **หมายเหตุ implement:** แนวทางแรก (สร้าง Approval_Request ให้ artifact) ถูกตัดออก — `approval_request.work_item_id` เป็น NOT NULL และ SLA sweep/notification workers (0025) ผูกกับ work_item ทั้งหมด; การ generalize ตาราง core เพื่อ capture เสี่ยงเกินประโยชน์ การเช็คสิทธิ์จาก**แหล่ง RACI เดียวกัน**ที่จุด promote ให้ authority guarantee เท่ากันโดยไม่แตะ workflow core
- **Consequences:** สอดคล้อง ADR-005/ADR-018 (approver จาก RACI ไม่ hardcode) และ reuse-not-fork; gate_confirmed flag ยังต้องเป็น true (สองเงื่อนไขซ้อน: ข้อมูลยืนยัน + คนมีอำนาจ); ถ้าภายหลังต้องการ SLA/notification สำหรับ spec gate ค่อยยก Approval_Request generalization เป็น ADR ใหม่

## ADR-032 — ยังไม่เปิด capture เป็น MCP Write_Tool (explicit no; ทบทวนเมื่อมี use case จริง)

- **Status:** Accepted (grill owner-decisions, 3 ก.ค. 2026) — ratifies สถานะปัจจุบัน (registry มีแค่ 3 tools)
- **Context:** การเปิด capture ผ่าน MCP สร้างปัญหา double-gate (MCP Human_Approval_Gate ซ้อน capture verify gate — มนุษย์กด 2 รอบต่อ 1 เอกสาร) หรือไม่ก็ต้องแก้หลัก MCP Req 5 ให้ Write_Tool ข้าม gate ตัวเองได้ (เจาะ invariant); ขณะที่ช่องทางภายใน (LINE/Gmail/app) ครอบคลุม use case ปัจจุบันครบ
- **Decision (owner, grill Q6):** **ไม่เปิด** ในเฟสนี้ — capture ยังเป็น internal orchestration เท่านั้น; จะทบทวนเมื่อมี AI agent ภายนอกที่ต้องใช้จริง และเมื่อนั้นให้เลือกแนว single-gate (ใช้ capture verify เป็น human gate ของ MCP) พร้อมออก ADR ใหม่
- **Consequences:** ไม่มีงาน implement เพิ่ม; ปิด gap #6 ใน _owner-decisions; ใครเจอ registry ไม่มี capture tool จะรู้ว่าตั้งใจ ไม่ใช่ลืม

## ADR-033 — Extraction engine: Claude เป็น bridge (เฉพาะเอกสารธุรกิจ) → Typhoon on-prem เมื่อผ่าน dual-run (partially supersedes ADR-021)

- **Status:** Accepted (grill Claude vs Typhoon, 3 ก.ค. 2026) — **ผ่อน ADR-021 เฉพาะ capture extraction ชั่วคราว**
- **Context (verified):** Typhoon ต้องมี GPU ซึ่งยังไม่มี → pipeline รันจริงไม่ได้; ต้นทุนเทียบที่ ~1,000 เอกสาร/เดือน: Claude Haiku 4.5 (~300–500 บาท/เดือน) vs Typhoon บน AWS g6 Bangkok (~9,000–26,000 บาท/เดือน) vs ซื้อเครื่อง (~250k) — break-even ~85,000 เอกสาร/เดือน; ทางเลือก "residency ไทยแท้" มีแค่ GPU เพราะ Bedrock Bangkok ก็ cross-region ใน APAC และ Typhoon hosted API รันบน Together (ต่างประเทศ); PDPA ไม่ห้าม cross-border ถ้ามี safeguard (ม.28) และเอกสารธุรกิจส่วนใหญ่เป็นข้อมูลนิติบุคคล
- **Decision (owner):**
  1. **สถาปัตยกรรม:** สร้าง **Extraction_Engine adapter seam** — Stage1/Stage2 เรียกผ่าน interface เดียว สลับ engine ด้วย config ไม่แก้ core (ตามหลัก config-driven ของ spine)
  2. **Bridge:** ใช้ **Claude API** เป็น engine ชั่วคราว — เฉพาะ capture_type ที่ `cloud_allowed=true` (expense_document, material_receipt, delivery_pod, spec_draft); ประเภทที่แตะข้อมูลบุคคลธรรมดา (site_survey, installation_proof) = **manual entry** จนกว่า on-prem พร้อม; ต้องมี DPA/no-training กับผู้ให้บริการ
  3. **Exit criteria (amended จาก scrutinize 3 ก.ค. 2026):** เมื่อ GPU พร้อม → **dual-run** Typhoon เทียบ Claude บนเอกสารจริง ≥ 1 เดือน; สลับเมื่อ critical fields ตรงกับผลที่มนุษย์ยืนยัน ≥ 95% — **verify gate ปัจจุบันเก็บแค่ boolean confirm** (0055 เขียนเฉพาะ status/reviewed_by/notes ไม่เก็บค่าที่มนุษย์แก้) จึงต้องเพิ่ม **`corrected_fields jsonb`** ใน `rpc_capture_verify` (migration ใหม่) เพื่อเก็บ ground truth ให้วัดได้ — ทำตั้งแต่ช่วง bridge เพื่อสะสม baseline; การสลับเป็น config change ไม่ใช่ code change
- **Consequences:** pipeline ใช้งานได้ทันทีโดยไม่รอจัดซื้อ; on-prem guard (`isOnPremEndpoint` — `capture-ocr-extract/index.ts:35` บังคับที่ :102) เพิ่ม allowlist สำหรับ Claude endpoint เฉพาะ engine=claude + cloud_allowed=true (ยังห้าม egress อื่นทั้งหมด); เพิ่ม flag `cloud_allowed` ใน capture_type_config; **provenance ต่อ artifact มีอยู่แล้ว** (`ai_provider`/`model_version` — 0049:58) ใช้ audit ว่าใบไหนผ่าน cloud ได้เลย ไม่ต้องเพิ่มคอลัมน์; ADR-021 ยังคุม Finance data at-rest ทั้งหมด (DB/storage ไทย) — ผ่อนเฉพาะ transient extraction call; ความเสี่ยง: bridge ถาวรถ้าไม่คุม exit criteria — จึงผูกกับ dual-run ที่วัดจาก corrected_fields

## ADR-034 — Entitlement SaaS = แยก DB (โปรเจกต์ Supabase ใหม่เมื่อขายจริง) — ปิด PRD §11 ข้อ 8 / entitlement Req 10

- **Status:** Accepted (grill owner-decisions, 5 ก.ค. 2026)
- **Context (verified):** DB ปัจจุบันเป็น internal ops ของบริษัทเดียว — `00000000000000_c12_foundation.sql` ระบุ "DAPH เป็นบริษัทเดียว vertically-integrated, single-site", `get_active_site_codes()` return ค่าคงที่แถวเดียว, **ไม่มีตาราง tenancy** (site_codes อ่านจาก JWT app_metadata); entitlement v0.3 ออกแบบสำหรับลูกค้า SaaS ภายนอกหลายองค์กร (`organizations`+RLS) — คนละ population กับข้อมูลภายใน; ข้อโต้แย้งฝั่ง "รวม DB" (join line_oa_*/workflow) ตกไปหลังมติ ADR-035 ว่า Installation PM v1 เป็นโมดูล internal อยู่ใน DB เดิมอยู่แล้ว — ลูกค้า SaaS ภายนอกไม่มีข้อมูลใน DB นี้ให้ join
- **Decision (owner, grill Q2):** เมื่อเปิดขาย MONOLITH SaaS → สร้าง**โปรเจกต์ Supabase แยก** ใช้ `schema-draft-v0.3.sql` (tenant = organizations ตาม draft, ไม่ต้อง map org↔site); ข้อมูล internal DAPH ไม่ปนกับลูกค้าภายนอก (blast radius/PDPA/backup แยกขาด)
- **Consequences:** entitlement Phase 0 ปลดล็อก — Phase 1 (landing migrations + รัน tests-negative.sql) เริ่มได้ทันทีที่ตัดสินใจขาย; ตัด scope "ปรับ RLS เข้า convention C12" ออกจาก entitlement tasks (ไม่ต้องทำแล้ว); Installation PM เวอร์ชัน SaaS ในอนาคต = ส่วนหนึ่งของโปรเจกต์ SaaS นั้น (sitepm.* ใน matrix v0.4 คือ availability ของเวอร์ชันขาย ไม่เกี่ยวกับ internal v1)

## ADR-035 — Installation PM v1 = dogfood ภายใน DAPH บน DB เดิม (C12) + MVP เป็น PWA + offline-lite upload queue

- **Status:** Accepted (grill owner-decisions, 5 ก.ค. 2026)
- **Context:** spec `.kiro/specs/installation-pm/` ร่างโดยเปิดทางเลือก tenant/platform ไว้ (Req 12); ผู้ใช้จริง v1 = ทีมติดตั้งของ DAPH เอง (สั่งอุปกรณ์/เก็บ metrics ได้ ไม่ต้อง polish ระดับขายลูกค้า); ส่วนที่แพงสุดของ draft ภายนอกคือ N5 offline-first mobile (RN + two-way sync + conflict resolution) ซึ่งทีมปัจจุบันไม่มีคน RN
- **Decision (owner, grill Q1+Q3):**
  1. **v1 = โมดูล internal ใน DB เดิม** ตาม convention C12 (ไม่มี org_id — ใช้ site_code/roles จาก JWT + `installation_memberships` สำหรับช่างภายนอกรายโปรเจกต์); ไม่ gate ด้วย entitlement (ของใช้เอง)
  2. **MVP = web responsive + PWA + offline-lite**: คิว upload ทางเดียว (service worker + IndexedDB เก็บ report/รูปตอนเน็ตหลุด ส่งเมื่อสัญญาณกลับ) — **ไม่มี two-way sync** = ไม่มี conflict resolution ใน v1
  3. เก็บ baseline จากงานจริง (อัตรา submit ผ่านคิว offline, จุด/ความถี่ที่ไม่มีสัญญาณ) → ตัดสิน mobile RN + full sync (Phase 2) ด้วยข้อมูล ไม่ใช่สมมติฐาน — หลัก baseline-first เดียวกับ PRD
- **Consequences:** requirements Req 8 (offline-first mobile) เลื่อนสถานะเป็น conditional-on-baseline; sync protocol D-6 คงไว้ในเอกสารเป็น design สำรอง (ห้าม implement ก่อน baseline ยืนยัน); Realtime spike (tasks 0.4) ยังจำเป็น (chat MVP); เมื่อยกเป็น SaaS ค่อย re-scope tenancy ตาม ADR-034

### ADR-035 Amendment (owner, 5 ก.ค. 2026) — MVP ต้องเกาะ line_oa/workflow spine

- **Decision (owner):** MVP ไม่ใช่ PWA เดี่ยว ๆ — งานติดตั้ง = `work_items` ขั้น Installation ใน canonical process (lifecycle/approval/notify ของ workflow ทำงานเดิม ห้าม bypass), รูปหลักฐาน = capture `installation_proof` (ingest→verify→commit ปิด work item — 0063 มีอยู่แล้ว), แจ้งเตือนช่าง+รับรูปจากช่าง = line_oa (webhook/outbound/templates), ข้อมูลวัดหน้างาน = SiteSurveyZone read-only
- **Verified reuse เพิ่มเติม:** canonical process มี Sub_Process_Group {Office, Factory, Installation} + workflow Req "Installation start/finish → approver หัวหน้าทีม Installation + notify Sale/PM"; capture types `installation_proof` (0051, commit_target='Work_Item complete') และ `site_survey`→SiteSurveyZone (0062/0073) — spec ฉบับก่อน amendment ออกแบบ task system + media pipeline ขนานโดยไม่จำเป็น
- **Consequences:** `installation_tasks` ลดบทบาทเป็น subtask หน้างานใต้ work_item (single source of truth = workflow); media net-new เหลือแค่ thumbnail/compress + annotation; push FCM/APNs เลื่อนได้ (แจ้งเตือนหลัก = LINE); chat in-app กลายเป็น optional ตามผล Realtime spike — design.md D-11

## ADR-036 — Deployment: Supabase hosted (Singapore) เป็น bridge ชั่วคราวของ DAPH internal ops — ผ่อน SPINE-8/ADR-021 แบบมีเงื่อนไขไข (pattern ADR-033)

- **Status:** Accepted (grill-with-docs, 6 ก.ค. 2026)
- **Context:** โค้ด workflow/LINE/capture ครบ (134/134 + scrutiny 0084) เหลือ ops แต่ยังไม่มี deployment target จริง (config.toml = local dev เท่านั้น); ADR-021 + Property SPINE-8 บังคับ Finance/PII at-rest ใน Thai_Data_Center ขณะที่ Supabase hosted ไม่มี region ไทย (ใกล้สุดสิงคโปร์); ทางเลือก self-host บนโครงสร้างไทย (แนว INET ตาม Feasibility workbook) สอดคล้องเอกสารตรง ๆ แต่ต้องมีคนดูแล (JD DevOps เพิ่งร่าง ยังไม่มีคนจริง) และจะหน่วง dogfood ทั้งสาย
- **Decision (owner, grill Q1):** ใช้ **Supabase hosted (ap-southeast-1 สิงคโปร์) เป็น bridge เฉพาะช่วง dogfood** — ผ่อน SPINE-8/ADR-021 ชั่วคราวแบบมีเงื่อนไขไข:
  1. **Exit criteria (ต้องย้ายเข้าโครงสร้างไทยก่อน):** (ก) เปิดใช้บัญชี/การเงินจริง (ledger production data) หรือ (ข) เก็บข้อมูลลูกค้าจริงเต็มระบบเกินขอบเขต pilot dogfood — อย่างใดถึงก่อน
  2. ระหว่าง bridge: จำกัดข้อมูลใน DB ให้เป็นข้อมูล dogfood/pilot; DPA กับ Supabase; ไม่เปิด foreign-SaaS egress เพิ่ม (ADR-021 ข้ออื่นคงเดิม)
  3. การย้าย = `supabase db dump/restore` + repoint functions — ทุกอย่างเป็น migration/repo-as-code อยู่แล้วจึงย้ายได้จริง (กัน "bridge ถาวร" ที่ ADR-033 เตือน)
- **Consequences:** ปลดล็อก ops ทั้งชุด (apply 0081–0084, deploy Edge Functions, pg_cron/Vault มีให้ใน hosted); SPINE-8 มีสถานะ "ผ่อนชั่วคราวโดย ADR-036" ต้อง track exit ใน roadmap; งาน follow-up: ตั้ง billing alert + backup policy ตั้งแต่วันแรก

## ADR-037 — Re-quote complete = full revert ผ่านวงจรอนุมัติเดิม (ปลด lock → ย้อน step → trigger re-lock เอง)

- **Status:** Accepted (grill-with-docs, 6 ก.ค. 2026) — design แล้ว รอ go-ahead implement (scrutiny F8)
- **Context:** Req 21.10 สั่ง "revert ไป gate ที่ field ถูกแก้แล้ว re-lock" แต่ `rpc_accept_requote` (0024) แค่ set `in_progress` — ไม่ revert ไม่ re-lock; และ Req 21.11 ห้าม silent unlock (ปลดได้เฉพาะ approved scope_change); ทางเลือก "re-lock อย่างเดียวไม่ย้อน step" เบากว่าแต่ทำให้แบบใหม่ที่แพงขึ้นไม่ถูกเซ็นซ้ำโดยผู้อนุมัติ gate
- **Decision (owner, grill Q4):** **Full revert ผ่านวงจรอนุมัติเดิม** — กลไก:
  1. `rpc_request_scope_change` รับ `p_gate` (0083 reject flow มีค่าจาก classify อยู่แล้ว) เก็บใน `design_locks._requote.gate`
  2. เมื่อ accept ครบทั้งคู่ (internal PM+exec single-consolidated + customer): **ปลด lock ของ gate นั้น** (นี่คือ "approved scope_change" เพียงเส้นทางเดียวที่ปลดได้ — Req 21.11 คงจริง) + **revert `current_step`** ไป step ของ gate (inverse ของ `fn_wf_gate_for_step`)
  3. งานเดินเข้าวงจรอนุมัติของ gate นั้นใหม่ตามปกติ → เมื่อผ่าน **trigger 0084 re-lock ให้เองอัตโนมัติ** — ไม่มีโค้ด re-lock พิเศษ, แบบใหม่ถูกเซ็นจริงโดยผู้มีอำนาจของ gate
- **Consequences:** reuse ทั้งเส้น (resolver + decision + trigger เดิม); ต้องแก้ 2 จุดตอน implement: `rpc_request_scope_change(p_work_item_id, p_gate)` + branch complete ของ `rpc_accept_requote` (unlock+revert แทน set in_progress ตรง ๆ); trigger 0084 ไม่ยิงซ้ำระหว่าง requote เพราะเงื่อนไข OLD=awaiting_approval; งานที่ revert จะนับ attempt ใหม่ใน approval_request (พฤติกรรมที่ต้องการ — เป็นการเซ็นรอบใหม่จริง)

## ADR-038 — Staff↔LINE binding = ตาราง `identity_binding` เดียว (ยุบ `line_staff_identity` ที่ spec ไว้)

- **Status:** Accepted (grill-with-docs, 6 ก.ค. 2026)
- **Context:** grill พบตารางผูกพนักงาน↔LINE ซ้ำสองระบบ: `identity_binding` (workflow — มีจริง, 0084 เพิ่ม `app_role` สำหรับ resolve approver ref) กับ `line_staff_identity` (installation-pm spec 📝 ยังไม่สร้าง — มี consent/LINE Login/bound_at) — ถ้าสร้างทั้งคู่ พนักงานต้องผูกสองรอบ + ข้อมูล drift
- **Decision (owner, grill Q5):** ตารางเดียว = **ขยาย `identity_binding`** (เพิ่ม `consent_at`, `bound_at`, `revoked_at` + flow ผูกครั้งเดียวผ่านลิงก์+LINE Login ตามมติ installation-pm เดิม) — installation-pm อ้างตารางนี้แทน `line_staff_identity` ทุกจุด (reuse-not-fork)
- **Consequences:** ผูกครั้งเดียวใช้ทั้ง notification (workflow), กลุ่ม LINE, รูป/`#ปัญหา` attribution (installation); แก้ spec: installation-pm requirements Req 13.3, line-architecture §3/§7, tasks 1.8 — done ในรอบ grill นี้; `app_role` = จุดที่ HR ผูก approver ref ให้ผู้อนุมัติ (ไม่ใช่ช่างทุกคนต้องมี)

## ADR-039 — Installation lifecycle = ราง approval เดียว (workflow SSOT · ใบปิดบ้านใบเดียว · ตรวจรับลูกค้าแยกชั้น project)

- **Status:** Accepted (grill-with-docs 1.2, 6 ก.ค. 2026) — design แล้ว รอ go-ahead implement (tasks 1.2)
- **Context:** 0090 เปิด `installation_approvals` รับ subject start/finish/customer_acceptance → เสี่ยงเป็นระบบอนุมัติขนานกับ workflow (ขัด ADR-035 amendment); grill ยังพบ 2 ช่องโหว่จริง: (1) เส้น finish (capture verify→promote→complete) ใครมี site access ก็กดได้ — ไม่ตรง Req 8.6 workflow ที่สั่งให้หัวหน้าทีม Installation เป็น approver; (2) adapter complete ปิด work item ทันทีที่ `installation_proof` ใบแรก promote — บ้าน 5 ห้องโดนปิดตั้งแต่รูป Wrapping ห้องแรก
- **Decision (owner, grill 5 มติ):**
  1. **`installation_approvals` เหลือหน้าที่เดียว = `customer_acceptance`** — ตัด subject start/finish (แก้ CHECK ของ 0090); start/finish วิ่ง workflow approval loop 100%; การ์ด Flex ในกลุ่ม LINE = ช่องทางกดที่ยิงเข้า decision RPC เดิม ไม่ใช่ระบบที่สอง (หลักเดียวกับ "กลุ่ม LINE ≠ authorization")
  2. **Finish authority = RACI gate ใน adapter 'Work_Item complete' (pattern ADR-031):** `current_step='Installation'` → ผู้ promote ต้องมี app role ตรง approver ref ของขั้น Installation จาก `knowledge_import` current หรือ governance; RACI ว่าง → fail-safe block; ไม่สร้าง approval รอบสอง (SLA การรอ finish = SLA ของขั้น Installation); adapter แจ้ง Sale/PM (fyi) ตอน complete
  3. **สอง capture type:** `installation_room_proof` (รูป Wrapping รายเลน/ห้อง — `commit_target='evidence_only'`, promote = evidence+link ห้อง, ศูนย์โค้ด adapter) vs `installation_proof` (**ใบปิดบ้านใบเดียว** หัวหน้าทีมส่งเมื่อทุกห้องเสร็จ → complete ผ่าน gate ข้อ 2); verify "ทุกห้องมี room proof" = soft (เตือน UI ไม่ block — ห้องยกเลิกกลางทางได้ อำนาจอยู่ที่หัวหน้า + audit)
  4. **T0 site readiness = soft + audit snapshot** ตอน approve start (ไม่ hard-block — T0 มีข้อ conditional ตามบ้าน; hard gate บนเช็คลิสต์ conditional = สอนให้ติ๊กเพื่อผ่าน)
  5. **ตรวจรับลูกค้า = closure ระดับ project:** work item ปิดเมื่อใบปิดบ้านผ่าน (นาฬิกา operational ของทีมหยุดตรงงานช่างจบ); `installation_projects`: `active → customer_review → completed`; ลูกค้าไม่รับ → ไม่ reopen work item — reason ลง `installation_approvals` + แจ้งทีม → punch list/rework flow ใหม่ (Phase ถัดไป); ห้ามเพิ่ม Installation เข้า `wf_is_customer_approval_step` (คุม entry gate — ความหมายคนละเรื่อง)
- **Consequences:** ไม่มี state อนุมัติซ้ำสองราง; Req 8.6 ถูก enforce จริงที่ DB ทั้ง start (มีอยู่แล้วผ่าน resolver) และ finish (gate ใหม่); การปิดบ้านยังเป็นการกระทำของมนุษย์ที่รับผิดชอบ (D-11 คงจริง — subtask ครบไม่ auto-complete); SLA workflow ไม่ปนกับการรอลูกค้า; implement = migration แก้ CHECK + adapter gate + seed `installation_room_proof` + tests (tasks 1.2)

## ADR-040 — Field PWA: workspace app แยก + LINE Login เป็น session และ binding ในจังหวะเดียว

- **Status:** Accepted (grill PWA, 7 ก.ค. 2026) — design แล้ว รอ go-ahead implement (tasks 1.5 Wave A)
- **Context:** ต้องมี UI ให้ office/หัวหน้า/ช่างใช้ (tasks 1.3/1.5/1.6) แต่แอปเดียวที่มีคือ MONOLITH CAD (Three.js bundle หนัก, audience ดีไซเนอร์บน workstation, **ไม่มี supabase-js ฝั่ง client เลย**); Supabase Auth ไม่มี LINE provider ในตัว; ช่างไม่มี email บริษัทแต่มี LINE ทุกคน; งาน "ลิงก์ผูก staff identity (LINE Login + consent)" ค้างใน spec โดยมีคอลัมน์รอตั้งแต่ 0088
- **Decision (owner, 5 มติ):**
  1. **`packages/field-app`** — Vite+React แยกใน workspace เดิม (bundle เบาสำหรับมือถือหน้างาน; reuse `src/installation/offline-queue` + types; ห้าม route ใน CAD / ห้ามแยก repo)
  2. **LINE Login = ทางหลัก** ผ่าน edge fn `line-login` (verify id_token → mint Supabase session → **บันทึก identity_binding + consent_at ในจังหวะเดียว** — login ครั้งแรกปิดงานผูกตัวตน) + email magic link เสริมสำหรับ office; ตัด password (audit เพี้ยน) และ phone OTP (SMS ต่างชาติ — ADR-021)
  3. **Build ตาม dependency: Wave A office → B หัวหน้า → C ช่าง** — ทุก Wave ปล่อยใช้ทันที; ระหว่างรอ C ช่างใช้กลุ่ม LINE (0097)
  4. **DAPH brand tokens บนโครง field-first** — #1F3D2B/#C7A86A เป็น identity, field physics ชนะเมื่อขัด (Noto Sans Thai, ปุ่ม ≥48px, contrast AA)
  5. **GitHub Pages** — static ไม่มีข้อมูล at rest, vendor เดิม, ย้ายตาม ADR-036 exit ได้ทันที
- **Consequences:** frontend ตัวแรกที่ต่อ Supabase → ต้องมี **RPC ชุด field** (สถาปัตยกรรม RPC-only — API roles ไม่มี table DML): เปิดบ้าน/preset ห้อง/มอบเลน/ออกรหัสผูก/รายการงาน; edge fn line-login = infra auth ตัวแรก; ops A3 เพิ่ม LINE Login channel; CI เพิ่ม build+deploy pages

## ADR-041 — Customer Journey v2: group-centric ทั้งเส้น (กลุ่มบ้านเกิดตั้งแต่ Qualify · กลุ่มโรงงานถาวร · milestone ผลิตถึงตาลูกค้า · การเงิน soft-gate)

- **Status:** Accepted (grill-with-docs journey-v2, 7 ก.ค. 2026) — design แล้ว รอ go-ahead implement (tasks Phase J2)
- **Context:** Journey v1 (เอกสาร Customer-Journey-End-to-End) ถูก owner ชี้ว่า "ยังไม่ใช่" 4 จุด: ไม่มีการเงินทั้งเส้น · ช่วงผลิตเงียบ · ข้ามช่วงต่อรอง · จบห้วนหลังส่งมอบ; owner วาง flow ใหม่แบบ group-centric (กลุ่ม LINE ของบ้านเกิดตั้งแต่ Qualify + สมาชิกหมุนตามเฟส + โรงงานรายงานเข้ากลุ่ม + designer approve คุณภาพ); ข้อจำกัดจริง: LINE bot สร้างกลุ่ม/ดึงคนเข้ากลุ่มไม่ได้ → "อัตโนมัติ" ต้องเป็น "ระบบสั่ง-เช็ค-ตาม" (roster + ตามคนขาด/แจ้งคนเกิน)
- **Decision (owner, 5+1 มติ — รายละเอียดเต็มใน `.kiro/specs/installation-pm/customer-journey-v2-draft.md`):**
  1. **กลุ่มโรงงาน = กลุ่มถาวรกลุ่มเดียว** (ไม่เปิดต่อบ้าน — กลุ่มตามธรรมชาติของทีม: ทีมหมุนตามบ้านใช้กลุ่มต่อบ้าน ทีมอยู่กับที่ใช้กลุ่มประจำ); bot แยกงานต่อบ้านด้วยชื่อบ้านนำหน้าโพสต์; schema: group_type += 'factory' แบบไม่ผูก project
  2. **Designer gate 2 จุด รายงาน 6 จุด**: ทุกสถานี (Laminate→Cutting→Edging→CNC→Assembly→Packing) รายงานเข้ากลุ่มโรงงานเป็น FYI; gate จริง = หลัง Assembly (approve → รูปตู้จริง curated เข้ากลุ่มลูกค้า) + หลัง Packing (approve รวม + E5 QA ด่านสุดท้าย → แจ้งจัดส่ง); ลูกค้าเห็น 3 จังหวะ: เริ่มผลิต → ตู้เสร็จ → ขึ้นรถ — ปิด pain "ช่วงเงียบ"
  3. **ตรวจหน้างานร่วมก่อนผลิต = เงื่อนไขก่อนส่งการ์ด G3** (capture `site_design_verification` โดย C2+B2 ที่บ้าน) — ไม่เพิ่มขั้น canonical, ไม่ reopen ADR-039; ลายเซ็น G3 = อนุมัติหลังเห็นของจริง; enforcement soft+audit (ยก hard ได้ภายหลัง)
  4. **แผนติดตั้งถึงลูกค้า**: E7 โลจิสติกส์จัดคิว → ระบบร่าง → **D1 PM กดยืนยันส่ง** (คำสัญญาวันต้องมีเจ้าของมนุษย์; เก็บทุก version — เลื่อนกี่ครั้งวัดได้)
  5. **การเงินเฟสแรก = แจ้ง + บันทึก + soft gate**: payment plan ต่อบ้าน → การ์ดแจ้งงวดอัตโนมัติเข้ากลุ่มลูกค้า → F3 บันทึกรับ → ปล่อยผลิตทั้งที่งวดไม่เข้า = เตือน + PM/GM override พร้อมเหตุผล (ห้าม hard block — exception มีจริง, บทเรียน T0); ไม่มี payment gateway
  6. **โครงงวด DAPH: 4 งวดหน้าหนัก งวดส่งมอบ 5%** ผูก 4 จุด (สัญญา · G3 · ก่อนจัดส่ง · ตรวจรับ); default = **50/30/15/5 (ยืนยันแล้ว 7 ก.ค. 2026)** — ปรับได้ต่อสัญญา
  - โครงเสริมที่ทุกมติพึ่ง: **Phase Roster** — ตาราง "ใครควรอยู่กลุ่มไหนช่วงไหน" ต่อบ้าน + assignment approval โดยหัวหน้าฝ่าย (C1 วัด / B1 ออกแบบ+จับคู่ designer / D3 ติดตั้ง)
- **Consequences:** delta 8 ชิ้น (tasks Phase J2): factory group + roster + milestones/curated + payment plan + site verification + QC gate + install plan send + designer matching; กลุ่มลูกค้าย้ายจุดเกิดจากเฟสติดตั้งมาที่ Qualify (0095 รองรับอยู่แล้ว — installation_projects เปิดได้ตั้งแต่ต้น); after-sales + lead pipeline = เฟสถัดไป (จดใน draft); journey v1 HTML จะถูกเขียนใหม่หลัง J2 landing

## ADR-042 — After-Sales: punch list ใช้ตาราง issue เดียว · กลุ่มบ้านมีชีวิตตลอดประกัน · ขอรีวิวแบบรู้กาลเทศะ

- **Status:** Accepted (grill after-sales, 7 ก.ค. 2026) — design แล้ว รอ go-ahead (tasks J2.9–J2.11)
- **Context:** journey จบห้วนที่ completed (จุดวิจารณ์ข้อ 4 ของ v1); ADR-039 มติ 5 defer punch list ไว้; ไม่มี spec ไหนแตะ warranty/รีวิว; ลูกค้าคนที่ 2 ที่ถูกที่สุดมาจากลูกค้าคนที่ 1
- **Decision (owner, 3+1 มติ):**
  1. **Punch list = reuse `installation_issues` + source `customer_review`** — แก้ครบทุกข้อจึงส่งตรวจรับรอบใหม่ได้ (การ์ดใหม่/token ใหม่); ไม่มีตารางใหม่ ไม่ reopen work item; ได้ metric defect ต่อบ้าน/ทีมฟรี
  2. **กลุ่มบ้านคง active ตลอดประกัน** — ปุ่ม "แจ้งซ่อม" ถาวรหลังส่งมอบ (กด = issue source `warranty` + แจ้งทีม; ไม่ดักแชท — PDPA เดิม); หมดประกัน → การ์ดสรุป → archive
  2.1 **ประกัน: งาน DAPH 1 ปีนับจากตรวจรับ · ฟิตติ้งตามประกันแบรนด์ (pass-through — เก็บแบรนด์/รุ่นจาก BOM ไว้อ้างเคลม)**; `warranty_until = acceptance_date + 1 ปี`; การ์ดส่งมอบระบุสองชั้นชัด
  3. **รีวิว+referral: 2 สัปดาห์หลังตรวจรับ + ไม่มี issue ค้าง** (มีค้าง → เลื่อนจนปิด); การ์ดสองปุ่ม (รีวิว / แนะนำเพื่อน — ลิงก์ฝังรหัสผู้แนะนำ → tag lead อัตโนมัติ); incentive v1 = ไม่มี (วัดก่อน)
- **Consequences:** delta 3 ชิ้น (tasks J2.9–J2.11): issue sources ใหม่ 2 + gate ส่งตรวจรับรอบใหม่ · warranty_until + ปุ่มแจ้งซ่อม + cron การ์ดอำลา/archive · scheduled card รีวิว (เช็ค issue ค้าง) + referral tag บน lead ใหม่; journey ครบวงจรแล้ว: add OA → ... → ตรวจรับ → ประกัน → รีวิว → **ลูกค้าคนถัดไป**

## ADR-043 — Reconcile ชุด Interior Design Studio System เข้า DAPH (Package sub-process · การเงินสองชั้น · กั้นเขตโปรดักต์)

- **Status:** Accepted (grill reconcile, 7 ก.ค. 2026)
- **Context:** owner สร้างชุดเทมเพลตขาย (Home Construction Planner 56 ชีต, millwork 12 ขั้น, บัญชี C6, RIBA 9-phase) แบบไม่อ้างระบบหลัก — ขัด canonical 3 จุด (workflow/payment/journey); เลือก merge แบบมี reconcile
- **Decision (owner, 3 มติ — รายละเอียดใน customer-journey-v2-draft.md §R):**
  1. **R-1**: Millwork 12 ขั้น = sub-process ราย **Package (MW-xxx)** ใต้ 8 ขั้น canonical — บ้านเดินด้วย 8 ขั้น (คน/อนุมัติ/SLA) ชิ้นงานเดินด้วย 12 ขั้นใต้บ้าน (ของ/ต้นทุน/คุณภาพ); Package ID เสียบ D-3 Packet Registry; shop drawing gate = G4 เดิม; Production = 6 สถานี + J2.2
  2. **R-2**: การเงินสองชั้น — ลูกค้า 50/30/15/5 (SSOT ยืน) · WIP/Job Cost/C6 = ชั้นบัญชีวิเคราะห์ภายใน (margin จริงต่อบ้าน — ผูก ledger) · retainage = option สัญญา corporate เท่านั้น
  3. **R-3**: ชุดเทมเพลต = โปรดักต์ขายแยก + README-STATUS.md กั้นเขต (RIBA/Sales Gate/retainage-default = ของโปรดักต์ ห้ามใช้ภายใน)
- **Consequences:** backlog ใหม่ 2 ก้อน (tasks Phase PK): Package registry ขยายจาก D-3 (takeoff/BOM/cutlist/shop-drawing/finish ราย package) + ชั้นบัญชี C6 (job cost, Project P&L, accountant handoff); ไม่มีการแตะ canonical/ADR-041

## ADR-044 — Reconcile kit รอบ 2 (C7–C12): Variation Order เข้าระบบ · C8 checklist เป็น legal gate · เนื้อหาลูกค้าเข้าคิว sender

- **Status:** Accepted (owner "ก", 8 ก.ค. 2026)
- **Context:** ชุด Interior Design Studio System โตจาก C6 → C12 หลัง reconcile รอบแรก (C7 แปลไทยเอกสารลูกค้า · C8 professional review guardrails · C10 contractor forms 12 ตระกูล · C11 portal sheets · C12 studio bundle); ตรวจแล้วส่วนใหญ่เป็นชั้นโปรดักต์ตาม R-3 แต่มีความรู้ 4 ก้อนที่อุดช่องว่างระบบจริง
- **Decision (owner, 4 มติ — ดูดความรู้เข้าโครงที่มี ไม่ลาก workbook มาเป็นระบบขนาน):**
  1. **R-4**: Variation Order (C10-04) = เอกสาร scope change ของจริงในระบบ — generate จากข้อมูลก้อนเดียว (pattern สัญญา 0117) + เซ็นกระดาษ → capture `signed_variation_order` → approve; ปิดวรรค "ห้ามตกลงปากเปล่า" (ADR-037/D4-4/B2-2) ด้วยเอกสารที่เถียงไม่ได้; กฎในฟอร์มตรงมติเดิมทุกข้อ (ไม่เริ่มงานส่วนที่เปลี่ยนจนกว่าอนุมัติ · price/time impact ชัด · แนบหลักฐาน); การปรับงวดจาก VO = F3 ปรับแผนผ่านเส้น 0108 เดิม (SSOT ยืน)
  2. **R-5**: Progress Claim (C10-06) = ใบแจ้งงวดแนบการ์ด — เข้าคิว follow-up "sender รองรับไฟล์" (ไม่สร้างระบบใหม่ตอนนี้)
  3. **R-6**: C8 Agreement Review Checklist + Caveat Library = **legal gate ของเอกสารบริษัท** — แปลงเป็น `docs/CONTRACT-REVIEW-CHECKLIST.md` (ปรับบริบท DAPH: สัญญา 0117 + VO) ใช้เป็น agenda ตอนส่งทนาย review skeleton + เกทใน runbook ก่อนใช้เอกสารกับลูกค้าจริง; ติ๊กครบ ≠ legal approval (เป็นเครื่องมือเตรียมส่งต่อผู้เชี่ยวชาญ)
  4. **R-7**: เนื้อหาลูกค้า C7 (Welcome Pack / Investment Guide / Journey Timeline ไทย) = ไฟล์ส่งกลุ่มช่วง qualify/onboarding — เข้าคิว sender เดียวกับ R-5
- **ปัดตก:** C11 portal sheets (มี PWA จริงแล้ว — workbook ด้อยกว่า) · C12 pipeline/tracker (ซ้ำ SJ-2/SJ-5 ที่เป็นระบบจริง) · artifacts ทั้งโฟลเดอร์ (build outputs + Linden reference ห้าม copy ตาม design ของ kit เอง) · RIBA/Sales Gate/retainage (คงห้ามตาม R-3)
- **Consequences:** tasks ใหม่ PK-3 (VO — implement ทันที) · follow-up sender += ใบแจ้งงวด + เอกสารลูกค้า C7 · README-STATUS ของ kit อัปเดตรายการ merge · docs/superpowers คงเป็น log ฝั่งโปรดักต์ตามสภาพ

## ADR-045 — Sender รองรับไฟล์/รูป (grill PK-4: เอกสาร = ลิงก์หน้าเว็บ · รูป = signed URL · ทยอยตามผลกระทบเงิน)

- **Status:** Accepted (owner "ก" ทั้ง 4 ข้อ, 8 ก.ค. 2026)
- **Context:** ความจริงแพลตฟอร์ม: LINE bot ส่งไฟล์เอกสารตรงไม่ได้ (ไม่มี file message type) และ image message ต้องเป็น HTTPS URL ที่ LINE ดึงได้เอง — bucket เราเป็น private
- **Decision (owner, 4 มติ):**
  1. **เอกสาร = ลิงก์หน้าเว็บอ่าน** (edge fn render HTML จาก body ที่ generate ไว้แล้ว + token อายุจำกัด — pattern approve_token/customer-design-view; ไม่สร้าง PDF engine); ปัดตก: render PDF ฝั่ง server (ฟอนต์ไทย+revoke ไม่ได้) และรูปทีละหน้า (อ่านสัญญายาก)
  2. **รูป = signed URL อายุ ~48 ชม. จาก bucket เดิม** ตอน dispatch — รูปคง private ทั้งหมด ศูนย์ infra ใหม่; ปัดตก bucket สาธารณะ (PDPA อ่อน)
  3. **ลำดับส่งมอบ**: Wave 1 = image kind + รูป curated ผลิต → Wave 2 = ลิงก์เอกสารเงิน (ใบแจ้งงวด + สัญญา/VO) → Wave 3 = เอกสาร C7/รายงาน PDF
  4. **ลิงก์เอกสารเงิน/สัญญาหมดอายุ 30 วัน** + ขอใหม่ได้จากการ์ดใหม่ + ทุกการเปิดลง audit
- **Consequences:** sender += LineImageMessage + createSignedMediaUrl (fail-safe: ไม่มี signer/URL = ไม่ส่งมั่ว); templates message_kind += 'image' (0134); producer แรก rpc_field_send_photo_to_customer (curated — office/designer เท่านั้น); Wave 2 = document_links + edge fn doc-view

## ADR-046 — F3 การเงิน: สลิป-กระทบยอดมือ · ใบเสร็จอัตโนมัติ · เตือนค้างสุภาพครั้งเดียว · หน้าเงินของฉัน (grill F3)

- **Status:** Accepted (owner "ก" ทั้ง 4, 8 ก.ค. 2026)
- **Decision (owner, 4 มติ):**
  1. **สลิป = capture evidence ผูกงวด + F3 เช็คยอดแบงก์เองแล้วกดบันทึกรับ** — ไม่ต่อ bank API (เจ้าเดียวเช็คเองเร็วกว่า + ไม่มี integration เสี่ยง/แบงก์ไทย API ไม่นิ่ง)
  2. **ใบเสร็จ generate จากระบบ** (เลขรัน + snapshot จากงวดจริง) → ลิงก์ doc-view ส่งเข้ากลุ่มอัตโนมัติหลังบันทึกรับ; ฟอร์มใบเสร็จ/ใบกำกับต้องผ่าน checklist บัญชี/ทนาย (PK-5) ก่อนใช้จริง — มี marker กำกับ
  3. **เตือนค้างชำระ**: sweep รายวัน — แจ้งแล้วค้างเกิน X วัน (config, default 5) → เตือนสุภาพในกลุ่ม **1 ครั้งเดียว** → ค้างต่อเกิน Y (default 10) → แจ้งภายใน F3 (+Sale เจ้าของบ้านผ่าน audit — mapping email→employee = follow-up); ห้ามทวงซ้ำในกลุ่ม (ทวงแรง = ทำลายความรักทั้ง journey)
  4. **หน้าแรก F3 "งานเงินของฉันวันนี้"**: ① งวดรอตรวจ/บันทึกรับ (+แนบสลิป) ② ค้างเกิน X วัน ③ รับแล้ววันนี้รวม — สูตรเดียวกับทุกตำแหน่ง
- **Consequences:** Phase FJ (0137): capture payment_slip + receipts (RC-YYYY-run) + rebase rpc_finance_record_payment (0108→0137) + finance_config + fn_payment_overdue_sweep (cron ใหม่) + doc_type += receipt + FinanceHome UI; ops_contacts += 'F3' (runbook P5.4)

## ADR-047 — B4 Planner: คิวตามวันติดตั้ง+override · BOM ผูกวัสดุจริง · capacity view แบบง่าย · หน้าคิวโรงงาน (grill B4)

- **Status:** Accepted (owner "ก" ทั้ง 4, 8 ก.ค. 2026)
- **Decision (owner, 4 มติ):**
  1. **คิวผลิตข้ามบ้าน** เรียงตามวันติดตั้งที่สัญญากับลูกค้า (แผนติดตั้ง sent ล่าสุด — ใกล้สุดก่อน; ไม่มีแผน = ท้ายคิว) + **B4 override ลำดับได้พร้อมเหตุผลลง audit** — เครื่องเรียงตามคำสัญญา คนตัดสินใจสุดท้าย; ปัดตก FIFO (ไม่สนคำสัญญาส่งมอบ)
  2. **BOM ผูกวัสดุจริงราย package**: รายการ+จำนวน+สถานะ (รอสั่ง→สั่งแล้ว→รับแล้ว, E6 ติ๊กรับ) → รับพร้อมราคา = เข้า Job Cost ราย package อัตโนมัติ · เริ่มตัด (machining) ทั้งที่ของไม่ครบ = **เตือน+audit ไม่ block** (soft — pattern T0) · ของขาดปุ่มเดียว → issue `material` เดิม (route E6/E2/E7)
  3. **Capacity view แบบง่าย**: จำนวน package ค้างต่อสถานี (ขั้น 7–10) — B4 เห็นคอขวดแล้วตัดสินใจเอง; ปัดตก finite scheduling (ข้อมูลยังไม่พอให้เครื่องฉลาด — pattern matching v1)
  4. **หน้าแรก B4 "คิวโรงงานวันนี้"**: ① คิว package + ขั้นปัจจุบัน + วัสดุพร้อม/ไม่พร้อม + override ② วัสดุรอรับ/รอสั่ง ③ โหลดต่อสถานี
- **Consequences:** Phase BQ (0139): work_packages += queue_override · package_materials + RPCs (add/status/shortage→issue) · rebase rpc_field_package_stage_done (0128→0139 — เตือน machining ของไม่ครบ) · rpc_factory_queue/load/home + FactoryHome UI + ปุ่มโรงงาน

## ADR-048 — C1 หัวหน้าฝ่ายวัด: entity นัดหมายกลาง · จบวัด=capture handoff · หน้าคิววัด (grill C1)

- **Status:** Accepted (owner "ก", 8 ก.ค. 2026)
- **Decision:** (1) **appointments** entity กลาง (บ้าน × ชนิด วัด/ตรวจร่วม/ติดตั้ง × วันเวลา) → การ์ด confirm เข้ากลุ่มลูกค้า + **เตือนทีมอัตโนมัติเช้าวันนัด** (dispatch ถึง roster เฟสที่ตรงชนิด; cron เช้า) — ใช้ร่วมทุกชนิดนัด ปลดล็อกช่อง "นัดวันนี้" ของ designer; (2) ปุ่ม "จบวัด–ส่งมอบให้ออกแบบ" = capture `survey_handoff` (สรุป + นับโซนจาก site_survey_zone เดิม — ไม่ fork) → แจ้ง designer ของบ้าน + mark นัดวัดเสร็จ; (3) หน้าแรก C1: นัดวัดวันนี้/พรุ่งนี้ · คำขอทีมวัดรออนุมัติ · วัดแล้วรอส่งมอบ
- **Consequences:** Phase CQ (0140): appointments + reminder sweep (cron ที่ 10) + survey_handoff + rpc_survey_home + SurveyHome UI

## ADR-049 — E2 หัวหน้าโรงงาน: รายงานเปิดแต่ visible · check-in โรงงานรวม = overhead กลาง · หน้าโรงงานวันนี้ (grill E2)

- **Status:** Accepted (owner "ก", 8 ก.ค. 2026)
- **Decision:** (1) รายงานสถานี**คงเปิดใครก็ได้ ไม่เพิ่ม approval ชั้นใหม่** (ไลน์ต้องไหล) — วินัยจากความ visible: E2 เห็นสรุป "รายงานวันนี้" สถานี×บ้าน×คนรายงาน; (2) **check-in รวมโรงงานต่อวัน** (E2 กดคนเดียว+ติ๊กใครมา ไม่ผูกบ้าน) → man-hours = **overhead กลาง** ให้ C6 กระจายตอนวิเคราะห์ (ปัดตกผูกชั่วโมงต่อ package — ช่างสลับงานทั้งวัน friction สูง บทเรียน D4-2); (3) หน้าแรก E2 แยกจาก B4 (ต่างมุม: B4 จัดคิว / E2 เดินงาน): คิวเดียวกับ B4 · gate รอ designer นานสุดก่อน · เข้างานโรงงานวันนี้ + รายงานวันนี้
- **Consequences:** Phase EQ (0141): factory_checkins (ไม่ผูกบ้าน) + rpc_factory_ops_home + FactoryOpsHome UI (ปุ่ม "ผลิต"); production_milestones.reported_by มีอยู่แล้ว — สรุปวันนี้อ่านตรง

## ADR-050 — Reconcile รอบ 3 (ฉบับใหญ่): QMS จริง DAPH 2020 + kit C1–C17 + vault เข้าระบบ (owner "ก" ทั้ง 5 + ยืนยัน 3)

- **Status:** Accepted (grill 5 สาย sweep — generators/kit HTML/superpowers/artifacts/DAPH workbooks 34 เล่ม 127 ชีต, 8 ก.ค. 2026)
- **Decision (owner):**
  1. **Q1 ความจริงโรงงาน**: station checklist ผูกรายงานสถานี (soft+audit) + **Special Characteristics เป็นช่องบังคับ** (Laminate: กดทับ ≥3 ชม./ทับ ≤5 แผ่น) + threshold จริง (ใบเลื่อย 150–200 แผ่น · edging เป่า 15 นาที · incoming ไม่แตก/บิ่น/โก่ง · วัดทุกชิ้นหลังตัด) + **gate ยืนยันก่อนสั่งวัสดุ (SEV 10 สูงสุดทั้งระบบ)** ใน BOM flow
  2. **Q2 Design integrity** (จากความเจ็บจริงใน PFMEA Revise 1): capture `design_handoff` ("Final ถึง Production = 3D เท่านั้น" + ยืนยัน drawing/3D sync) · shop drawing revision บังคับยืนยันแก้คู่ (drawing+3D) · T0 เตือนถ้ายังไม่มีรูปบ้านเดิม (photo+video liability — soft+audit)
  3. **Q3 EOT = reuse VO** (ไม่สร้างฟอร์มใหม่): VO += delay_category 6 ค่า (weather/client_decision/lead_time/hidden_condition/subcontractor/permit) + notice_date
  4. **Q4 เสริมขาย/ออกแบบ**: quote 6 หมวด (อธิบายในเอกสาร investment + estimate) · capture `cabinet_wall_list` 7 fields · red-flag hints ตอน qualify (4 ข้อ) · script bank Sale (ปฏิเสธสุภาพ/เตรียม consult/ตาม proposal) · **อบรม Sale ทุก 3 เดือน (cron เตือน H1)**
  5. **Q5 Housekeeping**: track `daph-second-brain/` + `docs/new-folder-workbook-audit/`; gitignore `New folder*/` + `_daph_extract/` (ต้นทาง xlsx/scripts — extract เป็น text แล้ว)
- **ยืนยัน 3 จุด (canonical pins):** ① ลำดับ 3D_Presentation → Production_Planning → 3D_Rendering_Final ยืนตาม knowledge export ② approval quorums = design decision ที่ยืนยันแล้ว (ไม่ใช่ของเดิมบริษัท) ③ millwork 12 ขั้นของ IIMOS ยืน (kit ใช้ 13 = ของโปรดักต์)
- **ข้อควรระวังถาวร (pins):** RPN ทั้ง QMS = null (OCC/DET ไม่เคยกรอก — มีแต่ SEV; **ห้าม logic ใด sort ตาม RPN**) · Control Plan ทุกไฟล์มีชีต Six-Sigma โรงพยาบาลปนมา (template เก่า — ห้าม ingest เป็น spec เฟอร์นิเจอร์) · P1/P2/P3 = เลนช่างขนาน (มติ 2026-07-05) · ค่า "XXX/XX N" ใน Control Plan = placeholder ไม่ใช่ตัวเลขจริง (ตัวจริงอยู่ P'Mean + Master Matrix)
- **ทำทันทีไม่ต้องถาม:** Citadines minimums → docs reference · checklist ทนาย += หัก ณ ที่จ่าย/VAT/PDPA · design 2 สัปดาห์/ขั้น + effort weights → docs · Blum/System-32 vault specs = source ให้ MONOLITH (backlog)
- **Consequences:** 0143 (Q1–Q3) + 0144 (Q4) + housekeeping commit + docs; kit product-only เดิมคงเขต R-3 ทุกตัว (ยืนยันรอบ 3: retainage/RIBA/draw/sales-pipeline/WIP ไม่เข้า)

## ADR-051 — Reconcile รอบ 4 (C17 competitor deep-dives ×10): Package Estimating v1 + ยืนยันเขตแดน billing

- **Status:** Accepted (owner "ก" ทั้ง 2, 8 ก.ค. 2026 — delta sweep 13 รายงาน)
- **Decision:**
  1. **Q1 Package Estimating v1 (Costimator pattern)**: ประเมินต้นทุน package จาก **ชั่วโมงต่อขั้นผลิต (7–10) × เรทแรงงาน + วัสดุจาก BOM + machine allowance** → estimated_cost อัตโนมัติ (แทนกรอกมือ 0129) + **calibration view** เทียบ estimate vs actual สะสมต่อ package ที่จบ — ข้อมูลโตเอง ไม่สัญญาว่าเป็น AI (pattern matching v1); **ห้าม copy สูตร MTI/Costimator — library สร้างจากเรทจริง DAPH**; เรทไม่มี = fail-safe no-guess
  2. **Q2 เอกสาร/เขตแดน**: pattern spine 3 ข้อ (ID-chain / revision-as-delta ✓ VO ตรงแล้ว / claim boundary) + MONOLITH backlog (overlay-diff revision QA · manifest checksum ID-chain · claim เฉพาะ machine profile ที่ verify) ลง REFERENCE doc · **QuickBooks/Buildertrend/Dynamics(ส่วน ERP) = product-only ยืนยันรอบ 4** (retainage/WIP/draw/pipeline) · เติม C17 ลง README-STATUS ของ kit (doc-sync gap)
- **ปัดตก/ครอบคลุมแล้ว:** Cabinet Vision chain = MONOLITH มีแล้ว · takeoff pre-layer = BOM จาก CAD ดีกว่า · assembly-pricing-unit + catalog versioning = v2 ภายหลัง (rate_version มีแล้ว) · Bord ต้อง re-verify (403) ก่อน claim ฝั่งโปรดักต์
- **Consequences:** 0145 (package_estimates + rpc estimate/calibration — rebase estimated_cost path 0129) + docs + kit README-STATUS

## ADR-052: C18 ราคากลางบิลท์อินไทย — market bands + กติกาวัสดุพื้นที่เปียก (2026-07-08)

**บริบท**: C18 (Thailand Built-In Furniture Pricing Research) + รายงานฉบับยาวจากเจ้าของ: ตารางราคาตลาดต่อเมตรวิ่ง/ตร.ม. แยกหมวด×เกรด, hidden costs (ดำเนินการ 10% / VAT 7% / ตจว. +20%), ข้อเท็จจริงวิศวกรรม PB ในพื้นที่เปียกพัง 1–3 ปี, spec lock ถึงรหัสสินค้า, E1/E0. ระบบเดิมมี price_rates (ตร.ม.×เกรด กรอกเอง) + Package Estimating 0145 แต่ไม่มี "กรอบตลาด" เทียบเลย

**มติ (ก ทั้งสอง)**:
- **Q1 market bands เข้าเครื่องยนต์ราคา**: ตาราง `market_price_bands` (หมวด×เกรด×หน่วย m/sqm → min/max + source + effective_date) seed จาก C18; อัปเดตผ่าน rpc (governance) ไม่แก้ migration; hook 2 จุด — price_estimate (SJ) แนบ band + hidden-cost reminder (เตือน ไม่ block), estimate_package (B4) ใส่ band category + ความยาวเมตร → ต้นทุน/เมตรชน/เกินกรอบราคาขายตลาด → เตือน+audit (band = sanity, เรทจริง DAPH คือความจริง)
- **Q2 กติกาพื้นที่เปียก hard rule**: cabinet & wall list ชิ้นที่ระบุห้องครัว/ห้องน้ำ + โครง PB/พาร์ติเคิล/MDF ธรรมดา (ไม่ใช่ HMR) → **block** ต้อง HMR/ไม้อัด/พลาสวูด (แบบเดียวกับ material SEV 10); CONTRACT-REVIEW-CHECKLIST เพิ่มแถว 12 "ล็อกสเปกถึงรหัสสินค้า (โครง/ฟิตติ้ง/ลามิเนต)" + แถว 13 "มาตรฐาน formaldehyde E1/E0"

**ปัดตก**: ราคากลางครุภัณฑ์รัฐ + Factor F (ไม่ประมูลงานราชการ — เปิด ADR ใหม่ถ้าวันหนึ่งรับ) · งวด 20/30/30/20 (มี payment plan แล้ว) · design fee models (SJ มีสคริปต์+investment doc) · ราคาฟิตติ้งปลีกรายชิ้น (BOM ใช้ราคาซื้อจริง)

**Consequences**: 0147 (market_price_bands + seed C18 + rpc set/list + rebase price_estimate 0115 / estimate_package 0145 6-param / cabinet_wall_list 0144) + docs (REFERENCE C18 + checklist 12/13)

## ADR-053: Market Outlook 2569 — reconcile 2 รายงานตลาด + segment cheat sheet ทีมขาย (2026-07-08)

**บริบท**: เจ้าของส่งรายงานตลาดบิ้วอิน 2569 สองฉบับ (ยังไม่เข้า kit เป็นไฟล์) — ตัวเลขขัดกันแรง (ลูกค้า 65–80k vs 250k, ตลาด 33,984 ล. vs 12–18k ล.) แต่ reconcile ได้: คนละ funnel/scope; สัญญาณตรงกัน: โซนโต = <3 ล้าน + รีโนเวท, โซนหด = Luxury, supply บ้านใหม่จะแห้ง 2570–71 (ใบอนุญาต −50–71%), ไม้ +3–5%, E0/E1 ยอมจ่ายเพิ่ม 8–15%, smart add-on +10–25% ticket

**มติ (ก ทั้งสอง)**:
- **Q1**: `docs/MARKET-OUTLOOK-2569.md` ฉบับ reconcile — เอกสารตัดสินใจของเจ้าของ (funnel 2 ชั้น, pocket, กลยุทธ์ 4 ทาง) + ลิงก์จาก REFERENCE
- **Q2**: เพิ่ม "segment cheat sheet" เข้า sale_scripts (0149): Mass/Mid/Luxury — งบคาด + จุดเน้น + ประโยคชวนคุย + กติกา "งบต่ำกว่าเกณฑ์ = เสนอ package เล็ก ไม่ปฏิเสธ"

**ปัดตก**: อัปเดต market_price_bands จากรายงานนี้ (หยาบกว่า C18, ไม่ขัด — อัปเดตผ่าน rpc เมื่อยืนยันจริง) · pipeline/forecast ยอดขาย (R-3) · smart add-on / E0 product line = ทางเลือกธุรกิจ รอเจ้าของตัดสินใจค่อยเปิด ADR ฟีเจอร์

**Consequences**: docs/MARKET-OUTLOOK-2569.md + 0149 (sale_scripts append, idempotent guard)

## ADR-054: กลยุทธ์ 2569 — Renovation-first + Smart add-on + E-grade (2026-07-09)

**บริบท**: grill กลยุทธ์จาก MARKET-OUTLOOK-2569 (ADR-053) — เลือกทางที่ขายจุดแข็งที่ระบบมีแล้ว (ความน่าเชื่อถือ/หลักฐานครบ) ไม่ใช่สร้างสนามใหม่

**มติ (ก ทั้งสาม)**:
- **Q1 Renovation-first เป็นแกน + Mid sweet spot** (Mass = เมนูรอง via cheat sheet 0149, Luxury รับที่เดินเข้ามา): เหตุผล — supply บ้านใหม่แห้ง 2570–71, รีโนเวทใหญ่กว่า 2–3 เท่า, ลูกค้ารีโนเวทกลัวช่างทิ้งงาน = จุดแข็งเรา · ระบบ: project_type (new_build/renovation) + survey รีโนเวทบังคับเช็คสภาพเดิม/ไฟเก่า/ขอบเขตรื้อ (กัน hidden_condition VO) + referral card หลังจบบ้าน 30 วัน (ต่อ after-sales sweep)
- **Q2 Smart add-on catalog**: 3 ตัวเริ่ม (ไฟ sensor ตู้ / soft-close อัปเกรด / smart lock) ราคามาตรฐานในระบบ ผูก package → SJ เสนอ upsell — ticket +10–25% ไม่เพิ่มงานไม้
- **Q3 E-grade บังคับใน cabinet & wall list**: ไม่ระบุ → เตือน+audit · **E2 → block** (Nakhara: 4/5 เกินเกณฑ์ WHO; แบบเดียวกับ wet-area rule) + สคริปต์ขายสุขภาพเข้า sale_scripts (premium 8–15%)

**ปัดตก**: B2B developer kit (margin ต่ำ+ผูก supply ที่แห้ง) · Luxury push (ตลาด −14.9%)

**Consequences**: 0150 (project_type + survey renovation gate rebase 0142 + referral rebase fn_after_sales_sweep 0130 + tpl_referral + addon_catalog/package_addons + cabinet_wall_list rebase 0148 e_grade + sale_scripts health) + UI (NewProject toggle, SurveyHome, DesignerToolsPanel, PackagePanel)

## ADR-055: Turnkey <3M productized + lead source attribution (2026-07-09)

**บริบท**: รายงาน Turnkey Package คอนโด <3M (Gen Y/Z: Perceived Value R²=.746, Time-based Risk = ตัวยับยั้งหลัก; ช่องว่างตลาด 80–200k ระหว่าง SB กับ Richmont's) — เสริม ADR-054 ไม่ขัด (Renovation-first ยังเป็นแกน; รายงานเองชี้หนีไป resale+rental เมื่อ permit −71%)

**มติ (ก ทั้งสาม)**:
- **Q1 turnkey_offers catalog** 3 tier (Starter 55k/21วัน/ประกัน 5ปี · Standard 100k/30วัน/10ปี · Plus 175k/45วัน/15ปี — ราคากลาง เจ้าของแก้ผ่าน rpc): attach เข้าบ้าน → **stamp ราคา+วันส่งมอบสัญญา (promised_date)+scope snapshot** ลง audit — ตอบ Time-based Risk; ห้าม attach ซ้ำหลังสัญญาเซ็น; upsell ต่อด้วย addon_catalog 0150
- **Q2 lead_source** บน line_oa_conversations (developer/agent/tiktok/facebook/line_organic/referral/walk_in) + list_leads rebase 0130 + sales_summary rebase 0119 เพิ่ม by_source (สะสม: total/lost/converted) — เส้น R-3: attribution ได้ / pipeline board+forecast ไม่ทำ
- **Q3 docs/TURNKEY-PLAYBOOK.md** เล่มธุรกิจ (tier/COGS 55–65%/unit economics/ช่องทาง 3 ทาง + ค่าคอม/roadmap 90 วัน/KPI ปี 1/แผนที่คู่แข่ง)

**ปัดตก**: agent commission ledger (รอมี agent จริง — การเงินห้ามเดาล่วงหน้า) · TikTok/CRM tooling (นอก IIMOS) · modular grid SKU + 3D configurator (MONOLITH backlog) · เฟอร์ลอยตัว/เครื่องใช้ไฟฟ้า (เข้า BOM เดิมได้)

**Consequences**: 0151 + docs + UI (SaleHome source picker / SalesSummary by_source / ProjectDetail TurnkeyCard)

## ADR-056: C18–C20 release train delta — marketing claim guardrails (2026-07-09)

**บริบท**: kit ปล่อย release train C18–C20 (workbook pricing integration / platform export pack / social launch kit / hygiene / DOCX QA 36 ไฟล์) — เกือบทั้งหมดฝั่งโปรดักต์; ตรวจแล้ว kit+archive อยู่นอก git repo, Linden ถูก quarantine ใน _non_customer_archive ✓; C18 workbook ("research = assumption + re-quote gate") align กับ ADR-052 ไม่ขัด

**มติ (ก ทั้งสอง)**:
- **Q1**: 【claim guardrails การตลาด】เข้า sale_scripts (0152) + เส้นแดง TURNKEY-PLAYBOOK — บังคับก่อนยิง TikTok/Facebook (roadmap ADR-055 เดือน 2): ✅ ราคานิ่ง/วันส่งมอบที่ audit ยืนยันได้ · E0/E1 ตามสเปกจริง · before/after ที่ลูกค้า consent (PDPA แถว 10) / ⚠️ ตัวเลขภายใน·เทียบคู่แข่งระบุชื่อ / ❌ ปลอดสาร 100% · ถูก/เร็วสุดในตลาด · โชว์แอปเป็นจุดขายถ้าลูกค้ายังไม่ได้ใช้จริง · asset คู่แข่ง (Linden ห้ามเด็ดขาด)
- **Q2**: REFERENCE บันทึก delta (C19/C20 = ชั้นโปรดักต์ ไม่แตะ IIMOS) + **ปัดตก material multiplier calculator** — factor สมมติของ kit แพ้ calibration จากงานจริง (0146) เสมอ

**Consequences**: 0152 (sale_scripts guard marker) + docs 2 จุด

## ADR-057: MONOLITH Bridge เฟส 1 (2026-07-09)

**บริบท**: เจ้าของถามเรื่องลิงก์ ERP — เลือก (ก) เฟสเริ่ม: deploy + deep link + cutlist/BOM เข้าระบบอัตโนมัติ (ไม่เอา (ข) manifest checksum เต็มระบบ — แต่พบว่า FactoryPacket ของ MONOLITH มี contentHash SHA-256 อยู่แล้ว จึงเก็บ hash ลง audit ฟรี = ID-chain เริ่มเดิน)

**มติ (ก)**:
1. **0153 rpc_bridge_import_cutlist**: MONOLITH ส่ง cutlist (aggregate ตาม material) เข้า package_materials — resolve บ้านผ่าน work_item_id, สร้าง package อัตโนมัติถ้ายังไม่มี (reuse rpc_field_create_package), dedupe ตามชื่อวัสดุ, idempotent ด้วย client_key, **content_hash ลง audit** (bridge_cutlist_imported)
2. **MONOLITH sender**: src/bridge/iimosBridge.ts — buildBridgePayload(packet, workItem, code) + sendCutListToIimos (pure + unit test; ยังไม่ผูก UI — รอ auth story ฝั่ง MONOLITH เฟสถัดไป)
3. **Deep link รับเข้า**: App.tsx อ่าน ?work_item= → sessionStorage (ปุ่มจาก DesignerHome ทำงานเมื่อตั้ง VITE_MONOLITH_URL)
4. **Deploy**: ถ้า root build ผ่าน → Pages เดียวกัน 2 แอป (field-app ที่ root + MONOLITH ที่ /monolith/) + ตั้ง VITE_MONOLITH_URL

**ขอบเขตที่ไม่ทำเฟสนี้**: MONOLITH auth + ปุ่มส่งใน UI (เฟส 2) · overlay-diff revision QA · DXF/G-code sync

**Consequences**: 0153 + src/bridge/ + App.tsx param + CI (ตามผล build)

## ADR-058: MONOLITH Bridge เฟส 2 — ปุ่มส่ง cutlist ใน UI + auth (2026-07-09)

**บริบท**: เฟส 1 (ADR-057) วางท่อครบแต่ไม่มีปุ่มใน MONOLITH — เจ้าของสั่งเปิดเฟส 2 หลังเห็น E2E

**มติ**:
- **Auth = reuse session Field App**: บน Pages ทั้งสองแอปอยู่ origin เดียวกัน (/iimos-workspace/ + /monolith/) → localStorage แชร์กัน — ดีไซเนอร์ล็อกอิน Field App ครั้งเดียว MONOLITH หยิบ session (sb-*-auth-token) ใช้เอง **ไม่ต้องสร้างหน้า login ใหม่**
- **IimosBridgeButton** ใน header: อ่าน session + work_item (deep link/พิมพ์เอง) + รหัส package → สร้าง cutlist จาก cabinets ใน scene (buildCutListData) → **sha256 ของ cutlist JSON เป็น contentHash จริง** (crypto.subtle) → ยิง rpc_bridge_import_cutlist
- env MONOLITH build: VITE_SUPABASE_URL/ANON_KEY (Pages workflow ส่งให้ root build ด้วย)
- iimosBridge.ts refactor: แยก aggregation รับ PacketCutList ตรง (ใช้ได้ทั้งจาก packet และจาก scene)

**Consequences**: src/bridge/IimosBridgeButton.tsx + App.tsx header + workflow env + .env.local dev

## ADR-059: Naming — IIMOS คือชื่อเก่า ระบบชื่อ MONOLITH เท่านั้น (2026-07-09)

**บริบท**: เจ้าของแจ้ง — เดิมระบบชื่อ IIMOS แต่คล้าย **imos AG** (CAD/CAM เฟอร์นิเจอร์เยอรมัน) จึงรีแบรนด์เป็น MONOLITH; ซากชื่อเก่ากระจายอยู่ทำให้เข้าใจผิดว่าเป็นสองระบบ

**มติ (ข — ทำทั้งสองระดับ)**:
- **นิยาม**: MONOLITH = Manufacturing OS ทั้งก้อน; ส่วนย่อยเรียก "Designer Workspace" (CAD/CAM/gate/CNC) + "ระบบหน้างาน / Field App" — ห้ามใช้ IIMOS ในเอกสาร/หน้าจอ/ชื่อใหม่
- **ระดับ 1 user-facing**: title → "MONOLITH Designer Workspace" · ปุ่ม bridge → "🌉 ส่งเข้าหน้างาน" · ข้อความ panel
- **ระดับ 2 โครงสร้าง**: repo GitHub iimos-workspace → **monolith-workspace** · path ย่อย /monolith/ → **/designer/** (สื่อความหมายถูก: designer workspace ใต้ MONOLITH) · ตามแก้ลูกโซ่: Pages base path, VITE_MONOLITH_URL, LINE Login callback URL, docs/memory · ไฟล์ bridge iimos* → fieldBridge*

**Consequences**: index.html, src/bridge/*, App.tsx, workflow, gh repo rename + secrets, LINE console callback

## ADR-060: Factory State Server — หลุมที่ทำให้ Designer "ทำงานจริงไม่ได้" (2026-07-09)

**บริบท**: เจ้าของลองใช้จริงแล้วติดตาย — grill รอบ 15 พบราก: สถาปัตยกรรม P11.1 "Server-only authority" ให้ Freeze/Release/Export ผ่าน factory server (localhost:3001) ซึ่ง**ไม่เคยถูกสร้าง** → ทุกงานติด DRAFT ตลอดกาล, Export to CNC block ตลอดกาล, กด Freeze แล้วเงียบ (intent เข้า queue offline)

**มติ**: สร้าง factory server บน stack ที่มีอยู่ — **Supabase Edge Function `factory-api` + Postgres (0155)**:
- ตาราง factory_jobs (spec_state DRAFT/FROZEN/RELEASED + revision_id + anchors + timestamps) + factory_job_events (ทุก transition ลง event)
- rpc_factory_job_state / rpc_factory_job_transition (freeze|release|revoke — validate state machine ใน SQL, gen revision id) / proof bundle (P12) — service_role only, edge fn เป็นคนเรียก
- endpoints ตรง contract stateApi.ts: /api/factory/jobs/:id/{state,freeze,release,revoke,can-export,proof} + /api/health + CORS
- client: stateApi ใช้ VITE_FACTORY_API_BASE + แนบ session token จาก readFieldSession (ต้องล็อกอิน Field App ก่อน — align ADR-058)
- can-export = FROZEN หรือ RELEASED (ตาม gate message)
- dev: supabase functions serve · prod: deploy + env ใน Pages workflow

**Consequences**: 0155 + supabase/functions/factory-api + stateApi patch + env

## ADR-061: Connector Density เป็นตัวเลือกผู้ใช้ + roadmap Connector OS เต็มตัว (2026-07-10)

**Context**: S16 ต่อ Connector OS เป็นผู้ตรวจ drill map สำเร็จ — audit จับว่าตู้ default วาง Minifix ห่าง 243mm เกินมาตรฐาน AWI Premium (128mm) ตามกติกา CAD เดิม (≤400→2, >400→3 ตัว/joint) การถี่ขึ้น = แข็งแรงขึ้นแต่ต้นทุนฮาร์ดแวร์เพิ่ม — เป็นการตัดสินใจเชิงพาณิชย์ ไม่ใช่ถูก/ผิดทางวิศวกรรม

**มติ owner (10 ก.ค. 2026)**:
1. **ความถี่ Minifix = ตัวเลือกผู้ใช้** เพื่อตัดสินใจกับลูกค้า — สองโปรไฟล์:
   - `CAD_STANDARD` (default): กติกา CAD เดิม — ประหยัด; spacing เกิน AWI รายงานเป็น **INFO** (เลือกเองโดยตกลงกับลูกค้า)
   - `AWI_PREMIUM`: generator วางให้ gap ≤128mm (count = max(CAD, ceil(span/128)+1) กระจายสมมาตร); เกิน = WARNING
   - เก็บใน useDrillMapStore (persisted `drill-map-settings`) · UI selector ใน ConnectorManager (แท็บ Hardware→Connectors) · จำนวน connector ไหลเข้า packet/BOM อัตโนมัติเพราะ drill map เป็นต้นทาง
2. **เห็นชอบ scope ใหญ่ 2 เรื่อง (ลุยต่อ)**:
   - **Compiler เป็นตัวสร้างรูแทน generator เดิม** (`emitToOpNodes`) — ทำแบบ staged: shadow mode เทียบ output compiler vs generator บนตู้จริงก่อน สลับเมื่อ parity 100%
   - **FactoryApp dashboard backend** — เพิ่ม endpoints jobs list/detail/activity ใน factory-api (จาก factory_jobs/events) + client แนบ auth headers

**Consequences**: generateDrillMap `connectorDensity` option + `computeConnectorCountForDensity` · useDrillMapStore.connectorDensity + setter · Cabinet3D ส่ง option · ConnectorDensitySelector ใน ConnectorManager · runConnectorOsAudit รับ density → severity ตามโปรไฟล์ · SafetyPanel ส่ง density; พิสูจน์สด: CAD → 8 INFO / AWI → All checks passed (5 ตัว gap ~121mm); tests +15

## ADR-062: Floor Plan Import — ก+ข แบบไม่ทิ้ง human-in-loop (2026-07-10)

**Context**: claim สาธารณะบอกรองรับ import image/PDF/DWG/DXF + AI detect walls/doors/windows — ตรวจแล้ว**ไม่มีจริงสักส่วน**; ของจริงคือ SiteSurveyZone verified field records + Designer parametric

**มติ owner**: ก+ข — แก้ claim ทันที และสร้าง import เป็น roadmap โดย**ไม่ทิ้งจุดแข็ง**:
1. **หลักเหล็ก (ทุก Phase)**: แปลนที่ import = **ร่างอ้างอิง/underlay เท่านั้น** ไม่ใช่ความจริง — ขนาดที่ใช้ผลิตต้องมาจากการวัดจริงหน้างาน (SiteSurveyZone verified record มีคนรับผิดชอบ) และ**คนต้องวัดเช็คจริงก่อนอนุมัติทุกขั้นตอน** — AI detect (ถ้าทำ) = เสนอร่างให้คนยืนยัน ไม่ auto-commit
2. **ก (เสร็จแล้ว — 0159)**: claim guardrail ใน sale_scripts: ห้าม claim import/AI detect; ใช้เรื่องจริง accuracy-first แทน ("ไม่เดาจากแปลนเก่า — วัดจริงทุกโซน")
3. **ข roadmap (Phase FP)**: FP-1 image/PDF underlay ในฉาก Designer (opacity/scale/lock — เบา คุ้มสุด) → FP-2 DXF import เป็น reference layer (parser เปิด) → FP-3 DWG (ต้องตัวแปลง — ประเมินก่อน) → FP-4 AI detect เป็นผู้ช่วยร่าง (ML scope ใหญ่ — ADR แยก + ROI ก่อน เพราะ SiteSurveyZone ตอบความแม่นอยู่แล้ว)

**Consequences**: 0159 (claim) + tasks Phase FP-1..4 backlog; import ทุกชิ้นต้อง label "REFERENCE — ไม่ใช่ขนาดผลิต" ใน UI

## ADR-063: FP-4 AI detect — Staged แบบ human-first (2026-07-11, มติ owner ก×5)

**Context**: FP-4 (AI detect walls/doors/windows) จาก ADR-062; ตรวจแล้วระบบไม่มี wall/room entity เลย — AI ตรวจได้ก็ไม่มีที่ลง

**มติ**:
1. **ผู้ซื้อปัญหา = Sale ตอนเสนอราคา** — เครื่องมือขาย (ลูกค้าเห็นตู้ในโครงห้อง 3D ตั้งแต่นัดแรก) ไม่แตะ manufacturing
2. **Staged**: FP-4a = wall tracing มือทับ underlay (reference room layer — คุณค่า 80% โดยไม่มี AI) → FP-4b = AI เสนอเส้นให้คนยืนยัน
3. **สมอง 4b = Claude vision ผ่าน API** — เงื่อนไข: เปิด cloud_allowed เฉพาะประเภท floor_plan (pattern ADR-033) + consent + model_provenance ลง audit ทุกครั้ง
4. **ROI gate**: เปิด 4b เมื่อการใช้ 4a จริง ≥ ~10 ครั้ง/เดือน — ต่ำกว่านั้นมือลากไม่กี่นาที ไม่คุ้ม
5. **v1 = visual-only**: ผนังอ้างอิงเป็นระนาบโปร่งให้เห็นตู้ในห้อง + ป้าย REFERENCE — ไม่ snap ไม่วัด ไม่เข้า estimate

**Consequences**: FP-4a ใน useUnderlayStore (walls + tracing) + ReferenceWalls canvas (render-only) + UI ใน UnderlayPanel; FP-4b เข้าคิวหลัง ROI gate ผ่าน


## ADR-065: ทิศทางธุรกิจ — Dogfood ขนาน S17 + shadow-mode Designer + gate ตัดจริง (2026-07-11, มติ owner ก×5)

**Context**: หลัง review PRD v5.1 (v3.1) + แผน S17 สามสายลงตัว เกิดทางแยกเชิงธุรกิจ: ทำ S17 ให้เสร็จก่อน (sequential) หรือเปิดใช้งานจริงขนานกันเลย — grill Q1-Q5 แล้ว owner ตอบ ก ทั้งห้า

**มติ**:
1. **Q1 — "ทดลองใช้งานจริง" รอบแรก = Business/Field dogfood**: เปิดบ้านจริง 1 หลังวิ่งเต็มสาย LINE→สัญญา→เงิน→ติดตั้ง→ตรวจรับ; **การผลิตใช้กระบวนการเดิมของโรงงาน** (ใบสั่งเดิม)
2. **Q2 — ขนานกัน**: dogfood เริ่มทันที // S17 วิ่งตามแผนสามสาย → S17 ปิดเมื่อไหร่ บ้าน dogfood ยกระดับเป็น controlled factory pilot ได้เลย
3. **Q3 — Designer = shadow mode**: ออกแบบ+Freeze+ออก packet ตามปกติ **ติดป้าย NOT-FOR-PRODUCTION** โรงงานตัดจากใบสั่งเดิม แล้วเทียบ packet กับของจริง = evidence ป้อน S17 จากงานจริงทุกใบ
4. **Q4 — มือทำ**: Claude = dogfood ops + support + แปลง session evidence เป็น CI artifact (งาน REVERIFY) · บัญชี AI A/B = S17 Track A/B บน clean worktrees · owner = custody + approvers + ลูกค้า/โรงงาน
5. **Q5 — Gate "ตัดจริง"**: S17 ครบ 5 + ADR-064 ลงชื่อครบ 4 + บ้าน dogfood ผ่านเต็มสาย ≥1 งาน + machine profile 1 ตัว calibrate กับโรงงาน
6. **มติเพิ่ม (จาก scrutiny v3.1)**: จุด branch Track A/B = **head ล่าสุดของ origin/main ณ เวลาเปิด worktree** แทน f9740559 ตายตัว — เงื่อนไข: ก่อนแตกต้อง verify ว่า delta จาก f9740559 เป็น docs/tasks เท่านั้น ถ้ามีโค้ดปนให้หยุดถาม owner

**เส้นแดงเส้นเดียว**: ห้ามตัดชิ้นงานจริงจาก packet จนกว่า S17 ปิด — คนละโดเมนกับการใช้ระบบรับลูกค้า/คุมงาน/เก็บเงิน

**Consequences**: dogfood ops เริ่มได้ทันที (P5 seeds, V1-V10, เปิดบ้าน); CI artifact pipeline = งานแรกของ Claude track; ADR-064 ยังรอ 4 ลายเซ็นตามเดิม

### Amendment CT-DEC-001: S17 baseline + separation of duties + CI evidence (2026-07-11)

**Authority**: มติมนุษย์จาก Tech Lead; ข้อ separation of duties และ S17-3 approval matrix ลงมติแยกบทบาท Tech Lead + Security Owner เอกสารเต็ม: `docs/governance/ct-dec-001-s17-baseline-governance.th.md`

1. **Operational baseline ของ Track A รอบนี้** = exact SHA `9ac7cff39d02d9430879275645e377728bc0abc5` บน clean worktree — แทนกติกา “latest origin/main” ของ ADR-065 เฉพาะการเปิด Track A รอบนี้
2. **ปลด Track A ทันที**: S17-1 → S17-2 เริ่ม implementation ได้ เพราะไม่พึ่ง packet contract; Track B implementation ของ S17-4/S17-5 ยังล็อกจน S17-3 อนุมัติครบ
3. **คงสามสายเดิม; ไม่สร้าง Track C**: S17-5 ต้อง implement และ review โดยฝ่ายที่อิสระจากผู้เขียน S17-3/S17-4 และ builder ห้าม approve งานตรวจของตนเอง
4. **CI classification** = `E0 CI PASS — scope-limited` ณ `9ac7cff3`: main run `29142280872`, branch `29142279488`, automated tests 4,553/4,553 + typecheck + build; exclusion ที่ต้องติดเสมอ = vault-builder invariants 2 ตัว local-only, ไม่มี DB/psql, ไม่มี E2E, ไม่พิสูจน์ deployment/operational readiness/P0 closure; archive อยู่ `docs/evidence/ci/9ac7cff3/`
5. **S17-3 approval matrix** = Tech Lead + Factory Owner + Security Owner โดย Security Owner ตรวจอย่างน้อย signature/trust boundary/key semantics
6. ใช้ decision IDs `CT-DEC-xxx`; คำเรียก unsigned Git baseline = **pinned/frozen + tamper-evident** ไม่ใช่ immutable

**ขอบเขตเดิมไม่เปลี่ยน**: ADR-064 ยังต้องครบ 4 บทบาท, ไม่มี P0 ใดปิดจาก amendment นี้ และห้ามตัดชิ้นงานจริงจาก packet จน gate สี่เงื่อนไขผ่าน


## ADR-066: Hosted/Prod Infra Ops = Human-Driven Only (2026-07-14, มติ owner ก หลัง prod incident)

**Context**: ระหว่างทำ S17 hosted-E0 (14 ก.ค.) เกิด **prod incident จริง 1 ครั้ง** (AI agent ขับ Supabase CLI เผลอ `link` prod แล้ว deploy factory-api ตัวใหม่ทับ prod ที่ DB ยัง 0161 -> factory-api prod พัง, rollback สำเร็จ) + **near-miss 2 ครั้ง** (guardrail default ชี้ Thai Curry Kitchen, agent `link` TCCK จะ unpause) — ทุกครั้งจาก AI agent pattern-match ชื่อ project ผิด (staging branch `wlivqsdgvwcjlbqqtcwt` เป็น Supabase branch ไม่โผล่ใน `projects list`)

**มติ (owner, ก)**:
1. **Hosted/prod infra ops = human-driven เท่านั้น** — deploy edge function, apply migration, `supabase link`, `db push`, unpause/resume, สร้าง/ลบ branch: มนุษย์กดเอง ห้าม AI ตัวใด (Claude/Codex/Control Tower) รัน Supabase CLI ใส่ environment ใด
2. **AI = verify + guarded tooling เท่านั้น** — เขียน guarded script (allowlist ref, reject prod/TCCK, ไม่ใช้ link), verify artifact ทุก byte/target แต่ execute เป็นมือมนุษย์
3. **Verify-don't-trust** — verify ทุก claim/banner ด้วยหลักฐานจริง (hash, target ref, git blob) ไม่เชื่อ "Deployed Functions."/"PASS" ลอย ๆ
4. **Guardrail บังคับ** — deploy staging ผ่าน `deploy-staging-guarded.mjs` (allowlist branch ref ตัวเดียว) ก่อน deploy verify linked ref + `s17-staging PREVIEW`
5. Supabase branch != project — target ที่ถูกต้องดูจาก Branch ID ใน dashboard ไม่ใช่ `projects list`

**Consequences**: hosted-E0 ที่เหลือ + S17-4/5/6 ทั้งหมดทำแบบ human-driven; guardrail+repro tooling committed ที่ `scripts/` (track-a); incident+rollback documented ใน `docs/evidence/hosted/s17-1-2/README.md`


## ADR-067: S17 Timeline Reality + Dogfood Resume + Key Custody Start (2026-07-14, มติ owner ก x4)

**Context**: milestone review 14 ก.ค. — S17-1/2 hosted-E0 เสร็จ, CT-DEC-002 v0.3 READY (รอ 3 ลายเซ็น), **แต่ S17-4/5 ยังไม่เริ่ม (ติดลายเซ็น) + S17-6 key ceremony ยังไม่เริ่ม + dogfood ยังไม่ยืนยันว่าเริ่ม** · เหลือ 11 วันถึง impl-deadline เดิม (~25 ก.ค.) → cut 4-6 ส.ค. = ตึงเกินจริง

**มติ (owner, ก x4)**:
1. **Q1 Dogfood เดินขนานทันที** — เปิดบ้านจริง, P5 seeds, V1-V10 กลับมาเดินคู่ S17 (ตาม ADR-065 เดิม) · shadow-mode Designer ป้อน evidence ให้ S17 ฟรี · ห้ามดริฟต์เป็น S17-only
2. **Q2 Re-plan pilot อย่างซื่อสัตย์** — 4-6 ส.ค. ตึงเกินจริง (S17-4/5/6 ยังไม่เริ่ม) → ตั้งวัน cut ใหม่ตาม dependency จริง **ห้ามบีบ verification/ceremony เพื่อรักษาวันเดิม** (ขัดกฎที่ตั้งเอง) · วันใหม่รอ owner + factory availability
3. **Q3 เริ่ม AWS KMS key custody เดี๋ยวนี้** — เป็น long pole/critical path จริง (S17-5 verify signature ไม่ได้ถ้าไม่มี key ceremony) · human-only, เริ่มขนานได้เลยไม่ต้องรอ Track B · ตามมติ custody เดิม (KMS/HSM non-exportable, Security Owner=Key Owner, PO+SecOwner joint create/rotate/revoke)
4. **Q4 คง SoD (builder != reviewer)** — พิสูจน์แล้วว่าจับ blocker จริง (re-review เจอของจริงหลายรอบ) · tighten ตาม ADR-066 (AI ห้ามแตะ infra)

**Consequences**: dogfood ops = งานคู่ขนานของ human track; re-planned timeline แทนที่ 4-6 ส.ค. (รอ owner ยืนยันวันใหม่); key custody kickoff = งานเร่งของ Security Owner + owner; Track B ยังรอ 3 ลายเซ็น CT-DEC-002 (`bf25b10f`)


## ADR-068: Factory Packet Signature = ECDSA P-256 on AWS KMS (2026-07-14, มติ owner ก-ก-ก)

**Context**: S17-6 key custody kickoff เปิดโปงว่า CT-DEC-002 v0.3 บังคับ **Ed25519** (`packet-attestation.schema.json` const + §10) แต่ **AWS KMS (custody ที่เลือกตามมติ) ไม่รองรับ Ed25519 signing** (รองรับ RSA / ECC_NIST_P256/384/521 / secp256k1) — spec sign บน custody จริงไม่ได้

**มติ (owner, ก-ก-ก)**:
1. **Q1: factory packet attestation signing = ECDSA P-256 บน AWS KMS** — non-exportable, FIPS 140-2 L3 HSM, joint-approval ผ่าน IAM · เหตุผลแกน: custody properties (non-exportable/HSM/joint-approval) สำคัญกว่าชื่อ algorithm; ECDSA P-256 แข็งเท่า Ed25519 และ KMS-native
2. **Q2: เฉพาะ factory packet เปลี่ยน** — receipt/release signing (`src/crypto/ed25519.ts`, `src/release/keys/*`) คง Ed25519 (คนละ trust domain, ทำงานอยู่) · unify ทีหลังถ้าจำเป็น · minimize blast radius
3. **Q3: amend CT-DEC-002 เดี๋ยวนี้ก่อนเซ็น** — ห้ามเซ็น spec ที่ implement บน custody จริงไม่ได้ · Control Tower (builder) แก้เป็น v0.4 → independent re-review รอบ 4 → แล้วค่อย 3-role sign-off

**Consequences**: CT-DEC-002 v0.3 (`bf25b10f`) superseded โดย v0.4 (Ed25519→ECDSA_P256 ใน §10 + schema const + signing preimage) · sign-off checklist regenerate สำหรับ v0.4 · S17-5 verifier ใช้ ECDSA verify · S17-6 KMS = ECDSA P-256 key · timing กระทบ re-plan (ADR-067) เล็กน้อย (~1-2 วัน amend+re-review)


## ADR-069 — Grill-me รอบแรก: ปลด critical path + ปิด owner-null ค้างสะสม (16 ก.ค. 2026, มติ owner ก ทุกข้อ)

- **Status:** Accepted (grill-me 16 ก.ค. 2026)
- **Context (verified):** session แรกของ `/grill-me` — harvest จาก specs/governance/PRs แล้ว verify ก่อนถาม: ตัดคำถามผี 3 ตัว (ledger_target = BUILT แล้ว 0066–0068 adapter #2 e2e-verified; hosting = ตัดสินแล้ว ADR-036; pricing 0.3 มี disposition "ก่อนเปิดขาย" อยู่แล้ว) · CT-DEC-002 v0.4 checklist ยัง `[ ]` ทุกข้อ = Track B LOCKED · PR #1 (integration, CI 8/8) + PR #2 (entitlement P1+2, CI เขียว) รอ owner · capture-spine owner nulls ค้างจริง 4 กลุ่ม · design-hub 0/10 ค้าง WO-0
- **Decision (owner, ก ทุกข้อ — 13 มติ):**
  1. **CT-DEC-002 v0.4 sign-off: เปิด session เลย** — AI เตรียม review pack ต่อบทบาท (Tech Lead / Factory Owner / Security Owner); owner ไล่ checklist เซ็นทีละบทบาทแยกกัน (AI ห้ามเซ็นแทน)
  2. **PR #1: owner review `.kiro` union 2 ไฟล์เอง + merge เอง** — ส่ง delta note ให้ Codex หลัง merge (owner = ratify authority)
  3. **PR #2: ratify SSOT v0.3.1 (L10 seat-floor, L11 grants) + v0.3.2 (F5 org_id hook, F6 billing RPCs) + merge**
  4. **Pilot window: dependency-first** — ล็อกวันเมื่อ (1) CT-DEC-002 ครบ 3 ลายเซ็น (2) S17-4/5 มี estimate จริง (3) owner ยืนยัน factory slot — ห้ามบีบ verification เพื่อรักษาวัน (คงหลัก ADR-067)
  5. **design-hub Phase 2: เลื่อนชัดแจ้ง** — trigger กลับมา = S17 ปิด + 2-sided signal จริง (waitlist/LOI) + legal review (ตรง exec research P2)
  6. **has_po: defer จนมี procurement module จริง** — `po_ref` = free-text provenance (เก็บครบ ตรวจย้อนหลังได้) ไม่สร้าง PO table เชิงทฤษฎี
  7. **Released_Spec target: defer-until-demand** — trigger = spec_draft ตัวจริงตัวแรกใน dogfood → ค่อย spike แนว reuse factory release seam (RELEASED/S17-2) ห้าม fork
  8. **MCP external exposure: ไม่เปิด** — capture เป็น internal loop จนกว่ามี use case จริง + design reconcile double-gate (MCP pending × capture verify)
  9. **auto-approve: ไม่เปิด** — คง verify-before-emit = 100% (System Guarantee) จนกว่า dogfood ให้ baseline volume/error จริง
  10. **OCR infra: dogfood เริ่มแบบคีย์มือ (ไม่มี OCR)** — trigger ยืน Typhoon = photo-capture volume เจ็บจริง → self-host บน VM ใต้เงื่อนไข bridge ADR-036 (weights ใน infra เรา ไม่มี third-party API; ตั้งโดยมนุษย์ตาม ADR-066)
  11. **Metering = calendar-month ถาวร** (ปิด design note v0.3.2) — เปลี่ยนเป็น billing-anchor ทีหลังได้ถ้ามี data ลูกค้า complain จริง
  12. **Entitlement พักที่ Phase 2** — schema+billing พร้อมขายระดับ DB แล้ว; trigger Phase 3 (app layer) = มติเปิดขาย/tenant นำร่องจริง; AI capacity ย้ายไป S17/dogfood
  13. **v0.4 delta: hold — v0.3 คง SSOT** — sitepm.* คือ availability ของเวอร์ชันขาย (roadmap ทั้ง 8) review พร้อม pricing 0.3 เมื่อใกล้เปิดขาย
- **Consequences:** งานถัดไปของ AI = CT-DEC-002 review pack (มติ 1) + delta note ให้ Codex (มติ 2) · merges เป็น human act ของ owner (มติ 2–3) · spec ledgers ที่กระทบ append มติแล้ว: capture-spine (มติ 6–10), design-hub (มติ 5), entitlement (มติ 11–13 — บน PR #2) · ไม่มีมติใด supersede ADR เดิม

## ADR-070 — Machine Onboarding: documented-profile first, bench verification ก่อนทำงานจริง (17 ก.ค. 2026, มติ owner)

- **Status:** Accepted (sign-off session CT-DEC-002, 17 ก.ค. 2026)
- **Context (verified):** CT-DEC-002 FO-5 เรียก "machine profile `kdt_mvp_v1` ตรงเครื่อง+controller จริง (ยืนยันจากโรงงาน)" แต่ DAPH กำลัง onboard เครื่องหลายตัว การถ่าย nameplate/เปิด About/จด tool table ทุกเครื่องทันทีเป็นไปไม่ได้และไม่จำเป็นต่อ Track B (implementation ไม่แตะเครื่องจริง) · owner ส่งมอบหลักฐานระดับเอกสารของเครื่องแรก (KDT KN-2409LP): capability assessment + owner-answered profile ที่ติดป้ายที่มาต่อค่าและประกาศ `PROHIBITED · NOT_ASSESSED` เองอย่างซื่อตรง — landed ที่ governance commit `765c326c2ea289d10688a4704a46335e60d6a152` ใต้ `docs/evidence/machines/kdt-kn-2409lp/` (manifest 6/6)
- **Decision (owner):** *"เอาตามนี้เลยครับ เราต้องใส่อีกหลายเครื่อง เป็นไปไม่ได้ที่จะถ่ายหน้าเครื่องทุกเครื่องในตอนนี้ ต้องทำงานเราไปก่อน ไว้วิศวกรอยู่หน้าเครื่อง แล้วให้เซ็ตให้อีกรอบก่อนทำงานจริง"* — แปลเป็นกติกา:
  1. **Onboard เครื่องด้วย documented profile ก่อน** — ต่อเครื่อง: assessment + profile (ป้ายที่มาต่อค่า: ยืนยันแล้ว/ตามเอกสาร/ต้องเช็กเครื่อง/ยังไม่รู้) ใต้ `docs/evidence/machines/<id>/` พร้อม sha256 manifest — ไม่ block งาน implementation
  2. **Bench verification โดยวิศวกรหน้าเครื่อง = hard gate ก่อนทำงานจริง** — ตาม Gate ในตัว assessment (nameplate/versions/tool table/origin/import/transfer/known-good job/simulation/dry-run/first-article/human acceptance)
  3. **FO-5 ใน sign-off = CONDITIONAL** ไม่ติ๊กเป็น "ยืนยันจากโรงงานแล้ว" — และไม่มีช่องหลุดสู่การตัดจริง เพราะ CT-DEC-002 §11.6 บังคับ "machine profile calibrated" เป็นเงื่อนไข real-cut อยู่แล้วอีกชั้น (ซ้อนกับ NFP/NO_CUT)
- **Consequences:** เครื่องถัดไปใช้ pattern เดียวกัน (โฟลเดอร์ต่อเครื่อง) · `kdt_mvp_v1` ได้หลักฐานทิศทาง KDT path ระดับเอกสาร (KDT/NCstudio/Weihong/`.nc`; ยังไม่ใช่ physical-machine verification) · งานวิศวกร bench session = รายการค้างระดับ human ก่อน pilot · FO signature ลงได้เมื่อ owner attest FO-1..FO-4 (spec semantics) โดย FO-5 ติดเงื่อนไขบันทึกชัด · เอกสาร ADR สองภาษา: `docs/governance/adr-070-machine-onboarding.{th,en}.{md,html}`

> **ADR-070 อัปเดต (17 ก.ค. เย็น, มติ owner ก×3):** เครื่องมือมาตรฐานของ pattern นี้ landed แล้ว — (1) **KDT Machine Intelligence Library 83 รุ่น** ที่ `docs/evidence/machines/kdt-library/` (ทุกรุ่น NOT_ASSESSED/PROHIBITED, manifest 691/691) + generator ที่ `tools/kdt-library-build/` (2) **fleet-onboarding-kit v1.1** — DOC_PROVISIONAL→ENGINEER_VERIFIED + interim P0/P1 โดย **P1 ห้ามตัดงานจาก MONOLITH packet ทุกกรณี** (ครอบเฉพาะงานกระบวนการเดิม) และ ENGINEER_VERIFIED = ปลด machine-level เท่านั้น (3) PDFs ต้นทาง third-party pin hash ไม่ commit (`kdt-primary-sources.th.md`) (4) เครื่องนำร่อง Daph ขยายเป็น 2: KN-2409LP + **KD-610R** · หลักฐาน FO-5 เดิม (`kdt-kn-2409lp/`) แช่แข็งไม่แตะ
