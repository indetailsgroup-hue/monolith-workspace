# Requirements Document

## Introduction

เอกสารนี้กำหนดข้อกำหนด (requirements) ของโมดูล **Workflow, Approvals & AI Copilot** สำหรับ DAPH Decor (ธุรกิจออกแบบตกแต่งภายใน / ผลิตเฟอร์นิเจอร์) ซึ่งเป็นโมดูลภายในองค์กรแบบข้ามแผนกบนแพลตฟอร์ม **Monolith** (Supabase / PostgreSQL) โมดูลนี้ทำหน้าที่เป็น **ชั้นกลางด้านสติปัญญาและการลงมือทำ (Intelligence + Action layer)** ที่เชื่อมชั้นความรู้ (Knowledge) เข้ากับชั้นการมีส่วนร่วม (Engagement) เพื่อให้พนักงานทำงานได้ลื่นไหล ป้อนข้อมูลน้อยที่สุด ได้รับการช่วยเหลือเชิงรุกแต่ไม่รบกวน อนุมัติได้ในคลิกเดียว และ **มนุษย์เป็นผู้ตัดสินใจเสมอ**

### สถาปัตยกรรมสามชั้น (Three-Layer Architecture)

โมดูลนี้วางตัวอยู่ระหว่างสองชั้นที่ส่งมอบแล้ว และต้องอ้างอิงสัญญา (contract) ของทั้งสองชั้นโดยไม่นิยามซ้ำ:

1. **ชั้นความรู้ (Knowledge layer)** — ผลลัพธ์จาก spec `daph-obsidian-second-brain` (Vault_Builder) ได้แก่ SOS / JES / PFMEA / Process Control Plan, โมเดลกระบวนการสามกลุ่ม (Office → Factory → Installation), Document Sets และ Master Process Matrix (RACI / เวลา / ต้นทุน) จากไฟล์ `สำหรับคุณชุ.xlsx` โมดูลนี้ **บริโภค (consume)** ข้อมูลความรู้ดังกล่าวในรูปแบบที่เครื่องอ่านได้ (machine-readable export) โดยเฉพาะแถวความเสี่ยงของ PFMEA (Process Step → Failure Mode → Cause → Control → RPN) โมดูลนี้ **ไม่** สร้างหรือแก้ไขความรู้ต้นทาง แต่ query จากสำเนา export เท่านั้น

2. **ชั้นการมีส่วนร่วม (Engagement layer)** — spec `line-oa-commerce` (Module B5) ที่ส่งมอบแล้ว โมดูลนี้ **นำกลับมาใช้ (reuse)** primitive ที่ส่งมอบแล้วโดย **ไม่นิยามซ้ำ** ได้แก่: ฟังก์ชันความปลอดภัย C12 (`public.current_app_roles()`, `public.has_any_app_role()`, `public.has_site_access()`, `public.is_governance_role()`, `public.resolve_actor()`, RLS แบบ `TO authenticated`, และ SECURITY DEFINER RPCs), D2 Autonomy Ladder สำหรับธรรมาภิบาล AI, LINE Flex / Postback_Data_Contract, การส่งข้อความแบบ Push / Reply, Message_Templates (slot-filling ที่ผูกกับเทมเพลต, ข้อความไทยน้ำเสียงอบอุ่น ≤ 200 ตัวอักษร) และรูปแบบ audit log แบบ append-only

3. **ชั้นกลาง (โมดูลนี้)** — ชั้นสติปัญญาและการลงมือทำที่ขับเคลื่อน workflow, การอนุมัติ, การแจ้งเตือน และ AI Copilot

### หลักการออกแบบที่อนุมัติแล้ว (Approved Design Baseline)

- **ลำดับการอนุมัติแบบไฮบริดตามความเสี่ยง/มูลค่า:** อนุมัติแบบร่างงานออกแบบ → หัวหน้าทีม Designer; ปล่อยงานเข้าผลิต → หัวหน้า Production Planning โดยหาก RPN ของ PFMEA สูง หรืองบประมาณวัสดุเกินเพดานที่ตั้งค่าได้ ให้ยกระดับไปยัง executive_owner; การจัดซื้อเกินงบ → executive_owner; เริ่ม/จบงานติดตั้ง → หัวหน้าทีม Installation พร้อมแจ้ง Sale/PM อัตโนมัติ
- **โมเดลการแจ้งเตือนแบบกันข้อมูลล้น:** งานที่เป็นความรับผิดชอบ/ต้องอนุมัติของบุคคล → push ส่วนตัวทาง LINE; การส่งต่องานข้ามทีม / FYI → LINE group ของแผนก; มี quiet hours + daily digest; ผู้ใช้ปิดเสียงหมวดการแจ้งเตือนได้ โดยเฉพาะงานความรับผิดชอบโดยตรงเท่านั้นที่ข้าม quiet hours ได้
- **การเข้าถึง JES/SOS ของทีมหน้างานแบบไฮบริด:** LINE rich menu แสดง "ขั้นตอนที่ต้องทำตอนนี้" + การถ่ายภาพ/เช็กลิสต์ พร้อม deep-link เข้า Obsidian สำหรับรายละเอียดเต็ม
- **Copilot แบบให้คำแนะนำเท่านั้น (advisory-only), มีมนุษย์ในวงจร (Human-in-the-loop), อยู่ภายใต้ D2 Autonomy Ladder:** ในแต่ละจุดตัดสินใจ Copilot เสนอ 2–3 ตัวเลือกพร้อมข้อดี/ข้อเสีย และอ้างอิงแหล่งที่มา (แถว PFMEA / RPN) เสมอ; ไม่ตัดสินใจเอง; งานความเสี่ยงสูงต้องผ่านมนุษย์; หากกลไกอนุมัติไม่พร้อมใช้งานให้บล็อกแบบ fail-safe; ทุกคำแนะนำของ Copilot เป็นเพียงคำแนะนำและถูกบันทึก log

### ขอบเขตและการพึ่งพา (Scope & Dependencies)

ทุกอย่างต้อง self-contained ภายในเวิร์กสเปซ `determined-williams` และสอดคล้องกับธรรมเนียมของแพลตฟอร์มใน `line-oa-commerce` ส่วนใดที่โมดูลนี้พึ่งพา `line-oa-commerce` หรือ `daph-obsidian-second-brain` ให้ระบุเป็น **dependency/assumption ที่ชัดเจน** แทนการนิยามสัญญาเหล่านั้นซ้ำ

## Glossary

