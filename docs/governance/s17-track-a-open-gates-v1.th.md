# S17 Track A — Open Gates, มติความเป็นส่วนตัว และ Handoff ให้ Track B

รุ่นบันทึก: 1.0

วันที่บันทึก: 2026-07-12

ผู้มีอำนาจตัดสินใจ: **Tech Lead (คำสั่งมนุษย์ที่ส่งให้ implementer)**

ผู้บันทึก: AI Track A implementer — advisory/non-authoritative

สถานะ: **implementation candidate; ยังมี evidence gate เปิดอยู่**

> บันทึกนี้ตรึงมติ Tech Lead ห้าข้อหลัง independent review S17-1/S17-2 แบบ durable แต่ไม่ merge หรือ deploy code, ไม่ปิด S17-1/S17-2 หรือ P0 ใด, ไม่ claim production-ready และไม่อนุญาตตัดชิ้นงานจริง

## 1. ทะเบียนมติ

| Ref | เรื่อง | มติที่บันทึก |
| --- | --- | --- |
| F-1 | Factory site isolation | **DECOUPLE** ติดตามเป็น hard gate เปิดชื่อ `factory-site-isolation`; ห้ามสร้าง multi-tenant enforcement แบบเก็งกำไรขณะที่ DAPH มีไซต์ที่ตั้งค่าไว้หนึ่งไซต์ |
| F-2 | Hosted Auth integration | **EVIDENCE GATE** Human/Ops ต้อง deploy ลง staging ที่อนุมัติและรัน hosted test package ที่ผูก hash; implementer ห้าม deploy เอง |
| F-3 | Cross-role reads | `state` และ `can-export`: capability ที่รู้จักครบห้ากลุ่ม ส่วน `jobs`, `activity`, `proof`: เฉพาะ ADMIN + DESIGNER + FACTORY |
| F-4 | Email PII ใน audit | Audit context ใหม่จาก Factory API ใช้ verified `subjectId` เป็น `actor_name`; เส้นนี้ไม่ persist verified email และไม่ rewrite แถวประวัติศาสตร์ |
| F-5 | Semantic สำหรับ Track B | `authorizationContextId` hash เฉพาะ identity snapshot ไม่ผูก job, action, route, revision, packet หรือ attestation |

## 2. Hard gate: `factory-site-isolation`

สถานะ gate: **OPEN — known gap, gated to multi-branch**

Trigger: ต้องปิด gate นี้ก่อน DAPH เปิด active site/branch แห่งที่สอง หรืออ้างว่า Factory data แยก tenant ได้แล้ว

### 2.1 เหตุผล as-built ที่ต้อง decouple

- `current_site_codes()` และ `has_site_access()` อ่าน `auth.jwt().app_metadata.site_codes` จาก database session ปัจจุบัน (`supabase/migrations/00000000000000_c12_foundation.sql`)
- Factory RPC ถูก `factory-api` เรียกด้วย service-role session; ถ้าเรียก `has_site_access()` ตรง ๆ จะประเมิน session ของ service role ไม่ใช่ end-user identity ที่ Edge verify แล้ว
- `factory_jobs` ไม่มี `site_code`, project foreign key หรือความสัมพันธ์ job→site ที่ authoritative (`supabase/migrations/0155_factory_state_server.sql`)
- `get_active_site_codes()` คืนค่าที่ตั้งไว้เพียง `BKK-HQ-01` และ comment ของ helper ระบุว่าการขยายหลายสาขายังเป็นมติ Q3 ที่ pending

ดังนั้นการเรียก `has_site_access()` ตรง ๆ จะทำให้เข้าใจผิด ส่วนการประดิษฐ์ความสัมพันธ์ job/site ตอนนี้เป็น speculative architecture Candidate นี้จึงไม่เพิ่ม factory site-enforcement code

### 2.2 แบบที่ต้องมีก่อนปิด gate

ปิด gate ได้เมื่อครบทั้งหมด:

1. Migration ที่ผ่าน review ผูก Factory job ทุกงานเข้ากับไซต์ authoritative โดยตรง หรือผ่าน project foreign key ที่ไม่กำกวม
2. Site predicate ที่ปลอดภัยเมื่อรันด้วย service role รับ `p_actor_site_codes` จาก verified server context เป็น parameter ชัดเจน และห้าม derive site set ของ end user จาก service-role database session
3. Read/mutation routes ทุกเส้นใช้กติกา job/site เดียวกันและ fail closed เมื่อไม่มี binding หรือ actor site set
4. Fixture สองไซต์จริงพิสูจน์ positive same-site และ negative cross-site สำหรับ list, state, activity, proof, transition, packet, export และ verify
5. Tech Lead และ Security Owner review migration, trust boundary, tests และ hosted evidence ก่อนเปิด multi-branch

