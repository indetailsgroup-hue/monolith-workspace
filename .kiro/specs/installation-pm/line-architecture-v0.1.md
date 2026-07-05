# LINE Architecture — Installation PM v0.1

> **มติ owner (5 ก.ค. 2026):** (1) บ้านละ **2 กลุ่ม** — Internal Team (คุยงาน/ปัญหา/ต้นทุน/แก้แบบ/นัดช่าง) + Customer Group (เฉพาะสิ่งที่ลูกค้าควรรู้: ความคืบหน้า, แบบ, นัดหมาย, ขออนุมัติ) · (2) **bot เข้าทุกกลุ่ม** ในบทบาท "ผู้ช่วยเก็บหลักฐานและแจ้งเตือน" พร้อม guardrails — ห้ามพูดต้นทุน/เรื่องภายในในกลุ่มลูกค้า, กลุ่มลูกค้าใช้ template ควบคุมเท่านั้น, ข้อความ sensitive route เข้ากลุ่มทีมในเท่านั้น · (3) ผูกตัวตนพนักงาน↔LINE ด้วย**ลิงก์ครั้งเดียว** (LINE Login)
> **ฐานที่ต่อยอด:** line-oa-commerce (✅ 20/20 — webhook HMAC/idempotent, outbound worker, template governance "ไม่มี free-text LLM", customer identity) — **schema เดิมเป็น 1:1 ล้วน ไม่มี group** → ส่วนกลุ่ม/ตัวตนพนักงานเป็น net-new ตามเอกสารนี้

## 1. Actors & Identities — ใครเป็นใครในระบบ

| Actor | Identity | ที่เก็บ | หมายเหตุ |
|---|---|---|---|
| **ลูกค้า** | LINE user_id → canonical customer | `line_oa_customer_identity` (มีแล้ว) | ไม่เป็น DB principal (Edge Function mediate — pattern เดิม) |
| **พนักงาน** (ช่าง/หัวหน้างาน/sale/office) | LINE user_id ↔ บัญชีพนักงาน (auth user) | **`line_staff_identity`** (ใหม่) | ผูกครั้งเดียว: admin ส่งลิงก์ → พนักงานกด → LINE Login → บันทึก mapping + consent; `line_user_id` UNIQUE (คนหนึ่ง = บัญชีเดียว) |
| **Bot** | OA channel เดิม | `line_oa_channels` (Vault refs) | ตัวเดียว ทำงานต่างกันตาม group_type |

**ทำไมต้องแยก staff identity จาก customer identity:** ตาราง customer มี match_confidence/manual_review (จับคู่โดยอนุมาน) แต่พนักงานต้อง**ยืนยันตัวเองแบบ deterministic** (LINE Login) เพื่อให้ `resolve_actor` audit ได้ว่า "ช่างคนไหนส่งรูปนี้" — ห้ามอนุมาน

## 2. Group Model — ใครอยู่กลุ่มไหน

```
installation_projects (บ้าน) ─1:2─ line_groups
  ├─ group_type = 'internal'  → หัวหน้างาน + ช่างทุกคนของบ้าน + sale (+office ตามงาน)
  └─ group_type = 'customer'  → ลูกค้า + sale + หัวหน้างาน (ช่างไม่อยู่)

line_groups        (line_group_id UNIQUE, project_id, group_type, status: active|archived)
line_group_members (group_id, line_user_id, display_name snapshot, joined_at, left_at)
                    — sync จาก webhook events: memberJoined / memberLeft / join / leave
                    — ตอบคำถาม "ใครอยู่กลุ่มไหนบ้าง" ได้จาก DB ตลอดเวลา + ย้อนประวัติได้
```

- สมาชิกที่ join แล้ว **match กับ `line_staff_identity`** → รู้ชื่อพนักงาน; match กับ customer identity → รู้ว่าเป็นลูกค้า; ไม่ match ทั้งคู่ → bot ส่งลิงก์ผูกตัวตน (ถ้าอยู่กลุ่ม internal) หรือ mark เป็น guest (กลุ่มลูกค้า เช่น ญาติ/ผู้รับเหมาฝั่งลูกค้า)
- **คนแปลกหน้าในกลุ่ม internal** (ไม่ยอมผูกตัวตนภายใน N วัน) → แจ้งหัวหน้างาน — กันข้อมูลภายในรั่ว

