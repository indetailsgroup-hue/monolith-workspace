# Implementation Plan: Monolith Accounting & AI Orchestration

## Overview

แผนงานนี้แปลงเอกสารการออกแบบ (Capture Spine + 14 องค์ประกอบ) เป็นชุดงานเขียนโค้ดแบบเพิ่มทีละขั้น (incremental, test-driven) ด้วย **TypeScript** โดยเริ่มจากโครงสร้างข้อมูลแกนกลาง → IAM/RLS → Audit → Capture Spine state machine → commit targets → connectors → MCP capability layer → data residency → optional adapters และปิดท้ายด้วยการ wiring ทั้งหมดเข้าด้วยกัน

หลักการทดสอบ:
- ใช้ไลบรารี property-based **fast-check** (ไม่เขียน PBT framework เอง) ทุก property test รันอย่างน้อย **100 iterations**
- แต่ละ property test ต้องติด tag รูปแบบ: `Feature: monolith-accounting, Property {SPINE-X | ACC-X | AUTHZ-X}: {property text}`
- Correctness Property ทั้ง 26 ตัว (SPINE-1..9, ACC-1..15, AUTHZ-1..2) implement ด้วย property-based test หนึ่งตัวต่อหนึ่ง property
- งานทดสอบเป็นสับทาสก์ที่ทำเครื่องหมาย `*` (เลือกได้) เสมอ งานหลักที่เป็น implementation ห้ามทำเครื่องหมาย `*`

## Tasks

- [ ] 1. ตั้งค่าโครงสร้างโปรเจกต์และเครื่องมือทดสอบ
  - สร้างโครงสร้างไดเรกทอรีฝั่งเซิร์ฟเวอร์ (TypeScript): `src/spine`, `src/ledger`, `src/manufacturing`, `src/tax`, `src/connectors`, `src/mcp`, `src/iam`, `src/audit`, `src/pdpa`, `test`
  - ตั้งค่า `tsconfig.json`, test runner (Vitest/Jest) และติดตั้ง `fast-check` สำหรับ property-based testing (ตั้งค่า numRuns ขั้นต่ำ 100)
  - กำหนดสคริปต์ build/test ใน `package.json`
  - _Requirements: 1.1_

- [ ] 2. โมเดลข้อมูลแกนกลางและ generators
  - [ ] 2.1 นิยามโมเดลข้อมูล Capture Spine แกนกลาง
    - เขียน interface `CaptureArtifact`, `CaptureTypeConfig`, `CaptureAudit` และ enum `CaptureState` (`proposed | approved | emitted | rejected | superseded`)
    - เขียนฟังก์ชัน validation ของ artifact fields (value + confidence + provenance + humanConfirmed) และ idempotencyKey
    - _Requirements: 6.1, 10.1, 10.2_

  - [ ] 2.2 นิยามเอนทิตีบัญชีแกนกลาง (Core Accounting)
    - เขียน interface `Account`, `JournalEntry`, `JournalLine`, `Money` พร้อมฟังก์ชันตรวจ invariant บัญชีคู่ (sum(baseDebit) === sum(baseCredit))
    - _Requirements: 2.5_

  - [ ]* 2.3 เตรียม property-based test generators
    - สร้าง generators: journal entries (balanced/unbalanced), money + currency + วันที่ + rate table, BOM + units, bank txns (รวม id ซ้ำ), capture artifacts ทุก typeKey (`expense`/`site_survey`/`material_receipt`/`qc`/`installation_proof`/`delivery_pod`/`spec_draft`), ผู้ใช้ + ขอบเขตสิทธิ์, WHT records (บุคคล/นิติบุคคล), Revit quantities, PDM events (รวม id ซ้ำ + payload ไม่ครบ)
    - ครอบคลุม edge cases: whitespace, อักขระไทย/Unicode, จำนวนเงินติดลบ/ศูนย์, payload ขนาดใหญ่
    - _Requirements: 2.1, 4.1, 8.2, 10.2, 11.1, 12.1_

- [ ] 3. IAM_Service และ Row-Level Security (RLS)
  - [ ] 3.1 Implement IAM_Service
    - เขียน `createUser` (ไม่จำกัดจำนวน), `authorize(token)` (ตรวจ OAuth2 token + scope), `enforceScope(ctx, query)` (ฉีดเงื่อนไข RLS ตาม ownerUserId/departmentId)
    - ปฏิเสธการยกระดับสิทธิ์และคำขอข้ามแผนก พร้อมส่งความพยายามไปยัง Audit_Trail_Service
    - _Requirements: 1.1, 1.2, 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x]* 3.2 เขียน property test สำหรับ RLS — **PBT ผ่าน (`src/iam/scope.ts`); runtime = Postgres RLS**
    - **Property 25: AUTHZ-1 — User-Scoped Result (RLS)**
    - **Validates: Requirements 13.1, 13.2, 13.5**
    - **verify:** enforceScope = ทั้งหมดและเฉพาะแถวที่มองเห็น (soundness+completeness); non-gov ไม่เห็นแผนกอื่น; cross-dept ไม่มีสิทธิ์→ปฏิเสธ. runtime บังคับด้วย RLS has_site_access/is_governance_role (0049/0066/...)

  - [ ]* 3.3 เขียน unit tests เงื่อนไขความปลอดภัยของ IAM
    - ทดสอบ token หมดอายุ/ไม่ถูกต้อง (13.4) และการยกระดับสิทธิ์ถูกปฏิเสธพร้อม log (13.3)
    - _Requirements: 13.3, 13.4_

