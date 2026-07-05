# MONOLITH — LINE Architecture (ทั้งระบบ · ฉบับสมบูรณ์)
### System-wide LINE Integration Architecture · 5 กรกฎาคม 2026

> เอกสารฉบับเดียวรวม **ทุก touchpoint ของ LINE ในระบบ MONOLITH** — ตั้งแต่ LINE OA Commerce ที่ทำเสร็จแล้ว, การอนุมัติแบบ/งานผ่าน Flex, การส่งเอกสาร/รูปเข้า capture, การแจ้งเตือน workflow, จนถึงกลุ่ม LINE ของงานติดตั้ง
> **ป้ายสถานะ:** ✅ = implemented (มีในโค้ด) · 🔵 = in-progress · 📝 = ข้อเสนอ (spec/ร่าง) · ⏸ = รอ dependency
> **แหล่ง:** `supabase/migrations/00000000000001–62_line_oa_*`, `supabase/functions/{line-webhook,line-outbound-sender,approval-postback,capture-ingest,field-capture}`, PRD §6.5–6.6, ADR-033, `.kiro/specs/installation-pm/line-architecture-v0.1.md`

---

## 1. ภาพรวม — LINE คือช่องทาง Engagement + Field ของทั้งระบบ

MONOLITH ใช้ **LINE เป็นช่องทางหลักติดต่อคนนอกออฟฟิศ** (ลูกค้า + ช่างหน้างาน + คนส่งเอกสาร) เพราะคนไทยอยู่บน LINE อยู่แล้ว — เชื่อมเข้าแกน trust/capture/workflow ของระบบผ่าน Edge Function ที่ควบคุมความปลอดภัยไว้แน่น

```
                          ┌──────────── LINE Platform ────────────┐
 ลูกค้า ─┐                │  OA (1:1)          กลุ่ม (group)       │
 ช่าง ───┼─ ข้อความ/รูป/postback ─→  line-webhook (HMAC + idempotent)
 บัญชี ──┘                └───────────────────┬───────────────────┘
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
              ▼                               ▼                               ▼
      capture spine                   workflow / approval               order intake
   (expense/customer_req/            (work item, gate,               (quote→order→ship)
    installation_proof)               Flex approval)
              │                               │                               │
              └──────────── audit (append-only) + RLS site-scoped ────────────┘
                                              │
                                    line-outbound-sender (worker)
                          template ที่ approve แล้ว + named slots (ไม่มี free-text LLM)
```

**หลักเหล็ก 4 ข้อ (ใช้ทุก touchpoint):**
1. **Webhook ทุกทางเข้า HMAC + idempotent** ตาม `webhook_event_id` UNIQUE — replay ไม่ซ้ำ
2. **Outbound เป็น pre-approved template + named slots เท่านั้น** — ไม่มี free-text LLM (กันข้อความหลุด/หลอก)
3. **ลูกค้าไม่เป็น DB principal** — Edge Function เป็นตัวกลาง (ไม่สร้าง account ให้ลูกค้า)
4. **สิทธิ์ใน DB มาจาก RLS + membership เท่านั้น** — การอยู่ใน LINE (แชท/กลุ่ม) ไม่ให้สิทธิ์ใด ๆ

---

## 2. โครงสร้างพื้นฐาน — LINE OA Commerce ✅ (เสร็จแล้ว 20/20 tasks · 31 properties)

ไฟล์: `supabase/functions/line-webhook`, `line-outbound-sender`, migrations `00000000000001–62`

**8 ตารางหลัก** (`vertical_context` แยก Monolith furniture / TCCK food ในช่องเดียว):

