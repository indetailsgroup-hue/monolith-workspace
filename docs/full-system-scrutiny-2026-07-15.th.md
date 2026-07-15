# รายงาน Scrutiny ทั้งระบบ MONOLITH

วันที่: 2026-07-15  
revision ที่ตรวจ: `077452a7cbe8714ed5ac3ed388420565bc19f252` รวม control pack S17 v0.4.1 ที่ยังไม่ commit  
มติ: **NO-GO สำหรับ production, การตัดจริงแบบ controlled factory และการกล่าวว่า dogfood เริ่มแล้ว**  
ท่าทีที่อนุญาต: **พัฒนาในเครื่อง, automated verification และเตรียม shadow/NO_CUT เท่านั้น**

## 1. ข้อสรุปสำหรับผู้ตัดสินใจ

MONOLITH เป็น codebase วิศวกรรมที่มีเนื้อหาจริง ไม่ใช่ mock-up ตัว root application typecheck และ build ได้ factory server กับ field app build ได้ มี Vitest assertions ผ่าน 4,553 ข้อ และ browser smoke ผ่านห้าข้อ ส่วน manufacturing geometry, CNC dialect, gate, workflow control และ packet determinism มี automated coverage ที่มีน้ำหนัก

อย่างไรก็ตาม ระบบยังไม่พร้อมใช้งานเชิงปฏิบัติการ release chain ถูกบล็อกด้วยสถานะ governance ที่ประกาศชัด, factory-server boundary ที่ยังไม่มี authentication, dependency advisories ระดับ critical, canonical CI/test command ที่เสีย, field surface ที่ยังไม่ verified, signature implementation ที่แตกหลายสาย และไม่มีหลักฐาน live deployment หรือ dogfood จริง ห้ามแปลงความพร้อมของโค้ดให้กลายเป็น production authority

## 2. ขอบเขตและหลักฐาน

การตรวจครอบคลุม root Designer/Factory application, `server/`, `packages/field-app/`, Supabase migrations และ Edge Functions, LINE/workflow, GitHub workflows, factory packet/S17 governance, dependency installation, unit tests, builds, browser smoke tests และหลักฐาน operational ที่มีในเครื่อง

หลักฐานมาจาก repository ที่ checkout อยู่และ GitHub repository metadata แบบ read-only GitHub connector ไม่พบ PR-triggered workflow run หรือ combined status ของ commit ที่ตรวจ สิ่งนี้ไม่ใช่หลักฐานว่า push-triggered workflow ไม่เคยรัน แต่หมายความว่ายังยืนยัน external CI success ปัจจุบันไม่ได้จากหลักฐานที่เข้าถึงได้ รอบนี้ไม่ได้เข้าถึง live Supabase, LINE, Redis, AWS KMS, CNC, GitHub Pages runtime หรือข้อมูลลูกค้า

## 3. ผล verification

| รายการตรวจ | ผล | ความหมาย |
|---|---:|---|
| Root TypeScript project references | PASS | `tsc -b tsconfig.build.json` สำเร็จ |
| Root production build | PASS พร้อมคำเตือน | ยังมี chunk ใหญ่และ mixed static/dynamic import ที่แบ่ง chunk ไม่ได้ |
| Factory server build | PASS | compile ได้หลังติดตั้ง dependency ของ server แยก |
| Field app build | PASS พร้อมคำเตือน | Tailwind แจ้งว่า content configuration หายหรือว่าง |
| Root Vitest command | FAIL | test ผ่าน 4,553 ข้อใน 262 ไฟล์ แต่ Node-native test สองไฟล์ถูก Vitest เก็บผิดเป็น empty suite |
| Governance tooling | PASS 5/5 | canonical manifest writer/verifier และ renderer controls ผ่าน |
| Schema bundle tooling | PASS 1/1 | closed bundle และ canonical array-order rule ผ่าน |
| Factory server test command | FAIL 13/13 | CLI ทำงานและเรียก `process.exit(0)` ตอน import; test runtime ยังพยายามแก้ `testPath` ที่ read-only |
| Browser smoke | PASS/PARTIAL | ผ่าน 5 ข้อ ข้าม 2 ข้อ; ยังไม่มี full E2E หรือ live integration evidence |
| Dependency installation summary | FAIL release gate | Root: 21 advisories รวม critical 3; server: 13 advisories รวม critical 1 |

จำนวน advisory มาจากการติดตั้งตาม lockfile แบบ reproducible ไม่ได้ดึงรายละเอียด advisory เพราะการทำเช่นนั้นจะส่ง dependency metadata ของ private project ไป external npm advisory endpoint โดยยังไม่มี owner authorization เฉพาะเจาะจง