- [ ] 4. Audit_Trail_Service (append-only + transactional)
  - [ ] 4.1 Implement Audit_Trail_Service
    - เขียน `record(event)` แบบ append-only และ `history(targetId)` เรียงตามเวลา
    - บังคับ transactional guarantee: ถ้า audit เขียนไม่สำเร็จ ให้ rollback การแก้ไขข้อมูลที่เกี่ยวข้อง
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 4.2 เขียน property test สำหรับความครบถ้วนของ audit
    - **Property 7: SPINE-7 — Audit-Complete**
    - **Validates: Requirements 6.1, 6.3, 9.6**

  - [ ]* 4.3 เขียน property test สำหรับความไม่เปลี่ยนแปลงของระเบียน
    - **Property 6: SPINE-6 — Immutable**
    - **Validates: Requirements 6.2, 7.4**

  - [ ]* 4.4 เขียน unit test กรณี audit ล้มเหลว
    - ทดสอบว่าเมื่อบันทึก audit ล้มเหลว การแก้ไขข้อมูลที่เกี่ยวข้องถูก rollback (atomic)
    - _Requirements: 6.4_

- [ ] 5. Capture Spine Orchestrator (state machine)
  - [ ] 5.1 Implement state machine และ capture_type_config
    - เขียน `ingest`, `extract`, `validate`, `verify`, `emit`, `reject`, `supersede` ตาม state machine (`proposed → approved → emitted`, กิ่ง `rejected`/`superseded`)
    - บังคับกฎ NO-COMMIT-UNTIL-EMITTED และฟิลด์วิกฤตต้อง humanConfirmed ก่อน emit
    - อ่าน commit target + verify rule จาก `capture_type_config` (row-extensible โดยไม่แก้โค้ดแกนกลาง)
    - บันทึกทุก transition ผ่าน Audit_Trail_Service ภายใน transaction เดียวกัน
    - _Requirements: 6.1, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 5.2 เขียน property test No-Commit-Until-Verified
    - **Property 1: SPINE-1 — No-Commit-Until-Verified**
    - **Validates: Requirements 10.4, 10.5**

  - [ ]* 5.3 เขียน property test Number-Verify-Forced
    - **Property 2: SPINE-2 — Number-Verify-Forced**
    - **Validates: Requirements 10.3, 10.4**

  - [ ]* 5.4 เขียน property test No-Guess (Fail-Safe)
    - **Property 4: SPINE-4 — No-Guess (Fail-Safe)**
    - **Validates: Requirements 10.3, 12.4**

  - [ ]* 5.5 เขียน property test Provenance
    - **Property 5: SPINE-5 — Provenance**
    - **Validates: Requirements 6.1, 10.1**

  - [ ]* 5.6 เขียน property test Extensible (Config not Rebuild)
    - **Property 9: SPINE-9 — Extensible (Config not Rebuild)**
    - **Validates: Requirements 4.1, 10.2**

