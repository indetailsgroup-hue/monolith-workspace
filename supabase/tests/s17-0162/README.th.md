# S17 Migration 0162 — ชุด Dry-Run บน PostgreSQL

รุ่นเอกสาร: 1.0

จัดทำ: 2026-07-11

Implementation candidate: `739aee160f324543006028e74f8ce479ecc538a3`

Migration เป้าหมาย: `supabase/migrations/0162_factory_server_identity_released_only.sql`

สถานะ: **ชุดตรวจสอบสำหรับ non-production เท่านั้น**

> ชุดนี้ไม่ apply migration 0162 กับ production, ไม่อนุมัติ merge และไม่ปิด S17-1/S17-2 โดย driver ทั้งสองเปิด transaction เดียวและจบด้วย `ROLLBACK`

## 1. สิ่งที่ชุดนี้พิสูจน์

Assertions รัน migration ตัวจริงบน PostgreSQL จริงและตรวจว่า:

1. RPC overload เก่าที่รับ actor จากผู้เรียกถูกถอดออก
2. เฉพาะ `service_role` มีสิทธิ์ execute mutating RPC ใหม่โดยตรง
3. client แบบ authenticated ที่พยายามส่ง actor ปลอมถูกปฏิเสธและไม่สร้าง job/event
4. server actor context ที่ผิดรูปถูกปฏิเสธก่อนแก้ state หรือ audit
5. role ผิดประเภทถูกปฏิเสธสำหรับการบันทึก packet และ verification
6. transition ผิดลำดับคืน error และไม่เขียน event
7. งานสถานะ FROZEN บันทึก/อัปโหลด packet ไม่ได้, exportable ไม่ได้ และบันทึก verification ไม่ได้
8. positive control `DRAFT -> FROZEN -> RELEASED -> record packet -> verify` ผ่านและบันทึก server actor context

ชุดนี้ **ไม่พิสูจน์** hosted Supabase Auth, Storage, Edge deployment, PostgREST schema-cache refresh, ความครบของ metadata ผู้ใช้ production หรือ P0 closure

## 2. ไฟล์ในชุด

| ไฟล์ | หน้าที่ |
| --- | --- |
| `dry-run-bootstrap.sql` | สร้าง migrations 0155/0156/0157/0161 ใน DB ชั่วคราว, apply 0162, รัน assertions แล้ว rollback |
| `dry-run-existing.sql` | ตรวจว่า non-production DB อยู่ที่ 0161, apply 0162, รัน assertions แล้ว rollback |
| `bootstrap-pre0162.sql` | สร้าง Supabase roles และ `fn_is_service_role()` เท่าที่ DB ว่างต้องใช้ |
| `preflight-existing.sql` | ตรวจ tables และ legacy signatures ก่อน 0162 แบบ fail-closed |
| `assertions.sql` | negative cases และ positive controls |
| `run-0162-dry-run.ps1` | psql runner ที่มี safety gate สำหรับ connection ที่ระบุ |
| `run-0162-ephemeral.ps1` | สร้าง PostgreSQL cluster ชั่วคราว, รัน bootstrap mode, หยุดและลบทิ้ง |
| `local-postgres-dry-run-evidence.json` | บันทึกผล PostgreSQL 18.1 bootstrap ที่ผูก hash inputs และ exclusion list |

## 3. คำสั่งแนะนำ: PostgreSQL ชั่วคราว

เครื่องต้องมี `psql`, `initdb`, `pg_ctl`, `createdb` และ `pg_isready` ใน `PATH`

รันจาก repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File supabase/tests/s17-0162/run-0162-ephemeral.ps1 `
  -Port 55439
```

หาก port ถูกใช้ให้เปลี่ยนเป็นหมายเลขอื่น ผลสำเร็จต้องจบด้วย marker ครบสี่ตัว:

```text
S17_0162_ASSERTIONS_PASS
S17_0162_DRY_RUN_PASS mode=bootstrap transaction=rolled_back
S17_0162_PSQL_PACKAGE_PASS
S17_0162_EPHEMERAL_POSTGRES_PASS
```

## 4. รันกับ non-production DB ที่อยู่ก่อน 0162

เป้าหมายต้องเป็น disposable snapshot ที่มี migrations ถึง 0161 และยังไม่มี 0162 ห้ามชี้ไป production

```powershell
$env:S17_TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@HOST:PORT/s17_0162_staging'

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File supabase/tests/s17-0162/run-0162-dry-run.ps1 `
  -Mode existing-pre0162 `
  -ExpectedDatabase s17_0162_staging `
  -ConfirmNonProduction
```

Runner ใช้ `psql -X -w`, `ON_ERROR_STOP=1`, ตรวจชื่อ database จริง, ปฏิเสธชื่อ protected/production-like และไม่เปิด password prompt แนะนำ `.pgpass`, `PGPASSFILE` หรือ secret environment variable อายุสั้นในสภาพแวดล้อม operator ที่ควบคุมแล้ว

## 5. พฤติกรรมเมื่อไม่ผ่าน

- Assertion ที่ไม่ผ่าน raise `S17_ASSERT_FAIL` และ psql ออกด้วย code ที่ไม่ใช่ศูนย์
- DB ที่ไม่ได้อยู่สถานะ 0161 raise `S17_PREFLIGHT_FAIL` ก่อน migration ทำงาน
- หาก error การตัด connection จะ rollback transaction ที่ยังเปิดอยู่; หากผ่าน driver จะ `ROLLBACK` อย่างชัดเจน
- Ephemeral runner ลบเฉพาะโฟลเดอร์ที่ตัวเองสร้างชื่อ `monolith-s17-0162-<guid>` ใต้ system temp หลังหยุด PostgreSQL แล้ว

## 6. หลักฐานที่รันซ้ำแล้วบนเครื่องนี้

วันที่ 2026-07-11 bootstrap driver ผ่านบน PostgreSQL 18.1 ด้วย database ชั่วคราวชื่อ `s17_0162_dryrun` negative cases และ positive controls ผ่านทั้งหมด, transaction ถูก rollback, server ถูกหยุด และ cluster ชั่วคราวถูกลบแล้ว Exact input hashes และ exclusions อยู่ใน `local-postgres-dry-run-evidence.json` หลักฐานนี้เป็น local real-PostgreSQL เท่านั้น; ยังต้องมี hosted/staging evidence ก่อนมนุษย์พิจารณาปิดงาน

## 7. Human gate

การ apply 0162 กับ hosted หรือ production database ต้องมีมติมนุษย์แยกต่างหาก, deployment sequence ที่อนุมัติ, metadata readiness, แผน backup/abort และ independent review ชุดนี้ไม่ให้อำนาจดังกล่าว
