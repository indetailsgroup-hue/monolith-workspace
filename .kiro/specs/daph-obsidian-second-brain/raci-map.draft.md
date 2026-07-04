# RACI_Map (DRAFT) — DAPH Decor Process Steps

> **สถานะ: ร่างเพื่อรีวิว** — โครงนี้ derive จากหลักฐาน Job Description 27 ไฟล์ (`_daph_extract/_jd_text/`)
> **R/A** เติมจากสายบังคับบัญชาใน JD (reports-to) ที่มีหลักฐานชัด
> **ช่องที่มีเครื่องหมาย ⬜ = JD ไม่ครอบคลุม ต้องให้เจ้าของธุรกิจยืนยัน** (ไม่เดา ตามหลัก human-in-the-loop)
> หลังท่านรีวิว/เติมค่าครบ ไฟล์นี้จะเป็นแหล่งความจริงที่ Knowledge_Export emitter (Phase 3) อ่านไปสร้าง JSON
>
> นิยาม RACI: **R**=Responsible (ผู้ลงมือทำ) · **A**=Accountable (ผู้รับผิด/อนุมัติขั้นสุดท้าย, 1 คน) · **C**=Consulted (ปรึกษาสองทาง) · **I**=Informed (แจ้งให้ทราบทางเดียว)

## 1. สายบังคับบัญชา (derive จาก JD — หลักฐานชัด)

| ตำแหน่ง (TH) | English | reports-to | เสนอ C12_Role |
|---|---|---|---|
| กรรมการผู้จัดการ | Managing Director | — (สูงสุด) | `executive_owner` |
| ผู้จัดการทั่วไป | General Manager | กรรมการผู้จัดการ | `executive_owner` |
| ผู้จัดการโครงการ | Project Manager | ผู้จัดการทั่วไป | `branch_manager` |
| ผู้จัดการฝ่ายออกแบบ | Designer Manager | ผู้จัดการทั่วไป ⬜ | `branch_manager` |
| ผู้จัดการโรงงาน | Factory Manager | ผู้จัดการทั่วไป | `branch_manager` |
| ผู้จัดการฝ่ายขาย | Sales Manager | ผู้จัดการทั่วไป | `branch_manager` |
| ผู้จัดการฝ่ายบัญชีและการเงิน | Accounting/Finance Manager | ผู้จัดการทั่วไป | `finance` |
| ผู้จัดการฝ่ายบริหารทรัพยากรมนุษย์ | HR Manager | ผู้จัดการทั่วไป | `operations` ⬜ |
| หัวหน้าฝ่าย/ทีมติดตั้ง | Installation Team Lead | ผู้จัดการโครงการ | `branch_operator` |
| หัวหน้าฝ่ายผลิต | Production Head | ผู้จัดการโรงงาน | `branch_operator` |
| หัวหน้าฝ่ายซ่อมบำรุง | Maintenance Head | ผู้จัดการโรงงาน | `branch_operator` |
| เจ้าหน้าที่ฝ่ายขาย | Sales Staff | ผู้จัดการฝ่ายขาย | `branch_operator` |
| เจ้าหน้าที่ฝ่ายออกแบบ | Designer | ผู้จัดการฝ่ายออกแบบ | `branch_operator` |
| เจ้าหน้าที่เขียนแบบ | Draftsman | ผู้จัดการโครงการ | `branch_operator` |
| เจ้าหน้าที่ฝ่ายวางแผนการผลิต | Production Planning Staff | ผู้จัดการโครงการ | `branch_operator` |
| เจ้าหน้าที่ฝ่ายติดตั้ง / ผู้ช่วย | Installation Staff | หัวหน้าทีมติดตั้ง | `branch_operator` |
| เจ้าหน้าที่ฝ่ายประกันคุณภาพ | Quality Assurance | ผู้จัดการโรงงาน | `branch_operator` |
| เจ้าหน้าที่ฝ่ายคลังสินค้า | Warehouse Staff | ผู้จัดการโรงงาน | `branch_operator` |
| เจ้าหน้าที่ฝ่ายจัดซื้อ | Purchasing Staff | ผู้จัดการบัญชี/การเงิน | `finance` ✓ |
| เจ้าหน้าที่การเงิน/บัญชี | Finance/Accounting Officer | ผู้จัดการบัญชี/การเงิน | `finance` |
| เจ้าหน้าที่ HR | HR Officer | ผู้จัดการ HR ⬜ | `operations` ⬜ |