- **Workflow_Copilot_Manager**: ระบบของโมดูลนี้ — เครื่องยนต์ที่จัดการ identity binding, การส่งต่องานตามกระบวนการ, การหาผู้รับผิดชอบ/ผู้อนุมัติ, การอนุมัติผ่าน LINE, การแจ้งเตือน, AI Copilot, audit และการควบคุมการเข้าถึง
- **Work_Item**: หน่วยงานหนึ่งชิ้น (เช่น โครงการลูกค้าหนึ่งงาน) ที่เคลื่อนผ่านขั้นตอนต่าง ๆ ของกระบวนการ มีสถานะและเจ้าของในแต่ละขั้น
- **Process_Step**: ขั้นตอนหนึ่งในกระบวนการ มีอัตลักษณ์ (identity) เป็น **`canonical_order`** (ลำดับ 0..n-1 ที่ derive จาก Knowledge_Export) โดยชื่อขั้น (`process_step`) เป็น **label ที่ซ้ำได้** (เช่น งานตรวจสอบใน Installation เกิดซ้ำหลายจังหวะ — ดู ADR-017). แต่ละ Process_Step เป็น sub-step ระดับละเอียด (Office step / Factory station / Installation task); การอนุมัติเกิดเฉพาะขั้นที่ `requiresApproval=true` ส่วนขั้น checklist ไปต่อด้วยการบันทึก Capture_Item
- **Sub_Process_Group**: กลุ่มกระบวนการย่อยหนึ่งค่าจากชุด {Office, Factory, Installation} ตามที่นิยามใน `daph-obsidian-second-brain`
- **Employee**: พนักงานภายในองค์กร DAPH Decor หนึ่งคน มีแผนกสังกัดและบทบาท (role) ตาม C12
- **Department**: หน่วยงานภายในองค์กร เช่น Sale, Area Measurement, Designer, 3D_Presentation, Production Planning, 3D_Rendering_Final, Factory, Installation, Purchasing
- **LINE_User_Id**: ตัวระบุผู้ใช้ LINE (ต่อ channel) ตามที่นิยามใน `line-oa-commerce`
- **Identity_Binding**: การผูกระหว่าง Employee หนึ่งคน (พร้อมแผนกและบทบาท C12) กับ LINE_User_Id หนึ่งค่า เพื่อให้ส่งการแจ้งเตือนถึงผู้รับผิดชอบที่ถูกต้อง
- **C12_Role**: บทบาทผู้ใช้ตามชั้นความปลอดภัย C12 ของ `line-oa-commerce` (เช่น `branch_manager`, `branch_operator`, `admin`, `operations`, `finance`, `executive_owner`)
- **Governance_Role**: C12_Role ที่อ่านข้ามทุก Site_Code ได้ (`admin`, `operations`, `finance`, `executive_owner`) ตามที่ `public.is_governance_role()` รับรอง
- **Branch_Role**: C12_Role ที่จำกัดเฉพาะบาง Site_Code (`branch_manager`, `branch_operator`)
- **Site_Code**: ตัวระบุสาขา/สถานที่ตาม A1 ของแพลตฟอร์ม ชุดที่ใช้ได้คือผลของ `public.get_active_site_codes()`
- **RACI_Map**: แผนผังความรับผิดชอบที่สกัดจาก Master_Process_Matrix (RACI = Responsible, Accountable, Consulted, Informed) ระบุว่าใคร/บทบาทใดรับผิดชอบหรืออนุมัติในแต่ละ Process_Step
- **Master_Process_Matrix**: เมทริกซ์กระบวนการ + เวลา + ต้นทุน + RACI ระดับบริษัทจากไฟล์ `สำหรับคุณชุ.xlsx` ที่ถูก export มาในรูปแบบที่เครื่องอ่านได้
- **Approver**: Employee ที่ถูกหาตัว (resolve) ให้มีสิทธิ์อนุมัติ Work_Item ในขั้นตอนหนึ่ง จาก C12_Role + RACI_Map — แหล่งผู้อนุมัติ: ขั้น `unanimous` ใช้ `approvers` array จาก RACI entry (เซ็ตหลายคน), ขั้น `first_response`/เดี่ยว ใช้ `accountable` (คนเดียว) — ดู ADR-018
- **Approval_Request**: คำขออนุมัติหนึ่งรายการที่ผูกกับ Work_Item, Process_Step, ผู้ขอ และ Approver ที่ถูกหาตัวแล้ว
- **Approval_Decision**: ผลการตัดสินของ Approver หนึ่งค่าจากชุด {approved, rejected} พร้อมเวลาและผู้ตัดสินที่หาตัวผ่าน `public.resolve_actor()`
- **Postback_Data_Contract**: โครงสร้าง payload ของ LINE postback ตามที่นิยามใน `line-oa-commerce` ใช้นำส่งการกระทำ (เช่น การกดอนุมัติ) กลับเข้าระบบ
- **Encrypted_Postback**: Postback_Data_Contract ที่ถูกเข้ารหัส/ลงนาม เพื่อกันการปลอมแปลงคำสั่งบนปุ่ม LINE
- **PFMEA_Risk_Row**: แถวความเสี่ยงหนึ่งแถวจาก PFMEA ในรูป Process Step → Failure Mode → Cause → Control → RPN ที่มาจาก Knowledge_Export
- **RPN**: Risk Priority Number (= SEV × OCC × DET) ค่าจัดลำดับความเสี่ยงใน PFMEA
- **RPN_Threshold**: ค่า RPN เกณฑ์ที่ตั้งค่าได้ ซึ่งเมื่อเกินแล้วถือว่าเป็นความเสี่ยงสูงและกระตุ้นการยกระดับการอนุมัติ
- **Budget_Ceiling**: เพดานงบประมาณวัสดุที่ตั้งค่าได้ ซึ่งเมื่อเกินแล้วกระตุ้นการยกระดับการอนุมัติ
- **Escalation**: การยกระดับการอนุมัติไปยังบทบาทที่สูงกว่า (เช่น executive_owner) เมื่อเข้าเงื่อนไขความเสี่ยง/งบประมาณ
- **Copilot_Suggestion**: ข้อเสนอเชิงให้คำแนะนำของ AI Copilot ประกอบด้วย 2–3 ตัวเลือก พร้อมข้อดี/ข้อเสีย และการอ้างอิงแหล่งที่มา (PFMEA_Risk_Row / RPN)
- **Autonomy_Tier**: ระดับความเสี่ยงตาม D2 Autonomy Ladder ที่กำหนดว่าการกระทำของ AI ดำเนินการอัตโนมัติได้หรือต้องผ่านมนุษย์
- **Notification**: ข้อความแจ้งเตือนที่ส่งทาง LINE หนึ่งค่าจากชุดช่องทาง {direct_push, group_message}
- **Notification_Category**: หมวดของการแจ้งเตือนที่ผู้ใช้สามารถปิดเสียง (mute) ได้ เช่น handoff, FYI, digest
- **Direct_Responsibility_Item**: การแจ้งเตือนที่เกี่ยวกับความรับผิดชอบหรือการอนุมัติโดยตรงของบุคคล ซึ่งข้าม Quiet_Hours ได้
- **Approver ref**: identity แบบ opaque ที่ใช้ใน `approval_request.resolved_approver` และ delegation — เป็น **app-role ref ตาม ADR-018** (จาก raciMap approvers[].ref/accountable) ไม่ใช่ email/uuid; การ map ref → LINE ทำผ่าน `identity_binding.app_role` (0084) — นิยามชัดหลัง scrutiny F6 กันเข้าใจผิดซ้ำ
- **Quiet_Hours**: ช่วงเวลาที่ตั้งค่าได้ซึ่งระงับการแจ้งเตือนที่ไม่ใช่ Direct_Responsibility_Item — **ค่าจริง (owner, grill-with-docs 6 ก.ค. 2026): 20:00–08:00 เวลาไทย** (ช่างทำงาน 08:00–17:00 ตามตาราง time-box); การคำนวณ `in_quiet_hours` ทำที่ dispatch path ฝั่ง DB (Asia/Bangkok) — เดิมเป็น boolean ที่ไม่มีใครคำนวณ (พบจาก grill)
- **Daily_Digest**: สรุปการแจ้งเตือนที่สะสมไว้ ส่งรวมเป็นครั้งเดียวตามรอบที่กำหนด — **ค่าจริง: ส่ง 08:00 เวลาไทย** (จบ Quiet_Hours พอดี — ทุกคนเปิดวันด้วยสรุปเดียว)
- **Field_View**: มุมมองบน LINE rich menu สำหรับทีมหน้างาน แสดง "ขั้นตอนที่ต้องทำตอนนี้" พร้อมการถ่ายภาพ/เช็กลิสต์
- **Capture_Item**: ภาพถ่ายหรือรายการเช็กลิสต์ที่ทีมหน้างานบันทึกผ่าน Field_View
- **Obsidian_Deep_Link**: ลิงก์ที่เปิดโน้ตรายละเอียดเต็ม (SOS/JES) ใน Obsidian Vault ของชั้นความรู้
- **Knowledge_Export**: ผลลัพธ์ที่ Vault_Builder ของ `daph-obsidian-second-brain` ปล่อยออกมาในรูปแบบ JSON/ฐานข้อมูลที่เครื่องอ่านได้ ประกอบด้วย PFMEA_Risk_Row, โมเดลกระบวนการ (Process_Step + ลำดับ) และ RACI_Map สำหรับให้โมดูลนี้ query
- **Workflow_Audit_Log**: ตาราง audit แบบ append-only ของโมดูลนี้ บันทึกทุก handoff, notification, approval และ Copilot_Suggestion โดยลบความลับ (secret) ออก
- **Approval_Mechanism**: กลไกที่ใช้บันทึกและยืนยัน Approval_Decision (RPC ฝั่งฐานข้อมูล + ช่องทาง LINE)
- **SLA_Deadline**: เวลาสูงสุดที่อนุญาตให้ Approval_Request รอการตัดสินใจ ก่อนถือว่าเกินกำหนด
- **Acting_Approver**: ผู้ได้รับมอบหมายให้อนุมัติแทน Approver เดิมชั่วคราว ภายในช่วงเวลาที่กำหนด
- **Approval_Quorum**: กติกาการรวมผลอนุมัติจาก Approver หลายคน หนึ่งค่าจากชุด {unanimous, majority, first_response}
- **Knowledge_Freshness**: สถานะความสดใหม่ของ Knowledge_Export ประกอบด้วย source_version, imported_at และ review_status ต่อแหล่งความรู้
- **Delivery_Failure**: เหตุการณ์ที่ Notification ไม่สามารถส่งได้สำเร็จหลังพยายามส่งซ้ำจนครบจำนวนครั้งที่กำหนด
- **Action_Type_Registry**: ทะเบียนที่ผูกแต่ละ Action_Type (operation ที่ธรรมาภิบาลต้องการคุม) เข้ากับ `risk_class` ∈ {low, medium, high}, `max_allowed_tier` ∈ Autonomy_Ladder_Tier และ `r02_bound` (boolean) ใช้เป็นแหล่ง classify ความเสี่ยง/เพดาน autonomy ของการกระทำ AI/Copilot (ไม่ hardcode)
- **Autonomy_Ladder_Tier**: ระดับเพดานความเป็นอิสระของการกระทำตาม D2 Autonomy Ladder หนึ่งค่าจากชุด {L0_advisory, L1_propose, L2, L3} โดยใน Phase นี้ใช้เพื่อ classify/label เท่านั้นและจำกัดที่ L0_advisory/L1_propose (ไม่มี auto-execute)
- **Customer_Approver**: ลูกค้าของโครงการที่ได้รับสิทธิ์อนุมัติแบบ project-scoped ผ่าน `line_oa_customer_identity` (canonical customer_id) โดย **ไม่** มี App_Role/Site_Access และ **ไม่** เป็น DB principal; `primary_customer_approver` = ผู้เซ็นสัญญา 1 คนต่อโครงการ
- **Revision_Reason**: เหตุผลของการแก้แบบหนึ่งค่าจากชุด {daph_defect, customer_change, scope_change} — `customer_change` นับเข้า threshold, `daph_defect` เข้า QA_Metric (ไม่นับ), `scope_change` เข้า re-quote path
- **Design_Lock**: การล็อก baseline ของแบบเป็นชั้นตาม gate {G1, G2, G3 (customer), G4 (internal)} ตาม `design_lock_field_config`; ปลดได้เฉพาะผ่าน approved scope_change เท่านั้น (no silent unlock)
- **Scope_Change**: การเปลี่ยนแปลงที่แตะ field ซึ่งถูก Design_Lock ที่ gate ก่อนหน้าแล้ว → ต้องผ่าน re-quote approval (Project_Manager + executive_owner) ก่อนดำเนินต่อ; ต่างจาก revision (ฟรี 1/gate, ไม่คิดเงิน)
- **QA_Metric**: ตัวชี้วัดคุณภาพภายในที่สะสมอัตรา `daph_defect` ต่อทีม/Process_Step เพื่อกันการ under-report (PM ซ่อน daph_defect เป็น customer_change)

## Requirements

### Requirement 1: การผูกอัตลักษณ์พนักงานกับ LINE และบทบาท C12 (Identity Binding)

**User Story:** ในฐานะผู้ดูแลระบบ ฉันต้องการผูกพนักงานภายในแต่ละคนและแผนกเข้ากับ LINE_User_Id และบทบาท C12 เพื่อให้การแจ้งเตือนและคำขออนุมัติไปถึงผู้รับผิดชอบที่ถูกต้องเสมอ

#### Acceptance Criteria

1. WHEN ผู้ดูแลระบบสร้าง Identity_Binding ระหว่าง Employee หนึ่งคนกับ LINE_User_Id หนึ่งค่า, THE Workflow_Copilot_Manager SHALL บันทึก Identity_Binding พร้อม Department และ C12_Role ของ Employee นั้น
2. THE Workflow_Copilot_Manager SHALL บังคับความไม่ซ้ำของ LINE_User_Id ต่อหนึ่ง Identity_Binding ที่ยังมีผล (active)
3. THE Workflow_Copilot_Manager SHALL หาบทบาทของ Employee ผ่าน `public.current_app_roles()` ของ C12 แทนการเก็บบทบาทซ้ำเป็นแหล่งความจริงของตนเอง
4. IF มีการอ้างถึง Employee ที่ยังไม่มี Identity_Binding ที่มีผลในขณะต้องส่ง Notification, THEN THE Workflow_Copilot_Manager SHALL ยกระดับ Notification นั้นไปยังหัวหน้าแผนกที่มี Identity_Binding ที่มีผล **ทันที** และ SHALL บันทึกทั้งความล้มเหลวในการส่งต้นฉบับ (original delivery failure) และเหตุการณ์การยกระดับ (escalation) ลง Workflow_Audit_Log โดย SHALL ไม่บล็อกหรือพักการแจ้งเตือนต้นฉบับไว้ในคิวเพื่อรอการตั้งค่า Identity_Binding (ไม่ block/queue รอการ setup)
5. WHEN Identity_Binding ถูกเพิกถอน (revoke), THE Workflow_Copilot_Manager SHALL หยุดส่ง Notification ส่วนตัวไปยัง LINE_User_Id นั้นทันที โดยไม่คำนึงว่าระเบียน Identity_Binding จะยังแสดงสถานะ active อยู่ในฐานข้อมูลหรือไม่
6. THE Workflow_Copilot_Manager SHALL หาตัวผู้กระทำของการสร้างหรือเพิกถอน Identity_Binding ผ่าน `public.resolve_actor()` และบันทึกลง Workflow_Audit_Log

### Requirement 2: เครื่องยนต์ส่งต่องานตามโมเดลกระบวนการสามกลุ่ม (Process Handoff Engine)

**User Story:** ในฐานะผู้จัดการโครงการ ฉันต้องการให้ Work_Item เคลื่อนผ่านขั้นตอนจริงของกระบวนการตั้งแต่ Sale จนถึง Installation โดยมีสถานะและเจ้าของชัดเจนในแต่ละขั้น เพื่อให้ทุกคนรู้ว่างานอยู่ที่ใครและขั้นใด

