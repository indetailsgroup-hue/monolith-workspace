# Requirements Document

## Introduction

เอกสารนี้กำหนดข้อกำหนด (requirements) ของ **MCP Layer** สำหรับแพลตฟอร์ม **Monolith** (AI-Native ERP ของ DAPH Decor — ธุรกิจออกแบบตกแต่งภายใน / ผลิตเฟอร์นิเจอร์) MCP Layer ทำหน้าที่เปิดเผยความสามารถ (capabilities) ของ Monolith ออกมาเป็น **MCP Tool** มาตรฐานตามโพรโทคอล Model Context Protocol (MCP) เพื่อให้ AI client เรียกใช้งานได้ผ่านสัญญาเดียวที่เป็นมาตรฐานกลาง

เป้าหมายเชิงกลยุทธ์ (ผ่านการตรวจสอบกับผู้บริหารในเซสชันที่ปรึกษาแล้ว) คือ **ยกระดับ AI จากผู้ให้คำแนะนำ (advisor) สู่ผู้ปฏิบัติการที่ถูกควบคุม (controlled operator)** — AI client สามารถ query ความรู้ สร้าง Work_Item และบันทึก Approval_Decision ผ่าน MCP Tool ได้ แต่ **ทุกการกระทำต้องอยู่ภายใต้ธรรมาภิบาลเดิมของแพลตฟอร์มเสมอ** โดยไม่มีข้อยกเว้น

### มาตรฐานอ้างอิง (MCP)