> ⬜ การ map ตำแหน่ง → C12_Role เป็น **ข้อเสนอ** ทั้งหมด ต้องให้ท่านยืนยัน (โดยเฉพาะ HR/Purchasing/operations)

## 2. RACI ต่อ Process_Step

### Office (6 หน่วย)

| Process_Step | R (ผู้ทำ) | A (อนุมัติ) | C (ปรึกษา) | I (แจ้ง) | requires_approval |
|---|---|---|---|---|---|
| Sale | เจ้าหน้าที่ฝ่ายขาย | ผู้จัดการฝ่ายขาย | ลูกค้า | Designer, Area Measurement | no |
| Area Measurement | ทีมวัดพื้นที่ (PFMEA: "DAPH Area Measurement Team") | Project Manager *(default — JD: Sales=office-only "ปิดการขาย" ไม่มีงานหน้างาน, PM=field-owner "งานติดตั้ง/ภาคสนาม"; confidence: needs_confirmation)* | — | Designer | no |
| Designer | เจ้าหน้าที่ฝ่ายออกแบบ | **{ ผู้จัดการฝ่ายออกแบบ + ลูกค้า }** | Sale | — | **yes** — design draft sign-off; approver set = unanimous { Designer Manager (Req 8.4 ไม่ escalate) + ลูกค้า เซ็นผ่าน LINE } (OQ-KX-2 §7) |
| 3D_Presentation | ทีม 3D/Perspective (PFMEA: "DAPH 3D Perspective Team") | **{ ผู้จัดการฝ่ายออกแบบ + ลูกค้า }** | Sale | — | **yes** — ลูกค้าอนุมัติคอนเซ็ปต์; quorum = unanimous (OQ-KX-2 §7) |
| Production Planning | เจ้าหน้าที่ฝ่ายวางแผนการผลิต | ผู้จัดการโครงการ | Designer, จัดซื้อ, ผลิต | คลังสินค้า | **yes** — Production release → PP Head; escalate executive_owner ถ้า RPN>threshold หรือ budget>ceiling (Req 8.1/8.2/8.5); quorum = first_response (internal, คงเดิม) |
| 3D_Rendering_Final | ทีม 3D/Perspective (PFMEA: "DAPH 3D Perspective Team") | **{ ผู้จัดการโครงการ + ลูกค้า }** | Production Planning | — | **yes** — ลูกค้าอนุมัติก่อนผลิต; quorum = unanimous (OQ-KX-2 §7) |

> หลักฐาน R ของ Area Measurement / 3D: PFMEA owner field ระบุทีมเฉพาะ ("DAPH Area Measurement Team", "DAPH 3D Perspective Team") → ความเชื่อมั่นสูง; เหลือเพียง **A ของ Area Measurement** (สังกัด Sales หรือ PM) ที่ต้องท่านชี้

### Factory (6 สถานี)

