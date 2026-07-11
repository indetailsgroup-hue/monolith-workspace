# S17 Hosted Auth และ Staging Evidence Package

รุ่น package: 1.0

จัดทำ: 2026-07-12

สถานะ: **Package สำหรับ Human/Ops รัน — ไม่ใช่อำนาจ deploy**

> Script ไม่ deploy Edge function และไม่ apply migration แต่เมื่อ Human/Ops รัน มันจะสร้างและเปลี่ยนสถานะ synthetic job หนึ่งงานบน staging ดังนั้นการรันเป็น state-changing staging action ที่ต้องมีมติมนุษย์ชัดเจน ห้ามรันกับ production

## 1. วัตถุประสงค์

Package นี้เก็บ hosted evidence gate ที่ยังขาดของ S17-1/S17-2 implementation candidate:

- Designer JWT จริงที่ถูกต้องได้ `200`
- JWT ที่หมดอายุจริงได้ `401`
- user ถูกต้องแต่ไม่มี `app_metadata.roles` ที่ระบบรู้จักได้ `403`
- `x-actor-role: DESIGNER` ปลอมให้ Factory principal มีสิทธิ์ transition ไม่ได้ และ job ยังคง DRAFT
- INSTALLER อ่าน state ได้ แต่ activity ได้ `403`
- packet upload, export และ verify ตอน FROZEN ได้ `409` ทุกเส้น
- Designer ที่ถูกต้อง release ไป RELEASED ได้
- release activity เก็บ `actorName = actorSubjectId = verified JWT sub` ไม่ใช่ email

Script ไม่เก็บ JWT, API key, raw activity body, email หรือ plaintext subject ID ใน evidence JSON โดยเก็บ SHA-256 subject anchor และ response field ที่จำกัดไว้เท่านั้น

## 2. เงื่อนไขก่อนรันที่ Human/Ops เป็นเจ้าของ

- independent review รับ source candidate SHA ที่แน่นอนแล้ว
- เป้าหมายเป็น hosted Supabase **staging/test** ที่แยกจาก production เท่านั้น
- บันทึก backup, abort owner, maintenance window และ approval แล้ว
- apply migration 0162 บน staging สำเร็จ
- deploy `factory-api` commit ที่ review แล้วบน staging
- PostgREST schema cache และ Auth healthy
- มี staging token ห้าตัวจาก secret manager/environment variables:
  - active Designer (`app_metadata.roles` มี `designer`)
  - active Factory (`factory_operator` หรือ `factory`)
  - active Installer (`installer`)
  - active no-role user (ไม่มี Factory role ที่ระบบรู้จัก)
  - **token จริงที่ค่า `exp` ผ่านไปแล้ว** การทำ token เสียไม่เทียบเท่าการทดสอบหมดอายุ

Operator ต้อง verify deployed commit แยกต่างหาก การรันผ่านทั้งที่ deploy คนละ commit เป็น evidence ที่ใช้ไม่ได้

## 3. ลำดับ deploy ของมนุษย์

Migration และ final Edge function แบบ as-built ไม่มี binary order ที่ zero-downtime: final function ต้องใช้ RPC signature ใหม่ ส่วน migration 0162 ถอน signature เก่า ให้ใช้ approved maintenance sequence จาก client compatibility checklist:

1. หยุด Factory mutations และยืนยัน staging target, backup และ abort owner
2. ตรวจ `supabase migration list` ให้แน่ใจว่า 0162 เป็น Factory migration ที่ตั้งใจให้ pending เพียงตัวเดียว
3. รันและ review `supabase db push --dry-run` กับ staging project ที่ link ไว้
4. เมื่อมีมติชัดเจน จึงรัน `supabase db push` เพื่อ apply 0162 บน staging
5. Deploy function ที่ review แล้วด้วย `supabase functions deploy factory-api`
6. Verify deployed target/commit แล้วจึงรัน evidence script นี้
7. ถ้าเคสใด fail ให้คง staging traffic ปิดไว้และ archive redacted evidence กับ platform run/deploy logs

