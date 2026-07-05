# LINE Architecture — Installation PM v0.1 (rev.1 — เพิ่มตำแหน่งงานครบชุดตาม "สำหรับคุณชุ.xlsx")

> **มติ owner (5 ก.ค. 2026):** (1) บ้านละ **2 กลุ่ม** — Internal Team (คุยงาน/ปัญหา/ต้นทุน/แก้แบบ/นัดช่าง) + Customer Group (เฉพาะสิ่งที่ลูกค้าควรรู้: ความคืบหน้า, แบบ, นัดหมาย, ขออนุมัติ) · (2) **bot เข้าทุกกลุ่ม** ในบทบาท "ผู้ช่วยเก็บหลักฐานและแจ้งเตือน" พร้อม guardrails — ห้ามพูดต้นทุน/เรื่องภายในในกลุ่มลูกค้า, กลุ่มลูกค้าใช้ template ควบคุมเท่านั้น, ข้อความ sensitive route เข้ากลุ่มทีมในเท่านั้น · (3) ผูกตัวตนพนักงาน↔LINE ด้วย**ลิงก์ครั้งเดียว** (LINE Login)
> **ฐานที่ต่อยอด:** line-oa-commerce (✅ 20/20 — webhook HMAC/idempotent, outbound worker, template governance "ไม่มี free-text LLM", customer identity) — **schema เดิมเป็น 1:1 ล้วน ไม่มี group** → ส่วนกลุ่ม/ตัวตนพนักงานเป็น net-new ตามเอกสารนี้

## 1. Actors & Identities — ใครเป็นใครในระบบ

| Actor | Identity | ที่เก็บ | หมายเหตุ |
|---|---|---|---|
| **ลูกค้า** | LINE user_id → canonical customer | `line_oa_customer_identity` (มีแล้ว) | ไม่เป็น DB principal (Edge Function mediate — pattern เดิม) |
| **พนักงานทุกตำแหน่ง** (ดู §1.1) | LINE user_id ↔ บัญชีพนักงาน (auth user) | **`line_staff_identity`** (ใหม่ — ตารางเดียวทุกตำแหน่ง) | ผูกครั้งเดียว: admin ส่งลิงก์ → พนักงานกด → LINE Login → บันทึก mapping + consent; `line_user_id` UNIQUE; **role/แผนก มาจากระบบ (C12 roles + memberships) ไม่ใช่จาก LINE** |
| **Bot** | OA channel เดิม | `line_oa_channels` (Vault refs) | ตัวเดียว ทำงานต่างกันตาม group_type |

**ทำไมต้องแยก staff identity จาก customer identity:** ตาราง customer มี match_confidence/manual_review (จับคู่โดยอนุมาน) แต่พนักงานต้อง**ยืนยันตัวเองแบบ deterministic** (LINE Login) เพื่อให้ `resolve_actor` audit ได้ว่า "ช่างคนไหนส่งรูปนี้" — ห้ามอนุมาน

### 1.1 ตำแหน่งงานทั้งหมดในขั้นตอนการทำงาน DAPH (จาก "สำหรับคุณชุ.xlsx" 2025-07-03)

**กลุ่ม ก — ทำงานต่อโปรเจกต์ลูกค้าโดยตรง** (มี membership ต่อบ้าน + เกี่ยวกับ LINE กลุ่ม — ตรงกับ Department ใน workflow spec: Sale, Area Measurement, Designer, 3D_Presentation, Production Planning, 3D_Rendering_Final, Factory, Installation, Purchasing):

| แผนก (ตามไฟล์) | คน (แผน) | บทบาทต่อโปรเจกต์ | เฟสที่แตะ LINE กลุ่ม |
|---|---|---|---|
| on Line sales | 2 | Qualify ลูกค้า, เสนอราคา, ชี้แจงขั้นตอน, เก็บค่าวัดหน้างาน | ทุกเฟส — อยู่ทั้ง 2 กลุ่มตลอดอายุโปรเจกต์ |
| measure (Area Measurement) | 10 | ตรวจข้อมูลจาก sale, วัดพื้นที่ → site_survey | internal ช่วงวัดพื้นที่ |
| Designer | 5 | Function, Mood & theme, Floor plan, Cabinet & wall list | internal + ส่งแบบ/ขออนุมัติเข้ากลุ่ม **customer** (ผ่าน curated flow) ช่วงออกแบบ |
| 3D rendering | 5 | 3D final, furniture/lighting/material selection, rendering | internal ช่วงออกแบบ; ผลงาน render → กลุ่ม customer ผ่าน curated |
| Production Planning | 5 (25k/คน) | 3D model→Pytha, raw mat list, FTR production list, installation checklist, **สั่งซื้อวัสดุ (Purchasing)** | internal — แจ้งกำหนดการผลิต/ของเข้า |
| Production (Factory) | 27 | สถานีเครื่อง: Laminate HPL (4), cutting (4), edging (4), CNC (4), assembly (7: ทำความสะอาด 2/เกือกม้า 1/เดือยไม้ 1/เดือยเหล็ก 1/ประกอบ 2), packing (2) | ปกติไม่อยู่กลุ่มบ้าน — งานเดินผ่าน work item/ใบงาน; แจ้งของเสร็จ → bot โพสต์กลุ่ม internal |
| Installation | 3 ช่าง/ห้อง + หัวหน้างาน 1/บ้าน | ตาม form templates | internal ช่วงติดตั้ง; หัวหน้าอยู่กลุ่ม customer ด้วย |
| General Manager / BD | 1+1 | oversight, escalation (Executive Owner ใน RACI) | ไม่บังคับอยู่กลุ่ม — เห็นทุกอย่างผ่าน PWA/dashboard |

