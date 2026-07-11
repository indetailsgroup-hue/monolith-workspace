# S17 Track A — Client Compatibility และ Deployment Checklist

รุ่นเอกสาร: 1.0

จัดทำ: 2026-07-11

Implementation candidate: `739aee160f324543006028e74f8ce479ecc538a3`

สถานะ: **วิเคราะห์ deployment — ไม่ใช่อำนาจ deploy**

> Candidate นี้เปลี่ยน trust boundary ของ factory และ RPC signatures ห้าม merge หรือ deploy จนกว่า independent review, database evidence, metadata preparation และ cutover plan ที่มนุษย์อนุมัติจะครบ

## 1. ข้อค้นพบระดับสรุป

`factory-api` candidate และ migration 0162 ปัจจุบัน **ไม่มีลำดับ zero-downtime ได้ด้วยตัวเอง**:

- **ลง function ก่อน:** function ใหม่เรียก RPC parameter signatures ใหม่ที่ยังไม่มีจนกว่า 0162 จะถูก apply ทำให้ mutating routes ล้มเหลว
- **ลง migration ก่อน:** 0162 drop signatures เก่าทันที แต่ function ที่ deploy อยู่ยังเรียก signatures เก่า ทำให้ mutating routes ล้มเหลว

ดังนั้น “function ก่อนหรือ migration ก่อน” ไม่ใช่คำตอบแบบสองตัวเลือกภายใต้ live traffic ต้องใช้ bridge sequence ใน §6.1 หรือ controlled maintenance window ใน §6.2

## 2. ผลกระทบด้าน authentication ร่วม

Factory API ทุก route ยกเว้น health ต้องมี end-user Bearer JWT ที่ถูกต้อง Anon key เป็นเพียง API key และไม่กลายเป็นตัวตน `monolith.user.role`, `x-actor-role`, actor ใน body และ `user_metadata` ไม่มีสิทธิ์เพิ่ม server access

เงื่อนไขที่ client ต้องมี:

- มี Supabase session ที่ยังไม่หมดอายุใน browser
- access token มี `app_metadata.roles` ที่ระบบรู้จัก
- production operators มี `app_metadata.site_codes` ที่เป็นรหัสจริง
- หลังแก้ metadata ผู้ใช้ต้อง refresh session หรือ sign out/in เพื่อให้ JWT ใหม่บรรจุ claims

หากไม่มี token หรือไม่มี role ที่รู้จัก ระบบจะคืน `401`/`403` แทนพฤติกรรม permissive เดิม

## 3. Checklist แยกตาม client

### 3.1 Designer workspace และ automatic packet upload

| จุดตรวจ | ผลกระทบ as-built / สิ่งที่ต้องทำ |
| --- | --- |
| State/freeze/release/revoke/can-export/proof | ต้องมี JWT และ capability `designer`/`admin`; local role selector เป็น presentation เท่านั้น |
| สถานะ export | FROZEN export ไม่ได้อีกต่อไป Operator ต้อง Release ก่อน Export อย่างชัดเจน |
| ปุ่ม export ที่ header | `AppShell.tsx` เปิดเมื่อ gate OK และ state RELEASED เท่านั้น |
| Automatic upload | `App.tsx` สร้างและดาวน์โหลด NFP ZIP ในเครื่องก่อนเรียก `uploadPacket()` หาก server ปฏิเสธ ผู้ใช้อาจมีไฟล์ local แล้ว และ feedback ปัจจุบันอยู่แค่ console |
| ปุ่มสร้าง/download packet อื่น | บางเส้นยังสร้าง local browser download ได้โดยไม่มี server acceptance ไฟล์ดังกล่าวไม่ใช่ server-released evidence และยัง NO_CUT |
| Session หาย/หมดอายุ | Calls คืน `401`; UI ควรแสดง sign-in/session-expired ให้ชัดแทนการพึ่ง console |

Compatibility risk: ผู้ใช้ที่เคย “Freeze แล้ว Export” ต้องเพิ่มขั้น Release และ NFP ZIP ที่ดาวน์โหลดสำเร็จห้ามตีความว่า server รับ packet แล้ว

### 3.2 FactoryApp routes

| Route/client | Claim ที่ต้องมี | ผล compatibility |
| --- | --- | --- |
| jobs/state/activity/proof | Factory capability ใด ๆ ที่รู้จัก | ใช้ได้เมื่อ JWT ถูกต้อง; role ว่าง/ไม่รู้จักได้ `403` |
| GET `/:jobId/export` | `factory`, `factory_operator` หรือ admin-equivalent | ใช้ได้เฉพาะ RELEASED และมี packet ที่บันทึกแล้ว |
| POST `/:jobId/verify` | `factory`, `factory_operator` หรือ admin-equivalent | ใช้ได้เฉพาะ RELEASED และมี packet ที่บันทึกแล้ว |
| `triggerLegacyExportApi()` แบบ POST | — | **พัง/ไม่รองรับ:** `factory-api` มี GET export ไม่ใช่ legacy POST export |
| `fetchExportOptionsApi()` | — | **พัง/ไม่รองรับ:** `factory-api` ไม่มี `/factory/export/options` |
| การ map status ใน jobs list | — | **ทำให้เข้าใจผิด:** `jobsApi.ts` map FROZEN เป็น `VERIFIED` และ comment ว่าพร้อม export แต่ server ใหม่ปฏิเสธจนกว่าจะ RELEASED |
| การประกอบ route base | — | ต้องทดสอบทั้ง hosted Edge base URL และ local proxy เพราะ clients ใช้ทั้ง `/factory/...` และ `/api/factory/...` |

แม้ UI compatibility เหล่านี้ยังเปิดอยู่ server gates ยังคงเป็น authority

### 3.3 MCP pipeline