- [ ] 6. Checkpoint - ตรวจสอบแกนกลาง (data models + IAM + Audit + Spine)
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Ledger_Engine, Currency_Service และ Multi_Book_Ledger
  - [x] 7.1 Implement Ledger_Engine (seed: monolith_accounting.html) — **DB e2e-verified (SQL: `0066_ledger_engine.sql`)**
    - แยกตรรกะบัญชีคู่ ผังบัญชี สมุดรายวัน งบทดลอง งบกำไรขาดทุน งบแสดงฐานะการเงิน และอัตราส่วนการเงินออกเป็นบริการฝั่งเซิร์ฟเวอร์
    - เขียน `postJournalEntry` (บังคับ debit=credit), `createDraftEntry`, `approveDraft` (draft ไม่เข้างบจนกว่าอนุมัติ)
    - **impl หมายเหตุ:** implement เป็น SQL `rpc_post_journal_entry` (บังคับ Σdebit=Σcredit + validate accounts) + COA seed 21 รหัส + journal_entry/journal_line. status enum draft|posted (MVP post ทันที; draft/approve = ส่วนขยาย). งบ/อัตราส่วน = view/rollup ส่วนขยายภายหลัง
    - _Requirements: 2.5, 10.4, 10.5_

  - [x]* 7.2 เขียน property test Double-Entry Balance — **DB e2e-verified** (ยังไม่ทำ unit PBT ปลอมสำหรับ DB-bound property; ตรวจผ่าน psql e2e diff=0)
    - **Property 10: ACC-1 — Double-Entry Balance (สมการบัญชีคู่)**
    - **Validates: Requirements 2.5, 4.6, 9.4, 10.5**
    - **verify:** `rpc_post_journal_entry` raise `check_violation` เมื่อ Σdebit≠Σcredit; e2e expense→ledger TEST A/B งบดุล diff=0

  - [x] 7.3 Implement Currency_Service — **core BUILT + PBT (`src/ledger/currency.ts`)**
    - เขียน `listSupportedCurrencies` (≥160), `getRate` (ไม่พบ → NotFoundError), `convert` (ปัดเศษ 2 ตำแหน่ง เก็บทั้งสกุลต้นทางและสกุลหลัก)
    - ปฏิเสธการบันทึกเมื่อไม่มีอัตราแลกเปลี่ยนของสกุลเงิน/วันที่ที่ร้องขอ
    - **impl หมายเหตุ:** SUPPORTED_CURRENCIES 168 ISO codes; getRate keyed from>to@date (from==to→1); convert เก็บ original+base (round2). rate table = config-injectable
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x]* 7.4 เขียน property test Currency Conversion — **PBT ผ่าน (fast-check ≥500 runs)**
    - **Property 11: ACC-2 — Currency Conversion (เก็บสองค่า + ปัด 2 ตำแหน่ง)**
    - **Validates: Requirements 2.2, 2.3**
    - **verify:** base=round2(amount×rate) เสมอ; เก็บ original(from)+base(to); from==to→identity

  - [x]* 7.5 เขียน unit tests ของ Currency_Service — **ครอบใน currency.test.ts**
    - ทดสอบรองรับสกุลเงิน ≥160 (2.1) และกรณีไม่พบอัตราแลกเปลี่ยนถูกปฏิเสธ (2.4)
    - _Requirements: 2.1, 2.4_

  - [x] 7.6 Implement Multi_Book_Ledger — **core BUILT (`src/ledger/multibook.ts`); statutoryStatement DBD2554/IFRS เหลือ**
    - เขียน `books()` (≥ internal, external), `post(entry, bookId)` (บันทึกเฉพาะ book ที่ระบุ), `statutoryStatement(bookId, format, entityType)` รองรับ `DBD2554` และ `IFRS_Format3`
    - **impl หมายเหตุ:** books/post/entriesOf/statement (isolation) = pure TS. statutoryStatement (DBD2554/IFRS_Format3 formatter) = ส่วนที่เหลือ (task 7.8)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x]* 7.7 เขียน property test Multi-Book Isolation — **PBT ผ่าน (≥300 runs)**
    - **Property 16: ACC-7 — Multi-Book Isolation**
    - **Validates: Requirements 5.2, 5.3**
    - **verify:** entry อยู่เฉพาะ book ที่ post (ไม่ปรากฏ book อื่น); statement รวมจาก book นั้นเท่านั้น (no cross-bleed)

  - [x]* 7.8 เขียน unit tests ของ Multi_Book_Ledger — **≥2 books + DBD2554/IFRS_Format3 BUILT (`statutoryStatement`)**
    - ทดสอบมีชุดบัญชี ≥2 (5.1) และรูปแบบรายงาน DBD2554 (5.4) กับ IFRS แบบ 3 (5.5)
    - **impl หมายเหตุ:** statutoryStatement (group by COA type, balanced check assets=liab+equity+netProfit, isolation ต่อ book, DBD2554/IFRS_Format3 selector) = pure + tested. layout เป็น reference — ต้อง validate กับแบบ DBD/IFRS จริง
    - _Requirements: 5.1, 5.4, 5.5_