## 4. Findings ที่บล็อก release

### FS-B0-01 — Governance และอำนาจตัดจริงยังปิด

canonical packet specification อยู่ในสถานะ `DRAFT — NOT APPROVED — NOT FOR IMPLEMENTATION AUTHORITY` โดย Tech Lead, Factory Owner และ Security Owner ยัง PENDING ทั้งหมด CT-DEC-002 ระบุ `Track B LOCKED` และ `NO_CUT` ส่วน real-cut gate ยังต้องปิด S17-1..5, ครบทุกบทบาท ADR-064, มี dogfood เต็มสายอย่างน้อยหนึ่งงาน และ calibrate machine profile แล้ว ยังไม่มีหลักฐานว่าเงื่อนไขเหล่านี้ครบ

การจัดการที่ต้องทำ: คง `NO_CUT`; ห้าม deploy หรือกล่าวว่า S17-4/S17-5 เป็น implementation ที่อนุมัติแล้ว จน approval matrix ของมนุษย์ครบ

### FS-B0-02 — Factory server มี trust boundary ที่บล็อก production

server entry point ทั้งสองใช้ `cors()` แบบไม่จำกัด และเปิด bundle, export, key, state, proof, activity และ download operation โดยไม่พบ authentication หรือ authorization middleware ที่ application boundary JSON body รับได้ 50 MB ส่วน signed-URL helper fallback เงียบ ๆ ไปใช้ static secret `dev-secret-change-in-production` และ error handler หนึ่งจุดส่ง `err.message` กลับ caller

ถ้า server entry point ใดเข้าถึงได้จาก network ผู้เรียกที่ไม่ไว้ใจอาจสั่ง operation ที่กระทบโรงงานได้ และ default HMAC secret ทำให้ปลอม signed URL ได้ นี่เป็น production blocker แม้ downstream validator จะถูกต้อง

การจัดการที่ต้องทำ: ให้ startup fail เมื่อไม่มี secret, เพิ่ม authentication และ authorization ราย operation, จำกัด origin, ใส่ rate limit และ upload bound, ปิด internal error และทดสอบ boundary ทั้งเส้นก่อน deploy

### FS-B0-03 — Canonical packet signature implementation ยังไม่ converge ตาม ADR-068

contract v0.4.1 บังคับ AWS KMS `ECC_NIST_P256`, `ECDSA_SHA_256`, raw 64-byte `r||s`, reject high-S และ non-exportable key แต่ active factory packet type และ mock route ยังประกาศ `Ed25519`; manufacturing verifier รองรับ Ed25519 เท่านั้น มี ECDSA implementation อีกสายหนึ่ง แต่สร้าง browser key ที่ extractable, เก็บ private JWK ใน local storage และไม่ใช่ AWS KMS/registry/low-S verifier ตาม v0.4.1

ส่วนหนึ่งเป็นสิ่งที่คาดได้เพราะ Track B ยังล็อก แต่ยืนยันว่าระบบ runtime ยังไม่ใช่ implementation v0.4.1 และห้าม certify ว่าเป็นแล้ว ต้องจำแนก legacy Ed25519 receipt/trust layer ให้ชัดว่าไม่ใช่ canonical factory-packet attestation layer

การจัดการที่ต้องทำ: หลัง approval ปลด Track B แล้ว จึง implement packet-attestation path เดียวผ่าน AWS KMS และ pinned registry พร้อม test raw length, low-S/high-S rejection, public-key format, KMS non-determinism และ verifier order

### FS-B0-04 — Dogfood จริงยังไม่เริ่มตามหลักฐานที่ audit ได้

repository มีมติให้เริ่ม business/field dogfood ขนานกับ S17 และมี shadow/NOT-FOR-PRODUCTION behavior แต่ไม่มี real-house project ID ที่ enroll แล้ว, start timestamp, operator ผู้รับผิดชอบ, immutable workflow event แรก, session-evidence artifact หรือสาย LINE-to-acceptance ที่จบแล้ว PRD review ระบุชัดว่า real dogfood pilot ยังไม่เริ่ม

การจัดการที่ต้องทำ: สถานะต้องคง `AUTHORIZED/PREPARED — NOT STARTED` จะเริ่มได้เมื่อ enroll project จริงพร้อม evidence ID, owner, rollback path, PDPA classification, legacy-process fallback และ immutable event แรก

## 5. Findings ระดับ critical และ high

### FS-B1-01 — Dependency risk สูงกว่า release threshold

