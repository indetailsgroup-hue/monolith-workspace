# Trust Kernel — คู่มือปฏิบัติการ Shadow Trust-Ready (TH)

> **สถานะ: `NOT_FOR_PRODUCTION`.** คู่มือนี้ใช้ปฏิบัติการ Production Trust Kernel ระดับ
> **Shadow Trust-Ready** เท่านั้น การกระจาย P3 และการส่งงานเข้าโรงงาน/เครื่องจักรจริง
> ยัง **ปิดอยู่** การผ่านทุกขั้นตอนในคู่มือนี้ **ไม่ใช่** การอนุมัติ Production/GA — GA ยัง
> เป็น NO-GO จนกว่าจะมีพิธีจัดการกุญแจ production, นโยบาย AAL2, การซ้อมปฏิบัติการ,
> การนำร่องโรงงานที่ได้รับอนุญาต, การยอมรับระดับเครื่องจักร และการอนุมัติ P3 แยกต่างหาก

## 1. วัตถุประสงค์

ใช้ปฏิบัติการและตรวจสอบ Trust Kernel ในเครื่อง: รัน deterministic builder, verifier อิสระ,
ตัวมีอำนาจฝั่ง DB (Supabase/pgTAP), ชั้น edge, ขั้นตอน shadow E2E, บัญชี route disposition
และชุดหลักฐานที่เซ็นกำกับ ทุก artifact รูปทรงการผลิตต้องผูกกับ tenant, อนุมัติสองคน,
ปลอดภัยเชิงความสามารถ, ตรวจสอบจากภายนอกได้, เพิกถอนได้ และถูกผนึกไม่ให้มนุษย์เห็น
เป็น P2 plaintext

## 2. สิ่งที่ต้องมีในเครื่อง

- Node.js 20 หรือ 22 (เลนที่วัดจริง: v22.21.1) และ npm 11+
- Docker daemon ทำงานอยู่ (จำเป็นสำหรับ `supabase start`)
- Supabase CLI ผ่าน `npx -y supabase <cmd>` (เลนที่ตรึงไว้: 2.109.1)
- `psql` 18.x บน PATH เพื่อรัน pgTAP โดยตรง
- Playwright 1.58+ พร้อมเบราว์เซอร์ Chromium (`npx playwright install chromium`)
- Python 3.12 เฉพาะกรณีรัน guardrails claim linters (ข้ามรีโป ดู §10)

## 3. ตัวแปรสภาพแวดล้อม (เฉพาะ key ID / endpoint — ห้ามใส่ private key)

แอปพลิเคชันเก็บ **เฉพาะ signer key ID** เท่านั้น private key อยู่หลัง managed signer port
ห้ามวางวัตถุกุญแจไว้ในสภาพแวดล้อมหรือในไฟล์

| ตัวแปร | ความหมาย |
|---|---|
| `EVIDENCE_SIGNER_URL` | endpoint ของ managed **evidence** signer (purpose `EVIDENCE`) |
| `EVIDENCE_SIGNER_KEY_ID` | key ID ของหลักฐาน — ต้อง **แยก** จากกุญแจ release ทุกดอก |
| `E2E_BASE_URL` | origin ของแอปสำหรับรัน shadow E2E |
| `E2E_SUPABASE_ANON_KEY` | anon apikey ของ edge `/v3/factory` |
| `E2E_DESIGNER_A_JWT` | bearer ของผู้ freeze (tenant 001, Site A) |
| `E2E_APPROVER_B_JWT` | bearer ของผู้อนุมัติ release (คนละคน **แยกจากกัน**) |
| `E2E_TENANT_002_JWT` | bearer ของสมาชิก tenant 002 (การอยู่ร่วม + การแยกส่วน) |

หากไม่ได้ตั้ง `EVIDENCE_SIGNER_URL`/`EVIDENCE_SIGNER_KEY_ID` การออกหลักฐานและงาน
evidence ของ CI จะ **fail closed** — นี่คือพฤติกรรมที่ถูกต้อง ไม่ใช่ข้อผิดพลาด