| ตาราง | หน้าที่ |
|-------|---------|
| `line_oa_channels` | ช่อง OA (เก็บเฉพาะ Vault refs ของ secret — Edge Function ไม่ถือ secret) |
| `line_oa_conversations` | thread ต่อ (line_user_id, vertical_context) — lifecycle: site_unresolved → open → closed |
| `line_oa_inbound_messages` | ข้อความรับเข้า — idempotency anchor = `webhook_event_id` UNIQUE |
| `line_oa_outbound_messages` | ส่งออก staged: pending → sent/failed (worker claim rows, resolve token จาก Vault) |
| `line_oa_customer_identity` | LINE user_id → canonical customer + `match_confidence` + `manual_review_required` (**ไม่ auto-merge**) |
| `line_oa_message_templates` | template pre-approved + named slots (`{{order_id}}`), vertical-scoped, immutable version, **ไม่มี free-text**, brand voice ≤200 ตัวอักษร |
| `line_oa_orders` | order canonical (quote→order→ship), origin_channel='line_oa', idempotent |
| `line_oa_audit_log` | append-only (immutability enforce migration 0005) |

**Functions หลัก:** signature verification (0010), identity resolution (0020) + merge candidate (0021), ingest webhook (0022), resolve conversation site (0030), send outbound (0040) + record result (0041), create order (0050), forecast sync (0060), session timeout sweep (0061, cron), query audit (0062) · RLS site-scoped ทุกตาราง

---

## 3. ตัวตน (Identities) — ใครเป็นใครใน LINE

| Actor | Identity | ที่เก็บ | ยืนยันแบบ |
|-------|----------|---------|-----------|
| **ลูกค้า** | LINE user_id → canonical customer | `line_oa_customer_identity` ✅ | อนุมาน (match_confidence) + มนุษย์ตรวจถ้าไม่ชัด — ไม่ auto-merge |
| **พนักงาน** (ช่าง/หัวหน้า/sale/บัญชี) | LINE user_id ↔ auth user | `line_staff_identity` 📝 | **deterministic** (ลิงก์ + LINE Login + consent, ครั้งเดียว) — เพื่อ audit "ใครทำ" |
| **Bot** | OA channel | `line_oa_channels` ✅ | ตัวเดียว ทำงานต่างกันตาม context/group_type |

**เหตุผลแยก staff จาก customer identity:** ลูกค้าจับคู่โดยอนุมานได้ แต่พนักงานต้องยืนยันตัวเอง deterministic เพราะ `resolve_actor` ต้อง audit ได้แน่นอนว่ารูป/`#ปัญหา`/การกดปุ่มมาจากใคร

---

## 4. Touchpoint ทั้งหมด (แยกตาม use-case)

### 4.1 ลูกค้า — แชท + สั่งงาน ✅
LINE OA 1:1: ลูกค้าทัก → identity resolution → conversation → order intake (quote→order→ship) · ตอบด้วย template

### 4.2 ลูกค้า — อนุมัติแบบ/งาน ผ่าน Flex ✅ (design) / 📝 (installation)
`supabase/functions/approval-postback`:
- **One-click approve/reject จาก LINE** (Encrypted_Postback + HMAC verify) + **web fallback** (JWT session) — ผลสองช่องทางตรงกันเสมอ, idempotent ตาม `webhook_event_id`
- **Customer Approver (PRD §6.5 Req 20):** ลูกค้าอนุมัติผ่าน LINE Flex / customer-design-view โดย**ไม่เป็น DB principal**; Edge Function mediate; timeout → escalate ไป project_manager
- ใช้กับ: อนุมัติแบบ 3D (เฟสออกแบบ) ✅ · **อนุมัติงานติดตั้งเสร็จ** (template `inst_approval_request`) 📝

### 4.3 การส่งเอกสาร/รูป เข้า Capture ผ่าน LINE ✅ infra / ตาม type
`supabase/functions/capture-ingest`, `field-capture` + ADR-033 (`cloud_allowed`):
- **บิล/ใบเสร็จ** (บัญชี) → capture `expense_document` (OCR + fraud flags + รอคนยืนยัน) ✅ · cloud_allowed=true
- **ใบบันทึกความต้องการลูกค้า** → capture `customer_requirement` 📝 · cloud_allowed=false (ข้อมูลบุคคล)
- **รูปหลักฐานติดตั้ง** → capture `installation_proof` → verified → **ปิด work item อัตโนมัติ** (0063) · cloud_allowed=false
- **ข้อมูลวัดพื้นที่** → `site_survey` → SiteSurveyZone (0073)

