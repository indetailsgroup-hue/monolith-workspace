# DOGFOOD-START — First-House Checklist & Runbook

รุ่น: 1.0 (2026-07-15) · ADR-065 (dogfood ขนาน S17) · ADR-067 (resume) · ADR-066 (infra = human-driven)

**เป้าหมาย**: เปลี่ยนสถานะ dogfood จาก `AUTHORIZED/PREPARED — NOT STARTED` → **`STARTED`** ด้วยบ้านจริง 1 หลังที่มี event แรกในสาย
**หลักเหล็ก**: บ้าน dogfood ใช้ **ระบบเดิม** เต็มสาย · Designer = **shadow mode NOT-FOR-PRODUCTION เท่านั้น** · **ห้ามตัดชิ้นงานจริงจาก packet** จนกว่า real-cut gate ผ่าน · ไม่พึ่ง S17-3/4/5/6 ใด ๆ

## PDPA — ข้อมูลอยู่ที่ไหน (บังคับ)
| ข้อมูล | ที่จัดเก็บ | เหตุผล |
| --- | --- | --- |
| ที่อยู่บ้าน, ชื่อลูกค้า, LINE, สลิป, เบอร์ | **Supabase operational เท่านั้น** (RLS + PDPA + cloud_allowed) | PII — ห้ามเข้า git |
| Evidence ใน git (`docs/evidence/dogfood/house-NN/started.json`) | **redacted**: `project_id`, `site_code`, first-event ref/timestamp, role labels | ไม่มี raw PII, ทำซ้ำ/ตรวจสอบได้ |

> หลักเดียวกับ hosted-auth evidence: เก็บ reference/anchor ไม่เก็บ raw PII · ห้าม commit ที่อยู่/ชื่อลูกค้าลง git เด็ดขาด

## 0. นิยาม "STARTED" (acceptance)
dogfood house นับว่าเริ่มแล้วต่อเมื่อครบ:
- [ ] บ้านจริงมี **`project_id`** ในระบบ (`rpc_field_create_project`)
- [ ] มี **owner + operator** ที่รับผิดชอบ (บันทึกในระบบ)
- [ ] มี **event แรกจริง** ในสาย (LINE order หรือ contract draft) พร้อม timestamp
- [ ] **redacted `started.json`** commit เข้า `docs/evidence/dogfood/house-NN/`

## 1. Roles (ระบุคนจริงในระบบ ไม่ใช่ใน git)
| บทบาท | หน้าที่ |
| --- | --- |
| Dogfood Owner | อนุมัติ enroll + ตรวจรับสาย |
| Field Operator | รับ LINE, ทำสัญญา, ติดตั้ง, ตรวจหน้างาน (รัน RPC ในระบบ) |
| Designer | ออกแบบ + shadow packet (NOT-FOR-PRODUCTION) |
| Finance | รับสลิป / บันทึกเงิน |

## 2. First-House Runbook (ระบบเดิม — RPC จริง, operator รันในระบบ)
| # | ขั้น | RPC | Evidence (redacted → git) |
| --- | --- | --- | --- |
| 1 | Enroll บ้าน | `rpc_field_create_project` | `project_id`, `site_code`, created_at |
| 2 | LINE intake | `rpc_create_line_order` / identity binding | first LINE event ref + timestamp = **จุดพิสูจน์ STARTED** |
| 3 | Quote/สัญญา | `rpc_field_generate_contract` → `send_contract` → `submit_signed_contract` | contract id, signed flag |
| 4 | แผนเงิน + สลิป | `rpc_field_set_payment_plan` → `rpc_finance_submit_slip` → `record_payment` | payment_plan id, งวดแรก (ยอดไม่ลง git) |
| 5 | แผนติดตั้ง | `rpc_field_draft_install_plan` → `send_install_plan` | install plan id + SiteSurveyZone (วัดจริง) |
| 6 | VO ถ้ามี | `rpc_field_create_variation` → submit_signed | variation id |
| 7 | ผลิต (ใบสั่งเดิม) | production_milestone (`rpc_factory_list_milestones`) | โรงงานตัดจาก **ใบสั่งเดิม** ไม่ใช่ packet |
| 8 | ตรวจรับ/ส่งมอบ | milestone handover/acceptance | acceptance record |

## 3. Shadow-mode Designer (ขนาน — evidence ป้อน S17 ฟรี)
- Designer ออกแบบบ้านนี้ → Freeze → Release → **Export to CNC** → packet `NFP-...` NOT-FOR-PRODUCTION
- เก็บ packet + **เทียบกับของที่โรงงานตัดจริง** (ใบสั่งเดิม) → บันทึกส่วนต่าง
- 🔴 **ห้ามใช้ packet ตัดจริง** — โรงงานตัดจากกระบวนการเดิมเท่านั้น

## 4. Guardrails
- 🔴 ห้ามตัดจริงจาก packet จนกว่า real-cut gate 4 เงื่อนไขผ่าน (S17×5 + ADR-064×4 + dogfood≥1 + machine profile calibrated)
- ทุกขั้นมี **human ตรวจก่อนอนุมัติ** (SiteSurveyZone วัดจริง, สลิปเช็คยอดเอง)
- บ้าน dogfood ที่ครบสาย = **นับเป็น dogfood≥1** ในเงื่อนไข real-cut gate

## 5. Redacted STARTED evidence (git)
`docs/evidence/dogfood/house-NN/started.json` — ดู `started.template.json` · **ห้ามใส่ raw address/ชื่อลูกค้า** · เก็บแค่ id/ref/timestamp/role-label

**วิธีบันทึก (บังคับผ่านเครื่องมือ — กัน PII หลุด + กันแก้ย้อนหลัง):**
1. copy `started.template.json` ไปกรอกนอก git (เช่น temp) — ค่า id/ref เอาจากระบบจริง
2. `node scripts/dogfood-start.mjs <ไฟล์ที่กรอกแล้ว>` — ตัว tool จะตรวจ acceptance §0 ครบ, รัน **PDPA redaction lint** (ปฏิเสธเบอร์โทร/LINE/อีเมล/คำบ่งที่อยู่/ข้อความไทยยาว), ปฏิเสธการ overwrite (start event = immutable; แก้ = record ใหม่) แล้วเขียน `started.json` + `started.sha256`
3. commit ตามคำสั่งที่ tool พิมพ์ให้ (human ตรวจก่อน commit เสมอ)