การติดตั้งตาม lockfile รายงาน critical advisories สามรายการใน root dependency graph และหนึ่งรายการใน factory server graph รวมทั้ง high และ moderate advisories แต่ยังไม่ได้ triage package ที่ได้รับผลและ runtime reachability

Action: เมื่อ owner อนุญาต ให้ดึง advisory ใน environment ที่อนุมัติ, map vulnerable path กับ runtime reachability, upgrade หรือ mitigate และ pin clean evidence ห้ามใช้ `npm audit fix --force` โดยไม่ review ผลกระทบ

### FS-B1-02 — Full-verification workflow หลักไม่สามารถเขียวได้ตามที่เขียนอยู่

`npm run test:run` เก็บ `scripts/governance-tooling.test.mjs` และ `scripts/schema-bundle.test.mjs` เป็น Vitest ทั้งที่สองไฟล์ใช้ Node native test runner แม้ Vitest assertions 4,553 ข้อผ่านหมด command ก็ exit non-zero เพราะ empty-suite failure สองรายการ `.github/workflows/verify-full.yml` เรียก command เดียวกัน จึงยังสร้าง E0 evidence สีเขียวอย่างสัตย์จริงไม่ได้จนกว่าจะแยก runner

Action: exclude Node-native tests ออกจาก Vitest และเรียก npm scripts เฉพาะของทั้งสองชุดใน CI โดยตรง เพิ่ม factory server และ field app เป็น job แยก

### FS-B1-03 — Test suite ของ factory server ใช้งานไม่ได้

การ import `server/src/cli/receiptVerify.ts` เรียก `main()` ทันทีและเรียก `process.exit` ทำให้ verifier import ไม่ปลอดภัย dedicated server tests ล้ม 13/13 และ environment รายงานการแก้ `testPath` ที่ read-only ส่งผลให้ security-sensitive verifier ไม่มี regression coverage ที่เชื่อถือได้

Action: guard CLI entry point, ทำ verification functions ให้ไม่มี side effect, ใช้ temporary injected key registry แทนการแก้ production key file, align Vitest version/configuration และบังคับผล 13/13

### FS-B1-04 — Field app build ได้แต่ยังไม่ verified

`packages/field-app` ไม่มี `test` script การ build เตือนว่า Tailwind content หายหรือว่าง จึงเสี่ยงให้ deployed CSS ไม่มี class ที่ต้องใช้ Offline queue, authentication callback, RLS behavior, proof binding และ close-house acceptance ไม่มี field-app-level test gate ตรงกับ PRD ที่จัดเป็น `PARTIAL / NOT VERIFIED`

Action: เพิ่ม app-local Tailwind config, unit/component tests, offline/retry tests, authentication และ RLS integration tests และ controlled field pilot ก่อนพึ่งพา surface นี้

### FS-B1-05 — ยังยืนยัน live data-plane และ deployment claim ไม่ได้

มี migration files 174 ไฟล์และ Edge Function directories 19 ชุด แต่ provisioning runbook ยังเป็น checklist และระบุว่าต้องทำ `supabase db push`, function deployment, secrets, cron และ end-to-end verification แบบ manual ยังไม่มีหลักฐาน live migration parity, RLS probe, secret inventory, LINE webhook signature, Redis worker, Pages deployment หรือ rollback drill

Action: ทำ staging ceremony กับ commit bytes ที่ pin แล้ว บันทึก migration/function parity, รัน negative RLS และ webhook tests, เก็บ rollback evidence แล้วจึงกำหนดวันเริ่ม dogfood จริง

### FS-B1-06 — ต้องปรับ classification ของ governance-tool bytes แบบ append-only — REMEDIATED

CT-DEC-003 classify candidate bytes รุ่นก่อนหน้า แต่ manifest writer, verifier และ test harness ปัจจุบันมี hashes ต่างออกไป จึงห้าม rewrite record เดิมแบบเงียบ `CT-DEC-003-A1` ได้ pin hashes ปัจจุบันทั้งสี่, บันทึก independent advisory source review และผล negative tests ที่ reproduce ผ่าน 5/5 พร้อม classify exact bytes เป็น official เฉพาะ governance-document tooling

Disposition: **REMEDIATED สำหรับ bytes ที่ pin แล้ว** ด้วย `docs/governance/ct-dec-003-a1-current-governance-tool-bytes.*` และ `monolith-ct-dec-003-a1-review-input.sha256` หาก byte ใดเปลี่ยน tool นั้นกลับเป็น candidate ทันที Remediation นี้ไม่แก้ CI runner issue แยกต่างหากใน `FS-B1-02` และไม่สร้าง S17-5, Track B, production หรือ cutting authority

