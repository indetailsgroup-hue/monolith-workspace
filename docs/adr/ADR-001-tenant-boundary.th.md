# ADR-001 — ขอบเขต Tenant และรูปแบบ Isolation

- **สถานะ:** Proposed
- **วันที่:** 2026-07-19
- **อำนาจตัดสินใจ:** MONOLITH Platform Owner, Architecture Authority และ Security/Privacy Authority
- **Pilot ที่ให้คำปรึกษา:** Daph และ tenant ในอนาคตให้หลักฐาน workflow แต่ไม่มีสิทธิ์ ratify นโยบายแพลตฟอร์ม
- **Bounded contexts:** Identity & Tenancy; Security & Observability; Platform API

## บริบท

MONOLITH ให้บริการองค์กรอิสระหลายราย ข้อมูล project, customer, ราคา, ไฟล์, manufacturing record และ service history ต้องไม่รั่วข้าม tenant บุคคลหรือ supplier หนึ่งรายอาจทำงานให้หลาย tenant ส่วน end customer อาจมี global login เดียวแต่ business profile ต้องแยกต่อ tenant ADR-002 เรียก tenant policy และ overlay แล้ว ดังนั้น ADR นี้เป็นกติกาหลักของการอ้างเหล่านั้น

PostgreSQL RLS มีประโยชน์แต่ไม่เพียงพอด้วยตัวเอง เพราะ superuser, table owner และ role ที่มี `BYPASSRLS` ข้าม policy ได้ หากไม่ควบคุม role และ `FORCE ROW LEVEL SECURITY` โดยเจตนา ทุก API object reference ยังต้องตรวจ object-level authorization เพื่อป้องกัน BOLA ดู [PostgreSQL RLS](https://www.postgresql.org/docs/18/ddl-rowsecurity.html) และ [OWASP API1:2023](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)

## การตัดสินใจ

MONOLITH ใช้ **Bridge isolation model**

1. Tenant มาตรฐานใช้ pooled PostgreSQL พร้อม `tenant_id`, RLS ระดับฐานข้อมูล และ `FORCE ROW LEVEL SECURITY` ทุก tenant-owned table
2. Routing layer ย้าย tenant ไป dedicated schema/database ได้เมื่อมีข้อกำหนดด้านสัญญา กฎหมาย home region, customer-managed key, SLA/load หรือ incident containment
3. Daph เป็น pilot tenant ปกติ ไม่มีสิทธิ์เขียนหรือ ratify ระดับแพลตฟอร์ม
4. Shared canonical data ไม่ขึ้นกับ tenant, tenant อ่านอย่างเดียว และแก้ผ่าน MONOLITH governance เท่านั้น ราคา ชื่อภายใน supplier preference สัญญา และ mapping เฉพาะรายอยู่ใน tenant overlay

## ขอบเขต Identity และ Authorization

- บุคคลหรือองค์กรมี global `actor_id` หนึ่งชุด
- สิทธิ์มาจาก `tenant_membership(actor_id, tenant_id, roles, validity)` เท่านั้น
- หนึ่ง request มี active tenant เดียว `tenant_id` ต้องมาจาก authenticated membership ไม่ใช่ request body, query parameter หรือ object ID ที่ยังไม่ verify
- Supplier, contractor และ installer ที่ทำงานหลาย tenant ได้ membership/scope แยกในแต่ละ tenant และไม่กลายเป็น platform admin
- End customer ใช้ global login ได้ แต่ profile, consent, project, budget, contract, files และ service history ต้อง tenant-local ระบบห้ามเปิดเผยว่าบุคคลเดียวกันเป็นลูกค้าของ tenant อื่น

## Propagation invariant

Active tenant context ที่ verify แล้วต้องติดไปกับ database transaction, object-storage path, cache key, queue job, event, webhook, search index, export และ audit record ทุกครั้ง งานข้าม tenant ทำได้เฉพาะ platform job ที่กำหนด scope, authorization, reason, expiry และ audit ชัดเจน

## Runtime role red lines

- Application runtime ห้ามเป็น superuser, table owner หรือ `BYPASSRLS`
- Migration ownership ต้องแยกจาก runtime access
- RLS ต้องควบคุมทั้งการมองเห็น (`USING`) และการเขียน (`WITH CHECK`) ตามกรณี
- CI ต้องพิสูจน์ว่า tenant A อ่าน สร้าง แก้ ลบ export enqueue ดึงไฟล์ หรือรับ event ของ tenant B ไม่ได้
- Shared canonical tables ต้องปฏิเสธ tenant write โดยไม่พึ่ง UI

## Support access

MONOLITH support ไม่มี standing access ต่อข้อมูล tenant การเข้าถึงใช้ break-glass record ที่มี ticket, purpose, tenant, actor, scope, approval, start, expiry และ immutable audit เหตุ security emergency เปิดได้ตาม incident policy แต่ต้องแจ้งและ review ย้อนหลังภายใน SLA

## Analytics และ AI

ห้ามใช้ raw tenant data ทำ cross-tenant analytics หรือฝึก AI โดยค่าเริ่มต้น การวิเคราะห์รวมต้อง aggregate จนย้อนกลับไปหาบุคคลหรือ tenant ไม่ได้ การใช้งานกว้างกว่านั้นต้องมี contractual opt-in แยก พร้อม scope, purpose, retention, withdrawal และ auditability

## Encryption และ Residency

- Tenant ทุกรายมี encryption-key identity และ tenant-specific DEK ภายใต้ KMS envelope encryption
- Dedicated tenant ใช้ customer-managed key ได้
- การทำลาย key เพื่อ cryptographic erasure ต้องมี two-person approval และ immutable audit
- Tenant ทุกรายมี `home_region`; database, object storage, backup และ keys อยู่ใน region นั้น
- การ copy/migrate/failover ข้าม region ต้องมีฐานกฎหมาย/สัญญา approval และ migration evidence ห้าม silent failover

## Offboarding และ Recovery

- ส่ง authorized tenant export ภายใน 7 วัน
- เปิด recovery window 30 วัน
- ลบ production/object-storage data หลัง 30 วัน เว้นแต่มี legal hold
- ทำให้ backup ใช้งานไม่ได้ภายใน 90 วันด้วย expiry และ/หรือ governed key destruction
- Legal hold ต้องมี reason, approver, scope และ expiry
- Tenant มาตรฐานใช้ `RPO ≤ 15 นาที`, `RTO ≤ 4 ชั่วโมง`
- Tenant-scoped restore ห้ามย้อน tenant อื่น Dedicated tenant ใช้ SLA ที่เข้มกว่าและต้องผ่าน restore drill ก่อน production

## Migration และ Rollback

การย้าย pool ไป dedicated ต้องมี governed route, backfill, double-write ที่ verify หรือ write pause, reconciliation, read cutover, monitoring และ rollback copy ที่มีเวลาหมดอายุ ห้ามจบ migration จน row/file counts, checksums, events, access tests และ restore evidence ตรงกัน Rollback ต้องคืน route เดิมโดยไม่เกิด mixed-tenant writes

## ผลตามมา

แนวทางนี้รักษาต้นทุน tenant มาตรฐานและรองรับ isolation ที่เข้มขึ้น แต่เพิ่มความซับซ้อนด้าน routing, migration, keys, restore และ tests Cross-tenant reporting กลายเป็นข้อยกเว้นที่มี governance ไม่ใช่สิทธิ์ฐานข้อมูลโดยปริยาย

## Ratification และ Evidence Gate

ADR นี้ยังเป็น Proposed จนกว่าจะมีและผ่านใน revision เดียวกัน:

1. Database schema/RLS ครบทุก tenant-owned table
2. Tests ของ runtime/migration roles ที่พิสูจน์ว่า application ไม่ใช้ owner/bypass role
3. Cross-tenant negative matrix ครบ DB, files, cache, jobs, events, webhooks, exports, search และ support
4. Tenant export, deletion, backup expiry, key erasure, pool-to-dedicated migration, rollback และ restore drills
5. Legal/privacy review สำหรับ GDPR, Thailand PDPA, contracts, residency และ breach procedures
6. Approval แยกจาก Platform Owner, Architecture Authority และ Security/Privacy Authority โดย implementer ห้ามอนุมัติคนเดียว

ยังไม่มี artifact ใดพิสูจน์ production isolation ADR นี้คือ owner decision ที่อนุมัติแนวทางแล้วแต่ยังมี governance status เป็น Proposed
