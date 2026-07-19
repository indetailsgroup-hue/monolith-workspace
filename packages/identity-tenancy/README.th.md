# Identity & Tenancy — ชุด Contract ตาม ADR-001

**สถานะ:** Proposed contract fixtures; ไม่ใช่หลักฐานการบังคับใช้ใน production

Package นี้แปลงมติ ADR-001 ที่เจ้าของยืนยันแล้วเป็น contract แบบ machine-readable และ negative isolation matrix โดยยังไม่ได้ implement identity provider, PostgreSQL RLS, KMS, object storage, queue, webhook, backup หรือ hosted control plane

## มติที่กำกับ

- ใช้ Bridge isolation: tenant มาตรฐานอยู่ใน pool และย้ายไป dedicated storage ผ่าน governance เมื่อสัญญา/กฎหมาย, residency, customer-managed key, SLA/load หรือ containment กำหนด
- ใช้ global identity หนึ่งตัวพร้อม membership เฉพาะ tenant และมี active tenant หนึ่งรายต่อ request
- Customer profile, contract, ราคา, preference, approval และ project selection เป็น tenant-local
- Shared canonical kernel เขียนได้ผ่าน MONOLITH governance เท่านั้น
- Support ไม่มี standing access; เข้าข้อมูล tenant ได้แบบ break-glass เท่านั้น ต้องจำกัด scope, อนุมัติ, หมดอายุ และมี immutable audit
- Tenant context ต้องส่งต่อครบ database, object storage, cache, job, event, webhook และ audit
- Runtime database role ห้ามเป็น superuser, table owner หรือ `BYPASSRLS`; ต้องใช้ `FORCE ROW LEVEL SECURITY` และแยก migration role
- ทุก tenant มี tenant-specific DEK ภายใต้ KMS envelope encryption; dedicated tenant ใช้ customer-managed key ได้
- `home_region` เปลี่ยนไม่ได้และห้าม silent cross-region failover
- ค่าเริ่มต้นห้าม raw cross-tenant analytics/AI training; อนุญาต irreversible aggregate และการใช้กว้างกว่านั้นต้อง contractual opt-in
- เป้าหมายมาตรฐานคือ RPO ≤15 นาที และ RTO ≤4 ชั่วโมง พร้อม tenant-scoped restore
- Offboarding: export ภายใน 7 วัน, recovery ถึงวันที่ 30, ลบ production ภายในวันที่ 30 และทำให้ข้อมูล backup ใช้งานไม่ได้ภายในวันที่ 90 ยกเว้น controlled legal hold

## Artifact

- `contracts/tenant-boundary.schema.json` ตรวจ authenticated request tenant context และเก็บคำศัพท์ policy ที่กำกับ
- `contracts/isolation-test-matrix.json` กำหนดกรณีปฏิเสธ cross-tenant ครบทุก plane รวม break-glass, restore และ migration evidence
- `tests/identity_tenancy/test_contracts.py` ตรวจให้ fixture สอดคล้องกับ ADR-001 ต่อเนื่อง

## หลักฐานที่ต้องมีเพื่อ implement จริง

การ ratify ต้องมี adapter รัน matrix กับ service จริง, ตรวจ database role และ `FORCE RLS`, trace isolation ของ object/cache/queue/webhook, KMS key-policy และ erase drill, หลักฐาน tenant-scoped restore, deletion/backup expiry, test home-region, บันทึก break-glass audit/notification และการอนุมัติจาก Platform Owner, Architecture และ Security/Privacy ส่วน Daph เป็นหลักฐานจาก consulted pilot เท่านั้น

## สิ่งที่ไม่ได้อ้าง

การผ่าน fixture tests พิสูจน์เพียงความสอดคล้องของเอกสาร ไม่ได้พิสูจน์ production isolation, security, privacy compliance, disaster recovery, data deletion, residency หรือ operational readiness