## 6. Findings ระดับกลางและ engineering debt

- **FS-B2-01 — Version drift:** `server/package.json` เป็น 0.13.2 แต่ API responses ประกาศ 0.10.0 และ 2.0.0-p22a ผ่าน entry point สองชุด ทำให้ operator ระบุ running contract ไม่ได้แน่นอน
- **FS-B2-02 — Build size:** root build มี application/vendor chunks เกิน threshold 600 kB รวม Three bundle ประมาณ 1.03 MB และ App chunk ประมาณ 888 kB กระทบ field connectivity และ cold start
- **FS-B2-03 — E2E blind spots:** smoke tests ถูกข้ามสองข้อ ได้แก่ export flow และ OperationGraph-source assertion และ suite ไม่แตะ Supabase, LINE, server authentication, KMS, Redis หรือ packet rejection จริง
- **FS-B2-04 — ไม่มี hermetic clean-worktree gate:** build output ถูก track ใน `dist/` และ local verification เปลี่ยน generated assets กับสถานะ snapshot ใน working tree CI ควร build นอก tracked release bytes หรือพิสูจน์ reproducible output โดยไม่แก้ source tree
- **FS-B2-05 — ยังมี function ไม่ครบใน production source:** STEP/PDF export และ full drawer drill-map generation มี not-implemented/TODO path ต้องจำกัด product claim ให้ตรง
- **FS-B2-06 — Encoding/document hygiene:** workflow และเอกสารไทยที่ track อยู่หลายจุดแสดง mojibake เมื่ออ่าน UTF-8 ปกติ ลดความน่าเชื่อถือของ review

## 7. จุดแข็งที่ควรรักษา

- Automated-test density สูงใน geometry, CNC dialect, gate, connector rules, workflow authorization, audit, capture, tax และ factory packet determinism
- Root, server และ field build compile ได้หลังติดตั้ง dependency แบบ reproducible
- Governance manifest tooling เป็น fail-closed และ test ผ่าน
- S17 v0.4.1 pin ECDSA encoding, low-S semantics, non-determinism, public-key format, verifier order และ NO_CUT behavior ชัด
- Browser smoke ครอบคลุม app load, WebGL health, X-ray mode, hardware preset behavior และ export-panel access
- Supabase migrations แสดงการออกแบบ RLS, SECURITY DEFINER, service-role และ append-only audit อย่างตั้งใจ แม้ยังต้องพิสูจน์ enforcement บน live environment

## 8. ลำดับงานที่ต้องทำ

1. คง `NO_CUT`, Track B lock และข้อความว่า dogfood ยังไม่เริ่ม
2. ปิด factory-server authentication/CORS/default-secret boundary ก่อน network deployment ใด ๆ
3. ขอ owner authorization เพื่อดู dependency advisory detail แล้วกำจัดหรือ mitigate critical path ที่ reachable
4. ซ่อมการแยก CI runner และ factory-server test harness; บังคับ root, governance, schema, server, field, build และ E2E gates ให้เขียว
5. ทำ S17 approval matrix สามบทบาทให้ครบ แล้วจึง implement ADR-068 packet-attestation layer
6. สร้าง staging deployment evidence สำหรับ migrations, RLS, Edge Functions, LINE, Redis, Pages, secrets, monitoring และ rollback
7. Enroll controlled real project หนึ่งงานและ emit immutable dogfood event แรก โดยใช้ legacy factory production ขนานกับ shadow/NO_CUT packet
8. พิจารณาตัดจริงแบบ controlled factory เมื่อมีหลักฐานครบทุกเงื่อนไขของ four-condition real-cut gate เท่านั้น

## 9. การจัดสถานะสุดท้าย

| มิติ | สถานะ |
|---|---|
| Engineering core | **SUBSTANTIAL / BUILDS / HIGH TEST DENSITY** |
| Canonical automated verification | **RED — runner wiring และ server suite** |
| Security boundary | **RED — ยังไม่ปลอดภัยสำหรับ network production** |
| S17 packet authority | **DRAFT / PENDING 3 / TRACK B LOCKED / NO_CUT** |
| Field และ live data plane | **PARTIAL / NOT VERIFIED** |
| Dogfood | **AUTHORIZED/PREPARED — NOT STARTED** |
| Production release | **NO-GO** |

รายงานนี้เป็น evidence-based review ไม่ใช่ approval signature, security certification, production authorization หรือการอนุญาตให้ตัดชิ้นงานจริง