## 3. Linkage — ลิงก์กลุ่มกับบ้านอย่างไร (provisioning)

```
เปิด installation project (จาก customer_requirement verified)
  → ระบบออก "รหัสผูกบ้าน" (สั้น, หมดอายุ 48 ชม., ใช้ได้ 2 ครั้ง — internal+customer)
  → หัวหน้างาน/sale สร้างกลุ่ม LINE 2 กลุ่มตามปกติ + เชิญ bot เข้ากลุ่ม
  → bot ได้ join event → ตอบในกลุ่ม: "พิมพ์ #ผูก <รหัส> <ทีม|ลูกค้า>"
  → คนที่มี staff identity พิมพ์ #ผูก → ระบบบันทึก line_groups (idempotent: กลุ่มหนึ่งผูกได้บ้านเดียว)
  → จากนั้น member events ไหลเข้า line_group_members อัตโนมัติ
ปิดงาน (project closed) → กลุ่ม archived — bot หยุด capture/แจ้งเตือน (ประวัติคงอยู่)
```

กติกา: การผูกทำได้เฉพาะผู้มี staff identity + เป็นสมาชิกโปรเจกต์นั้น · ผูกซ้ำ/ผิดบ้าน → หัวหน้างานแก้ผ่าน PWA (audit ทุกครั้ง)

## 4. Event Flows — ใครทำอะไรที่ไหนเมื่อไหร่

ทุกแถวลง audit เป็น 4 มิติ: **ใคร** (staff/customer identity) · **ทำอะไร** (event type) · **ที่ไหน** (บ้าน→ห้อง จาก group linkage + context) · **เมื่อไหร่** (webhook timestamp)

| เหตุการณ์ | กลุ่ม | ระบบทำอะไร |
|---|---|---|
| ช่างส่ง**รูป**ในกลุ่มทีมใน | internal | → capture `installation_proof` อัตโนมัติ (actor = ช่างจาก staff identity, project จาก group) → bot ตอบ ack + ให้เลือกห้อง/เลน (quick reply) → เข้า verify flow เดิม |
| ช่างพิมพ์ **#ปัญหา** + ข้อความ/รูป | internal | → สร้าง issue ผูกบ้าน/ห้อง + แจ้งหัวหน้างาน (เก็บเป็นหลักฐาน ไม่หายในแชท) |
| bot แจ้งเตือนทีม (งานใหม่/handoff/ผล approval/เตือนรายงาน) | internal | outbound template หมวด internal |
| bot ส่ง**ความคืบหน้า** (ห้องเสร็จ + รูปที่หัวหน้าเลือกแล้ว), นัดหมาย, แบบ, **ขออนุมัติ (Flex)** | customer | outbound template หมวด customer เท่านั้น (whitelist ที่ DB — ดู §6) |
| ลูกค้ากดอนุมัติ/ปฏิเสธจาก Flex ในกลุ่ม | customer | postback → `installation_approvals` (idempotent) → audit + แจ้งกลุ่ม internal |
| ลูกค้าถามในกลุ่ม | customer | คนตอบ (sale/หัวหน้า); bot ตอบเฉพาะเรื่องที่ระบบรู้ผ่าน template (เช่น สถานะงาน) — **ไม่มี free-text LLM** (กติกาเดิม) |
| member join/leave ทุกกลุ่ม | ทั้งคู่ | sync `line_group_members` + audit |

## 5. Access Matrix — ใครเข้าถึงข้อมูลอะไร