## 4. เตรียม fixture ของ tenant (Daph 001 + tenant 002)

Daph คือ **ข้อมูล fixture/onboarding ของ tenant 001** ไม่ใช่ค่าคงที่ runtime ทุกการตรวจ
การอยู่ร่วมต้องเตรียม **tenant 002** ด้วย

1. เริ่ม DB: `npx -y supabase start` (จะ apply สายการย้ายรวมถึง 0180–0184)
2. Seed สมาชิกของ tenant 001 (Daph) และ tenant 002, working revision ของ Site A และ
   candidate ที่ freeze แล้ว ผ่าน action-context RPC ที่ผูกกับผู้ใช้ — **ภายใต้ bearer ของ
   ผู้เรียก** ไม่ใช่ service role ผู้ freeze และผู้อนุมัติ release ต้องเป็น **ผู้ใช้ที่ยืนยันตัวตน
   สองคนแยกกัน**
3. ยืนยัน fixture: `releaseStatus` ของ working revision คืน projection (สถานะ + การอ้างอิง
   เท่านั้น — ไม่มี locator ไม่มี URL ไม่มี plaintext)

> service role สร้างอำนาจของมนุษย์ไม่ได้ และรับ role/name/tenant/site/object path ที่
> ไคลเอนต์ส่งมาไม่ได้

## 5. รันลำดับการยอมรับในเครื่อง

รันตามลำดับ ทุกคำสั่งต้อง exit 0 ทุกชุดต้องมี assertion ไม่เป็นศูนย์ และ skip ต้องเป็นศูนย์:

```
npm --prefix server test -- --run src/trust-kernel
npm --prefix server run build
npm test -w tools/factory-packet-verifier -- --run
npm run build -w tools/factory-packet-verifier
npx vitest run supabase/functions/factory-api/index.test.ts
npm run test:run -- src/factory/packet/__tests__/trustKernelContainment.test.ts src/core/api/__tests__/exportApi.containment.test.ts
node scripts/trust-kernel/verify-route-ledger.mjs
npm run typecheck:all
npm run build
npm run e2e -- e2e/trust-kernel
```

จากนั้นรัน pgTAP ทั้งห้าชุดของ Trust Kernel พร้อมชุด invariants บน stack ที่เพิ่งเริ่มใหม่
(ดู §6) ผลที่คาดหวัง: vector ที่ถูกต้องผ่าน, การเข้าถึง P2 โดยมนุษย์ถูกปฏิเสธ และ vector
ประสงค์ร้ายทุกตัวถูกปฏิเสธด้วยรหัสเหตุผลที่กำหนด

## 6. รันชุด pgTAP

```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tA -v ON_ERROR_STOP=1 \
  -f supabase/tests/trust_kernel_tenancy.sql
```

ทำซ้ำกับ `trust_kernel_governance`, `trust_kernel_release`, `trust_kernel_bundles`,
`trust_kernel_containment` และ `workflow_db_invariants` ชุดจะผ่านเมื่อมี `ok` อย่างน้อยหนึ่ง
และ `not ok` เป็นศูนย์

> บน stack ในเครื่องที่ **ใช้ร่วมกัน** ห้ามรัน `supabase db reset` หรือ `supabase stop`
> (เลนอื่นใช้ร่วม) ให้ apply ด้วย `psql -1 -f` แล้วเทสต์จะ roll back

## 7. ตรวจสอบรหัสเหตุผล

ทุกการปฏิเสธคืนรหัสเหตุผลที่คงที่และอ่านด้วยเครื่องได้ (ทะเบียน:
`server/src/trust-kernel/reasonCodes.ts`) รหัสที่พบบ่อยในโหมด shadow:

- `AUTH_SOD_VIOLATION` — คนเดียวพยายามทั้ง freeze และ release
- `AUTH_MEMBERSHIP_REVOKED` — membership ถูกเพิกถอนกลางคัน
- `STATE_CANDIDATE_STALE` / `STATE_RELEASE_AUTHORIZATION_STALE` — candidate ถูกแก้หลังอนุมัติ
- `STATE_CONFLICT` — ผู้อนุมัติสองคนแข่งกัน ชนะได้เพียงหนึ่ง
- `STATE_RELEASE_REVOKED` — release ที่ถูกเพิกถอนอ่านหรือสตรีมไม่ได้
- `STORE_PLAINTEXT_ACCESS_DENIED` — มนุษย์/ไคลเอนต์พยายามอ่าน P2 plaintext หรือ locator ดิบ
- `TRUST_FRESHNESS_UNPROVEN` — การเล่นซ้ำแบบออฟไลน์อ้างอำนาจปัจจุบันไม่ได้

## 8. เพิกถอน release

เพิกถอนผ่านอำนาจ `/v3/factory/.../revoke` ในบทบาท `SAFETY_REVOKER` การเพิกถอนมี
**ขอบเขตระดับ revision**: revision ที่ถูกเพิกถอนถูกบล็อกตลอดไป การแก้ไขเริ่มเป็น
**draft ใหม่** และต้องผ่านสี่ตาใหม่ หลังการเพิกถอน การอ่าน P2 ทั้งโดยมนุษย์และโดย
isolated จะถูกปฏิเสธ (ตรวจซ้ำ ณ ตอนเริ่มคำขอ)

## 9. รีเฟรช checkpoint ของ verifier + การเก็บรักษาหลักฐาน

- **Checkpoint ของ verifier:** verifier อิสระ (`tools/factory-packet-verifier`) ปฏิเสธการใช้
  ครั้งแรกที่ไม่มี checkpoint ที่เชื่อถือได้ (`TRUST_CHECKPOINT_REQUIRED`), การถอยลำดับ
  (`TRUST_SEQUENCE_ROLLBACK`) และ bundle ที่เกิน `maxOfflineStaleness` (`TRUST_BUNDLE_EXPIRED`)
  รีเฟรชโดยตรึง bootstrap checkpoint ที่เชื่อถือได้ปัจจุบัน และ high-water mark ที่เป็นปัจจุบัน
  ออนไลน์ก่อนรันออฟไลน์
- **การเก็บรักษาหลักฐาน:** `EvidenceAttestationV1` บันทึก `retentionDays` ชุดหลักฐาน
  self-verify (§16.4) ภายใต้กุญแจ `EVIDENCE` ที่ **แยกต่างหาก** และผูกทั้งสอง Git root,
  digest ของคำสั่ง/รายงานที่แน่นอน, ตัวตนของ CI run/workflow และแฮชไบนารีของ builder/
  verifier บันทึกที่ถูกตัดทอนหรือเทสต์ที่ถูก skip ไม่สามารถรองรับการอ้างว่าผ่านได้

## 10. Guardrails claim linters (รอข้ามรีโป)

Linters ของ claim/certification (`tools/lint_claims.py`, `tools/lint_certifications.py`)
อยู่ใน **governance root ของ MONOLITH** ไม่ใช่รีโปผลิตภัณฑ์นี้ งาน CI `claim-linters`
อ้างถึง path ที่คาดไว้และจะรันเมื่อมี checkout ของ governance ผ่าน
`MONOLITH_GOVERNANCE_ROOT`; มิฉะนั้นจะรายงานสถานะ **รอข้ามรีโป (cross-repo-pending)**
แทนที่จะผ่านแบบเงียบ ๆ

## 11. สถานะ CI — ยังไม่ได้พิสูจน์ (UNVERIFIED)

`.github/workflows/trust-kernel-verify.yml` **ยังไม่เคยรัน** (worktree นี้ยังไม่ถูก push)
ผู้ push คนแรกต้อง push การละเมิดโดยเจตนา (เพิ่ม skip, ทำให้เทสต์ล้ม, ลบรายงาน, รบกวน
packet บน OS เดียว) และยืนยันว่า final gate **ล้มเหลว** ก่อนจะเชื่อถือมัน ไม่มีช่องทางลัด
`--allowlist`/override ใด ๆ