#### Acceptance Criteria

1. THE Workflow_Copilot_Manager SHALL กำหนดลำดับ Process_Step ของ Work_Item ตามโมเดลกระบวนการสามกลุ่มของ `daph-obsidian-second-brain` คือ Sale → Area Measurement → Designer → 3D_Presentation → Production Planning → 3D_Rendering_Final → สถานี Factory → Installation และ SHALL บังคับให้ Work_Item เคลื่อนตามลำดับนี้แบบทีละขั้น (step-by-step) ตามลำดับที่กำหนดอย่างเคร่งครัด สอดคล้องกับการส่งต่อไปขั้นถัดไปใน Acceptance Criteria ข้อ 3 และการปฏิเสธการข้ามขั้นใน Acceptance Criteria ข้อ 5 — **อัตลักษณ์ของ Process_Step คือ `canonical_order`** และลำดับ canonical ที่บังคับจริงคือลำดับ sub-step เต็มจาก Knowledge_Export (Factory แตกเป็นสถานี, Installation แตกเป็นงานย่อย ตาม `canonicalOrder` 0..n-1); ชื่อ 8 ขั้นข้างต้นเป็น phase ระดับสูง — การตรวจ adjacency ใช้ `canonical_order` ไม่ใช่ชื่อขั้น (ดู ADR-017)
2. THE Workflow_Copilot_Manager SHALL เก็บสถานะปัจจุบัน (current Process_Step) และเจ้าของปัจจุบัน (owning Department/Employee) ของแต่ละ Work_Item
3. WHEN Work_Item เสร็จสิ้น Process_Step ปัจจุบัน, THE Workflow_Copilot_Manager SHALL ส่งต่อ Work_Item ไปยัง Process_Step ถัดไปตามลำดับ canonical และกำหนดเจ้าของใหม่ตาม RACI_Map — การอนุมัติเกิดเฉพาะเมื่อขั้นถัดไป `requiresApproval=true` (resolve_approver + block จนกว่าจะอนุมัติ) ส่วนขั้น checklist (`requiresApproval=false`) ไปต่อได้ด้วยการบันทึก Capture_Item โดยไม่รอ approval (ดู ADR-017)
4. WHEN เกิดการส่งต่อ (handoff) ระหว่าง Process_Step, THE Workflow_Copilot_Manager SHALL บันทึกเหตุการณ์ handoff ลง Workflow_Audit_Log พร้อมขั้นเดิม ขั้นใหม่ และผู้กระทำที่หาตัวผ่าน `public.resolve_actor()`
5. IF มีการร้องขอให้ส่งต่อ Work_Item ไปยัง Process_Step ที่ไม่ใช่ขั้นถัดไปตามลำดับ canonical, THEN THE Workflow_Copilot_Manager SHALL ปฏิเสธการส่งต่อและคืนค่าความผิดพลาดที่ระบุว่าลำดับขั้นไม่ถูกต้อง
6. THE Workflow_Copilot_Manager SHALL เชื่อมโยง Work_Item แต่ละชิ้นกับ Site_Code หนึ่งค่าที่อยู่ในผลของ `public.get_active_site_codes()`
7. IF Process_Step ที่อ้างอิงไม่มีอยู่ใน Knowledge_Export ของโมเดลกระบวนการ, THEN THE Workflow_Copilot_Manager SHALL ปฏิเสธการสร้างหรือการส่งต่อ Work_Item นั้นและคืนค่าความผิดพลาดที่ระบุว่าขั้นตอนไม่เป็นที่รู้จัก

### Requirement 3: การหาผู้รับผิดชอบและผู้อนุมัติจาก RACI และบทบาท C12 (Responsibility Resolution)

**User Story:** ในฐานะเจ้าของกระบวนการ ฉันต้องการให้ระบบหาตัวผู้รับผิดชอบและผู้อนุมัติของแต่ละขั้นจาก RACI Master Process Matrix รวมกับบทบาท C12 เพื่อให้คำขออนุมัติส่งถึงคนที่มีอำนาจจริง

#### Acceptance Criteria

1. WHEN THE Workflow_Copilot_Manager ทราบว่า Process_Step หนึ่งต้องมีการอนุมัติ (ทันทีที่ทราบ โดยไม่ต้องรอให้ Work_Item เข้าสู่ Process_Step นั้น), THE Workflow_Copilot_Manager SHALL หาตัว Approver จาก RACI_Map ของ Process_Step นั้นรวมกับ C12_Role ผ่าน `public.has_any_app_role()`
2. THE Workflow_Copilot_Manager SHALL จำกัด Approver ให้เป็น Employee ที่มี C12_Role ตรงตามที่ RACI_Map ระบุว่าเป็นผู้รับผิดชอบ (Accountable) ของ Process_Step นั้น — โดยขั้นที่ Approval_Quorum = `unanimous` SHALL ใช้เซ็ตผู้อนุมัติจาก `approvers` array ของ RACI entry (อาจมากกว่า 1 คน) ส่วนขั้น `first_response`/เดี่ยว SHALL ใช้ `accountable` (ดู ADR-018)
3. WHERE Process_Step มีผู้รับผิดชอบหลายคนตาม RACI_Map, THE Workflow_Copilot_Manager SHALL สร้าง Approval_Request ไปยังผู้รับผิดชอบที่ถูกหาตัวทุกคนและรวมผลการอนุมัติตาม Approval_Quorum ที่กำหนดไว้สำหรับ Process_Step นั้น (ดู Requirement 15)
4. IF ไม่สามารถหาตัว Approver ใด ๆ จาก RACI_Map และ C12_Role สำหรับ Process_Step ที่ต้องอนุมัติได้, THEN THE Workflow_Copilot_Manager SHALL ระงับการอนุมัติแบบ fail-safe และยกระดับไปยัง executive_owner พร้อมบันทึกเหตุผลลง Workflow_Audit_Log
5. THE Workflow_Copilot_Manager SHALL หา RACI_Map จาก Knowledge_Export ของ Master_Process_Matrix แทนการนิยาม RACI ซ้ำภายในโมดูลนี้
6. WHEN RACI_Map ใน Knowledge_Export ถูกปรับปรุง, THE Workflow_Copilot_Manager SHALL ใช้ RACI_Map ฉบับล่าสุดในการหาตัว Approver ของ Approval_Request ที่สร้างหลังจากนั้น

### Requirement 4: การอนุมัติในคลิกเดียวผ่าน LINE พร้อมกันการปลอมตัว (One-Click Approval)

**User Story:** ในฐานะผู้อนุมัติ ฉันต้องการอนุมัติหรือปฏิเสธงานได้ในคลิกเดียวจากปุ่มบน LINE โดยมีการบันทึกที่ตรวจสอบได้และกันการปลอมตัวผู้อื่น เพื่อให้อนุมัติได้รวดเร็วและปลอดภัย

#### Acceptance Criteria

1. WHEN มีการสร้าง Approval_Request, THE Workflow_Copilot_Manager SHALL ส่ง LINE Flex message ที่มีปุ่มอนุมัติและปฏิเสธ โดยแต่ละปุ่มบรรจุ Encrypted_Postback ตาม Postback_Data_Contract ของ `line-oa-commerce`
2. WHEN Approver กดปุ่มอนุมัติหรือปฏิเสธ, THE Workflow_Copilot_Manager SHALL บันทึก Approval_Decision ผ่าน SECURITY DEFINER RPC ที่ตรวจสอบบทบาทของผู้เรียกซ้ำภายในฟังก์ชัน
3. THE Workflow_Copilot_Manager SHALL หาตัวผู้ตัดสินผ่าน `public.resolve_actor()` แทนการเชื่อตัวระบุผู้กระทำที่ส่งมาจาก client
4. IF LINE_User_Id ที่กด Encrypted_Postback ไม่ตรงกับ Approver ที่ถูกหาตัวสำหรับ Approval_Request นั้น, THEN THE Workflow_Copilot_Manager SHALL ปฏิเสธ Approval_Decision คืนค่าความผิดพลาดสิทธิ์ไม่เพียงพอ และ SHALL คง Work_Item ที่ขึ้นกับการอนุมัตินั้นไว้ในสถานะถูกบล็อก (BLOCKED) เพื่อรอการตัดสินจาก Approver ที่ถูกต้องต่อไป — หมายเหตุ: กรณีนี้แตกต่างจาก Acceptance Criteria ข้อ 10 เพราะข้อ 10 เป็นเส้นทางการปฏิเสธ (rejection/rework) ที่เกิดเมื่อ Approver **ที่มีสิทธิ์** ตัดสิน rejected เท่านั้น ส่วนกรณีนี้เป็นการตัดสินจากผู้ที่ไม่ใช่ Approver ที่ถูกต้องและ Work_Item ยังไม่เข้าสู่เส้นทางการปฏิเสธ
5. IF Encrypted_Postback ตรวจสอบความถูกต้อง (เข้ารหัส/ลายเซ็น) ไม่ผ่าน, THEN THE Workflow_Copilot_Manager SHALL ปฏิเสธคำขอและบันทึกการปฏิเสธลง Workflow_Audit_Log โดยไม่เปิดเผยค่าความลับ
6. WHEN มีการบันทึก Approval_Decision สำเร็จ, THE Workflow_Copilot_Manager SHALL บันทึกการตัดสินลง Workflow_Audit_Log พร้อม Work_Item, Process_Step, ผลการตัดสิน ผู้ตัดสิน และเวลา (UTC)
7. IF Approval_Request เดิมถูกตัดสินไปแล้ว, THEN THE Workflow_Copilot_Manager SHALL คงผล Approval_Decision เดิมไว้ (idempotent) บันทึกการพยายามตัดสินซ้ำ (attempted decision) ลง Workflow_Audit_Log และ SHALL แจ้งผลกลับไปยังผู้กดว่าคำขอนี้ได้รับการตัดสินไปแล้ว (user feedback) แทนการเพิกเฉยอย่างเงียบ ๆ — หมายเหตุ: ข้อกำหนดนี้เป็นกรณีเฉพาะของหลักการ idempotency และ optimistic locking ที่นิยามไว้ใน Requirement 16 และต้องสอดคล้องกัน
8. THE Workflow_Copilot_Manager SHALL บล็อกการดำเนินการของ Work_Item ที่ขึ้นกับการอนุมัติไว้จนกว่าจะได้ Approval_Decision = approved
9. IF LINE_User_Id ที่กด Encrypted_Postback ตรงกับ Approver ที่ถูกหาตัวแล้ว แต่การตรวจสอบสิทธิ์อื่นอย่างใดอย่างหนึ่ง (เช่น การตรวจบทบาท C12 ซ้ำ หรือ `public.has_site_access()`) ไม่ผ่าน, THEN THE Workflow_Copilot_Manager SHALL ปฏิเสธ Approval_Decision โดยถือว่าการตรงกันของตัวระบุเพียงอย่างเดียวไม่เป็นการอนุญาตที่เพียงพอ
10. WHEN Approval_Decision = rejected, THE Workflow_Copilot_Manager SHALL ปลดการบล็อก Work_Item ที่ขึ้นกับการอนุมัตินั้นและส่งต่อ Work_Item เข้าสู่เส้นทางการจัดการการปฏิเสธหรือแก้ไขงาน (rejection/rework path) แทนการคงสถานะถูกบล็อกไว้
11. WHEN Approval_Decision = approved, THE Workflow_Copilot_Manager SHALL ปลดการบล็อก Work_Item ที่ขึ้นกับการอนุมัตินั้นและให้ Work_Item ดำเนินตามเส้นทางปกติต่อไป (continue normal flow/handoff) ตามลำดับ canonical ใน Requirement 2