### 4.4 พนักงานออฟฟิศ — อนุมัติ work item ผ่าน LINE 🔵 (รอ Phase 13)
Office staff (ขาย/วัด/วางแผน) เห็นสถานะงานใน canonical process + กดอนุมัติ/ส่งต่อขั้นจาก LINE · **ขึ้นกับ workflow Phase 13 (notification delivery + retry) ที่ยังไม่ปิด** ⏸

### 4.5 Executive — escalation ผ่าน LINE 🔵
งานเสี่ยง RPN เกิน threshold / งบเกิน → escalate ทันที (Copilot) · Phase 13/14

### 4.6 ช่างหน้างาน — รูป + #ปัญหา + แจ้งเตือน (กลุ่ม) 📝
ดู §5 (Installation groups)

---

## 5. Groups Model — กลุ่ม LINE ของงานติดตั้ง 📝 (installation-pm rev.2)

> schema line-oa เดิมเป็น **1:1 ล้วน (ไม่มี group)** → ส่วนกลุ่มเป็น net-new · มติ owner (5 ก.ค. 2026): บ้านละ 2 กลุ่ม, bot ทุกกลุ่ม, staff identity ผูกครั้งเดียว

```
installation_projects (บ้าน) ─1:2─ line_groups
  ├─ internal → sale(ตลอด) + สมาชิกหมุนตามเฟส (ทีมวัด→designer/3D→หัวหน้าทีม+ช่าง)
  │             (+media ชั่วคราวช่วงถ่ายงาน)
  └─ customer → ลูกค้า + sale + หัวหน้าทีม (ช่างไม่อยู่)
```

**Bot ทุกกลุ่ม พร้อม guardrails:**
- กลุ่ม internal: รูป → capture `installation_proof` (+quick reply เลือกห้อง/เลน), `#ปัญหา` → issue + แจ้งหัวหน้า, แจ้งเตือนทีม
- กลุ่ม customer: **เฉพาะ template `audience='customer'`** (DB CHECK — ส่งผิดกลุ่ม = error), ความคืบหน้า curated, ขออนุมัติ Flex
- **รูป internal ไม่ forward อัตโนมัติ**ไปกลุ่มลูกค้า — มนุษย์เลือกผ่าน PWA
- v1 เก็บจากกลุ่มแค่ **รูป + #ปัญหา + member events** (ไม่เก็บแชททั่วไป — PDPA)

**การผูกบ้าน:** เปิดโปรเจกต์ → ออกรหัสผูก (48 ชม.) → เชิญ bot → พิมพ์ `#ผูก <รหัส> <ทีม|ลูกค้า>` → `line_groups` (idempotent) → member events sync `line_group_members` ตลอด → ปิดงาน = archived

**ตำแหน่งใครอยู่กลุ่มไหน** (จาก org 38 ตำแหน่ง): ดู `.kiro/specs/installation-pm/line-architecture-v0.1.md` §1.1 (กลุ่ม ก ผูกโปรเจกต์ / กลุ่ม ข support ไม่มี membership → RLS ปิด default)

---

## 6. ความปลอดภัย + Guardrails (บังคับที่ DB/Edge ไม่ใช่วินัยคน)

| # | Guardrail | บังคับที่ |
|---|-----------|-----------|
| G1 | HMAC signature ต่อ channel (secret จาก Vault) | line-webhook (0010) ✅ |
| G2 | Idempotency ทุกทางเข้า (`webhook_event_id` UNIQUE) | schema (0003) ✅ |
| G3 | Outbound = template ที่ approve แล้ว + named slots, ไม่มี free-text LLM | templates + sender ✅ |
| G4 | Template `audience` (internal/customer/both) — ส่งผิดกลุ่ม = error | DB CHECK + Edge 📝 |
| G5 | รูป internal ไม่ auto-forward → กลุ่มลูกค้า | app logic 📝 |
| G6 | ลูกค้าไม่เป็น DB principal (Edge mediate) | approval-postback ✅ |
| G7 | **กลุ่ม LINE ≠ authorization** — สิทธิ์จาก membership+RLS เท่านั้น | RLS 📝 |
| G8 | Identity ลูกค้าไม่ auto-merge (มนุษย์ตรวจ) | identity resolution ✅ |
| G9 | Scrub PII ใน log | sender/functions ✅ |
| G10 | Audit append-only (immutable) | 0005 ✅ |
| G11 | cloud_allowed ต่อ capture type (ข้อมูลบุคคล = manual) | ADR-033 (0080) ✅ |
| G12 | PDPA: consent ตอนผูก staff identity + privacy notice ในกลุ่ม | 📝 |