ทั้งหมดเป็นคำสั่งของ operator ไม่ใช่ authorization การ link project, push และ deploy ต้องทำโดย Human/Ops ไม่ใช่ AI implementer

## 4. การตั้งค่าแบบไม่รั่ว secret

ตั้งค่าใน operator process จาก secret store ที่อนุมัติ ห้าม paste JWT ลง chat, commit, command history หรือ evidence:

```powershell
$env:S17_FACTORY_API_BASE_URL = 'https://<STAGING-REF>.supabase.co/functions/v1/factory-api'
$env:S17_SUPABASE_ANON_KEY = '<STAGING-ANON-KEY>'
$env:S17_DESIGNER_JWT = '<ACTIVE-DESIGNER-JWT>'
$env:S17_FACTORY_JWT = '<ACTIVE-FACTORY-JWT>'
$env:S17_INSTALLER_JWT = '<ACTIVE-INSTALLER-JWT>'
$env:S17_NO_ROLE_JWT = '<ACTIVE-NO-ROLE-JWT>'
$env:S17_EXPIRED_JWT = '<GENUINELY-EXPIRED-STAGING-JWT>'
$env:S17_TARGET_LABEL = 'monolith-staging'
$env:S17_EXPECTED_COMMIT = '<FULL-40-HEX-DEPLOYED-COMMIT>'
$env:S17_EXPECTED_MIGRATION_SHA256 = '<LOWERCASE-SHA256-OF-0162>'
```

Package ตั้งใจไม่รับและไม่ต้องใช้ service-role key

## 5. คำสั่งรันซ้ำได้

ดูแผนแบบปลอดภัยในเครื่อง (ไม่มี network หรือ state change):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File supabase/tests/s17-hosted-auth/run-hosted-auth-evidence.ps1 `
  -PlanOnly
```

รันบน hosted staging หลังอนุมัติ:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File supabase/tests/s17-hosted-auth/run-hosted-auth-evidence.ps1 `
  -ConfirmNonProduction `
  -EvidencePath artifacts/s17-hosted-auth-evidence-<RUN-ID>.json
```

Guard ที่บังคับ:

- target label ต้องมี staging/stage/preview/test/sandbox
- hosted URL ต้องเป็น HTTPS
- job ID ต้องขึ้นต้น `S17-HOSTED-`
- expected commit และ migration hash ต้องเป็น lowercase hash เต็ม
- active token ต้องยังไม่หมดอายุและมี metadata role ตามที่คาด
- expired token ต้องมี `exp` ในอดีต
- ไม่ overwrite evidence เดิม นอกจาก operator ส่ง `-ForceEvidenceOverwrite` ชัดเจน
- หยุดเมื่อพบ status/state แรกที่ผิดคาด และยังเขียน redacted FAIL record

## 6. Checklist archive evidence

- เก็บ byte ของ JSON ที่สร้างและคำนวณ SHA-256
- แนบ staging deployment/function log IDs และ migration apply log
- ระบุ hosted project ด้วย approved non-secret label/project ref
- บันทึก deployed commit และ migration digest จริง
- ตรวจทุก case เป็น PASS
- ตรวจ `rawTokensStored` เป็น false และไม่มี secret/email/plain subject ID
- archive เข้า durable evidence path ที่อนุมัติก่อนมติ closure ของมนุษย์

## 7. ขอบเขต

Hosted run เขียวและ staging migration สำเร็จเป็นเพียง evidence input สำหรับ human closure review ของ S17-1/S17-2 ไม่ merge code, ไม่ปิด P0 เอง, ไม่พิสูจน์ production readiness, ไม่ปิด `factory-site-isolation`, ไม่ปลดล็อกการตัดจริง และไม่ให้อำนาจ deploy production