| ข้อมูล | ช่าง | หัวหน้างาน | Sale | Office/บัญชี | ลูกค้า |
|---|---|---|---|---|---|
| Checklist/subtask เลนตัวเอง | ✅ เขียน | ✅ ทุกเลน | 👁 อ่าน | 👁 อ่าน | ✕ |
| รูปหน้างานทั้งหมด (raw, กลุ่ม internal) | ✅ ของบ้านที่ตัวเองมี membership | ✅ | ✅ | 👁 | ✕ |
| รูป/ความคืบหน้า curated | — | ✅ เลือกส่ง | ✅ เลือกส่ง | 👁 | ✅ เฉพาะที่ถูกส่งเข้ากลุ่ม customer |
| ปัญหา/defect (#ปัญหา) | ✅ | ✅ | ✅ | 👁 | ✕ (จนกว่าจะแปลงเป็นข้อความ curated) |
| ต้นทุน/ราคา/margin | ✕ | 👁 (ตาม role) | ✅ (quote) | ✅ | ✕ เด็ดขาด — guardrail ที่ template whitelist |
| customer_requirement (ข้อมูลส่วนตัวลูกค้า) | 👁 เฉพาะส่วนหน้างาน (ที่อยู่/ข้อจำกัดไซต์) | ✅ | ✅ | ✅ | (ของตัวเอง) |
| ผลอนุมัติ | 👁 | ✅ | ✅ | 👁 | ✅ ของตัวเอง |

บังคับ 3 ชั้นตามหลักเดิม: UI (PWA) · Edge Function (LINE routes) · **DB RLS** (membership ต่อโปรเจกต์ + role) — LINE group membership **ไม่ใช่**ตัวกำหนดสิทธิ์ใน DB (คนหลุดเข้ากลุ่มไม่ได้สิทธิ์อะไรใน DB — สิทธิ์มาจาก `installation_memberships` เท่านั้น; กลุ่มเป็นแค่ช่องทาง)

## 6. Guardrails (มติ owner ข้อ 2 — บังคับที่ DB ไม่ใช่วินัยคน)

1. `line_oa_message_templates` เพิ่มคอลัมน์ **`audience`** (`internal` | `customer` | `both`) — outbound ไปกลุ่ม customer ได้เฉพาะ template ที่ `audience IN ('customer','both')` — **CHECK ที่ DB + Edge Function** (ส่งผิดกลุ่ม = โยน error ไม่ใช่แค่เตือน)
2. Template หมวด customer: ห้ามมี slot ที่รับข้อมูลต้นทุน/ภายใน (review ตอน approve template — governance เดิม)
3. รูปจากกลุ่ม internal **ไม่ forward อัตโนมัติ**ไปกลุ่ม customer — ต้องมนุษย์ (หัวหน้า/sale) เลือกผ่าน PWA เป็น curated update เท่านั้น
4. Bot ไม่ initiate free-text ใด ๆ — ทุก outbound คือ pre-approved template + named slots (สืบทอด line-oa Req เดิม)
5. Scrub logs (pattern เดิม) + รูป/ข้อความกลุ่ม = ข้อมูลส่วนบุคคล → PDPA: consent ตอน bind staff identity; privacy notice ปักในกลุ่ม (bot ส่งตอน join); retention ตาม lifecycle policy (D-4)

## 7. Data Model เพิ่ม (net-new — เข้า tasks Phase 1)

```sql
line_staff_identity   (line_user_id text UNIQUE, user_id uuid → auth, display_name, bound_at, consent_at, revoked_at)
line_groups           (id, line_group_id text UNIQUE, project_id → installation_projects, group_type internal|customer, status, bound_by, bound_at)
line_group_members    (group_id, line_user_id, display_name, member_kind staff|customer|guest, joined_at, left_at)
line_bind_codes       (code, project_id, expires_at, uses_left)          -- รหัสผูกบ้าน
line_oa_message_templates + audience ('internal'|'customer'|'both')      -- guardrail G1
line_oa_outbound_messages + target_type ('user'|'group') + target_id     -- ส่งเข้ากลุ่มได้
line_oa_inbound_messages + source_type ('user'|'group') + line_group_id  -- รับจากกลุ่มได้
```

ทั้งหมด RLS fail-closed ตาม convention C12 · member events idempotent ตาม `webhook_event_id` เดิม

## 8. สิ่งที่ยังไม่ทำใน v1 (ตัดชัด)

- Bot ตอบคำถามลูกค้าแบบเข้าใจภาษา (LLM) — ขัดกติกา template-only; ทบทวนพร้อม MCP governance
- อ่านข้อความกลุ่ม internal ทั้งหมดเข้า DB — v1 เก็บเฉพาะ**รูป + #ปัญหา + member events** (เจตนา: เก็บหลักฐานงาน ไม่ใช่ดักฟังแชท — PDPA-friendly และลด noise)
- LINE Notify (deprecated โดย LINE แล้ว) — ใช้ Messaging API push อย่างเดียว