R = พนักงานผลิตประจำสถานี (SOS ทุกสถานี: "Team member = 1 | Leader = 1"; P'Mean PFMEA จัดตามเครื่อง → ความเชื่อมั่นสูง), A = หัวหน้าฝ่ายผลิต, C = QA (เจ้าหน้าที่ประกันคุณภาพ)

| Process_Step | R (ผู้ทำ) | A (อนุมัติ) | C (ปรึกษา) | I (แจ้ง) | requires_approval |
|---|---|---|---|---|---|
| Laminate HPL | พนักงานผลิต (สถานี Laminate) | หัวหน้าฝ่ายผลิต | QA | — | no |
| Cutting | พนักงานผลิต (สถานี Cutting) | หัวหน้าฝ่ายผลิต | QA | — | no |
| Edging | พนักงานผลิต (สถานี Edging) | หัวหน้าฝ่ายผลิต | QA | — | no |
| CNC | พนักงานผลิต (สถานี CNC) | หัวหน้าฝ่ายผลิต | QA | — | no |
| Assembly | พนักงานผลิต (สถานี Assembly) | หัวหน้าฝ่ายผลิต | QA | — | no |
| Packing | พนักงานผลิต (สถานี Packing) | หัวหน้าฝ่ายผลิต | คลังสินค้า | Installation | no |

> Factory เป็นเพียงสายผลิตภายใน (no formal approval รายสถานี) — QA เป็น C (gate คุณภาพ) การอนุมัติปล่อยงานผลิตอยู่ที่ขั้น Production Planning (Req 8.5)

### Installation (16 ขั้นตอน)

R = เจ้าหน้าที่ฝ่ายติดตั้ง, A = หัวหน้าทีม/ฝ่ายติดตั้ง สำหรับทุกขั้น (derive จาก JD Installation TeamLead: "ควบคุม/ตรวจสอบงานติดตั้ง", Staff: "รับผิดชอบงานติดตั้ง") — ยืนยันภาพรวมได้

| Process_Step | R | A | C/I | requires_approval |
|---|---|---|---|---|
| **การบรีฟงาน** (ขั้นแรก = Installation start) | เจ้าหน้าที่ฝ่ายติดตั้ง | หัวหน้าทีม/ฝ่ายติดตั้ง | I: Sale, PM, ลูกค้า | **yes** — start → Team Lead + แจ้ง Sale/PM (Req 8.6) |
| ขั้นกลาง (ตรวจสอบหน้างาน → … → รักษาความสะอาด) | เจ้าหน้าที่ฝ่ายติดตั้ง | หัวหน้าทีม/ฝ่ายติดตั้ง | C: PM ⬜ / I: Sale ⬜ | no |
| **การเก็บของ** (ขั้นสุดท้าย = Installation finish) | เจ้าหน้าที่ฝ่ายติดตั้ง | หัวหน้าทีม/ฝ่ายติดตั้ง | I: Sale, PM, ลูกค้า | **yes** — finish → Team Lead + แจ้ง Sale/PM (Req 8.6) |

## 3. สิ่งที่ต้องให้เจ้าของธุรกิจตัดสินจริง (เหลือ 3 จุด — เดาไม่ได้)

หลังเติมช่องความเชื่อมั่น "สูง" จากหลักฐาน (PFMEA owner teams, SOS "Team member/Leader", workflow Req 8) แล้ว เหลือเพียง:

1. **A ของ Area Measurement** — default = **Project Manager** ตามหลักฐาน JD (Sales=office-only, PM=field-owner) emit เป็น `confidence: needs_confirmation` ให้ DAPH ยืนยัน 1 บรรทัด (ไม่บล็อก)
2. **C12_Role ของ HR** — default = **`operations`** (governance ฝั่ง business-ops, ไม่ใช่ system-admin; นิยามจาก line-oa-commerce §Glossary) — *HR ไม่ปรากฏเป็น R/A ใน 14 Process_Step สายลูกค้า จึงไม่บล็อกการ resolve Approver — ยืนยันเมื่อสะดวก*
3. **ค่า OCC/DET จริง** ของขั้น Office/Design/Installation — DAPH กรอกผ่าน FMEA workshop ตามกรอบมาตรฐาน AIAG-VDA/IATF (1–10, ดู ADR-012) ปัจจุบัน emit เป็น `severity_only`/`not_assessed` พร้อม guardrail (ADR-011) เติมภายหลังได้โดยไม่ต้อง re-architect

### ยืนยันแล้วจากหลักฐาน (ไม่ต้องตัดสินซ้ำ)
- **R ของ Area Measurement / 3D สองขั้น** = ทีมเฉพาะตาม PFMEA owner (สูง)
- **R/A ของ Factory ทุกสถานี** = พนักงานผลิตประจำสถานี / หัวหน้าฝ่ายผลิต (สูง)
- **requires_approval** ทุกขั้น = ตาม workflow Req 8 (สูง)
- **Purchasing → C12 `finance`** (JD: จัดซื้อ reports-to ผจก.บัญชี/การเงิน — มีหลักฐาน)

### สถานะ draft-guard (ตามที่ท่านสั่ง — ตัวเลือก ข.)
จนกว่าท่านจะปิด 3 จุดข้างบน Knowledge_Export จะ emit RACI_Map พร้อม `raci_status: "draft"` (ระดับ export) และ `confidence: high|needs_confirmation` ต่อ cell เพื่อให้ workflow-copilot รู้ว่า RACI ยังไม่ authoritative และ fail-safe ได้ (Req 3.4: หา Approver ที่ confirmed ไม่ได้ → escalate executive_owner)