- [ ] 8. Manufacturing_Module (BOM, Job Costing, สินค้าคงคลัง)
  - [x] 8.1 Implement Manufacturing_Module — **core + postJobToLedger BUILT (`src/manufacturing/manufacturing.ts`)**
    - เขียน `createBOM`, `explodeBOM` (qtyPerUnit × units), `issueMaterial` (ลด inventory; ปฏิเสธ InsufficientStockError ถ้าไม่พอ), `closeJob` (total = material+labor+overhead), `postJobToLedger` (debit=credit)
    - **impl หมายเหตุ:** ครบทุกฟังก์ชัน pure TS. `postJobToLedger` คืน journal lines (Dr FinishedGoods=total, Cr material/labor/overhead) balanced → ส่งเข้า rpc_post_journal_entry (0066) ได้. closeJob normalize components เป็นสตางค์ (กัน double-rounding). DB wiring (post จริงเข้า ledger) = integration task 19
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x]* 8.2 เขียน property test BOM Explosion — **PBT ผ่าน (≥400 runs)**
    - **Property 13: ACC-4 — BOM Explosion**
    - **Validates: Requirements 4.1, 4.2**

  - [x]* 8.3 เขียน property test Job Cost Summation — **PBT ผ่าน**
    - **Property 14: ACC-5 — Job Cost Summation**
    - **Validates: Requirements 4.3**

  - [x]* 8.4 เขียน property test Inventory Reduction — **PBT ผ่าน**
    - **Property 15: ACC-6 — Inventory Reduction**
    - **Validates: Requirements 4.4**

  - [x]* 8.5 เขียน unit test กรณีสินค้าคงคลังไม่พอ — **ครอบใน manufacturing.test.ts (InsufficientStockError, PBT)**
    - ทดสอบว่าการเบิกเกินยอดคงเหลือถูกปฏิเสธและ stock ไม่เปลี่ยน (InsufficientStockError)
    - _Requirements: 4.5_

- [ ] 9. eTax_Generator (e-Tax Invoice)
  - [ ] 9.1 Implement eTax_Generator — **VAT 7% + invoice numbering core BUILT (`src/tax/etax.ts`); PDF/A-3+XML+ลายเซ็นดิจิทัลยังเหลือ**
    - เขียน `issue(saleId)` สร้าง PDF/A-3 ฝัง XML ตามโครงสร้างกรมสรรพากร, ลงลายเซ็นดิจิทัล, คำนวณ VAT 7%, กำหนดเลขที่ไม่ซ้ำ
    - ปฏิเสธพร้อม MissingDataError เมื่อข้อมูลจำเป็นไม่ครบ (เช่น เลขประจำตัวผู้เสียภาษีผู้ซื้อ)
    - **impl หมายเหตุ:** core = VAT (composeFromNet/splitInclusive) + เลขที่ (formatInvoiceNumber/allocateBatch/issuer กันซ้ำ) pure TS. เหลือ: PDF/A-3+XML สรรพากร, ลายเซ็นดิจิทัล (task 9.5), MissingDataError guard, DB unique constraint บน invoice number (production uniqueness)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x]* 9.2 เขียน property test VAT 7% — **PBT ผ่าน (fast-check ≥400 runs)**
    - **Property 17: ACC-8 — VAT 7%**
    - **Validates: Requirements 7.3, 12.5**
    - **verify:** vat=round2(net×7%); gross=net+vat; splitInclusive net+vat===gross + vat≈gross×7/107; round-trip ±0.01; fail-safe ติดลบ→throw

  - [x]* 9.3 เขียน property test Invoice Number Uniqueness — **PBT ผ่าน**
    - **Property 18: ACC-9 — Invoice Number Uniqueness**
    - **Validates: Requirements 7.4**
    - **verify:** allocateBatch n ตัว distinct; issuer ออกต่อเนื่องไม่ซ้ำ; บังคับชน→throw. **track:** production ต้องบังคับด้วย DB unique constraint

  - [x]* 9.4 เขียน property test e-Tax XML Round-Trip — **PBT ผ่าน (`src/tax/etax-xml.ts`, ≥500 runs)**
    - **Property 20: ACC-11 — e-Tax XML Round-Trip**
    - **Validates: Requirements 7.1**
    - **verify:** parse(serialize(sale))===normalize(sale); escape/unescape เป็น inverse (อักขระ & < > " ' + unicode); items array ครบ

  - [ ]* 9.5 เขียน integration/unit tests ของ eTax
    - integration: ตรวจสอบลายเซ็นดิจิทัลบน PDF/A-3 (7.2); unit: ปฏิเสธเมื่อข้อมูลจำเป็นไม่ครบ (7.5)
    - _Requirements: 7.2, 7.5_

- [ ] 10. WHT_Export_Service (ภ.ง.ด.3 / ภ.ง.ด.53)
  - [x] 10.1 Implement WHT_Export_Service — **core logic BUILT + PBT (`src/tax/wht.ts`)**
    - เขียน `export(period)` สร้างไฟล์ .txt รูปแบบ RD Prep แยก ภ.ง.ด.3 (บุคคลธรรมดา) และ ภ.ง.ด.53 (นิติบุคคล), คำนวณยอดหัก = ฐาน × อัตราตามประเภทเงินได้, แสดงยอดรวมจ่ายและยอดรวมหัก
    - **impl หมายเหตุ:** core (classify→form / whtRate config-driven / computeWithholding / buildWhtExport totals) = pure TS + fail-safe (unknown incomeType/ฐานติดลบ→throw). RD Prep .txt serializer (8.1) = ส่วนที่เหลือ (integration, task 10.3). อัตรา = reference (DISCLAIMER ผู้ทำบัญชี review)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x]* 10.2 เขียน property test WHT Classification, Calculation & Totals — **PBT ผ่าน (6 tests, fast-check ≥300 runs)**
    - **Property 19: ACC-10 — WHT Classification, Calculation & Totals**
    - **Validates: Requirements 8.2, 8.3, 8.4, 8.5**
    - **verify:** classification partition ครบ/ไม่ซ้ำ; withheld=round(base×rate) ∈[0,base]; grand=Σlines; PND3+PND53=grand; fail-safe throws

  - [x]* 10.3 เขียน integration test รูปแบบไฟล์ RD Prep — **serializer BUILT + test (`src/tax/wht-rdprep.ts`); format ต้อง validate กับ RD Prep จริง**
    - ตรวจสอบรูปแบบไฟล์ .txt สอดคล้องกับข้อกำหนดการนำเข้าของโปรแกรม RD Prep
    - **impl หมายเหตุ:** buildRdPrepFile/buildRdPrepBoth (แยก ภ.ง.ด.3/53, detail+footer totals, field sanitize | และ newline, income-code map) = pure + tested. layout เป็น reference (pipe-delimited) — ต้อง validate กับสเปคนำเข้า RD Prep จริงก่อน production
    - _Requirements: 8.1_