### Requirement 5: AI Copilot เตือนความเสี่ยงเชิงรุกจากความรู้ PFMEA/RPN (Advisory Copilot)

**User Story:** ในฐานะผู้ตัดสินใจ ฉันต้องการให้ Copilot เตือนความเสี่ยงเชิงรุกพร้อมเสนอ 2–3 ทางเลือกที่มีข้อดี/ข้อเสียและอ้างอิงแหล่งที่มา เพื่อให้ฉันตัดสินใจได้ดีขึ้น โดย Copilot ไม่ตัดสินใจแทนฉัน

#### Acceptance Criteria

1. WHEN Work_Item เข้าสู่จุดตัดสินใจที่มี PFMEA_Risk_Row เกี่ยวข้องใน Knowledge_Export, THE Workflow_Copilot_Manager SHALL สร้าง Copilot_Suggestion ที่เสนอตัวเลือกระหว่าง 2 ถึง 3 ตัวเลือก
2. THE Workflow_Copilot_Manager SHALL แนบข้อดีและข้อเสียให้แต่ละตัวเลือกใน Copilot_Suggestion
3. THE Workflow_Copilot_Manager SHALL อ้างอิง PFMEA_Risk_Row และค่า RPN ที่เป็นแหล่งที่มาของคำเตือนในทุก Copilot_Suggestion
4. THE Workflow_Copilot_Manager SHALL นำเสนอ Copilot_Suggestion เป็นคำแนะนำเท่านั้น (advisory-only) สำหรับการกระทำแบบอัตโนมัติ และ SHALL ไม่ดำเนินการตัดสินใจหรือเปลี่ยนสถานะ Work_Item โดยอัตโนมัติด้วยตนเอง ทั้งนี้การกระทำที่ไม่ใช่คำแนะนำ (non-advisory action) SHALL อนุญาตได้เฉพาะเมื่อถูกส่งผ่าน workflow การอนุมัติของมนุษย์ (D2-gated) เท่านั้น
5. THE Workflow_Copilot_Manager SHALL จัดประเภทการกระทำของ Copilot ตาม Autonomy_Tier ของ D2 Autonomy Ladder ก่อนนำเสนอ
6. IF การกระทำของ Copilot ถูกจัดอยู่ใน Autonomy_Tier ที่ต้องการการอนุมัติจากมนุษย์, THEN THE Workflow_Copilot_Manager SHALL ระงับการกระทำนั้นไว้จนกว่ามนุษย์จะอนุมัติผ่าน workflow การอนุมัติ และ WHEN มนุษย์อนุมัติการกระทำนั้นผ่าน workflow การอนุมัติแล้ว THE Workflow_Copilot_Manager SHALL อนุญาตให้การกระทำที่ไม่ใช่คำแนะนำนั้นดำเนินการต่อได้
7. IF Approval_Mechanism ของการกระทำ Copilot ความเสี่ยงสูงไม่พร้อมใช้งาน, THEN THE Workflow_Copilot_Manager SHALL บล็อกการกระทำแบบ fail-safe และ SHALL ไม่ดำเนินการต่อโดยปราศจากการอนุมัติ
8. THE Workflow_Copilot_Manager SHALL บันทึกทุก Copilot_Suggestion พร้อมตัวเลือก การอ้างอิงแหล่งที่มา และ Autonomy_Tier ลง Workflow_Audit_Log
9. IF Copilot_Suggestion ที่จะสร้างมีตัวเลือกตั้งแต่ 4 ตัวเลือกขึ้นไป, THEN THE Workflow_Copilot_Manager SHALL ปฏิเสธ Copilot_Suggestion นั้นเพื่อคงช่วงจำนวนตัวเลือกไว้ที่ 2 ถึง 3 ตัวเลือก

### Requirement 6: การแจ้งเตือนข้ามแผนกและในแผนกพร้อมการกันข้อมูลล้น (Notification Model)

**User Story:** ในฐานะพนักงาน ฉันต้องการรับการแจ้งเตือนที่ตรงกับความรับผิดชอบของฉันโดยไม่ถูกรบกวนเกินจำเป็น เพื่อให้ฉันโฟกัสงานได้และยังไม่พลาดเรื่องสำคัญ

#### Acceptance Criteria

1. WHEN การแจ้งเตือนเป็นความรับผิดชอบหรือการอนุมัติโดยตรงของบุคคล, THE Workflow_Copilot_Manager SHALL ส่ง Notification เป็น direct_push ส่วนตัวไปยัง LINE_User_Id ของ Employee นั้น
2. WHEN การแจ้งเตือนเป็นการส่งต่องานข้ามทีมหรือเป็นข้อมูลเพื่อทราบ (FYI), THE Workflow_Copilot_Manager SHALL ส่ง Notification เป็น group_message ไปยัง LINE group ของ Department ที่เกี่ยวข้อง
3. WHILE อยู่ในช่วง Quiet_Hours, THE Workflow_Copilot_Manager SHALL ระงับการส่ง Notification ที่ไม่ใช่ Direct_Responsibility_Item และสะสมไว้ใน Daily_Digest
4. WHEN ถึงรอบ Daily_Digest, THE Workflow_Copilot_Manager SHALL ส่งสรุป Notification ที่สะสมไว้รวมเป็นข้อความเดียว
5. WHERE Employee ปิดเสียง (mute) Notification_Category หนึ่ง, THE Workflow_Copilot_Manager SHALL ระงับการส่ง Notification ของหมวดนั้นไปยัง Employee นั้นเสมอ รวมถึงกรณีที่ Notification เป็น Direct_Responsibility_Item แต่จัดอยู่ในหมวดที่ถูกปิดเสียง (มิวต์มีผลเหนือกว่าและระงับเสมอ)
6. IF Notification เป็น Direct_Responsibility_Item และหมวด (Notification_Category) ของ Notification นั้นไม่ได้ถูกปิดเสียง, THEN THE Workflow_Copilot_Manager SHALL ส่ง Notification นั้นทันทีแม้อยู่ในช่วง Quiet_Hours โดยการเป็น Direct_Responsibility_Item ข้าม Quiet_Hours (เงื่อนไขด้านเวลา) ได้เท่านั้น และ SHALL ไม่ข้ามการปิดเสียงหมวดของตัวเอง (ดู Acceptance Criteria ข้อ 5)
7. THE Workflow_Copilot_Manager SHALL จำกัดทุก Notification segment ให้มีความยาวไม่เกิน 200 ตัวอักษรตาม Brand_Voice_Guideline ของ `line-oa-commerce`
8. THE Workflow_Copilot_Manager SHALL ประกอบเนื้อหา Notification จาก Message_Templates ที่ผูกกับเทมเพลต (template-bound slot-filling) แทนการสร้างข้อความอิสระ (free-text)
9. IF Notification ไม่ใช่ Direct_Responsibility_Item (เช่น การส่งต่องานข้ามทีมหรือ FYI), THEN THE Workflow_Copilot_Manager SHALL ไม่ให้ Notification นั้นข้าม Quiet_Hours หรือการปิดเสียง (mute) ไม่ว่ากรณีใด
10. IF Notification ที่เป็น Direct_Responsibility_Item เมื่อประกอบแล้วมีความยาวเกิน 200 ตัวอักษร, THEN THE Workflow_Copilot_Manager SHALL พัก Notification นั้นไว้ในคิว (queue) จนกว่าจะจัดรูปแบบให้มีความยาวไม่เกิน 200 ตัวอักษรได้ แทนการตัดข้อความแล้วส่ง (ไม่ truncate-and-send)

### Requirement 7: การเข้าถึง JES/SOS ของทีมหน้างาน (Field-Team Access)

**User Story:** ในฐานะช่างติดตั้งหน้างาน ฉันต้องการเห็นขั้นตอนที่ต้องทำตอนนี้และถ่ายภาพ/ติ๊กเช็กลิสต์ได้จาก LINE พร้อมเปิดรายละเอียดเต็มได้เมื่อต้องการ เพื่อให้ทำงานตามมาตรฐานโดยไม่ต้องเปิดเอกสารหลายที่

#### Acceptance Criteria

1. WHEN ทีมหน้างานเปิด Field_View จาก LINE rich menu, THE Workflow_Copilot_Manager SHALL แสดง Process_Step ปัจจุบันของ Work_Item ที่เป็น "ขั้นตอนที่ต้องทำตอนนี้"
2. THE Field_View SHALL แสดงรายการเช็กลิสต์ของ Process_Step ปัจจุบันที่ดึงจาก Knowledge_Export ของ SOS/JES
3. WHEN ทีมหน้างานบันทึก Capture_Item (ภาพถ่ายหรือผลเช็กลิสต์), THE Workflow_Copilot_Manager SHALL ผูก Capture_Item เข้ากับ Work_Item และ Process_Step ปัจจุบัน พร้อมผู้บันทึกที่หาตัวผ่าน `public.resolve_actor()`
4. WHERE มี Knowledge_Export ของ SOS/JES สำหรับ Process_Step ปัจจุบัน, THE Field_View SHALL แสดง Obsidian_Deep_Link ที่เปิดโน้ตรายละเอียดเต็ม (SOS/JES) ของ Process_Step ปัจจุบันใน Obsidian Vault และ IF ไม่มี Knowledge_Export ของ SOS/JES สำหรับ Process_Step ปัจจุบัน, THEN THE Field_View SHALL ซ่อน (hide) Obsidian_Deep_Link โดยจะแสดง deep link เฉพาะเมื่อมีความรู้อยู่จริงเท่านั้น (จับคู่กับข้อความ "ยังไม่มีเอกสารมาตรฐาน" ใน Acceptance Criteria ข้อ 5)
5. IF ไม่มี Knowledge_Export ของ SOS/JES สำหรับ Process_Step ปัจจุบัน, THEN THE Workflow_Copilot_Manager SHALL แสดงข้อความระบุว่ายังไม่มีเอกสารมาตรฐานสำหรับขั้นตอนนี้แทนการแสดงเช็กลิสต์ว่าง
6. THE Workflow_Copilot_Manager SHALL บันทึกการบันทึก Capture_Item แต่ละครั้งลง Workflow_Audit_Log
7. IF การผูก Capture_Item เข้ากับ Work_Item หรือ Process_Step อย่างใดอย่างหนึ่งล้มเหลว, THEN THE Workflow_Copilot_Manager SHALL ปฏิเสธการบันทึก Capture_Item ทั้งรายการแบบ atomic โดยไม่ผูกเพียงบางส่วน (no partial linking) ทั้งนี้การ roll back แบบ atomic นี้ SHALL ครอบเฉพาะผลข้างเคียงด้านข้อมูลธุรกิจ (business-data side effects: Capture_Item, การผูก, version counter และ UI state ที่ขึ้นกับการบันทึกนั้น) เท่านั้น
8. IF `public.resolve_actor()` ในการบันทึก Capture_Item ล้มเหลว, THEN THE Workflow_Copilot_Manager SHALL ปฏิเสธการบันทึก Capture_Item ทั้งรายการแบบ atomic แม้การผูกเข้ากับ Work_Item และ Process_Step จะสำเร็จก็ตาม โดยถือว่าการหาตัวผู้กระทำ (actor resolution) เป็นส่วนหนึ่งของการดำเนินการแบบ atomic เดียวกัน
9. WHEN การบันทึก Capture_Item ถูก roll back ตาม Acceptance Criteria ข้อ 7 หรือ 8, THE Workflow_Copilot_Manager SHALL บันทึกเหตุการณ์ความล้มเหลว (failure-audit entry) ลง Workflow_Audit_Log แบบ append แยกออกนอก transaction ที่ถูก roll back (autonomous transaction) เพื่อคงรายการ audit ไว้เสมอตาม Requirement 9 ข้อ 5 และ 6 และ THE การ atomic rollback ของข้อมูลธุรกิจ SHALL NOT ลบหรือย้อนรายการ audit นั้น