- MCP registry/pipeline ปัจจุบันไม่มี factory packet tool โดยตรง migration 0162 จึงไม่ทำให้ MCP route ใดพังทันที
- MCP ส่ง end-user JWT ผ่าน user-scoped client อยู่แล้วและอ่าน claim family `app_metadata.roles`/`site_codes` เดียวกัน
- MCP tools ที่ต้องใช้ site scope ยังคง fail-closed เมื่อ JWT ไม่มี active site code
- หากเพิ่ม factory MCP tool ในอนาคต ห้ามเรียก legacy RPC signature หรือรับ actor จาก tool input ต้องใช้ authenticated Factory API/Track A contract และผ่าน human gate เมื่อเป็น Write/Approval

## 4. Production metadata matrix

ผู้ใช้ใหม่ควรใช้ role vocabulary ตัวพิมพ์เล็กของ C12; ค่า MONOLITH ตัวพิมพ์ใหญ่เป็น compatibility alias ชั่วคราว

| ประเภทผู้ใช้ | `app_metadata.roles` ที่แนะนำ | Factory capability |
| --- | --- | --- |
| Designer | `["designer"]` | read + freeze/release/revoke/unfreeze + packet upload |
| Factory operator | `["factory_operator"]` หรือ `["factory"]` | read + export + verify |
| Administrator/operations | `["admin"]` หรือ governance role ที่อนุมัติ เช่น `operations` | Factory API เต็ม; การให้ role ยังเป็นมติ governance ของมนุษย์ |
| Installer | `["installer"]` | read-only Factory API |
| Finance | `["finance"]` | read-only Factory API |

`site_codes` ต้องเป็น array ของรหัสไซต์จริงที่ active และผู้ใช้นั้นได้รับ เช่น `["<APPROVED-SITE-CODE>"]` ใน repo ยังมี `BKK-HQ-01` เป็น placeholder ที่ระบุชัดว่ายังไม่ได้ยืนยัน ห้าม provision ค่านี้เป็น production truth แบบกลุ่มจนกว่าเจ้าของที่รับผิดชอบจะยืนยัน

ข้อจำกัด as-built: `factory-api` derive และบันทึก `site_codes` แต่ migration 0162 ยังไม่ bind job กับ site และไม่ reject site list ว่าง ขณะที่ MCP/C12 consumers อื่นบังคับ site access ความต่างนี้ต้องคงอยู่ในรายงานและห้ามเรียกว่า factory site isolation สมบูรณ์

## 5. Pre-deployment checks

- [ ] Independent source review รับ implementation candidate
- [ ] Ephemeral PostgreSQL dry-run เขียว และ existing pre-0162 staging snapshot เขียว
- [ ] ระบุเจ้าของ hosted backup/restore และ abort
- [ ] Pilot users ทุกคนมี roles ที่ review แล้วและ site codes ที่อนุมัติแล้ว
- [ ] Pilot users refresh/sign in ใหม่; decoded access token เห็น claims ใหม่
- [ ] แก้หรือ disable FactoryApp legacy POST export, export-options, FROZEN status label และ route prefixes
- [ ] Designer แสดง upload failure/session expiry ให้ผู้ใช้ ไม่ใช่แค่ console
- [ ] อนุมัติ bridge deployment หรือ maintenance window
- [ ] Smoke tests ครบ state, freeze, release, packet, export, verify, proof, activity, list, missing JWT, forged headers และ FROZEN denial

## 6. Deployment sequence

### 6.1 ลำดับ zero-downtime ที่แนะนำ — ต้องมี bridge function

1. Provision และตรวจ metadata ผู้ใช้ แล้วบังคับ refresh JWT สำหรับ pilot users
2. Deploy `factory-api` bridge ชั่วคราวที่ derive identity จาก verified JWT เท่านั้น ลอง signature ใหม่ก่อนและ fallback signature เก่าเฉพาะเมื่อยืนยันว่า function/signature ยังไม่มี ห้ามนำ actor headers/body กลับมาเป็น authority
3. Smoke-test bridge กับ schema ก่อน 0162
4. Apply migration 0162 รอ PostgREST schema-cache refresh และยืนยันว่า bridge ใช้เฉพาะ signature ใหม่
5. Deploy final candidate ที่ไม่มี fallback แล้วรัน route/spoof/FROZEN smoke tests เต็มชุด
6. เก็บ run IDs/logs และรับมติมนุษย์ก่อน merge/closure claim

ช่วงที่ bridge ใช้ RPC เก่ายังไม่มี server-owned actor evidence ครบ จึงเป็น transitional evidence เท่านั้นและใช้ปิด S17-1 ไม่ได้

### 6.2 Controlled maintenance sequence — ไม่มี bridge

1. ตั้ง Factory API mutating routes เป็น maintenance/read-only และหยุด Designer/Factory operators ไม่ให้เริ่ม export
2. Apply 0162 กับ target ที่อนุมัติ
3. Deploy `factory-api` ใหม่ทันทีหลัง schema/cache พร้อม
4. รัน smoke tests ด้วย Designer และ Factory accounts ที่เตรียมไว้
5. เปิด traffic หลัง state, Release, packet upload, export และ verify ผ่านทั้งหมดเท่านั้น

ภายใน maintenance window ต้อง **migration ก่อน** เพราะ final function เรียก signature ใหม่ไม่ได้จนกว่าจะมี schema นี่ไม่ใช่ zero downtime; maintenance gate เป็นตัวป้องกันผู้ใช้จากช่วงระบบไม่สอดคล้อง

## 7. ขอบเขตที่ไม่เปลี่ยน

Checklist นี้ไม่อนุญาต production apply, merge, P0 closure, production-ready status หรือการตัดจริง Track B และกฎ NO_CUT ทั้งหมดยังคงเดิม