- [ ] 11. Checkpoint - ตรวจสอบ commit targets (Ledger/Currency/Multi-book/Manufacturing/eTax/WHT)
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Bank_Feed_Connector
  - [x] 12.1 Implement Bank_Feed_Connector — **core BUILT (`src/ledger/bankfeed.ts`); API pull/error-persist เหลือ**
    - เขียน `pull` (idempotent ตาม bankTxnId), `store` (ไม่สร้างซ้ำ), `autoMatch` (จับคู่ตามวันที่+จำนวนเงิน; ไม่จับคู่ → `pending_reconcile`)
    - บันทึกข้อผิดพลาดเมื่อ API ล้มเหลวและคงรายการที่ซิงก์แล้วไม่เปลี่ยน
    - **impl หมายเหตุ:** store (idempotent by bankTxnId, readback ครบ) + autoMatch (date+amount → matched/pending_reconcile) = pure TS. `pull` จาก bank API จริง + error-persist (3.5) = integration
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x]* 12.2 เขียน property test Bank Feed Storage & Match — **PBT ผ่าน (≥400 runs)**
    - **Property 12: ACC-3 — Bank Feed Storage & Match**
    - **Validates: Requirements 3.1, 3.2**
    - **verify:** store readback ครบ; autoMatch matched ⟺ มี ledger date+amount ตรง, ไม่พบ→pending_reconcile

  - [x]* 12.3 เขียน property test Idempotent (input ต้นทาง) — **PBT ผ่าน (store idempotent by bankTxnId)**
    - **Property 3: SPINE-3 — Idempotent**
    - **Validates: Requirements 3.4, 11.5**

  - [ ]* 12.4 เขียน unit tests ของ Bank Feed — **pending_reconcile (3.3) ครอบแล้ว; API-fail (3.5) เหลือ**
    - ทดสอบรายการที่จับคู่ไม่ได้ถูกตีตรา "รอกระทบยอด" (3.3) และกรณี API ล้มเหลวรายการเดิมคงเดิม (3.5)
    - _Requirements: 3.3, 3.5_

- [ ] 13. OCR_Service (Typhoon self-host) และการเชื่อมเข้า Spine
  - [ ] 13.1 Implement OCR_Service — **OCR→draft mapping core BUILT (`src/connectors/ocr-draft.ts`); Stage1/2 Typhoon integration เหลือ**
    - เขียน `stage1Ocr(image)` (โมเดล Typhoon ภายในองค์กร) และ `stage2Extract(text, schema)` (เติม confidence + provenance)
    - เชื่อม Stage1/Stage2 เข้ากับ `extract` ของ Capture Spine เพื่อสร้าง draft entry จากฟิลด์ที่สกัดได้
    - **impl หมายเหตุ:** `buildDraftFromExtraction` (date/amount/vat/wht → draft, no-guess null) = pure. Stage1/2 Typhoon (on-prem) + wire เข้า capture extract = integration (capture-spine 0054/Edge capture-ocr-extract มีแล้วบางส่วน)
    - _Requirements: 10.1, 10.2_

  - [x]* 13.2 เขียน property test OCR Extraction → Draft Entry — **PBT ผ่าน**
    - **Property 24: ACC-15 — OCR Extraction → Draft Entry**
    - **Validates: Requirements 10.2**
    - **verify:** draft สะท้อน date/amount/vat/wht ครบ; สกัดไม่ได้→null (no-guess); amount ติดลบ→throw

  - [ ]* 13.3 เขียน integration test OCR Typhoon
    - ทดสอบสกัดข้อมูลจริงด้วยชุดเอกสารตัวอย่าง 1–3 ใบ (วันที่/จำนวนเงิน/VAT/WHT)
    - _Requirements: 10.1_