Model Context Protocol เปิดตัวโดย Anthropic เมื่อพฤศจิกายน 2024 และบริจาคให้ Agentic AI Foundation (ภายใต้ Linux Foundation) เมื่อธันวาคม 2025 จึงถือเป็น **มาตรฐานเปิดที่เป็นกลางต่อผู้ขาย (open, vendor-neutral standard)** สเปกฉบับพฤศจิกายน 2025 เพิ่มแนวคิดสำคัญที่เอกสารนี้อ้างอิง ได้แก่ async operations, statelessness, **server identity**, official extensions และ community Registry MCP Layer ของ Monolith ต้องสอดคล้องกับสัญญาโพรโทคอลนี้ ([Model Context Protocol — modelcontextprotocol.io](https://modelcontextprotocol.io)) — *เนื้อหาถูกเรียบเรียงใหม่เพื่อความสอดคล้องกับข้อกำหนดด้านลิขสิทธิ์*

### หลักการที่ยึด (Approved Design Baseline)

- **Human-in-the-loop เสมอ** — AI เสนอ มนุษย์ตัดสิน (system invariant); MCP Tool ประเภทเขียน/อนุมัติ ไม่ดำเนินการเองโดยไม่ผ่านมนุษย์
- **D2 Autonomy Ladder กำกับทุก Tool** — Read_Tool อาจทำงานอัตโนมัติได้; Write_Tool และ Approval_Tool ต้องผ่านการอนุมัติของมนุษย์
- **Reuse ไม่ fork** — MCP Layer ห่อหุ้ม (wrap) primitive เดิม (C12 security federation, Workflow_Audit_Log, D2 Autonomy Ladder, `rpc_record_approval_decision`, เส้นทาง query Knowledge_Export, notification) ไม่นิยามใหม่
- **PDPA / data minimization** — Tool ที่อาจเปิดเผย PII ต้อง redact / minimize ที่ขอบเขต Tool ก่อนข้อมูลออกไปยัง LLM ภายนอก
- **Fail-safe** — เมื่อกลไกธรรมาภิบาลไม่พร้อมใช้งาน ให้บล็อก ไม่ auto-pass (สอดคล้อง ADR-011)
- **MCP security เป็น first-class concern** — server identity, authz ต่อ Tool, audit ทุก Tool_Invocation
- **Self-contained** — ทุกอย่างอยู่ภายใน `determined-williams/`

### ขอบเขตและการพึ่งพา (Scope & Dependencies)

MCP Layer **บริโภคและห่อหุ้ม** สัญญาที่ส่งมอบแล้วของ `line-oa-commerce` (C12 / D2 / audit) และ `monolith-workflow-copilot` (Work_Item, Approval_Request, `rpc_record_approval_decision`, Knowledge_Export query path) ส่วนใดที่พึ่งพาให้ระบุเป็น **dependency/assumption ที่ชัดเจน** แทนการนิยามสัญญาเหล่านั้นซ้ำ

## Glossary

- **MCP_Layer_Manager**: ระบบของสเปกนี้ — เซิร์ฟเวอร์ที่เปิดเผยความสามารถของ Monolith เป็น MCP Tool พร้อมจัดการ server identity, การยืนยันตัวตน client, การอนุญาตต่อ Tool, การบังคับ D2 Autonomy Ladder, การ redact PII, การควบคุม PDPA และการ audit ทุก Tool_Invocation
- **MCP_Server**: ปลายทางที่ MCP_Layer_Manager เปิดให้บริการตามโพรโทคอล MCP ซึ่งประกาศ (advertise) MCP_Tool ที่มีให้ใช้
- **MCP_Client**: โปรแกรม AI หรือ host ภายนอกที่เชื่อมต่อ MCP_Server เพื่อค้นหาและเรียกใช้ MCP_Tool
- **External_LLM**: โมเดลภาษาขนาดใหญ่ภายนอกที่ทำงานเบื้องหลัง MCP_Client และเป็นปลายทางที่ข้อมูลจาก Tool อาจถูกส่งออกไป
- **MCP_Server_Identity**: อัตลักษณ์ของ MCP_Server ที่ตรวจสอบได้ตามแนวคิด server identity ของสเปก MCP (พ.ย. 2025) ใช้ให้ MCP_Client ยืนยันว่ากำลังเชื่อมต่อเซิร์ฟเวอร์ที่ถูกต้อง
- **Client_Credential**: ข้อมูลรับรองที่ MCP_Client ใช้ยืนยันตัวตนต่อ MCP_Server ซึ่งผูกกับ Principal และบทบาท C12
- **Principal**: ตัวตนผู้ใช้ที่ได้รับการยืนยันแล้วซึ่งอยู่เบื้องหลัง MCP_Client หนึ่งเซสชัน หาตัวผ่าน `public.resolve_actor()` และถือบทบาท C12
- **MCP_Tool**: ความสามารถหนึ่งของ Monolith ที่ถูกเปิดเผยตามสัญญา MCP ประกอบด้วยชื่อ, คำอธิบาย, schema ของ input และ schema ของ output
- **Tool_Catalog**: รายการ MCP_Tool ทั้งหมดที่ MCP_Server ประกาศให้ MCP_Client ค้นพบได้ (discovery)
- **Tool_Class**: ประเภทธรรมาภิบาลของ MCP_Tool หนึ่งค่าจากชุด {Read_Tool, Write_Tool, Approval_Tool}
- **Read_Tool**: MCP_Tool ประเภทอ่านอย่างเดียวที่ไม่เปลี่ยนสถานะของ Monolith (เช่น query Knowledge_Export)
- **Write_Tool**: MCP_Tool ที่สร้างหรือเปลี่ยนสถานะของ Monolith (เช่น สร้าง Work_Item)
- **Approval_Tool**: MCP_Tool ที่บันทึกการตัดสินใจเชิงอนุมัติ (เช่น บันทึก Approval_Decision)
- **Tool_Invocation**: การเรียกใช้ MCP_Tool หนึ่งครั้งจาก MCP_Client พร้อม input, Principal, เวลา และผลลัพธ์
- **Tool_Authorization**: การตรวจสิทธิ์ของ Principal ต่อ MCP_Tool หนึ่ง โดยอ้าง C12_Role และ `public.has_site_access()` ของ Site_Code ที่เกี่ยวข้อง
- **Autonomy_Tier**: ระดับความเสี่ยงตาม D2 Autonomy Ladder ที่กำหนดว่าการกระทำของ AI ดำเนินการอัตโนมัติได้หรือต้องผ่านการอนุมัติของมนุษย์ (นิยามใน `line-oa-commerce`)
- **Human_Approval_Gate**: การกั้นโดยมนุษย์ที่ Write_Tool และ Approval_Tool ต้องผ่าน โดยใช้ workflow การอนุมัติเดิมและบันทึกผลผ่าน `rpc_record_approval_decision`
- **Pending_Invocation**: สถานะของ Tool_Invocation ที่รอการอนุมัติจากมนุษย์ก่อนจะมีผลจริง (async) — Tool คืนค่าสถานะรอ ไม่บล็อกค้างจนกว่ามนุษย์ตัดสิน
- **PII**: ข้อมูลส่วนบุคคลที่ระบุตัวบุคคลได้ (เช่น ข้อมูลสนทนา LINE, ที่อยู่ลูกค้า, ข้อมูลบุคคลที่ฝังอยู่ในไฟล์ CAD)
- **Data_Minimization_Boundary**: ขอบเขตที่ MCP_Layer_Manager บังคับ redaction และ data minimization กับ output ของ Tool ก่อนส่งออกไปยัง MCP_Client / External_LLM
- **Redaction_Policy**: นโยบายที่ตั้งค่าได้ซึ่งกำหนดว่า field ใดของ output เป็น PII และต้องถูก redact หรือลดทอน
- **Consent_Record**: บันทึกความยินยอม (PDPA) ของเจ้าของข้อมูลที่อนุญาตให้ประมวลผล/เปิดเผยข้อมูลส่วนบุคคลของตน
- **Cross_Border_Transfer**: การส่งข้อมูลส่วนบุคคลออกนอกประเทศไทย ซึ่ง PDPA โดยทั่วไปห้ามเว้นแต่มีมาตรการคุ้มครองที่เพียงพอ
- **MCP_Audit_Log**: บันทึก audit แบบ append-only ของ Tool_Invocation ทุกครั้ง โดย reuse รูปแบบ Workflow_Audit_Log / LINE_OA_Audit_Log (append-only, immutable, redacted)
- **Knowledge_Export**: ข้อมูล machine-readable (JSON) ที่ `daph-obsidian-second-brain` ปล่อยออก ให้บริโภคแบบ read-only (นิยามใน `monolith-workflow-copilot`)
- **Work_Item**: หน่วยงานหนึ่งชิ้นที่เคลื่อนผ่าน Process_Step ต่าง ๆ (นิยามใน `monolith-workflow-copilot`)
- **Approval_Decision**: ผลการตัดสินของ Approver หนึ่งค่าจากชุด {approved, rejected} (นิยามใน `monolith-workflow-copilot`)
- **C12_Role / Governance_Role / Branch_Role**: บทบาทตามชั้นความปลอดภัย C12 (นิยามใน `line-oa-commerce`)
- **Site_Code**: ตัวระบุสาขาตาม A1 ชุดที่ใช้ได้คือผลของ `public.get_active_site_codes()`
- **Governance_Mechanism**: กลไกธรรมาภิบาลที่ Tool พึ่งพา ได้แก่ Tool_Authorization (C12), Human_Approval_Gate (`rpc_record_approval_decision`), Redaction_Policy, MCP_Audit_Log และการตรวจ Autonomy_Tier (D2)
- **Rate_Limit_Policy**: นโยบายที่ตั้งค่าได้ (configurable) ซึ่งกำหนดเพดานอัตราการเรียก MCP_Tool และเพดานต้นทุน (เช่น จำนวน Tool_Invocation ต่อหน่วยเวลา และปริมาณ token ของ External_LLM โดยประมาณ) ต่อ MCP_Client/Principal เพื่อกันการเรียกรัวและควบคุมต้นทุน
- **Rate_Limit_Scope**: ขอบเขตที่ใช้นับและบังคับ Rate_Limit_Policy หนึ่งค่าจากชุด {Principal, MCP_Client, Tool_Class} ซึ่งกำหนดว่าจะนับเพดานรวมที่ระดับใด
- **Cost_Budget**: เพดานต้นทุนสะสมที่ตั้งค่าได้ต่อ Rate_Limit_Scope ภายในหน้าต่างเวลาหนึ่ง ใช้ประเมินต้นทุนของ Tool_Invocation (เช่น ต้นทุน token ของ External_LLM และจำนวน Read_Tool ที่เรียก) เพื่อระงับเมื่อเกินงบ
- **Throttling_Event**: เหตุการณ์ที่ MCP_Layer_Manager ปฏิเสธ Tool_Invocation เพราะเกิน Rate_Limit_Policy หรือ Cost_Budget ซึ่งต้องถูกบันทึกลง MCP_Audit_Log
- **Invocation_Expiry**: ระยะเวลา/กำหนดหมดอายุที่ตั้งค่าได้ของ Pending_Invocation นับจากเวลาที่สร้าง ซึ่งเมื่อพ้นกำหนดก่อนมนุษย์ตัดสิน ให้ถือว่า Pending_Invocation นั้น expired
- **Expired_Invocation**: สถานะปลายทางของ Pending_Invocation ที่พ้น Invocation_Expiry ก่อนได้รับ Approval_Decision โดยถือเป็นผล expired ที่ **ไม่เท่ากับ** approved และไม่ก่อให้เกิดผลข้างเคียงต่อ Monolith
- **Cleanup_Process**: กระบวนการที่กวาด (sweep) Pending_Invocation ที่พ้น Invocation_Expiry ให้เปลี่ยนเป็น Expired_Invocation และบันทึกลง MCP_Audit_Log แทนการปล่อยค้างถาวร
- **Idempotency_Key**: ตัวระบุที่ MCP_Client ส่งมากับ Tool_Invocation ของ Write_Tool เพื่อให้การเรียกซ้ำด้วยคีย์เดิมไม่สร้าง Work_Item หรือ Pending_Invocation ซ้ำ
- **Idempotency_Record**: บันทึกที่ผูก Idempotency_Key หนึ่งค่าเข้ากับผลลัพธ์ของ Tool_Invocation ที่เคยประมวลผลแล้ว ใช้คืนผลเดิมเมื่อได้รับคีย์ซ้ำ
- **Model_Provenance**: ข้อมูลที่มาของ External_LLM ที่อยู่เบื้องหลัง Tool_Invocation (เช่น ตัวระบุโมเดลและผู้ให้บริการ) เท่าที่ MCP_Client เปิดเผย ใช้เพื่อการสืบสวนย้อนหลัง โดยบันทึกเป็น unknown เมื่อ MCP_Client ไม่เปิดเผย
- **Untrusted_Content**: ข้อมูลใด ๆ ที่มาจาก input ของ MCP_Client หรือเนื้อหาที่ Read_Tool ดึงมาจากแหล่งภายนอก ซึ่ง MCP_Layer_Manager ต้องถือว่าไม่น่าเชื่อถือและอาจมีคำสั่งฝังตัว (prompt injection / tool poisoning)
- **Source_Provenance**: ข้อมูลแหล่งที่มาของค่าหรือตัวเลขที่ผลลัพธ์ของ Tool อ้างอิง ซึ่ง trace กลับไปยังระเบียนต้นทางใน Knowledge_Export ได้ (เช่น source_version, imported_at, ตัวระบุระเบียน) เพื่อกันค่าที่เป็น placeholder หรือตัวเลขปลอม

## Requirements

### Requirement 1: การเปิดเผยความสามารถของ Monolith เป็น MCP Tool (Tool Exposure & Catalog)

**User Story:** ในฐานะผู้พัฒนา AI client ฉันต้องการค้นพบและเข้าใจความสามารถของ Monolith ผ่าน Tool_Catalog มาตรฐาน เพื่อให้เรียกใช้ความสามารถเหล่านั้นได้โดยไม่ต้องรู้รายละเอียดภายในของแพลตฟอร์ม

#### Acceptance Criteria

1. THE MCP_Layer_Manager SHALL เปิดเผยความสามารถของ Monolith แต่ละอย่างเป็น MCP_Tool ที่มีชื่อ คำอธิบาย schema ของ input และ schema ของ output ตามสัญญาโพรโทคอล MCP
2. WHEN MCP_Client ร้องขอ Tool_Catalog, THE MCP_Layer_Manager SHALL คืนรายการ MCP_Tool ที่ Principal ของเซสชันนั้นมีสิทธิ์เรียกใช้ตาม Tool_Authorization เท่านั้น
3. THE MCP_Layer_Manager SHALL กำกับ MCP_Tool แต่ละตัวด้วย Tool_Class หนึ่งค่าจากชุด {Read_Tool, Write_Tool, Approval_Tool}
4. THE MCP_Layer_Manager SHALL ห่อหุ้มความสามารถเดิมของ Monolith (เส้นทาง query Knowledge_Export, การสร้าง Work_Item, การบันทึก Approval_Decision ผ่าน `rpc_record_approval_decision`) แทนการนิยามความสามารถใหม่ที่เป็นแหล่งความจริงของตนเอง
5. IF MCP_Client ร้องขอ MCP_Tool ที่ไม่มีอยู่ใน Tool_Catalog, THEN THE MCP_Layer_Manager SHALL ปฏิเสธคำขอและคืนค่าความผิดพลาดที่ระบุว่า tool ไม่เป็นที่รู้จัก
6. THE MCP_Layer_Manager SHALL ประกาศ Tool_Class และข้อกำหนดการอนุมัติของ Write_Tool และ Approval_Tool แต่ละตัวไว้ใน metadata ของ MCP_Tool นั้น เพื่อให้ MCP_Client ทราบล่วงหน้าว่า Tool ใดต้องผ่าน Human_Approval_Gate

### Requirement 2: อัตลักษณ์เซิร์ฟเวอร์และการยืนยันตัวตน Client (Server Identity & Client Authentication)

**User Story:** ในฐานะผู้ดูแลความปลอดภัย ฉันต้องการให้ MCP_Server มีอัตลักษณ์ที่ตรวจสอบได้และ MCP_Client ทุกตัวต้องยืนยันตัวตนก่อนเรียกใช้ Tool เพื่อกันการปลอมตัวทั้งฝั่งเซิร์ฟเวอร์และฝั่ง client

#### Acceptance Criteria

1. THE MCP_Layer_Manager SHALL นำเสนอ MCP_Server_Identity ที่ตรวจสอบได้ต่อ MCP_Client ตามแนวคิด server identity ของสเปก MCP (พ.ย. 2025)
2. WHEN MCP_Client เริ่มต้นเซสชัน, THE MCP_Layer_Manager SHALL ยืนยัน Client_Credential และผูกเซสชันนั้นเข้ากับ Principal หนึ่งค่าที่หาตัวผ่าน `public.resolve_actor()`
3. IF MCP_Client เชื่อมต่อโดยไม่มี Client_Credential หรือ Client_Credential ตรวจสอบไม่ผ่าน, THEN THE MCP_Layer_Manager SHALL ปฏิเสธการเชื่อมต่อและคืนค่าความผิดพลาดด้านการยืนยันตัวตน
4. THE MCP_Layer_Manager SHALL หาบทบาทของ Principal ผ่าน `public.current_app_roles()` ของ C12 แทนการเก็บบทบาทซ้ำเป็นแหล่งความจริงของตนเอง
5. THE MCP_Layer_Manager SHALL ผูกทุก Tool_Invocation เข้ากับ Principal ที่ยืนยันแล้วของเซสชัน และ SHALL ไม่เชื่อตัวระบุผู้กระทำที่ส่งมาจาก MCP_Client โดยตรง
6. IF Client_Credential ของเซสชันถูกเพิกถอนหรือหมดอายุระหว่างเซสชัน, THEN THE MCP_Layer_Manager SHALL ปฏิเสธ Tool_Invocation ครั้งถัดไปของเซสชันนั้นและคืนค่าความผิดพลาดด้านการยืนยันตัวตน

### Requirement 3: การอนุญาตต่อ Tool ด้วยบทบาท C12 และสิทธิ์เข้าถึงสาขา (Per-Tool Authorization)

**User Story:** ในฐานะผู้ดูแล IT ฉันต้องการให้การเรียก MCP_Tool ทุกครั้งถูกควบคุมด้วยบทบาท C12 และ Site_Code ที่มีอยู่ เพื่อให้ AI client เข้าถึงได้เฉพาะสิ่งที่ Principal ของมันมีสิทธิ์จริง โดยไม่ต้องนิยามโมเดลสิทธิ์ใหม่

#### Acceptance Criteria

1. WHEN MCP_Client เรียก MCP_Tool หนึ่ง, THE MCP_Layer_Manager SHALL ตรวจ Tool_Authorization ของ Principal ผ่าน `public.has_any_app_role()` ก่อนดำเนินการใด ๆ ของ Tool นั้น
2. WHERE MCP_Tool ดำเนินการกับข้อมูลที่ผูกกับ Site_Code หนึ่ง, THE MCP_Layer_Manager SHALL จำกัดการดำเนินการให้เฉพาะ Site_Code ที่ `public.has_site_access()` คืนค่า true สำหรับ Principal นั้น
3. WHILE Principal ถือ Governance_Role, THE MCP_Layer_Manager SHALL อนุญาตให้ Read_Tool อ่านข้อมูลข้ามทุก Site_Code
4. IF Principal ไม่มี C12_Role ที่อนุญาตสำหรับ MCP_Tool หรือ Site_Code ที่ร้องขอ, THEN THE MCP_Layer_Manager SHALL ปฏิเสธ Tool_Invocation และคืนค่าความผิดพลาดสิทธิ์ไม่เพียงพอ
5. THE MCP_Layer_Manager SHALL บังคับการควบคุมการเข้าถึงผ่าน Supabase RLS policy ที่ gate `TO authenticated` และ SECURITY DEFINER RPC ที่ตรวจบทบาทผู้เรียกซ้ำภายในฟังก์ชัน โดยนำ `public.has_any_app_role()`, `public.has_site_access()` และ `public.is_governance_role()` กลับมาใช้ และ SHALL ไม่ข้ามความปลอดภัยด้วย service_role จาก client
6. IF Site_Code ที่ MCP_Tool อ้างอิงไม่อยู่ในผลของ `public.get_active_site_codes()`, THEN THE MCP_Layer_Manager SHALL ปฏิเสธ Tool_Invocation และคืนค่าความผิดพลาดที่ระบุว่า site_code ไม่เป็นที่รู้จักหรือไม่มีผล

### Requirement 4: การบังคับ D2 Autonomy Ladder ต่อ Tool (Autonomy Enforcement per Tool)

**User Story:** ในฐานะผู้นำด้านธรรมาภิบาล ฉันต้องการให้ MCP_Tool ทุกตัวถูกจัดระดับตาม D2 Autonomy Ladder ก่อนทำงาน เพื่อให้เฉพาะ Read_Tool ความเสี่ยงต่ำทำงานอัตโนมัติได้ ส่วน Write_Tool และ Approval_Tool ต้องผ่านมนุษย์

#### Acceptance Criteria

1. WHEN MCP_Client เรียก MCP_Tool หนึ่ง, THE MCP_Layer_Manager SHALL จัด Autonomy_Tier ของ Tool_Invocation นั้นตาม D2 Autonomy Ladder ก่อนตัดสินใจอนุญาตหรือระงับ
2. WHERE MCP_Tool เป็น Read_Tool ที่ Autonomy_Tier อนุญาตให้ดำเนินการอัตโนมัติได้, THE MCP_Layer_Manager SHALL ดำเนินการ Tool_Invocation นั้นได้โดยอัตโนมัติภายใต้ guardrail ของ D2
3. WHERE MCP_Tool เป็น Write_Tool หรือ Approval_Tool, THE MCP_Layer_Manager SHALL จัดให้ Tool_Invocation นั้นต้องผ่าน Human_Approval_Gate และ SHALL ไม่ดำเนินการให้มีผลจริงจนกว่ามนุษย์จะอนุมัติ
4. THE MCP_Layer_Manager SHALL จัด Autonomy_Tier ของ Tool_Invocation ให้เสร็จก่อนทำการอนุญาตหรือระงับการดำเนินการของ Tool นั้น
5. IF การกระทำของ Tool ถูกจัดอยู่ใน Autonomy_Tier ที่ต้องการการอนุมัติจากมนุษย์, THEN THE MCP_Layer_Manager SHALL ระงับการกระทำนั้นไว้เป็น Pending_Invocation จนกว่ามนุษย์จะอนุมัติผ่าน Human_Approval_Gate
6. THE MCP_Layer_Manager SHALL จัดระดับ Autonomy_Tier โดยอ้างกลไก D2 Autonomy Ladder ของ `line-oa-commerce` แทนการนิยามบันไดความเป็นอิสระใหม่ภายในสเปกนี้

### Requirement 5: มนุษย์ในวงจรสำหรับ Tool ประเภทเขียน/อนุมัติ (Human-in-the-Loop for Write & Approval Tools)

**User Story:** ในฐานะผู้บริหาร ฉันต้องการให้ทุกการกระทำที่ AI เสนอผ่าน Write_Tool หรือ Approval_Tool ต้องให้มนุษย์ตัดสินก่อนมีผลจริง เพื่อให้ AI เป็นผู้ปฏิบัติการที่ถูกควบคุม ไม่ใช่ผู้ตัดสินใจแทนมนุษย์

#### Acceptance Criteria

1. WHEN MCP_Client เรียก Write_Tool หรือ Approval_Tool, THE MCP_Layer_Manager SHALL สร้าง Pending_Invocation และส่งคำขออนุมัติเข้าสู่ workflow การอนุมัติเดิมของ `monolith-workflow-copilot` แทนการดำเนินการให้มีผลทันที
2. THE MCP_Layer_Manager SHALL บันทึกผลการอนุมัติของ Pending_Invocation ผ่าน `rpc_record_approval_decision` ซึ่งเป็นเส้นทางเดียวกับการอนุมัติของมนุษย์ปกติ แทนการสร้างเส้นทางอนุมัติใหม่
3. WHEN มนุษย์อนุมัติ Pending_Invocation, THE MCP_Layer_Manager SHALL ดำเนินการ Tool_Invocation ที่เกี่ยวข้องให้มีผลจริงและส่งผลลัพธ์กลับไปยัง MCP_Client แบบ async
4. WHEN มนุษย์ปฏิเสธ Pending_Invocation, THE MCP_Layer_Manager SHALL ยกเลิก Tool_Invocation นั้นโดยไม่เปลี่ยนสถานะของ Monolith และคืนผล rejected ไปยัง MCP_Client
5. WHILE Pending_Invocation ยังไม่ได้รับ Approval_Decision, THE MCP_Layer_Manager SHALL คงสถานะของ Monolith ไว้โดยไม่ให้ Tool_Invocation นั้นมีผลข้างเคียง (no side effects)
6. THE MCP_Layer_Manager SHALL ไม่ดำเนินการ Write_Tool หรือ Approval_Tool ให้มีผลจริงโดยอัตโนมัติในทุกกรณี โดยถือว่าการกระทำเหล่านั้นต้องผ่านการตัดสินของมนุษย์เสมอ (human-in-the-loop invariant)

### Requirement 6: Tool อ่านความรู้จาก Knowledge Export (Knowledge Query Tool)

**User Story:** ในฐานะ AI client ฉันต้องการ query ความรู้ของ Monolith (PFMEA/RPN, โมเดลกระบวนการ, RACI) ผ่าน Read_Tool เพื่อใช้ประกอบการให้คำแนะนำ โดยไม่แก้ไขความรู้ต้นทาง

#### Acceptance Criteria

1. THE MCP_Layer_Manager SHALL เปิดเผย Read_Tool สำหรับ query Knowledge_Export ที่บริโภคข้อมูลแบบ read-only ผ่านเส้นทาง Knowledge_Export ที่ `monolith-workflow-copilot` ใช้
2. WHEN MCP_Client เรียก Read_Tool สำหรับ Knowledge_Export, THE MCP_Layer_Manager SHALL คืนเฉพาะข้อมูลที่ Principal มีสิทธิ์เข้าถึงตาม Tool_Authorization
3. THE MCP_Layer_Manager SHALL ไม่เขียนกลับหรือแก้ไขความรู้ต้นทางใน Obsidian Vault ผ่าน MCP_Tool ใด ๆ
4. WHERE ผลลัพธ์ของ Read_Tool อ้างอิงความรู้จาก Knowledge_Export, THE MCP_Layer_Manager SHALL แนบ source_version และ imported_at ของความรู้ที่ใช้ไปกับผลลัพธ์
5. IF ความรู้ที่ query มี review_status ไม่เท่ากับ approved หรือเก่ากว่า freshness threshold ที่ตั้งค่าได้, THEN THE MCP_Layer_Manager SHALL ทำเครื่องหมายผลลัพธ์นั้นว่า low confidence แทนการซ่อนข้อมูล

### Requirement 7: Tool สร้าง Work Item (Work Item Creation Tool)

**User Story:** ในฐานะ AI client ฉันต้องการเสนอการสร้าง Work_Item ผ่าน Write_Tool เพื่อให้งานเข้าสู่กระบวนการ โดยการสร้างจริงต้องผ่านการอนุมัติของมนุษย์

#### Acceptance Criteria

1. THE MCP_Layer_Manager SHALL เปิดเผย Write_Tool สำหรับสร้าง Work_Item ที่ห่อหุ้มกลไกการสร้าง Work_Item เดิมของ `monolith-workflow-copilot`
2. WHEN MCP_Client เรียก Write_Tool สำหรับสร้าง Work_Item, THE MCP_Layer_Manager SHALL สร้าง Pending_Invocation และส่งเข้าสู่ Human_Approval_Gate ตาม Requirement 5 แทนการสร้าง Work_Item ทันที
3. THE MCP_Layer_Manager SHALL ผูก Work_Item ที่จะสร้างเข้ากับ Site_Code หนึ่งค่าที่อยู่ในผลของ `public.get_active_site_codes()`
4. IF input ของ Write_Tool อ้างถึง Process_Step ที่ไม่มีอยู่ใน Knowledge_Export ของโมเดลกระบวนการ, THEN THE MCP_Layer_Manager SHALL ปฏิเสธ Tool_Invocation และคืนค่าความผิดพลาดที่ระบุว่าขั้นตอนไม่เป็นที่รู้จัก
5. WHEN มนุษย์อนุมัติ Pending_Invocation ของการสร้าง Work_Item, THE MCP_Layer_Manager SHALL สร้าง Work_Item ผ่านกลไกเดิมและคืนตัวระบุของ Work_Item ที่สร้างไปยัง MCP_Client

### Requirement 8: Tool บันทึก Approval Decision (Approval Recording Tool)

**User Story:** ในฐานะ AI client ฉันต้องการเสนอการบันทึก Approval_Decision ผ่าน Approval_Tool เพื่อสนับสนุนกระบวนการอนุมัติ โดยการบันทึกจริงต้องเป็นการตัดสินของมนุษย์ที่มีสิทธิ์เท่านั้น

#### Acceptance Criteria

1. THE MCP_Layer_Manager SHALL เปิดเผย Approval_Tool สำหรับบันทึก Approval_Decision ที่ห่อหุ้ม `rpc_record_approval_decision` เดิม
2. WHEN MCP_Client เรียก Approval_Tool, THE MCP_Layer_Manager SHALL สร้าง Pending_Invocation และส่งให้มนุษย์ที่เป็น Approver ที่ถูกหาตัวสำหรับ Approval_Request นั้นตัดสินผ่าน Human_Approval_Gate
3. THE MCP_Layer_Manager SHALL บันทึก Approval_Decision ผ่าน `rpc_record_approval_decision` โดยหาตัวผู้ตัดสินที่เป็นมนุษย์ผ่าน `public.resolve_actor()` แทนการเชื่อ Principal ของ MCP_Client ว่าเป็นผู้อนุมัติ
4. IF มนุษย์ที่ตัดสินไม่ใช่ Approver ที่ถูกหาตัวสำหรับ Approval_Request นั้น, THEN THE MCP_Layer_Manager SHALL ปฏิเสธการบันทึกและคืนค่าความผิดพลาดสิทธิ์ไม่เพียงพอ
5. IF Approval_Request ที่อ้างถึงถูกตัดสินไปแล้ว, THEN THE MCP_Layer_Manager SHALL คงผล Approval_Decision เดิมไว้ (idempotent) และแจ้งผลกลับไปยัง MCP_Client ว่าคำขอนี้ได้รับการตัดสินไปแล้ว แทนการบันทึกซ้ำ

### Requirement 9: การ Redact PII และ Data Minimization ที่ขอบเขต Tool (PII Redaction & Data Minimization)

**User Story:** ในฐานะเจ้าหน้าที่คุ้มครองข้อมูล ฉันต้องการให้ข้อมูลส่วนบุคคลถูก redact หรือลดทอนที่ขอบเขต Tool ก่อนออกไปยัง LLM ภายนอก เพื่อไม่ให้ PII รั่วไหลออกนอกระบบ

#### Acceptance Criteria

1. WHEN MCP_Tool จะส่ง output ไปยัง MCP_Client, THE MCP_Layer_Manager SHALL บังคับใช้ Redaction_Policy ที่ Data_Minimization_Boundary กับ field ที่เป็น PII ก่อนข้อมูลออกจากระบบ
2. THE MCP_Layer_Manager SHALL จำกัด output ของ Tool ให้มีเฉพาะ field ที่จำเป็นต่อวัตถุประสงค์ของ Tool นั้น (data minimization) แทนการคืนระเบียนทั้งหมด
3. WHERE output มีข้อมูลสนทนา LINE ที่อยู่ลูกค้า หรือข้อมูลบุคคลที่ฝังอยู่ในไฟล์ CAD, THE MCP_Layer_Manager SHALL redact หรือลดทอนข้อมูลส่วนบุคคลเหล่านั้นตาม Redaction_Policy ก่อนส่งออก
4. IF การบังคับใช้ Redaction_Policy กับ output ของ Tool ล้มเหลว, THEN THE MCP_Layer_Manager SHALL ระงับการส่ง output นั้นออกไปยัง MCP_Client แบบ fail-safe และคืนค่าความผิดพลาด แทนการส่งข้อมูลที่ยัง redact ไม่สำเร็จ
5. THE MCP_Layer_Manager SHALL อ่าน Redaction_Policy จากการตั้งค่า (configurable) แทนการ hard-code รายการ field ที่เป็น PII
6. THE MCP_Layer_Manager SHALL บันทึกว่ามีการบังคับใช้ Redaction_Policy กับ Tool_Invocation นั้นลง MCP_Audit_Log โดยไม่บันทึกค่า PII ที่ถูก redact ลงในบันทึก

### Requirement 10: ความยินยอม PDPA และการควบคุมการส่งข้อมูลข้ามพรมแดน (PDPA Consent & Cross-Border Control)

**User Story:** ในฐานะเจ้าหน้าที่คุ้มครองข้อมูล ฉันต้องการให้การเปิดเผยข้อมูลส่วนบุคคลผ่าน Tool อยู่ภายใต้ความยินยอมและข้อจำกัดการส่งข้ามพรมแดนตาม PDPA เพื่อให้สอดคล้องกฎหมายไทย

#### Acceptance Criteria

1. IF MCP_Tool จะเปิดเผยข้อมูลส่วนบุคคลของเจ้าของข้อมูลที่ไม่มี Consent_Record ที่มีผลครอบคลุมวัตถุประสงค์นั้น, THEN THE MCP_Layer_Manager SHALL ระงับการเปิดเผยและคืนค่าความผิดพลาดที่ระบุว่าขาดความยินยอม
2. WHERE External_LLM ที่อยู่เบื้องหลัง MCP_Client ประมวลผลข้อมูลนอกประเทศไทย, THE MCP_Layer_Manager SHALL ถือว่าการส่ง output ที่มีข้อมูลส่วนบุคคลเป็น Cross_Border_Transfer และ SHALL บังคับใช้ Redaction_Policy เพื่อลดทอนข้อมูลส่วนบุคคลก่อนส่ง
3. IF Cross_Border_Transfer ของข้อมูลส่วนบุคคลเกิดขึ้นโดยไม่มีมาตรการคุ้มครองที่เพียงพอตามที่ตั้งค่าไว้, THEN THE MCP_Layer_Manager SHALL ระงับการส่งข้อมูลส่วนบุคคลนั้นแบบ fail-safe
4. THE MCP_Layer_Manager SHALL บันทึกการตรวจ Consent_Record และการจัดประเภท Cross_Border_Transfer ของแต่ละ Tool_Invocation ที่เกี่ยวกับข้อมูลส่วนบุคคลลง MCP_Audit_Log
5. THE MCP_Layer_Manager SHALL หา Consent_Record และมาตรการคุ้มครองข้ามพรมแดนจากการตั้งค่า/แหล่งข้อมูลเดิมของแพลตฟอร์ม แทนการนิยามแบบจำลองความยินยอมใหม่ภายในสเปกนี้

### Requirement 11: การ Audit ทุก Tool Invocation (Full Audit Trail)

**User Story:** ในฐานะผู้ตรวจสอบ ฉันต้องการบันทึกที่แก้ไขไม่ได้ของการเรียก MCP_Tool ทุกครั้ง เพื่อให้สืบย้อนได้ว่า AI client ใดเรียก Tool ใด เมื่อใด ด้วยผลลัพธ์อะไร

#### Acceptance Criteria

1. WHEN เกิด Tool_Invocation, THE MCP_Layer_Manager SHALL บันทึก MCP_Audit_Log หนึ่งรายการที่ประกอบด้วยชื่อ MCP_Tool, Tool_Class, Principal (ผ่าน `public.resolve_actor()`), Site_Code (เมื่อทราบ), Autonomy_Tier, ผลลัพธ์ และเวลา (UTC)
2. THE MCP_Layer_Manager SHALL เก็บ MCP_Audit_Log ในตารางแบบ append-only ที่บังคับความไม่เปลี่ยนแปลง (immutability) ด้วยข้อจำกัดระดับฐานข้อมูล (trigger และ permission) ที่ปฏิเสธการ UPDATE และ DELETE โดยอิสระจากการป้องกันระดับแอปพลิเคชัน
3. THE MCP_Layer_Manager SHALL ลบหรือปกปิดค่าความลับ (เช่น Client_Credential, token, channel secret) และค่า PII ออกจากทุกรายการ MCP_Audit_Log
4. WHEN Pending_Invocation ได้รับ Approval_Decision, THE MCP_Layer_Manager SHALL บันทึกผลการอนุมัติ ผู้ตัดสิน (ผ่าน `public.resolve_actor()`) และเวลา (UTC) ลง MCP_Audit_Log
5. WHEN Governance_Role หรือ Branch_Role ที่มีสิทธิ์เข้าถึง Site_Code หนึ่ง query MCP_Audit_Log, THE MCP_Layer_Manager SHALL คืนเฉพาะรายการที่ผู้เรียกมีสิทธิ์เข้าถึงตาม RLS
6. THE MCP_Layer_Manager SHALL คงรายการ MCP_Audit_Log ไว้เสมอไม่ว่าการลบค่าความลับหรือ PII จะสำเร็จหรือล้มเหลว แทนการทิ้งรายการ audit

### Requirement 12: พฤติกรรม Fail-Safe เมื่อกลไกธรรมาภิบาลไม่พร้อม (Fail-Safe on Governance Unavailability)

**User Story:** ในฐานะผู้นำด้านธรรมาภิบาล ฉันต้องการให้ MCP_Tool ถูกบล็อกเมื่อกลไกธรรมาภิบาลใด ๆ ไม่พร้อมใช้งาน เพื่อไม่ให้ AI กระทำการโดยปราศจากการควบคุม (สอดคล้อง ADR-011)

#### Acceptance Criteria

1. IF Governance_Mechanism ที่ Tool_Invocation พึ่งพา (Tool_Authorization, Human_Approval_Gate, Redaction_Policy, MCP_Audit_Log หรือการตรวจ Autonomy_Tier) ไม่พร้อมใช้งาน, THEN THE MCP_Layer_Manager SHALL บล็อก Tool_Invocation นั้นแบบ fail-safe และ SHALL ไม่ดำเนินการต่อ
2. IF Human_Approval_Gate ของ Write_Tool หรือ Approval_Tool ไม่พร้อมใช้งาน, THEN THE MCP_Layer_Manager SHALL บล็อกการกระทำนั้นและ SHALL ไม่ดำเนินการให้มีผลโดยปราศจากการอนุมัติ
3. IF การจัด Autonomy_Tier ของ Tool_Invocation ทำไม่สำเร็จ, THEN THE MCP_Layer_Manager SHALL ถือว่า Tool_Invocation นั้นต้องการการอนุมัติจากมนุษย์เป็นค่าตั้งต้น และ SHALL ไม่ auto-pass
4. IF MCP_Audit_Log ไม่สามารถบันทึก Tool_Invocation ได้, THEN THE MCP_Layer_Manager SHALL ปฏิเสธการดำเนินการของ Tool ที่มีผลข้างเคียงนั้นแบบ fail-safe แทนการดำเนินการโดยไม่มีร่องรอยตรวจสอบ
5. THE MCP_Layer_Manager SHALL คืนค่าความผิดพลาดที่ระบุเหตุของการบล็อกแบบ fail-safe ไปยัง MCP_Client แทนการเพิกเฉยอย่างเงียบ ๆ

### Requirement 13: การตรวจสอบ Schema ของ Input/Output และคุณสมบัติ Round-Trip (Tool I/O Schema Validation & Round-Trip)

**User Story:** ในฐานะสถาปนิกระบบ ฉันต้องการให้ข้อความ MCP และ input/output ของ Tool ผ่านการตรวจ schema และคงค่าเดิมเมื่อ serialize แล้ว parse กลับ เพื่อกันข้อมูลเพี้ยนระหว่างขอบเขต client/server

#### Acceptance Criteria

1. WHEN MCP_Layer_Manager รับ input ของ MCP_Tool จาก MCP_Client, THE MCP_Layer_Manager SHALL ตรวจสอบ input นั้นกับ schema ของ MCP_Tool ก่อนดำเนินการ
2. IF input ของ MCP_Tool ไม่ตรงกับ schema ของ MCP_Tool, THEN THE MCP_Layer_Manager SHALL ปฏิเสธ Tool_Invocation และคืนค่าความผิดพลาดที่ระบุว่า input ไม่ถูกต้องตาม schema
3. THE MCP_Layer_Manager SHALL ประกอบ output ของ MCP_Tool ให้ตรงกับ schema ของ output ที่ประกาศไว้ใน Tool_Catalog
4. FOR ALL output ของ MCP_Tool ที่ถูกต้องตาม schema, THE MCP_Layer_Manager SHALL ทำให้การ serialize เป็นข้อความ MCP แล้ว parse กลับ ได้ผลลัพธ์ที่เทียบเท่ากับ output เดิม (round-trip property)
5. FOR ALL input ของ MCP_Tool ที่ถูกต้องตาม schema, THE MCP_Layer_Manager SHALL ทำให้การ parse จากข้อความ MCP แล้ว serialize กลับ ได้ข้อความที่เทียบเท่ากับข้อความเดิม (round-trip property)

### Requirement 14: Reuse Primitive เดิมและการ Self-Contained (Reuse-Not-Fork & Self-Containment)

**User Story:** ในฐานะสถาปนิกระบบ ฉันต้องการให้ MCP Layer ห่อหุ้ม primitive เดิมและอยู่ภายใน `determined-williams/` ทั้งหมด เพื่อให้ได้ security/audit/governance ที่สอดคล้องกันและไม่สร้างการพึ่งพาภายนอกใหม่

#### Acceptance Criteria

1. THE MCP_Layer_Manager SHALL นำกลับมาใช้ (reuse) C12 security federation, Workflow_Audit_Log/รูปแบบ audit เดิม, D2 Autonomy Ladder, `rpc_record_approval_decision`, เส้นทาง query Knowledge_Export และ notification แทนการนิยาม primitive เหล่านั้นใหม่
2. THE MCP_Layer_Manager SHALL คงทุกองค์ประกอบของ MCP Layer ไว้ภายในเวิร์กสเปซ `determined-williams/` (self-contained)
3. WHERE MCP_Layer_Manager พึ่งพาสัญญาของ `line-oa-commerce`, `monolith-workflow-copilot` หรือ `daph-obsidian-second-brain`, THE MCP_Layer_Manager SHALL อ้างอิงสัญญานั้นตามชื่อ แทนการ fork หรือนิยามซ้ำ
4. THE MCP_Layer_Manager SHALL ไม่สร้างโมเดลสิทธิ์ ช่องทางอนุมัติ หรือรูปแบบ audit ใหม่ที่ขนานกับของเดิม

### Requirement 15: การจำกัดอัตราการเรียกและการควบคุมต้นทุน (Rate-Limiting & Cost Control)

**User Story:** ในฐานะผู้บริหาร ฉันต้องการให้การเรียก MCP_Tool ของ AI client ถูกจำกัดอัตราและควบคุมต้นทุนต่อ MCP_Client/Principal เพื่อกัน AI เรียก Read_Tool รัวและคุมต้นทุน token ของ External_LLM ไม่ให้บานปลาย

#### Acceptance Criteria

1. WHEN MCP_Client เรียก MCP_Tool หนึ่ง, THE MCP_Layer_Manager SHALL ประเมิน Rate_Limit_Policy และ Cost_Budget ของทุก Rate_Limit_Scope ที่เกี่ยวข้องกับ Tool_Invocation นั้น (Principal, MCP_Client และ Tool_Class) ก่อนดำเนินการของ Tool และ SHALL ปฏิเสธ Tool_Invocation นั้นเมื่อ Rate_Limit_Scope ใดค่าหนึ่งละเมิดเพดานของตน
2. WHEN การนับ Tool_Invocation ของ Rate_Limit_Scope หนึ่งเมื่อรวมครั้งปัจจุบันแล้วจะเกินเพดานของ Rate_Limit_Policy ภายในหน้าต่างเวลาที่ตั้งค่าไว้, THE MCP_Layer_Manager SHALL ปฏิเสธ Tool_Invocation นั้นแบบ fail-safe โดยไม่ดำเนินการความสามารถเบื้องหลัง (no side effects) และคืนค่าความผิดพลาดที่ระบุ Rate_Limit_Scope ที่ละเมิดและหน้าต่างเวลาที่ใช้นับ
3. WHEN ต้นทุนสะสมที่ประเมินได้ของ Rate_Limit_Scope หนึ่งเมื่อรวมต้นทุนของครั้งปัจจุบันแล้วถึงหรือเกิน Cost_Budget ภายในหน้าต่างเวลาที่ตั้งค่าไว้, THE MCP_Layer_Manager SHALL ปฏิเสธ Tool_Invocation นั้นแบบ fail-safe โดยไม่ดำเนินการความสามารถเบื้องหลัง (no side effects) และคืนค่าความผิดพลาดที่ระบุ Rate_Limit_Scope ที่ละเมิดและหน้าต่างเวลาที่ใช้นับ
4. WHEN MCP_Layer_Manager ปฏิเสธ Tool_Invocation เพราะเกิน Rate_Limit_Policy หรือ Cost_Budget, THE MCP_Layer_Manager SHALL บันทึก Throttling_Event ลง MCP_Audit_Log พร้อม Rate_Limit_Scope, MCP_Tool, Principal (ผ่าน `public.resolve_actor()`), เหตุของการปฏิเสธ และเวลา (UTC)
5. THE MCP_Layer_Manager SHALL อ่านเพดานของ Rate_Limit_Policy, Cost_Budget และหน้าต่างเวลาที่ใช้นับจากการตั้งค่า (configurable) แทนการ hard-code ค่าเหล่านั้นไว้ในโค้ด
6. IF ไม่มี Rate_Limit_Policy หรือ Cost_Budget ที่กำหนดเฉพาะ Rate_Limit_Scope หนึ่ง, THEN THE MCP_Layer_Manager SHALL ใช้นโยบาย default ที่ตั้งค่าได้ (configurable) กับ Rate_Limit_Scope นั้นแบบ fail-safe แทนการถือว่า Rate_Limit_Scope นั้นไม่มีเพดาน
7. WHILE มี Tool_Invocation ของ Rate_Limit_Scope เดียวกันหลายรายการถูกประเมินพร้อมกัน, THE MCP_Layer_Manager SHALL นับและบังคับเพดานแบบ atomic เพื่อให้จำนวน Tool_Invocation ที่ดำเนินการจริงไม่เกินเพดานของ Rate_Limit_Policy (no race-condition overshoot)
8. IF กลไกที่ใช้ประเมินหรือบังคับ Rate_Limit_Policy ไม่พร้อมใช้งาน, THEN THE MCP_Layer_Manager SHALL ปฏิเสธ Tool_Invocation ที่มีผลข้างเคียงนั้นแบบ fail-safe แทนการปล่อยให้ผ่านโดยไม่มีการควบคุมอัตรา

### Requirement 16: การหมดอายุและการเก็บกวาด Pending Invocation (Pending_Invocation Expiry & Cleanup)

**User Story:** ในฐานะผู้นำด้านธรรมาภิบาล ฉันต้องการให้ Pending_Invocation ที่รอมนุษย์ตัดสินมีกำหนดหมดอายุและถูกเก็บกวาด เพื่อไม่ให้คำขอค้างถาวรเมื่อไม่มีมนุษย์ตัดสิน โดยการหมดอายุต้องไม่ก่อผลข้างเคียงต่อระบบ

#### Acceptance Criteria

1. WHEN MCP_Layer_Manager สร้าง Pending_Invocation, THE MCP_Layer_Manager SHALL กำหนด Invocation_Expiry ให้ Pending_Invocation นั้นจากค่า timeout ที่ตั้งค่าได้ (configurable) ในช่วงตั้งแต่ 1 ชั่วโมงถึง 30 วัน โดยมีค่าตั้งต้น 72 ชั่วโมง และอ้างอิงเวลา UTC
2. IF Pending_Invocation พ้น Invocation_Expiry ก่อนได้รับ Approval_Decision, THEN THE MCP_Layer_Manager SHALL เปลี่ยนสถานะของ Pending_Invocation นั้นเป็น Expired_Invocation โดยไม่เปลี่ยนสถานะของ Monolith และไม่ก่อผลข้างเคียงใด ๆ (no side effects)
3. WHEN Pending_Invocation กลายเป็น Expired_Invocation, THE MCP_Layer_Manager SHALL คืนผล expired ไปยัง MCP_Client โดยผล expired นั้น SHALL แยกแยะได้จากทั้งผล approved และผล rejected (human-in-the-loop invariant)
4. THE MCP_Layer_Manager SHALL ดำเนินการ Cleanup_Process เป็นรอบไม่เกินทุก 5 นาที ที่เปลี่ยน Pending_Invocation ซึ่งพ้น Invocation_Expiry และยังไม่ได้รับ Approval_Decision ทุกรายการให้เป็น Expired_Invocation ภายใน 5 นาทีหลังพ้นกำหนด แทนการปล่อยให้ค้างอยู่ในสถานะรอ
5. WHEN Pending_Invocation กลายเป็น Expired_Invocation, THE MCP_Layer_Manager SHALL บันทึกการหมดอายุลง MCP_Audit_Log พร้อม MCP_Tool, Principal (ผ่าน `public.resolve_actor()`), Invocation_Expiry และเวลา (UTC) ที่หมดอายุ
6. IF มนุษย์พยายามบันทึก Approval_Decision ให้ Pending_Invocation ที่เป็น Expired_Invocation ไปแล้ว, THEN THE MCP_Layer_Manager SHALL ปฏิเสธการบันทึก คงสถานะ Expired_Invocation ไว้โดยไม่ก่อผลข้างเคียง และคืนค่าความผิดพลาดที่ระบุว่าคำขอนี้หมดอายุแล้ว แทนการดำเนินการให้มีผล
7. IF มี Approval_Decision ของ Pending_Invocation หนึ่งถูกบันทึกในเวลาไม่เกิน Invocation_Expiry ของ Pending_Invocation นั้นแข่งกับการหมดอายุ, THEN THE MCP_Layer_Manager SHALL ถือว่า Approval_Decision นั้นมีผลเหนือการหมดอายุแบบ deterministic แทนการเปลี่ยน Pending_Invocation เป็น Expired_Invocation

### Requirement 17: Idempotency ของ Write Tool (Write_Tool Idempotency)

**User Story:** ในฐานะผู้พัฒนา AI client ฉันต้องการให้ Write_Tool รองรับ Idempotency_Key ที่ส่งมากับคำขอ เพื่อกัน double-submit ที่สร้าง Work_Item หรือ Pending_Invocation ซ้ำเมื่อมีการเรียกซ้ำด้วยคำขอเดียวกัน

#### Acceptance Criteria

1. WHERE MCP_Client ส่ง Idempotency_Key มากับ Tool_Invocation ของ Write_Tool, THE MCP_Layer_Manager SHALL กำหนดให้ Idempotency_Key นั้นมีความยาวตั้งแต่ 1 ถึง 255 ตัวอักษร และ SHALL ผูก Tool_Invocation นั้นเข้ากับ Idempotency_Record ที่อ้างด้วยคู่ (Idempotency_Key, Principal) ของเซสชัน
2. IF MCP_Client ส่ง Idempotency_Key ที่ตรงกับ Idempotency_Record ที่ประมวลผลไปแล้วด้วยคู่ (Idempotency_Key, Principal) และ input เดิม, THEN THE MCP_Layer_Manager SHALL คืนผลลัพธ์เดิมของ Idempotency_Record นั้น (idempotent) พร้อมแจ้ง MCP_Client ว่าเป็นผลคืนซ้ำ แทนการสร้าง Work_Item หรือ Pending_Invocation ใหม่
3. WHILE Pending_Invocation ที่ผูกกับคู่ (Idempotency_Key, Principal) หนึ่งยังรอ Approval_Decision, THE MCP_Layer_Manager SHALL คืนสถานะรอเดิมของ Pending_Invocation นั้นเมื่อได้รับคู่ (Idempotency_Key, Principal) ซ้ำ แทนการสร้าง Pending_Invocation เพิ่ม
4. WHERE Tool_Invocation ของ Write_Tool ไม่มี Idempotency_Key, THE MCP_Layer_Manager SHALL ประมวลผล Tool_Invocation นั้นตามปกติโดยไม่อ้าง Idempotency_Record
5. THE MCP_Layer_Manager SHALL ขยายหลักการ idempotent ของการบันทึก Approval_Decision (Requirement 8.5) ให้ครอบคลุม Write_Tool ด้วย โดยใช้แนวทาง idempotency ที่สอดคล้องกันแทนการสร้างกลไกป้องกันการเรียกซ้ำที่ขนานกัน
6. THE MCP_Layer_Manager SHALL บันทึกทั้งการคืนผลแบบ idempotent (replay) และการปฏิเสธเพราะ input ขัดแย้งกับ Idempotency_Record เดิม (conflict-rejection) ของ Idempotency_Key ที่ซ้ำลง MCP_Audit_Log แทนการดำเนินการซ้ำอย่างเงียบ ๆ
7. IF Idempotency_Key ที่ MCP_Client ส่งมาเป็นค่าว่างหรือยาวเกิน 255 ตัวอักษร, THEN THE MCP_Layer_Manager SHALL ปฏิเสธ Tool_Invocation นั้นและคืนค่าความผิดพลาดที่ระบุว่า Idempotency_Key ไม่ถูกต้อง โดยไม่สร้าง Work_Item หรือ Pending_Invocation (no side effects)
8. IF MCP_Client ส่งคู่ (Idempotency_Key, Principal) ที่ตรงกับ Idempotency_Record เดิม แต่ payload หรือ input ต่างจากที่บันทึกไว้, THEN THE MCP_Layer_Manager SHALL ปฏิเสธ Tool_Invocation นั้นและคืนค่าความผิดพลาดที่ระบุว่า Idempotency_Key ขัดแย้ง โดยคง Idempotency_Record เดิมไว้ไม่เปลี่ยนแปลง (กัน silent wrong-result)
9. WHEN MCP_Client ส่ง Tool_Invocation ของ Write_Tool หลายรายการพร้อมกัน (double-submit) ด้วยคู่ (Idempotency_Key, Principal) เดียวกัน, THE MCP_Layer_Manager SHALL รับประกันว่ามีการสร้าง Work_Item หรือ Pending_Invocation ไม่เกินหนึ่งรายการต่อคู่ (Idempotency_Key, Principal) นั้น

### Requirement 18: การบันทึกที่มาของโมเดล (Model Provenance Logging)

**User Story:** ในฐานะผู้ตรวจสอบ ฉันต้องการให้ MCP_Audit_Log บันทึก Model_Provenance ของ External_LLM ที่อยู่เบื้องหลัง Tool_Invocation เพื่อให้สืบสวนย้อนหลังได้ว่าโมเดลใดอยู่เบื้องหลังการกระทำ โดยไม่บันทึกค่าความลับ

#### Acceptance Criteria

1. WHEN เกิด Tool_Invocation, THE MCP_Layer_Manager SHALL บันทึก Model_Provenance ของ External_LLM ที่อยู่เบื้องหลัง MCP_Client — ประกอบด้วยตัวระบุโมเดลและผู้ให้บริการเท่าที่ MCP_Client เปิดเผย — ลงในรายการ MCP_Audit_Log เดียวกับ Tool_Invocation นั้น
2. IF MCP_Client ไม่เปิดเผยส่วนใดของ Model_Provenance (ตัวระบุโมเดลหรือผู้ให้บริการ), THEN THE MCP_Layer_Manager SHALL บันทึกส่วนที่ไม่เปิดเผยนั้นเป็น unknown แทนการละเว้นการบันทึก audit หรือการทิ้งทั้งรายการ
3. THE MCP_Layer_Manager SHALL บันทึก Model_Provenance โดยเสริมข้อมูล location/Cross_Border_Transfer ที่บันทึกตาม Requirement 10 และ Requirement 11 แทนการแทนที่ข้อมูลเหล่านั้น และ SHALL ไม่ถือว่าการบันทึก Model_Provenance ทดแทนการตรวจ Consent_Record หรือการจัดประเภท Cross_Border_Transfer ตาม Requirement 10
4. THE MCP_Layer_Manager SHALL ลบหรือปกปิดค่าความลับ (เช่น Client_Credential, token, API key) ออกจาก Model_Provenance ก่อนบันทึก แทนการบันทึกค่าความลับลง MCP_Audit_Log
5. THE MCP_Layer_Manager SHALL คงรายการ MCP_Audit_Log ไว้เสมอไม่ว่าจะระบุ Model_Provenance ได้หรือไม่ แทนการทิ้งรายการ audit เมื่อ Model_Provenance ไม่ครบ
6. IF การลบหรือปกปิดค่าความลับออกจาก Model_Provenance ที่ MCP_Client เปิดเผยทำไม่สำเร็จ, THEN THE MCP_Layer_Manager SHALL บันทึก Model_Provenance นั้นเป็น unknown แทนการบันทึกค่าที่ยังลบความลับไม่สำเร็จ และ SHALL คงรายการ MCP_Audit_Log ไว้แบบ fail-safe
7. THE MCP_Layer_Manager SHALL ปฏิบัติต่อ Model_Provenance ที่ MCP_Client เปิดเผยเป็น Untrusted_Content และ SHALL ไม่ใช้ค่า Model_Provenance นั้นในการตัดสิน Tool_Authorization หรือในการยกระดับสิทธิ์ใด ๆ
8. WHEN MCP_Client เปิดเผย Model_Provenance ที่ยาวเกินเพดานจำนวนตัวอักษรที่ตั้งค่าได้ (configurable), THE MCP_Layer_Manager SHALL ตัดทอน Model_Provenance ที่บันทึกให้ไม่เกินเพดานนั้น แทนการบันทึกเนื้อหาเต็มที่ไม่จำกัดความยาว

### Requirement 19: การป้องกัน Prompt Injection และ Tool Poisoning (Prompt-Injection & Tool-Poisoning Defense)

**User Story:** ในฐานะผู้ดูแลความปลอดภัย ฉันต้องการให้ MCP Layer ป้องกันภัยเฉพาะของ MCP (confused deputy, tool poisoning, prompt injection ผ่าน input หรือผ่านเนื้อหาที่ Read_Tool คืน) เพื่อไม่ให้คำสั่งที่ฝังในเนื้อหายกระดับสิทธิ์หรือข้ามธรรมาภิบาลเดิมได้

#### Acceptance Criteria

1. THE MCP_Layer_Manager SHALL ปฏิบัติต่อ input ของ MCP_Client และเนื้อหาที่ดึงจากแหล่งภายนอกทั้งหมดเป็น Untrusted_Content และ SHALL ไม่ตีความ Untrusted_Content เป็นคำสั่งควบคุมการทำงานของ MCP_Layer_Manager
2. IF Untrusted_Content มีคำสั่งฝังตัวที่สั่งให้ยกระดับสิทธิ์ ข้าม Tool_Authorization หรือข้าม Human_Approval_Gate, THEN THE MCP_Layer_Manager SHALL เพิกเฉยคำสั่งฝังตัวนั้นและบังคับใช้ Tool_Authorization และ Human_Approval_Gate ตามเดิม โดยคำสั่งฝังตัวนั้น SHALL ไม่ก่อให้เกิด Tool_Invocation การยกระดับสิทธิ์ หรือผลข้างเคียงใด ๆ ต่อ Monolith (state preservation)
3. WHEN MCP_Layer_Manager ตัดสินสิทธิ์ของ Tool_Invocation, THE MCP_Layer_Manager SHALL re-derive Tool_Authorization ทุกครั้งจาก Principal ที่ยืนยันแล้วของเซสชันและ C12_Role เท่านั้น และ SHALL ไม่ยกระดับสิทธิ์ตามตัวระบุผู้กระทำหรือคำสั่งที่มาใน Untrusted_Content (กัน confused deputy)
4. WHERE ผลลัพธ์ของ Tool อ้างอิงค่าหรือตัวเลขจากความรู้ของ Monolith, THE MCP_Layer_Manager SHALL แนบ Source_Provenance ที่ประกอบด้วยตัวระบุระเบียนต้นทาง, source_version และ imported_at ซึ่ง trace ค่าหรือตัวเลขนั้นกลับไปยังระเบียนต้นทางใน Knowledge_Export ได้ (provenance traceability) สอดคล้องกับ Requirement 6.4 และ Requirement 6.5
5. IF ค่าหรือตัวเลขในผลลัพธ์ของ Tool ไม่สามารถ trace กลับไปยัง Source_Provenance ใน Knowledge_Export ได้, THEN THE MCP_Layer_Manager SHALL ทำเครื่องหมายค่าหรือตัวเลขนั้นว่า unverified และคงค่านั้นไว้ในผลลัพธ์แทนการซ่อน (สอดคล้องกับ Requirement 6.5 กันเคส placeholder หรือตัวเลขปลอม)
6. WHEN MCP_Layer_Manager ตรวจพบคำสั่งฝังตัวใน Untrusted_Content, THE MCP_Layer_Manager SHALL บันทึกการตรวจพบและการเพิกเฉยคำสั่งฝังตัวนั้นแบบ append-only ในรายการ MCP_Audit_Log เดียวกับ Tool_Invocation นั้น โดยไม่บันทึกเนื้อหาที่เป็นความลับหรือ PII ลงในบันทึก
