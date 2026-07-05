> ⚠️ **ARCHIVED EXTERNAL DRAFT — SUPERSEDED โดย spec ในโฟลเดอร์นี้ (requirements.md / design.md / tasks.md)**
>
> ต้นฉบับ build plan จากภายนอก (5 ก.ค. 2026) — เก็บไว้เป็น provenance เท่านั้น **ห้ามใช้เป็นแหล่งอ้างอิงสถานะ**
> ผลตรวจกับเรโปจริง (2026-07-05) พบ over-claim/คลาดเคลื่อนที่ถูกแก้ใน spec แล้ว:
>
> 1. **"Entitlement v0.3 ✅ มีแล้ว"** → จริงคือ 📝 design draft ยังไม่ deploy (block ที่ PRD §11 ข้อ 8)
> 2. **"LINE OA (Flex approval) ✅✅"** → infra จริง (webhook/outbound/templates) แต่ approval Flex flow = งานใหม่
> 3. **"Supabase Realtime ✅"** → ไม่มีการใช้ใน src/ เลย — chat/presence เป็น net-new ทั้งก้อน
> 4. **"2FA ✅" / "Storage 🟡"** → MFA ยังไม่เปิดใช้; ไม่พบ storage.from(/FCM/APNs ในโค้ด
> 5. **"Audit ✅ Trust Chain"** → Trust Chain เป็น manufacturing provenance — spec ใช้ pattern append-only (line_oa_audit_log) แทน
> 6. **`site_project`** → เปลี่ยนเป็น `installation_projects` (คำว่า site ชนความหมาย C12)
> 7. **`factory_packet_id` bridge** → packet ไม่มีใน DB — ต้องมี Packet Registry (net-new ที่ draft ไม่ได้นับ)
> 8. **reuse 60–70%** → ตรวจแล้ว ~40–50%; **MVP 3–5 เดือนรวม mobile offline** → แยก track web-PWA ก่อน
> 9. **"AI Voice Reporting ของ KANNA"** → ยังไม่พบหลักฐานยืนยันจากการค้นภายนอก (unverified)
> 10. ตาราง tier §6 ขาดคอลัมน์ status → ทุก `sitepm.*` ต้อง seed เป็น roadmap (กติกา anti-vaporware v0.3)
>
> ข้อเท็จจริง KANNA ที่ยืนยันแล้ว: 50,000+ บริษัท (ก.ย. 2024) → หน้าผลิตภัณฑ์อ้าง 70,000+/100+ ประเทศ · ใช้ใน ASEAN รวมไทย · ISO 27001 · รองรับภาษาไทย (sources: aldagram.com/en/news/20240903, global-en.kanna4u.com, capterra.com/p/10006844)

---

# KANNA-style Project Management → MONOLITH Integration
### Build Plan · 5 ก.ค. 2026
*ต่อยอดจาก "แผนพัฒนาซอฟต์แวร์จัดการโปรเจค (แนว KANNA)" — เปลี่ยนจาก standalone clone → โมดูลฝังใน MONOLITH*

> **สถานะ:** planning/design proposal สำหรับ review — ผ่าน MONOLITH governance flow ก่อน implement
> **ขอบเขต IP:** ลอกได้เฉพาะ *แนวคิดฟีเจอร์/เวิร์กโฟลว์* (การจัดการโปรเจคหน้างานเป็นแนวคิดทั่วไป) — ห้ามคัดลอกโค้ด/แบรนด์/ชื่อ KANNA/ไอคอน/UI พิกเซล-ต่อ-พิกเซล และต้องทำ PDPA สำหรับข้อมูลส่วนบุคคล (รูปหน้างาน ชื่อ อีเมล)

## 0. บทสรุปผู้บริหาร

**สิ่งที่ MONOLITH ยังขาดเพื่อให้ระบบสมบูรณ์:** MONOLITH ครอบคลุม CAD → CAM → Factory แต่ **จบที่ประตูโรงงาน** — สิ่งที่ขาดคือ **ช่วงส่งมอบ + ติดตั้งหน้างาน** ซึ่งเป็นสิ่งที่ KANNA ทำได้ดีที่สุด ปิด loop: `ออกแบบ → ผลิต → ส่งของ → ติดตั้งหน้างาน → รายงานภาพ → ลูกค้าอนุมัติ → ปิดงาน`

**ข่าวดี — MONOLITH มี "ส่วนที่ยากที่สุดของ KANNA" อยู่แล้วราว 60–70%:** *(⚠️ ดูป้ายด้านบน — ตรวจแล้ว ~40–50%)*

| KANNA hard challenge | MONOLITH มีแล้ว? *(ตาม draft — ก่อนตรวจ)* |
|-------------------------------------|-------------------|
| Multi-tenant + สิทธิ์ละเอียด (RLS) | ✅ Supabase RLS + IAM C12 (org↔site) |
| Auth + 2FA + RBAC | ✅ Supabase Auth + IAM C12 |
| Audit log / provenance | ✅ Trust Chain + Audit/Proof/Lineage |
| Signed export / ความปลอดภัยองค์กร | ✅ Signed Export Receipt (Ed25519) |
| ระบบ entitlement/tier | ✅ Entitlement v0.3 (53 features, 4 tiers) |
| Realtime (แชท/แจ้งเตือน) | ✅ Supabase Realtime (ใน stack) |
| File storage | 🟡 Supabase Storage |
| ช่องทางลูกค้าอนุมัติ | ✅✅ LINE OA Commerce (Flex approval) |

**สิ่งที่ต้องสร้างใหม่จริง ๆ (net-new) มี 6 ก้อน** — โดย **offline-first mobile คือตัวที่ยากและแพงที่สุด**

**นัยเชิงกลยุทธ์:** KANNA บุกตลาดไทย/SEA อยู่แล้ว (SK Kaken Thailand, Thai Solar Energy; DigiTech ASEAN Thailand) — เป็นคู่แข่งจริง แต่ MONOLITH ได้เปรียบ: (1) integrate กับการผลิตเฟอร์นิเจอร์จริง (2) ลูกค้าอนุมัติผ่าน LINE

## 1. KANNA ทำงานยังไง

KANNA = Field Project Management SaaS ของ Aldagram (โตเกียว) สำหรับงาน non-desk ใช้บนเว็บ + มือถือ + ออฟไลน์หน้างานได้ · 70,000+ บริษัทใน 100+ ประเทศ · ISO 27001 · free tier + ผู้ใช้ไม่จำกัดต่อโปรเจค

ฟีเจอร์หลัก: Site management, Photos/Documents (มาร์กบนรูป), Task Management, Project Board (Kanban), Sub-Project, Gantt, Dashboard, Calendar, In-House Chat, Daily Report, Custom Report (ฟอร์มดิจิทัล ออฟไลน์ได้), Photo Report, Approval Flow, ISO27001/2FA, Excel/CSV

จุดใหม่: (1) AI Assistance + AI Voice Reporting *(unverified — ดูป้าย)* (2) KANNA อยู่ในตลาดไทย/SEA แล้ว

## 2–9. (โครงสร้างหลักของ draft)

- §2 missing loop + moat: site project ผูก cabinet/panel/factory packet + LINE approval
- §3 Reuse Map *(แก้แล้วใน requirements.md §Reuse Map)*
- §4 Architecture: data model `site_projects` + reuse services *(แก้ชื่อ/รายละเอียดใน design.md D-1..D-5)*
- §5 Net-new 6 ก้อน: N1 project/task/board/gantt · N2 media pipeline · N3 form builder/report/e-sign · N4 chat+push · N5 mobile offline (ยากสุด) · N6 AI voice
- §6 Entitlement: 8 feature keys `sitepm.*` 4 tiers *(แปลงเป็น schema-draft-v0.4-delta.sql — roadmap ทั้งหมด)*
- §7 Roadmap: MVP 3–5 เดือน → Phase 2 +4–6 เดือน → Phase 3 องค์กร *(ปรับเป็น Phase 0–4 ใน tasks.md)*
- §8 Moat 5 ข้อ: vertical integration, LINE-native, ปิด loop เดียวจบ, provenance, ตลาดเฉพาะ
- §9 ความเสี่ยง: offline sync, storage cost, PDPA, scope creep, mobile codebase ใหม่, KANNA ในไทยแล้ว

## 10. อ้างอิง

- KANNA/Aldagram: kanna4u.com, global-en.kanna4u.com, aldagram.com, App Store/Google Play, Capterra
- เอกสารต้นทาง: "แผนพัฒนาซอฟต์แวร์จัดการโปรเจค (แนว KANNA)" v.4 ก.ค. 2026
- MONOLITH internal: PRD, Entitlement-Tier v0.3