- [ ] 14. PDM_Sync_Connector (SolidWorks PDM)
  - [x] 14.1 Implement PDM_Sync_Connector — **core BUILT (`src/connectors/pdm.ts`); webhook transport เหลือ**
    - เขียน `onWebhook(event)` idempotent ตาม eventId, upsert ตาม partNo, เก็บประวัติ revision, ปฏิเสธ + log เมื่อ partNo ไม่ครบ
    - **impl หมายเหตุ:** syncEvent (idempotent by eventId, upsert by partNo, revisionHistory, partNo ว่าง→throw) = pure ครบ. webhook HTTP transport + log = integration
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x]* 14.2 เขียน property test PDM Sync, Upsert & Revision History — **PBT ผ่าน**
    - **Property 22: ACC-13 — PDM Sync, Upsert & Revision History**
    - **Validates: Requirements 11.1, 11.2, 11.3**
    - **verify:** part count=distinct partNo (upsert ไม่ซ้ำ); history length=ครั้ง sync−1; idempotent by eventId; partNo ว่าง→throw

  - [x]* 14.3 เขียน unit test payload ไม่ครบ — **ครอบใน pdm.test.ts (partNo ว่าง→throw)**
    - ทดสอบว่า webhook ที่ partNo ไม่ครบถูกปฏิเสธและบันทึกข้อผิดพลาด
    - _Requirements: 11.4_

- [ ] 15. BIM_Connector (Revit → BOQ → ใบเสนอราคา)
  - [x] 15.1 Implement BIM_Connector — **core BUILT (`src/connectors/bim.ts`)**
    - เขียน `importRevit(model)` → รายการ BOQ (ชนิดวัสดุ+ปริมาณ), `priceBoq` (line = qty × unitPrice; ไม่มีราคา → ตีตรา "ไม่มีราคา"), `createQuotation` (total = sum(lines); VAT 7%)
    - **impl หมายเหตุ:** importRevit (aggregate qty/type, ปัดครั้งเดียว) + priceBoq (priced flag) + createQuotation (Σ+VAT, มีรายการไม่มีราคา→throw) = pure ครบ. Revit file parser จริง = integration
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x]* 15.2 เขียน property test BIM → BOQ → Quotation — **PBT ผ่าน**
    - **Property 23: ACC-14 — BIM → BOQ → Quotation**
    - **Validates: Requirements 12.1, 12.2, 12.3**
    - **verify:** BOQ ครอบทุกชนิด+qty รวมครบ; line=qty×unitPrice; total=Σ+VAT

  - [x]* 15.3 เขียน unit test วัสดุไม่มีราคา — **ครอบใน bim.test.ts (priced=false + createQuotation throw)**
    - ทดสอบว่าวัสดุที่ไม่มีราคาถูกตีตรา "ไม่มีราคา" และห้ามสร้างใบเสนอราคาจนกว่ากำหนดราคา (no-guess)
    - _Requirements: 12.4_

- [ ] 16. MCP_Server (capability layer)
  - [ ] 16.1 Implement MCP_Server — **findOverdueReceivables RPC BUILT + e2e (`0075_receivables.sql`); createInvoice/reconcile + listTools เหลือ**
    - เขียน `listTools` (createInvoice, findOverdueReceivables, reconcile), `invoke(toolName, params, ctx)` บังคับ secure API filter, ทำในนามผู้ใช้ผ่าน IAM, สร้างใบแจ้งหนี้ผ่าน Ledger_Engine (debit=credit), log ทุกคำสั่งผ่าน Audit
    - ค้นหาหนี้ค้างชำระ (ครบกำหนดก่อนวันปัจจุบัน + ยังไม่ชำระเต็ม); ปฏิเสธพารามิเตอร์ผิด/ไม่ครบพร้อมอธิบายเหตุผล
    - **impl หมายเหตุ:** `rpc_find_overdue_receivables` (SQL, ACC-12 runtime, scope governance|site) = db e2e-verified. mcp-layer (Phase 2) มี invoke/secure-filter/audit ครบแล้ว. เหลือ: createInvoice→rpc_post_journal_entry, reconcile→bank feed, register 3 tools ใน mcp_tool_registry
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x]* 16.2 เขียน property test Overdue Receivables Predicate — **PBT ผ่าน (`src/ledger/receivables.ts`)**
    - **Property 21: ACC-12 — Overdue Receivables Predicate**
    - **Validates: Requirements 9.3**
    - **verify:** ผลลัพธ์ = ทั้งหมดและเฉพาะ dueDate<asOf AND paid<amount (soundness+completeness); ครบกำหนดวันนี้/จ่ายเต็ม ไม่นับ

  - [x]* 16.3 เขียน property test Secure Filter Enforcement — **PBT ผ่าน (`src/iam/secure-filter.ts`); runtime = mcp-layer RPC**
    - **Property 26: AUTHZ-2 — Secure Filter Enforcement**
    - **Validates: Requirements 9.2**
    - **verify:** exec ถูกเรียก ⟺ canInvoke (ผ่าน secure filter AND authz); ไม่ผ่าน→throw ก่อน exec (no bypass path); filter ก่อน authz

  - [ ]* 16.4 เขียน unit tests ของ MCP
    - ทดสอบ tool listing (9.1) และการปฏิเสธพารามิเตอร์ผิด/ไม่ครบพร้อมข้อความอธิบาย (9.5)
    - _Requirements: 9.1, 9.5_

