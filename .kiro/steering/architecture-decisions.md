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