ทางลัดที่ห้ามใช้: เรียก `has_site_access()` แบบ session-based ที่มีอยู่ตรง ๆ จาก Factory RPC ซึ่งรันด้วย service role

## 3. Hosted evidence gate

Reproducible package อยู่ที่ `supabase/tests/s17-hosted-auth/` Human/Ops รันได้หลังมีมติ maintenance/deployment บน staging เท่านั้น เคสบังคับคือ:

- JWT จริงที่ถูกต้อง → `200`
- JWT ที่หมดอายุจริง → `401`
- user ถูกต้องแต่ไม่มี role ที่ระบบรู้จัก → `403`
- `x-actor-role` ปลอมให้สิทธิ์ transition ไม่ได้และ state ต้องไม่เปลี่ยน
- INSTALLER อ่าน activity → `403`
- อัปโหลด packet ตอน FROZEN → `409`
- Designer ที่ถูกต้อง release → `200` โดย audit actor name เท่ากับ subject ID และเส้นนี้ไม่ persist email

Raw output จะเป็น E0 ได้เมื่อระบุ deployed commit, migration hash, hosted target, เวลารัน, HTTP status และผล pass/fail โดยไม่เก็บ JWT

## 4. Least-privilege route matrix

| Surface | ADMIN | DESIGNER | FACTORY | INSTALLER | FINANCE |
| --- | --- | --- | --- | --- | --- |
| `state`, `can-export` | allow | allow | allow | allow | allow |
| jobs list, `activity`, `proof` | allow | allow | allow | deny | deny |
| freeze/release/revoke/unfreeze, packet upload | allow | allow | deny | deny | deny |
| export, verify | allow | deny | allow | deny | deny |

Activity เปิดเผย subject ID และ authorization context ของ actor คนอื่น INSTALLER และ FINANCE ไม่มี approved need สำหรับ evidence surface นี้

Migration 0162 ถอนทั้ง policy เดิม `authenticated USING (true)` และ direct table privileges บน `factory_jobs`/`factory_job_events` เพื่อป้องกัน bypass Edge matrix ผ่าน PostgREST โดย application reads ต้องผ่าน service-role-only RPC หลัง `factory-api`

## 5. มติความเป็นส่วนตัวของ audit

สำหรับ event ใหม่ที่เขียนผ่าน Factory API candidate นี้:

- authority ยังคงเป็น `actor_subject_id`, `actor_roles`, `actor_site_codes` และ `authorization_context_id` ซึ่ง derive จาก Auth data ที่ verify แล้ว
- compatibility field `actor_name` ใช้ verified subject ID ค่าเดียวกัน
- migration 0162 persist `p_actor_subject_id` แม้ service caller จะส่ง compatibility `p_actor_name` เป็นค่าอื่น
- email ถูก ignore แม้มีอยู่ใน verified Auth user payload
- append-only row เก่าบางแถวอาจมี email จากเส้นทางก่อนหน้า และต้องเก็บไว้โดยไม่ rewrite

นี่เป็น data-minimization ไม่ใช่ anonymization เพราะ subject ID ยังเป็น identifier และยังเป็น governed audit data

## 6. Semantic handoff ให้ Track B

Track A คำนวณ:

```text
authorizationContextId = SHA-256(JSON({ actorSubjectId, roles, siteCodes }))
```

Array ถูก deduplicate และเรียงแบบ byte ก่อน hash ID นี้ตอบได้เพียงว่า “server ใช้ verified identity/authorization snapshot ชุดใด” โดยไม่รวมและไม่พิสูจน์ `jobId`, action, HTTP route, released revision, packet content, machine profile, exporter version, schema version, gate result หรือเวลา

Track B ต้อง bind authorization context ID ร่วมกับ action/job/revision/packet identity ภายใน canonical attestation/signature contract ห้ามใช้ authorization context ID เดี่ยว ๆ แทน action authorization หรือ packet signature

## 7. Closure matrix

| เกณฑ์ | สถานะในบันทึกนี้ |
| --- | --- |
| Independent full review | ผ่านตาม input ของ Tech Lead |
| บันทึก F-1 hard gate | จัดทำใน candidate นี้; ตัว gate ยังคง OPEN จนถึงงาน multi-branch |
| F-3 route restriction + negative tests | Implement ใน candidate นี้; รอ CI evidence |
| มติ F-4 privacy | Implement และบันทึกใน candidate นี้; รอ hosted evidence |
| F-2 hosted live Auth evidence | **OPEN — ต้องให้ Human/Ops ดำเนินการ** |
| Apply migration 0162 บน staging สำเร็จ | **OPEN — ต้องให้ Human/Ops ดำเนินการ** |

ก่อน hosted/staging evidence ครบและมนุษย์ปิดรายการ สถานะ S17-1/S17-2 ยังคง **implementation candidate** ขอบเขต Track B และ NO_CUT ทั้งหมดยังคงเดิม