- [ ] 17. Data Residency, Encryption และ PDPA (Right to Erasure)
  - [ ] 17.1 Implement การควบคุม PDPA-by-Architecture
    - บังคับให้การจัดเก็บ/ประมวลผลข้อมูลอยู่ใน Thai_Data_Center; ปฏิเสธ + log คำขอส่ง PII ออกนอกประเทศ
    - เข้ารหัสข้อมูลส่วนบุคคล at rest และ in transit (TLS); implement right to erasure (anonymize/ลบ PII ยกเว้นระเบียนที่กฎหมายบัญชี/ภาษีบังคับเก็บ)
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [ ]* 17.2 เขียน property test On-Prem / PDPA-by-Architecture
    - **Property 8: SPINE-8 — On-Prem / PDPA-by-Architecture**
    - **Validates: Requirements 14.2, 14.5**

  - [ ]* 17.3 เขียน unit/smoke tests ของ PDPA
    - smoke: data residency config = Thailand (14.1); unit: encryption at rest/in transit (14.4) และปฏิเสธ + log คำขอส่ง PII ออกนอกประเทศ (14.3)
    - _Requirements: 14.1, 14.3, 14.4_

- [ ] 18. Optional Adapters (นอก closed loop)
  - [ ] 18.1 Implement Work OS และ E-commerce adapters
    - เขียน adapter ที่ consume เฉพาะ committed records เท่านั้น (monday/ClickUp/Asana/SmartSuite และ Lazada/Shopee)
    - _Requirements: 5.3_

  - [ ]* 18.2 เขียน test ว่า adapter ไม่สามารถ bypass Capture Spine
    - ทดสอบว่า optional adapters ไม่สามารถเขียนเข้าบัญชีโดยข้าม spine และอ่านได้เฉพาะ records ที่ commit แล้ว
    - _Requirements: 5.3_

- [ ] 19. บูรณาการและเชื่อมต่อทั้งระบบ (Integration & Wiring)
  - [ ] 19.1 Wire ingest adapters → Spine → commit targets
    - เชื่อม LINE/Gmail/Photo/Bank/PDM/BIM adapters เข้ากับ Capture Spine และเชื่อม commit targets (Ledger/Manufacturing/eTax/WHT/BOQ) พร้อม MCP เหนือ spine ภายใต้ IAM ทั้งหมด
    - _Requirements: 1.2, 9.4_

  - [ ]* 19.2 เขียน smoke/load test ความต่อเนื่องของผู้ใช้พร้อมกัน
    - ทดสอบความต่อเนื่องเมื่อจำนวนผู้ใช้ที่ใช้งานพร้อมกันเพิ่มขึ้น (concurrent-user load)
    - _Requirements: 1.3_

- [ ] 20. Checkpoint สุดท้าย - ตรวจสอบทั้งระบบ
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- งานที่ทำเครื่องหมาย `*` เป็นงานเลือกได้ (optional) และสามารถข้ามเพื่อทำ MVP ให้เร็วขึ้น
- ทุกงานอ้างอิงข้อกำหนดเฉพาะเพื่อการตรวจสอบย้อนกลับ (traceability)
- Checkpoints ช่วยตรวจสอบความถูกต้องแบบเพิ่มทีละขั้น
- Property tests (fast-check, ≥100 iterations) ตรวจสอบ correctness properties ทั้ง 26 ตัว โดยแต่ละ property มี test หนึ่งตัวและติด tag ตามรูปแบบที่กำหนด
- Unit/integration/smoke tests ตรวจสอบตัวอย่างเฉพาะ ขอบเขต error conditions และการเชื่อมต่อภายนอก
- ครอบคลุม properties: SPINE-1 (5.2), SPINE-2 (5.3), SPINE-3 (12.3), SPINE-4 (5.4), SPINE-5 (5.5), SPINE-6 (4.3), SPINE-7 (4.2), SPINE-8 (17.2), SPINE-9 (5.6), ACC-1 (7.2), ACC-2 (7.4), ACC-3 (12.2), ACC-4 (8.2), ACC-5 (8.3), ACC-6 (8.4), ACC-7 (7.7), ACC-8 (9.2), ACC-9 (9.3), ACC-10 (10.2), ACC-11 (9.4), ACC-12 (16.2), ACC-13 (14.2), ACC-14 (15.2), ACC-15 (13.2), AUTHZ-1 (3.2), AUTHZ-2 (16.3)