---

## 7. Data Model รวม

**มีแล้ว ✅:** `line_oa_channels` · `line_oa_conversations` · `line_oa_inbound_messages` · `line_oa_outbound_messages` · `line_oa_customer_identity` · `line_oa_message_templates` · `line_oa_orders` · `line_oa_audit_log`

**เพิ่มสำหรับ groups + staff 📝** (installation-pm):
```sql
line_staff_identity   (line_user_id UNIQUE, user_id → auth, display_name, bound_at, consent_at, revoked_at)
line_groups           (line_group_id UNIQUE, project_id, group_type internal|customer, status, bound_by)
line_group_members    (group_id, line_user_id, display_name, member_kind staff|customer|guest, joined_at, left_at)
line_bind_codes       (code, project_id, expires_at, uses_left)
line_oa_message_templates + audience ('internal'|'customer'|'both')        -- G4
line_oa_outbound_messages + target_type ('user'|'group') + target_id       -- ส่งเข้ากลุ่ม
line_oa_inbound_messages  + source_type ('user'|'group') + line_group_id    -- รับจากกลุ่ม
```
ทั้งหมด RLS fail-closed (convention C12) · member events idempotent

---

## 8. Status Matrix — อะไรเสร็จ / อะไรรอ

| ความสามารถ | สถานะ | หมายเหตุ |
|-----------|-------|----------|
| LINE OA Commerce (webhook/identity/conversation/outbound/template/order/audit) | ✅ 20/20 | multi-vertical furniture+food |
| Customer design approval (Flex + web fallback + escalate) | ✅ | approval-postback |
| Capture ผ่าน LINE — expense_document | ✅ | OCR + fraud + verify |
| Capture ผ่าน LINE — customer_requirement / installation_proof | 📝 | ร่าง capture type + L3 adapter |
| Workflow work-item approval ผ่าน LINE | 🔵 ⏸ | **รอ workflow Phase 13** (notification delivery + retry) |
| Executive escalation ผ่าน LINE | 🔵 | Phase 13/14 |
| **LINE Groups (2/บ้าน) + bot + staff identity + guardrails** | 📝 | installation-pm rev.2 — net-new (schema เดิมไม่มี group) |
| Installation approval Flex (`inst_approval_request`) | 📝 | reuse approval-postback |

---

## 9. Dependencies (สำคัญก่อน implement)

1. **workflow Phase 13 (notification delivery + retry) ยังไม่ปิด** → การแจ้งเตือน/อนุมัติ work item ผ่าน LINE (§4.4–4.5) และแจ้งเตือนทีมติดตั้ง (§5) พึ่งชั้นนี้ — **ควรปิด Phase 13 ก่อนเริ่ม installation-pm Phase 1.8**
2. Installation groups พึ่ง `line_staff_identity` + group tables (net-new) — landing พร้อม installation-pm migrations (Phase 1.1)
3. capture types ใหม่พึ่ง L3 adapter (customer_requirement → work_item_open; ดู `installation-pm/tasks 1.5b`)

---

*เอกสารนี้เป็นภาพรวม LINE ทั้งระบบ — รายละเอียดกลุ่มติดตั้งอยู่ `.kiro/specs/installation-pm/line-architecture-v0.1.md`, รายละเอียด LINE OA Commerce อยู่ PRD §6.6 + `.kiro/specs/line-oa-commerce/`. สถานะ ✅ อ้างจากโค้ด/เทสต์จริง, 📝/🔵 จาก spec/แผน*