**กลุ่ม ข — support ไม่ผูกโปรเจกต์ลูกค้ารายหลัง** (มี staff identity ได้ แต่ไม่มี membership ต่อบ้าน → ไม่เห็นข้อมูลโปรเจกต์ตาม RLS): Marketing (Brand Editor, Creative, Account Executive ฯลฯ), digital marketing (Content, SEO, Data & Analytics, E-Commerce ฯลฯ), team media/Production House (motion graphic, graphic designer, Director, Camera man ฯลฯ — เข้าไซต์ถ่ายงานได้เป็นครั้งคราว → ให้ membership ชั่วคราวแบบ external ต่อบ้าน + เข้ากลุ่ม internal เฉพาะช่วงถ่าย), Software team, Marketing officer (Year 2+)

## 2. Group Model — ใครอยู่กลุ่มไหน

```
installation_projects (บ้าน) ─1:2─ line_groups
  ├─ group_type = 'internal'  → sale (ตลอด) + สมาชิกหมุนตามเฟส: ทีมวัด (ช่วงวัด) →
  │                             designer/3D (ช่วงออกแบบ) → หัวหน้างาน+ช่าง (ช่วงติดตั้ง)
  │                             (+team media ชั่วคราวช่วงถ่ายงาน — external membership)
  └─ group_type = 'customer'  → ลูกค้า + sale + หัวหน้างาน (ช่างไม่อยู่; designer ไม่อยู่ —
                                แบบ/render ส่งเข้ากลุ่มผ่าน curated flow)

**กลุ่มมีอายุยาวตลอดโปรเจกต์ ไม่ใช่แค่เฟสติดตั้ง** — กลุ่ม customer ทำงานตั้งแต่เฟสออกแบบ
(ส่งแบบ 3D + ขออนุมัติแบบผ่าน Flex — flow เดียวกับอนุมัติงานติดตั้ง) สมาชิก internal
หมุนตามเฟส โดย member events บันทึกหมดว่าใครเข้า/ออกเมื่อไหร่

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

## 5. Access Matrix — ใครเข้าถึงข้อมูลอะไร (ครบทุกตำแหน่งกลุ่ม ก + support)

| ข้อมูล | ช่างติดตั้ง | หัวหน้างาน | Sale | ทีมวัด | Designer/3D | Production Planning | Factory (สถานี) | Office/บัญชี | GM/BD | Marketing/media/SW | ลูกค้า |
|---|---|---|---|---|---|---|---|---|---|---|---|
| customer_requirement | 👁 ส่วนหน้างาน | ✅ | ✅ | ✅ (ตรวจข้อมูลจาก sale — JES-002) | ✅ | ✅ | ✕ | ✅ | ✅ | ✕ | (ของตัวเอง) |
| site_survey / SiteSurveyZone | 👁 | ✅ | 👁 | ✅ เขียน | ✅ | ✅ | ✕ | 👁 | ✅ | ✕ | ✕ |
| แบบ/3D/render + ผลอนุมัติแบบ | 👁 | ✅ | ✅ | 👁 | ✅ เขียน | ✅ | 👁 (drawing ใบงาน) | 👁 | ✅ | ✕ | ✅ เฉพาะที่ส่งเข้ากลุ่ม + อนุมัติของตัวเอง |
| ใบงานผลิต / FTR checklist / กำหนดการ | ✕ | 👁 | 👁 | ✕ | 👁 | ✅ เขียน | ✅ สถานีตัวเอง | 👁 | ✅ | ✕ | ✕ |
| Checklist/subtask ติดตั้ง | ✅ เลนตัวเอง | ✅ ทุกเลน | 👁 | ✕ | ✕ | 👁 (ตัวเองเป็นคน issue checklist) | ✕ | 👁 | ✅ | ✕ | ✕ |
| รูปหน้างาน raw (กลุ่ม internal) | ✅ บ้านที่มี membership | ✅ | ✅ | ✅ ช่วงวัด | ✅ ช่วงออกแบบ | 👁 | ✕ | 👁 | ✅ | ชั่วคราวตาม external membership | ✕ |
| รูป/ความคืบหน้า curated | — | ✅ เลือกส่ง | ✅ เลือกส่ง | — | เสนอผ่าน curated | — | — | 👁 | ✅ | ✕ | ✅ ที่ถูกส่งเข้ากลุ่ม |
| ปัญหา/defect (#ปัญหา) | ✅ | ✅ | ✅ | ✅ ช่วงวัด | ✅ ช่วงออกแบบ | ✅ | 👁 (defect ที่โยงผลิต) | 👁 | ✅ | ✕ | ✕ จนกว่า curated |
| ต้นทุน/ราคา/margin/job-cost | ✕ | 👁 ตาม role | ✅ quote | ✕ | ✕ | ✅ (วัสดุ/สั่งซื้อ) | ✕ | ✅ | ✅ | ✕ | ✕ เด็ดขาด (guardrail DB) |
| ผลอนุมัติงานติดตั้ง | 👁 | ✅ | ✅ | ✕ | ✕ | 👁 | ✕ | 👁 | ✅ | ✕ | ✅ ของตัวเอง |

หลัก: **role มาจาก C12 roles + `installation_memberships` ต่อบ้าน** — Marketing/media/Software ไม่มี membership → RLS ปิดหมดโดย default (team media เข้าถ่ายงาน = external membership ชั่วคราว); Factory ทำงานผ่าน work item/ใบงานของแผนกตัวเอง ไม่ผูกกลุ่ม LINE บ้าน

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