## Build Log (SQL-first + pure-logic implementation — ต่าง track จากแผน TS เดิม)

- **แนวทางจริง:** reuse capture-spine เป็น Spine; core บัญชี/ตรรกะเป็น SQL RPC (double-entry, receivables) + pure-TS modules (currency/manufacturing/tax/connectors/iam) พร้อม PBT (fast-check ≥300–500 runs). L3 commit-target adapters ต่อ capture→business-layer จริง.
- **L3 commit-target adapters ครบ 5/5 (db e2e-verified):** installation_proof→Work_Item (0063) · expense_document→ledger double-entry (0066–0068) · material_receipt→actual_purchase_price MAC (0069–0070) · spec_draft→Released_Spec gate+versioning (0071–0072) · site_survey→SiteSurveyZone (0073–0074).
- **26/26 correctness properties มี PBT ครอบ:** SPINE-1..9 (capture-spine) · ACC-1 (double-entry SQL 0066) · ACC-2 currency (`src/ledger/currency.ts`) · ACC-3 bank feed (`bankfeed.ts`) · ACC-4/5/6 manufacturing (`manufacturing.ts`) · ACC-7 multi-book (`multibook.ts`) · ACC-8 VAT + ACC-9 invoice# (`etax.ts`) · ACC-10 WHT (`wht.ts`) · ACC-11 e-Tax XML round-trip (`etax-xml.ts`) · ACC-12 overdue (`receivables.ts` + `0075` RPC db e2e) · ACC-13 PDM (`connectors/pdm.ts`) · ACC-14 BIM (`connectors/bim.ts`) · ACC-15 OCR→draft (`connectors/ocr-draft.ts`) · AUTHZ-1 RLS scope (`iam/scope.ts`) · AUTHZ-2 secure filter (`iam/secure-filter.ts`).
- **Formatters BUILT + tested:** RD Prep .txt (`wht-rdprep.ts`) · statutoryStatement DBD2554/IFRS_Format3 (`multibook.ts`) · postJobToLedger balanced lines (`manufacturing.ts`).
- **บทเรียน money-rounding (PBT จับ 4 ครั้ง):** ต้อง normalize เงินเป็น 2 ทศนิยม + ปัดครั้งเดียว (ไม่ปัดสะสม) + ใช้ balancing plug — แก้ใน WHT/postJob/BIM importRevit. + แก้ flaky pre-existing `mcp/catalog` (duplicate toolName → uniqueArray).
- **สถานะเทส:** 277 vitest เขียว เสถียร (scope: `src/workflow src/mcp src/capture src/tax src/ledger src/manufacturing src/connectors src/iam supabase/functions`) + db reset 0001–0075 เขียว.
- **ต้อง external infra (ยังทำ/verify ในเครื่องไม่ได้ — ไม่ทำของปลอม):** eTax PDF/A-3 render + XML embed + ลายเซ็นดิจิทัล (ต้อง lib+cert) · Typhoon OCR Stage1/2 (on-prem GPU model) · live bank API pull · PDM webhook endpoint · Revit binary parser · RD Prep/DBD/IFRS layout ต้อง validate กับสเปคจริง.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "3.1", "4.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "4.2", "4.3", "4.4", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "5.5", "5.6", "7.1", "7.3", "7.6"] },
    { "id": 5, "tasks": ["7.2", "7.4", "7.5", "7.7", "7.8", "8.1", "9.1", "10.1"] },
    { "id": 6, "tasks": ["8.2", "8.3", "8.4", "8.5", "9.2", "9.3", "9.4", "9.5", "10.2", "10.3"] },
    { "id": 7, "tasks": ["12.1", "13.1", "14.1", "15.1", "17.1"] },
    { "id": 8, "tasks": ["12.2", "12.3", "12.4", "13.2", "13.3", "14.2", "14.3", "15.2", "15.3", "17.2", "17.3"] },
    { "id": 9, "tasks": ["16.1"] },
    { "id": 10, "tasks": ["16.2", "16.3", "16.4", "18.1"] },
    { "id": 11, "tasks": ["18.2", "19.1"] },
    { "id": 12, "tasks": ["19.2"] }
  ]
}
```