### Requirement 8: กฎการยกระดับการอนุมัติตามความเสี่ยงและงบประมาณ (Escalation Rules)

**User Story:** ในฐานะผู้บริหาร ฉันต้องการให้งานที่มีความเสี่ยงสูงหรือเกินงบถูกยกระดับมาที่ฉันโดยอัตโนมัติ เพื่อให้ฉันควบคุมการตัดสินใจสำคัญได้โดยไม่ต้องตามดูทุกงาน

#### Acceptance Criteria

1. WHEN Work_Item อยู่ในขั้นปล่อยงานเข้าผลิต (Production release) และ RPN ของ PFMEA_Risk_Row ที่เกี่ยวข้องเกิน RPN_Threshold, THE Workflow_Copilot_Manager SHALL ยกระดับ Approval_Request ไปยัง executive_owner
2. WHEN Work_Item อยู่ในขั้นปล่อยงานเข้าผลิตและงบประมาณวัสดุเกิน Budget_Ceiling, THE Workflow_Copilot_Manager SHALL ยกระดับ Approval_Request ไปยัง executive_owner
3. WHEN Work_Item อยู่ในขั้นจัดซื้อและมูลค่าการจัดซื้อเกิน Budget_Ceiling, THE Workflow_Copilot_Manager SHALL กำหนด Approver เป็น executive_owner โดยให้มีผลทันที (immediately) สำหรับ Approval_Request ปัจจุบัน ไม่เลื่อนไปมีผลในการส่งต่อ (transition) ครั้งถัดไป
4. WHEN Work_Item อยู่ในขั้นอนุมัติแบบร่างงานออกแบบ (Design draft sign-off), THE Workflow_Copilot_Manager SHALL กำหนด internal Approver เป็นหัวหน้าทีม Designer เสมอ โดยไม่ยกระดับไปยัง executive_owner แม้จะเข้าเงื่อนไข RPN_Threshold หรือ Budget_Ceiling ที่ปกติจะกระตุ้นการยกระดับ; ทั้งนี้ข้อกำหนดนี้ระบุเฉพาะส่วน internal lead เท่านั้น และ SHALL NOT ลบล้างการเพิ่ม Customer_Approver เข้า Approver set ตาม Requirement 20 ข้อ 2 (Approver set = { internal approvers จาก `approvers` array, Customer_Approver }, Approval_Quorum = unanimous; ดู ADR-018)
5. WHEN Work_Item อยู่ในขั้นปล่อยงานเข้าผลิตและไม่เข้าเงื่อนไขการยกระดับใด ๆ, THE Workflow_Copilot_Manager SHALL กำหนด Approver เป็นหัวหน้า Production Planning
6. WHEN Work_Item เริ่มหรือจบงานติดตั้ง (Installation start/finish), THE Workflow_Copilot_Manager SHALL กำหนด Approver เป็นหัวหน้าทีม Installation และส่ง Notification อัตโนมัติไปยัง Sale และ PM
7. THE Workflow_Copilot_Manager SHALL อ่านค่า RPN_Threshold และ Budget_Ceiling จากการตั้งค่า (configurable) แทนการ hard-code
8. THE Workflow_Copilot_Manager SHALL บันทึกทุก Escalation ลง Workflow_Audit_Log พร้อมเงื่อนไขที่กระตุ้น (RPN หรือ Budget) และค่าที่เกี่ยวข้อง

### Requirement 9: ร่องรอยการตรวจสอบสำหรับทุกเหตุการณ์ (Audit Trail)

**User Story:** ในฐานะผู้ตรวจสอบหรือผู้บริหาร ฉันต้องการบันทึกที่แก้ไขไม่ได้ของทุก handoff, การแจ้งเตือน, การอนุมัติ และคำแนะนำ Copilot เพื่อให้สืบย้อนได้ว่าใครทำอะไรเมื่อใด

#### Acceptance Criteria

1. WHEN เกิด handoff, Notification, Approval_Decision, Escalation หรือ Copilot_Suggestion, THE Workflow_Copilot_Manager SHALL บันทึก Workflow_Audit_Log หนึ่งรายการที่ประกอบด้วย event_type, Work_Item, Process_Step, Site_Code (เมื่อทราบ), ผู้กระทำ (ผ่าน `public.resolve_actor()`) และเวลา (UTC)
2. THE Workflow_Copilot_Manager SHALL เก็บ Workflow_Audit_Log ในตารางแบบ append-only ที่บังคับความไม่เปลี่ยนแปลง (immutability) ด้วยข้อจำกัดระดับฐานข้อมูล (trigger และ permission) ที่ปฏิเสธการ UPDATE และ DELETE โดยอิสระจากการป้องกันระดับแอปพลิเคชัน
3. THE Workflow_Copilot_Manager SHALL ลบค่าความลับ (เช่น token, channel secret) ออกจากทุกรายการ Workflow_Audit_Log
4. WHEN Governance_Role หรือ Branch_Role ที่มีสิทธิ์เข้าถึง Site_Code หนึ่ง query Workflow_Audit_Log, THE Workflow_Copilot_Manager SHALL คืนเฉพาะรายการที่ผู้เรียกมีสิทธิ์เข้าถึงตาม RLS
5. WHEN Notification ส่งไม่สำเร็จ, THE Workflow_Copilot_Manager SHALL บันทึกความล้มเหลวลง Workflow_Audit_Log พร้อมรายละเอียดความผิดพลาดทั้งหมด (full error details) โดยลบหรือปกปิดค่าความลับที่อยู่ภายในรายละเอียดนั้น
6. THE Workflow_Copilot_Manager SHALL คงรายการ Workflow_Audit_Log ไว้เสมอ (ไม่ทิ้งรายการ audit) ไม่ว่าการลบค่าความลับจะสำเร็จหรือล้มเหลว และ IF การลบค่าความลับออกจากรายการ Workflow_Audit_Log ล้มเหลว, THEN THE Workflow_Copilot_Manager SHALL ยังคงพยายามลบค่าความลับต่อไป โดยคงรายการ audit ไว้ตลอดทุกผลลัพธ์ของการพยายามซ้ำ (retry) และยอมรับว่าค่าความลับบางส่วนอาจยังไม่ถูกลบ แทนการทิ้งรายการ audit

### Requirement 10: การควบคุมการเข้าถึงและการแยกสาขาโดยใช้ C12 (Access Control & Branch Isolation)

**User Story:** ในฐานะผู้ดูแล IT ฉันต้องการให้ข้อมูล workflow ถูกควบคุมด้วยบทบาทและ Site_Code ของ C12 ที่มีอยู่ เพื่อให้แต่ละสาขาเห็นเฉพาะงานของตน โดยไม่ต้องนิยามโมเดลสิทธิ์ใหม่

#### Acceptance Criteria

1. WHILE ผู้ใช้ถือ Branch_Role, THE Workflow_Copilot_Manager SHALL อนุญาตให้อ่าน Work_Item, Approval_Request, Notification และ Capture_Item เฉพาะ Site_Code ที่ `public.has_site_access()` คืนค่า true เท่านั้น
2. WHILE ผู้ใช้ถือ Governance_Role, THE Workflow_Copilot_Manager SHALL อนุญาตให้อ่านข้อมูล workflow ของทุก Site_Code
3. THE Workflow_Copilot_Manager SHALL บังคับการควบคุมการเข้าถึงผ่าน Supabase RLS policy ที่ gate `TO authenticated` และนำ `public.has_any_app_role()`, `public.has_site_access()` และ `public.is_governance_role()` กลับมาใช้ โดยไม่นิยามโมเดลสิทธิ์ใหม่และไม่ข้ามความปลอดภัยด้วย service_role จาก client
4. THE Workflow_Copilot_Manager SHALL ทำทุกการเปลี่ยนแปลงสถานะ (handoff, approval, notification dispatch, capture) ผ่าน SECURITY DEFINER function ที่ตรวจสอบบทบาทผู้เรียกซ้ำภายในฟังก์ชันและหาตัวผู้กระทำผ่าน `public.resolve_actor()`
5. IF ผู้ใช้พยายามทำการเปลี่ยนแปลงโดยไม่มีบทบาทที่อนุญาตสำหรับการดำเนินการและ Site_Code นั้น, THEN THE Workflow_Copilot_Manager SHALL ปฏิเสธการดำเนินการและคืนค่าความผิดพลาดสิทธิ์ไม่เพียงพอ
6. IF Site_Code ที่ผูกกับ Work_Item ไม่อยู่ในผลของ `public.get_active_site_codes()`, THEN THE Workflow_Copilot_Manager SHALL ปฏิเสธการดำเนินการและคืนค่าความผิดพลาดที่ระบุว่า site_code ไม่เป็นที่รู้จักหรือไม่มีผล

### Requirement 11: สัญญาการส่งออกความรู้จาก Second Brain (Knowledge Export Contract)

**User Story:** ในฐานะสถาปนิกระบบ ฉันต้องการให้ Vault_Builder ของ Second Brain ปล่อยข้อมูลที่เครื่องอ่านได้ออกมาอย่างมีโครงสร้าง เพื่อให้โมดูลนี้ query แถวความเสี่ยง PFMEA, โมเดลกระบวนการ และ RACI ได้โดยไม่ต้องอ่าน Excel ดิบ

#### Acceptance Criteria

1. THE Workflow_Copilot_Manager SHALL บริโภค Knowledge_Export ในรูปแบบ JSON หรือฐานข้อมูลที่เครื่องอ่านได้ ซึ่งปล่อยออกมาโดย Vault_Builder ของ `daph-obsidian-second-brain`
2. THE Knowledge_Export SHALL ประกอบด้วย PFMEA_Risk_Row แต่ละแถวในรูป Process Step, Failure Mode, Cause, Control และ RPN
3. THE Knowledge_Export SHALL ประกอบด้วยโมเดลกระบวนการที่ระบุ Process_Step แต่ละขั้น Sub_Process_Group ที่สังกัด และลำดับ canonical ของขั้นตอน
4. THE Knowledge_Export SHALL ประกอบด้วย RACI_Map ที่จับคู่ Process_Step กับบทบาทผู้รับผิดชอบ (Responsible/Accountable/Consulted/Informed) จาก Master_Process_Matrix
5. WHEN Knowledge_Export ที่บริโภคไม่ตรงตามโครงสร้างที่ตกลงไว้ (schema), THE Workflow_Copilot_Manager SHALL ปฏิเสธการนำเข้า export ฉบับนั้นและคงข้อมูลความรู้ฉบับล่าสุดที่นำเข้าสำเร็จไว้
6. THE Workflow_Copilot_Manager SHALL ถือว่า Knowledge_Export เป็นแหล่งอ่านอย่างเดียว (read-only) และ SHALL ไม่เขียนกลับหรือแก้ไขความรู้ต้นทางใน Obsidian Vault
7. THE Workflow_Copilot_Manager SHALL บันทึกเวอร์ชันหรือเวลาที่นำเข้า Knowledge_Export แต่ละครั้งลง Workflow_Audit_Log
8. THE Workflow_Copilot_Manager SHALL ยอมรับ Knowledge_Export ที่ลำดับ canonical ของ Process_Step เริ่มต้นที่ค่า 0 และ SHALL ไม่ปฏิเสธ export เพียงเพราะลำดับ canonical เริ่มต้นที่ 0
9. THE Knowledge_Export SHALL บรรจุ Knowledge_Freshness ต่อแหล่งความรู้ ประกอบด้วย source_version, imported_at และ review_status เพื่อให้โมดูลนี้ประเมินความสดใหม่และความน่าเชื่อถือของความรู้ที่ใช้ (ดู Requirement 17)
10. THE Knowledge_Export SHALL บรรจุ Approval_Quorum ของแต่ละ Process_Step หนึ่งค่าจากชุด {unanimous, majority, first_response} เพื่อให้โมดูลนี้รวมผลการอนุมัติแบบหลายผู้รับผิดชอบได้ (ดู Requirement 15)

### Requirement 12: การรับประกันการยอมรับและประสบการณ์ใช้งาน (Adoption & UX Guarantees)

**User Story:** ในฐานะพนักงาน ฉันต้องการเครื่องมือที่ป้อนข้อมูลครั้งเดียวแล้วใช้ซ้ำได้ ส่งข้อความสั้นอบอุ่นเป็นภาษาไทย ฉลองเมื่องานเสร็จ และอธิบายได้เสมอว่าทำไม Copilot จึงแนะนำเช่นนั้น เพื่อให้ฉันอยากใช้งานจริง

#### Acceptance Criteria

1. WHEN ข้อมูลของ Work_Item ถูกป้อนหรือบันทึกครั้งหนึ่งแล้ว, THE Workflow_Copilot_Manager SHALL นำข้อมูลนั้นกลับมาใช้ซ้ำในขั้นตอนถัดไปโดยไม่ขอให้ผู้ใช้ป้อนข้อมูลเดิมซ้ำ (capture-once-reuse)
2. THE Workflow_Copilot_Manager SHALL ประกอบทุกข้อความ Notification และ Copilot_Suggestion เป็นภาษาไทยน้ำเสียงอบอุ่น โดยแต่ละ segment มีความยาวไม่เกิน 200 ตัวอักษร
3. WHEN Work_Item ไปถึงและเสร็จสิ้น Process_Step สุดท้ายของกระบวนการเท่านั้น (ไม่ใช่การปิดหรือยกเลิกงานด้วยมือก่อนถึงขั้นสุดท้าย), THE Workflow_Copilot_Manager SHALL ส่งข้อความแสดงความยินดี (celebrate completion) ไปยังผู้รับผิดชอบที่เกี่ยวข้อง
4. THE Workflow_Copilot_Manager SHALL แสดงเหตุผลและแหล่งที่มา (PFMEA_Risk_Row / RPN) ของทุก Copilot_Suggestion เพื่อความสามารถในการอธิบาย (explainability)
5. THE Workflow_Copilot_Manager SHALL ประกอบเนื้อหาข้อความทั้งหมดจาก Message_Templates ที่ผูกกับเทมเพลต (template-bound slot-filling) แทนการสร้างข้อความอิสระ
6. IF ข้อความที่ประกอบได้มี segment เกิน 200 ตัวอักษร, THEN THE Workflow_Copilot_Manager SHALL ปฏิเสธ segment นั้นและคืนค่าความผิดพลาดแทนการส่ง
7. WHERE มีข้อผิดพลาดอื่นของระบบเกิดขึ้นในการดำเนินการเดียวกัน, THE Workflow_Copilot_Manager SHALL ยังคงส่งข้อความแสดงความยินดีเมื่อ Work_Item ถึง Process_Step สุดท้ายได้ โดยไม่ถูกระงับด้วยข้อผิดพลาดอื่นนั้น

### Requirement 13: SLA การอนุมัติ การเตือน และการกำกับ Timeout (Approval SLA, Reminder & Timeout Governance)

**User Story:** ในฐานะผู้จัดการ ฉันต้องการให้คำขออนุมัติมี SLA พร้อมการเตือนและ timeout เพื่อไม่ให้งานค้างเงียบเมื่อผู้อนุมัติไม่ตอบ ลืม หรือลาหยุด

#### Acceptance Criteria

1. WHEN Approval_Request ถูกสร้าง, THE Workflow_Copilot_Manager SHALL คำนวณ SLA_Deadline จากค่า SLA ที่ตั้งค่าได้ (configurable)
2. IF เวลาผ่านไป 50% ของ SLA และยังไม่มี Approval_Decision, THEN THE Workflow_Copilot_Manager SHALL ส่ง reminder ไปยัง Approver ที่ถูกหาตัว
3. IF เวลาผ่านไป 100% ของ SLA (ถึง SLA_Deadline) และยังไม่มี Approval_Decision, THEN THE Workflow_Copilot_Manager SHALL ส่ง reminder ซ้ำไปยัง Approver ที่ถูกหาตัว
4. IF เวลาเกิน timeout ที่ตั้งค่าได้ (configurable) หลัง SLA_Deadline และยังไม่มี Approval_Decision, THEN THE Workflow_Copilot_Manager SHALL กระตุ้น Escalation ตามกลไกใน Requirement 8 และ Requirement 3 ข้อ 4 ทันทีที่ตรวจพบเงื่อนไข timeout โดยไม่รอการอัปเดตสถานะอย่างเป็นทางการ (formal status update)
5. THE Workflow_Copilot_Manager SHALL จัดประเภท reminder ทุกครั้งเป็น Direct_Responsibility_Item ตาม Requirement 6
6. THE Workflow_Copilot_Manager SHALL บันทึกทุก reminder, timeout และ Escalation ที่เกิดจาก SLA ลง Workflow_Audit_Log พร้อมเวลา (UTC) และ Approval_Request ที่เกี่ยวข้อง

### Requirement 14: การมอบหมายสิทธิ์และผู้อนุมัติแทนชั่วคราว (Delegation & Acting Approver)

**User Story:** ในฐานะผู้อนุมัติ ฉันต้องการมอบสิทธิ์อนุมัติชั่วคราวเมื่อฉันลา ป่วย หรือเดินทาง เพื่อไม่ให้ workflow หยุดชะงัก

#### Acceptance Criteria

1. THE Workflow_Copilot_Manager SHALL อนุญาตให้ Approver แต่งตั้ง Acting_Approver แบบชั่วคราว โดยระบุ start_time และ end_time
2. THE Workflow_Copilot_Manager SHALL อนุญาตการมอบหมายก็ต่อเมื่อ (if and only if) Acting_Approver มี C12_Role ที่เพียงพอตามที่ Process_Step ต้องการ โดยตรวจผ่าน `public.has_any_app_role()` กล่าวคือ การมอบหมายผ่านเมื่อและเฉพาะเมื่อ Acting_Approver มีบทบาทเพียงพอเท่านั้น
3. IF Acting_Approver ไม่มี C12_Role ที่เพียงพอตามที่ Process_Step ต้องการ, THEN THE Workflow_Copilot_Manager SHALL ปฏิเสธการมอบหมายและคืนค่าความผิดพลาดสิทธิ์ไม่เพียงพอ
4. WHILE เวลาปัจจุบันอยู่ในช่วง [start_time, end_time] ของ delegation, THE Workflow_Copilot_Manager SHALL ส่ง Approval_Request ของ Approver เดิมไปยัง Acting_Approver
5. THE Workflow_Copilot_Manager SHALL บันทึกทุกการมอบหมาย การใช้สิทธิ์อนุมัติแทน และการเพิกถอนการมอบหมาย ลง Workflow_Audit_Log พร้อมผู้กระทำที่หาตัวผ่าน `public.resolve_actor()`
6. WHEN executive_owner เพิกถอน (revoke) delegation, THE Workflow_Copilot_Manager SHALL ส่ง Approval_Request ถัดไปกลับไปยัง Approver เดิม

### Requirement 15: กติกาการรวมผลอนุมัติจากผู้อนุมัติหลายคน (Multi-Approver Quorum Rules)

**User Story:** ในฐานะเจ้าของกระบวนการ ฉันต้องการกำหนดกติกาการรวมผลอนุมัติเมื่อมีผู้รับผิดชอบหลายคน เพื่อให้ทราบชัดเจนว่าต้องอนุมัติครบทุกคนหรือไม่

#### Acceptance Criteria

1. THE Process_Step SHALL กำหนด Approval_Quorum หนึ่งค่าจากชุด {unanimous, majority, first_response}
2. IF Approval_Quorum = unanimous, THEN THE Workflow_Copilot_Manager SHALL ถือว่าผ่านเมื่อ Approver ที่ถูกหาตัวทุกคนบันทึก Approval_Decision = approved
3. IF Approval_Quorum = majority, THEN THE Workflow_Copilot_Manager SHALL ถือว่าผ่านเมื่อจำนวน Approval_Decision = approved มากกว่าครึ่งหนึ่งของ Approver ที่ถูกหาตัว
4. IF Approval_Quorum = first_response, THEN THE Workflow_Copilot_Manager SHALL ถือว่า Approval_Decision แรกที่บันทึกเป็นผลสุดท้าย
5. THE Workflow_Copilot_Manager SHALL หา Approval_Quorum ของแต่ละ Process_Step จาก Knowledge_Export แทนการนิยามซ้ำภายในโมดูลนี้ (ดู Requirement 11)
6. IF Approval_Quorum = unanimous และมี Approver ที่ถูกหาตัวคนใดคนหนึ่งบันทึก Approval_Decision = rejected, THEN THE Workflow_Copilot_Manager SHALL ถือว่าการอนุมัติโดยรวมล้มเหลวทันที และ SHALL ส่งต่อ Work_Item เข้าสู่เส้นทางการปฏิเสธหรือแก้ไขงาน (rejection/rework path) ตาม Requirement 4 ข้อ 10
7. IF Approval_Quorum = majority และจำนวน Approval_Decision = rejected ถึงเสียงข้างมาก (มากกว่าครึ่งหนึ่งของ Approver ที่ถูกหาตัว), THEN THE Workflow_Copilot_Manager SHALL ถือว่าการอนุมัติโดยรวมล้มเหลวทันที และ SHALL ส่งต่อ Work_Item เข้าสู่เส้นทางการปฏิเสธหรือแก้ไขงาน (rejection/rework path) ตาม Requirement 4 ข้อ 10
8. IF Approval_Quorum = first_response และ Approval_Decision แรกที่บันทึกเป็น rejected, THEN THE Workflow_Copilot_Manager SHALL ถือว่าการอนุมัติโดยรวมล้มเหลวทันที และ SHALL ส่งต่อ Work_Item เข้าสู่เส้นทางการปฏิเสธหรือแก้ไขงาน (rejection/rework path) ตาม Requirement 4 ข้อ 10

### Requirement 16: การทำงานพร้อมกันและการป้องกัน Race Condition (Concurrency & Race Protection)

**User Story:** ในฐานะสถาปนิกระบบ ฉันต้องการให้การทำงานปลอดภัยจาก race condition เพื่อกันข้อมูลเพี้ยนเมื่อมีการกดพร้อมกันหรือการส่งต่องานซ้อนกัน

#### Acceptance Criteria

1. THE Work_Item SHALL มี version counter หนึ่งค่าสำหรับการควบคุมการแก้ไขพร้อมกัน
2. THE Approval_Request SHALL รองรับ optimistic locking ในการบันทึก Approval_Decision
3. IF version ของ Work_Item เปลี่ยนก่อน commit, THEN THE Workflow_Copilot_Manager SHALL ทำให้ transaction นั้นล้มเหลวและคงสถานะ Work_Item ไว้โดยไม่เสียหาย
4. THE Workflow_Copilot_Manager SHALL ดำเนินการ workflow state transition (handoff และ approval) แบบ atomic
5. IF ได้รับ postback ที่ซ้ำกัน (webhook_event_id หรือ postback เดิม), THEN THE Workflow_Copilot_Manager SHALL ประมวลผล postback ซ้ำนั้นแบบ idempotent โดย SHALL ไม่ใช้ side effect ซ้ำซ้อน (never double-apply side effects) ทั้งนี้ postback ซ้ำ SHALL สามารถสำเร็จได้โดยไม่ขึ้นกับผลลัพธ์ของครั้งแรก (เช่น การ retry หลังครั้งแรกล้มเหลวสามารถสำเร็จได้) และ SHALL ไม่ถูกบังคับให้สะท้อนผลล้มเหลวของครั้งก่อน

### Requirement 17: ความสดใหม่ของความรู้และระดับความน่าเชื่อถือ (Knowledge Freshness & Trust Level)

**User Story:** ในฐานะผู้ตัดสินใจ ฉันต้องการรู้ว่าความรู้ที่ Copilot ใช้สดใหม่และผ่านการรีวิวหรือไม่ เพื่อประเมินความน่าเชื่อถือของคำแนะนำ

#### Acceptance Criteria

1. THE Workflow_Copilot_Manager SHALL แสดง source_version และ imported_at ของ Knowledge_Export ที่ใช้ในทุก Copilot_Suggestion
2. IF แหล่งความรู้ที่ใช้เก่ากว่า freshness threshold ที่ตั้งค่าได้ (configurable), THEN THE Workflow_Copilot_Manager SHALL แสดงคำเตือน (warning) พร้อม Copilot_Suggestion นั้น
3. IF review_status ของแหล่งความรู้ที่ใช้ไม่เท่ากับ approved (เช่น pending), THEN THE Workflow_Copilot_Manager SHALL ยังคงแสดง Copilot_Suggestion ที่อ้างอิงแหล่งความรู้นั้นต่อผู้ใช้ โดยทำเครื่องหมายเป็น low confidence แทนการซ่อน (ไม่ hide)
4. THE Workflow_Copilot_Manager SHALL แสดงความรู้ที่ stale ต่อผู้ใช้พร้อมคำเตือนเสมอ แทนการซ่อนความรู้ที่ stale

### Requirement 18: ความต่อเนื่องทางธุรกิจและการสำรองเมื่อระบบล่ม (Business Continuity & Failover)

**User Story:** ในฐานะผู้บริหาร ฉันต้องการให้การอนุมัติยังทำได้แม้ LINE หรือ webhook ล่ม เพื่อให้ธุรกิจไม่หยุดชะงัก

> **ขอบเขตและข้อสันนิษฐาน (Scope Expansion / Assumption):** ข้อกำหนดนี้เพิ่มช่องทางสำรองแบบ web (web fallback surface) สำหรับการอนุมัติ ทำให้การมีส่วนร่วมไม่จำกัดเฉพาะ LINE อีกต่อไป (engagement is no longer LINE-only) ถือเป็นการขยายขอบเขตจากหลักการเดิมอย่างชัดเจน

#### Acceptance Criteria

1. IF LINE Messaging API ไม่พร้อมใช้งาน, THEN THE Workflow_Copilot_Manager SHALL นำ Notification เข้าสู่ retry queue
2. THE Workflow_Copilot_Manager SHALL ดำเนินการ retry การส่ง Notification ด้วย exponential backoff
3. IF การ retry ครบจำนวนครั้งที่ตั้งค่าได้ (configurable) แล้วยังส่งไม่สำเร็จ, THEN THE Workflow_Copilot_Manager SHALL บันทึก Delivery_Failure ลง Workflow_Audit_Log และ SHALL คงบันทึก Delivery_Failure นั้นไว้แม้ภายหลัง LINE API จะกลับมาใช้งานได้ (record the failure regardless of subsequent recovery)
4. WHERE LINE ไม่พร้อมใช้งาน, THE Workflow_Copilot_Manager SHALL อนุญาตให้บันทึก Approval_Decision ผ่าน web interface สำรอง
5. THE Workflow_Copilot_Manager SHALL ทำให้การอนุมัติทุกรายการสามารถดำเนินการผ่านช่องทางสำรองที่ไม่ใช่ LINE ได้ เพื่อไม่ให้การอนุมัติใดขึ้นกับความพร้อมใช้งานของ LINE เพียงช่องทางเดียว

### Requirement 19: ทะเบียนชนิดการกระทำและการจัดระดับ Autonomy (Action Type Registry & Autonomy Classification)

**User Story:** ในฐานะผู้กำกับธรรมาภิบาลแพลตฟอร์ม ฉันต้องการให้ทุกการกระทำของ AI/Copilot ถูกผูกกับระดับความเสี่ยงและเพดาน autonomy ที่ classify ได้ เพื่อให้งานความเสี่ยงสูงไม่มีทางทำงานอัตโนมัติโดยข้ามมนุษย์

> **ขอบเขต (D2 ตัวเลือก C):** Phase นี้ยก Autonomy_Ladder_Tier + Action_Type_Registry มาเพื่อ **classify/label เท่านั้น** ไม่ build เส้นทาง autonomous execution (ไม่มี `execute_autonomous_action` / guardrail / escalation_record)

#### Acceptance Criteria

1. THE Action_Type_Registry SHALL ผูกแต่ละ Action_Type กับ `risk_class` ∈ {low, medium, high}, `max_allowed_tier` ∈ Autonomy_Ladder_Tier และ `r02_bound` (boolean)
2. THE Action_Type_Registry SHALL บังคับด้วยข้อจำกัดระดับฐานข้อมูล (CHECK): IF `r02_bound = true` THEN `risk_class = high`; และ IF `risk_class ≠ low` THEN `max_allowed_tier` ∈ {L0_advisory, L1_propose}
3. WHERE Action_Type มาจาก Process_Step ที่มี PFMEA, THE Workflow_Copilot_Manager SHALL derive `risk_class` จาก Knowledge_Export ดังนี้: `computed` + Action_Priority = High → high; `computed` + Action_Priority = Medium → medium; `computed` + Action_Priority = Low → low; และ `severity_only` หรือ `not_assessed` (requiresHumanReview = true) → high (fail-safe ceiling)
4. WHEN Copilot จัด Autonomy_Tier ของการกระทำ, THE Workflow_Copilot_Manager SHALL ใช้ Action_Type_Registry เป็นแหล่ง classify โดยไม่ hard-code ค่าความเสี่ยง
5. THE Workflow_Copilot_Manager SHALL NOT สร้างเส้นทาง autonomous-execution (L2/L3 auto-execute, guardrail evaluation, escalation_record) ใน Phase นี้ โดย Autonomy_Ladder_Tier ใช้เพื่อ classify/label เท่านั้น และการบังคับ human-gate SHALL ทำผ่าน workflow การอนุมัติ (Requirement 4 และ Requirement 5)
6. WHEN มีการเรียก Action_Type ที่ไม่ได้ลงทะเบียนใน Action_Type_Registry, THE Workflow_Copilot_Manager SHALL ปฏิเสธการกระทำนั้น (unregistered action ดำเนินการไม่ได้)
7. WHERE Action_Type ไม่ผูกกับ Process_Step ที่มี PFMEA (เช่น delegation, notification, import), THE `risk_class` SHALL ถูกกำหนดด้วยมือใน registry โดย Governance_Role (ค่า default = `medium`; SHALL ไม่กำหนดเป็น low โดยไม่ตั้งใจ)
8. THE Action_Type SHALL ถูกนิยามที่ระดับ operation ที่ธรรมาภิบาลต้องการคุม (1 Action_Type = 1 governed operation เช่น `approve_design_signoff`, `production_release`) ไม่ใช่ต่อ RPC หรือต่อ row
9. WHEN Knowledge_Export ถูก re-import ด้วยค่าความเสี่ยงใหม่, THE Workflow_Copilot_Manager SHALL อัปเดต derived `risk_class` เฉพาะ Action ที่ derive จาก export (ค่าที่ตั้งด้วยมือ SHALL ไม่ถูกทับ) และ SHALL บันทึกการเปลี่ยน (เดิม→ใหม่) ลง Workflow_Audit_Log
10. THE การลงทะเบียนหรือแก้ไข Action_Type SHALL ทำผ่าน SECURITY DEFINER RPC ที่ตรวจสอบ Governance_Role ซ้ำภายในฟังก์ชันเท่านั้น
11. WHILE อยู่ใน Phase นี้ (D2 ตัวเลือก C), THE Action_Type_Registry SHALL จำกัด `max_allowed_tier` ของทุก Action_Type ไว้ที่ {L0_advisory, L1_propose} โดยไม่คำนึงถึง `risk_class` (รวมถึง `risk_class = low`) เพื่อให้สอดคล้องกับ Acceptance Criteria ข้อ 5 ที่ห้ามเส้นทาง autonomous-execution (L2/L3); การปลดเพดานนี้ SHALL ทำได้เฉพาะเมื่อ capture-spine เปิดเส้นทาง autonomous execution ในอนาคตเท่านั้น

### Requirement 20: ลูกค้าเป็นผู้อนุมัติแบบ Project-Scoped (Customer as Approver)

**User Story:** ในฐานะลูกค้า ฉันต้องการอนุมัติแบบ/3D ของโครงการตัวเองผ่าน LINE เพื่อให้งานไม่เดินต่อโดยที่ฉันยังไม่เห็นชอบ (ลด rework ที่เกิดจากการไม่ได้เซ็นอนุมัติ)

> **สถาปัตยกรรม:** Customer_Approver เป็น capability ระดับโครงการผ่าน `line_oa_customer_identity` โดยลูกค้า **ไม่เป็น DB principal** (ไม่มี Supabase session/RLS แบบ role) — การเข้าถึงผ่าน Edge Function gatekeeper เท่านั้น

#### Acceptance Criteria

1. THE Workflow_Copilot_Manager SHALL ผูก Customer_Approver ผ่าน `line_oa_customer_identity` (canonical customer_id) โดย Customer_Approver SHALL NOT มี App_Role หรือ Site_Access (เป็น project-scoped capability เท่านั้น)
2. WHERE Process_Step ∈ {Designer, 3D_Presentation, 3D_Rendering_Final}, THE Approver set SHALL = { internal approvers จาก `approvers` array ของ RACI entry (อาจ >1 คน; ดู ADR-018), Customer_Approver ของ Work_Item } และ Approval_Quorum SHALL = unanimous
3. WHEN Customer_Approver กดอนุมัติหรือปฏิเสธผ่าน LINE postback, THE Workflow_Copilot_Manager SHALL หาตัวผู้กระทำผ่าน `line_oa_customer_identity` และ SHALL อนุญาตก็ต่อเมื่อ (iff) resolved customer_id = `work_item.primary_customer_id` AND Encrypted_Postback ตรวจลายเซ็นผ่าน
4. THE Workflow_Copilot_Manager SHALL NOT เชื่อ customer identifier ที่ส่งจาก client โดยการตรงกันของ LINE_User_Id เพียงอย่างเดียว SHALL ไม่ถือว่าเพียงพอ (ขยายหลักการ anti-impersonation ใน Requirement 4 ให้ครอบ Customer_Approver)
5. WHERE เข้าเงื่อนไข escalation ของขั้นปล่อยงานเข้าผลิต (RPN หรือ Budget เกินเกณฑ์), THE Workflow_Copilot_Manager SHALL แทนที่ (replace) Approver ด้วย executive_owner ไม่ใช่การลงนามร่วม (co-sign)
6. THE Workflow_Copilot_Manager SHALL บันทึกทุกการอนุมัติ/ปฏิเสธของ Customer_Approver ลง Workflow_Audit_Log ด้วย customer_id โดยไม่บันทึกค่า PII (ชื่อ/เบอร์โทร)
7. WHERE Work_Item ไม่มี customer_id (โครงการภายใน), THE Approver set SHALL = internal lead เท่านั้น และ Approval_Quorum SHALL degrade เป็น single โดยไม่บล็อกรอ customer ที่ไม่มี
8. IF Customer_Approver ที่ต้องอนุมัติยังไม่มี `line_oa_customer_identity` ที่ active, THEN THE Workflow_Copilot_Manager SHALL เริ่ม binding flow และถ้าไม่สำเร็จภายในเวลาที่กำหนด SHALL ยกระดับไปยัง Project_Manager พร้อมบันทึกลง Workflow_Audit_Log (ไม่บล็อกเงียบ)
9. WHERE มีลูกค้าหลายคนต่อโครงการ, THE Workflow_Copilot_Manager SHALL ใช้ `primary_customer_approver` 1 คน (= ผู้เซ็นสัญญา) เป็น Customer_Approver และคนอื่น SHALL เป็น informed/consulted (ไม่ใช่ quorum ระหว่างลูกค้า)
10. WHEN Customer_Approver ปฏิเสธ, THE Revision_Reason SHALL ถูก classify โดย internal (Project_Manager หรือ lead) โดยลูกค้าให้เพียงเหตุผลแบบ free-text
11. WHILE รอ Customer approval, THE Workflow_Copilot_Manager SHALL ส่ง reminder ทาง LINE ตาม SLA (50% และ 100%) และ WHEN เกิน timeout SHALL ยกระดับไปยัง Project_Manager
12. THE การควบคุมการเข้าถึงสำหรับ Customer_Approver SHALL จำกัดให้เห็นเฉพาะ design-presentation artifacts (mood&tone board / 3D render / layout / construction drawing + คำขออนุมัติ) ของ Work_Item ที่ `primary_customer_id` ตรงเท่านั้น และ SHALL NOT เห็น cost, BOM unit price, production internals, PFMEA, RACI หรือโครงการอื่น

### Requirement 21: วินัยการแก้แบบและการล็อกแบบ (Revision Discipline & Design Locks)

**User Story:** ในฐานะผู้บริหารโครงการ ฉันต้องการควบคุมจำนวนการแก้แบบ แยกความผิด และล็อก baseline เพื่อไม่ให้เกิด rework วนไม่จบ และเพื่อให้ scope change ถูกคิดราคาใหม่อย่างถูกต้อง

> **โมเดล:** Soft model — การแก้เกินเกณฑ์ **แสดงต้นทุนประมาณการ + บังคับ PM อนุมัติ แต่ไม่คิดเงินลูกค้า** (visibility + accountability) ไม่ hard-block; field taxonomy = 4-gate (G1/G2/G3 customer, G4 internal)

#### Acceptance Criteria

1. WHEN Work_Item ถูก reject ที่ design หรือ 3D, THE Workflow_Copilot_Manager SHALL บันทึก `Revision_Reason` ∈ {daph_defect, customer_change, scope_change} (บังคับระบุ)
2. THE Workflow_Copilot_Manager SHALL นับเข้า revision threshold เฉพาะ `customer_change`; `daph_defect` SHALL NOT นับ (ส่งเข้า QA_Metric แทน); และ `scope_change` SHALL เข้า re-quote path
3. THE Design_Lock SHALL ถูกตั้งเป็นชั้นตาม gate: G1 (Mood&Tone/style/color — เมื่อลูกค้า approve ก่อน 3D), G2 (furniture layout/spatial — เมื่อ 3D_Presentation approve), G3 (material/finishes — เมื่อ 3D_Rendering_Final approve), G4 (construction/internal — เมื่อ Production Planning release)
4. WHEN change request แตะ field ที่ถูก lock ที่ gate ก่อนหน้าแล้ว, THE Workflow_Copilot_Manager SHALL จัดเป็น `scope_change` (ต้อง re-quote); ELSE SHALL จัดเป็น revision
5. THE Workflow_Copilot_Manager SHALL อนุญาต revision (`customer_change`) ฟรี 1 ครั้งต่อ gate; WHEN เกิน, THE Workflow_Copilot_Manager SHALL แสดงต้นทุนสะสมประมาณการแบบ gate-tiered และบังคับให้ Project_Manager อนุมัติ (executive_owner ถ้า break G1) ก่อนดำเนินการ — ในโหมด Soft model นี้ SHALL ไม่คิดเงินลูกค้า และ SHALL NOT hard-block
6. WHEN `request_scope_change` ถูกร้องขอ, THE Workflow_Copilot_Manager SHALL สร้าง re-quote เป็นกระบวนการอนุมัติแบบรวมศูนย์ฉบับเดียว (single consolidated re-quote) ที่ต้องได้รับอนุมัติจากทั้ง Project_Manager และ executive_owner บนชุดราคาเดียวกัน ก่อนดำเนินการต่อ; THE Workflow_Copilot_Manager SHALL NOT ถือว่าการอนุมัติแยกของแต่ละบทบาทบนคนละเวอร์ชันราคาเป็นการผ่าน re-quote
7. THE Workflow_Copilot_Manager SHALL บันทึกทุก revision, Design_Lock และ scope_change ลง Workflow_Audit_Log พร้อม reason, ผู้กระทำ, gate และ field
8. THE "revision" SHALL ถูกนับเป็น 1 reject-resubmit cycle (การ reject ครั้งเดียวพร้อมหลาย comment = 1 revision) ไม่นับเป็นราย comment
9. WHEN reject, THE Workflow_Copilot_Manager SHALL classify `Revision_Reason` แบบ deterministic ก่อนโดยเทียบกับ Design_Lock — การเปลี่ยนที่ขัด baseline ที่ลูกค้าเซ็น → `customer_change` หรือ `scope_change`; artifact ที่ไม่ตรง signed spec ที่ DAPH ผลิต → `daph_defect`; และเฉพาะเคสที่ไม่ deterministic Project_Manager SHALL ชี้ขาด
10. WHILE scope_change re-quote pending, THE Work_Item SHALL อยู่สถานะ `awaiting_requote` (ไม่เดินต่อ ไม่นับ SLA design); WHEN re-quote approved SHALL revert ไป gate ที่ field ถูกแก้แล้ว re-lock; WHEN rejected SHALL คงแบบเดิม
11. THE Design_Lock SHALL ถูกปลดได้เฉพาะผ่าน approved scope_change เท่านั้น (no silent unlock)
12. THE field taxonomy ต่อ gate SHALL ถูกกำหนดเป็น config (4-gate): G1 = {function_users, function_usage, function_storage, style, mood_tone, color_tone · Designer}; G2 = {furniture_layout, floor_plan, layout_plan, elevation_plan, ceiling_plan, lighting_layout, furniture_selection · 3D Presentation "ไม่มี MAT"}; G3 = {material_selection, finishes, lighting_selection, decoration_selection · 3D Rendering "มี MAT"}; G4 (internal) = {construction_drawing, dimensions, mep_positions, cabinet_wall_detail · Production Planning}; customer locks = G1/G2/G3, G4 = internal; THE การ classify scope_change SHALL อิง gate แรกสุดที่ field ถูก lock (ลำดับความแพง G1 > G2 > G3 > G4)
13. THE `daph_defect` revision SHALL ไม่นับเข้า threshold, SHALL ไม่มี cost display และ SHALL ถูกบันทึกเข้า QA_Metric พร้อม Process_Step และ responsible role
14. THE Customer_Approver SHALL สามารถ appeal การ classify reason ไปยัง executive_owner ได้; และอัตรา `daph_defect` ต่อทีม SHALL feed QA_Metric (กัน Project_Manager ซ่อน daph_defect เป็น customer_change)
15. WHEN `customer_change` เกิน 1 ครั้งต่อ gate, THE Workflow_Copilot_Manager SHALL แสดงต้นทุนสะสมประมาณการแบบ gate-tiered (break G1 > G2 > G3) ก่อนลูกค้ายืนยันคำขอแก้ (preventive transparency) — ในโหมด Soft model SHALL ไม่ออก invoice/ไม่คิดเงิน และการแก้เกินต้องผ่าน Project_Manager approval (executive_owner ถ้า break G1)
16. THE revision cost-display SHALL แยกจาก scope_change re-quote โดย revision = internal estimate ที่ไม่คิดเงิน ส่วน scope_change = product re-pricing ที่ผูกกับ costing (เป็นคนละกลไก)
17. WHEN internal re-quote (Acceptance Criteria ข้อ 6) ได้รับอนุมัติครบจาก Project_Manager และ executive_owner แล้ว, THE Workflow_Copilot_Manager SHALL ต้องการให้ `primary_customer_approver` ตอบรับราคาใหม่ผ่าน Edge Function gatekeeper เดียวกับ Requirement 20 ก่อนปลด Design_Lock และเดินงานต่อ; IF ลูกค้าไม่ตอบรับภายใน SLA ที่ตั้งค่าได้, THEN THE Workflow_Copilot_Manager SHALL คงสถานะ `awaiting_requote` ยกระดับไปยัง Project_Manager และบันทึกลง Workflow_Audit_Log โดย SHALL NOT ปลด Design_Lock, SHALL NOT เดินงานต่อ และ SHALL NOT บล็อกเงียบ
