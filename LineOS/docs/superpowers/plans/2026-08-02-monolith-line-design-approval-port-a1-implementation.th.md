# MONOLITH LINE Design Approval Port A1 — แผนการดำเนินงาน

> **สำหรับ agentic workers:** REQUIRED SUB-SKILL: ใช้ superpowers:subagent-driven-development (แนะนำหลังได้รับอนุมัติ execution อย่างชัดแจ้ง) หรือ superpowers:executing-plans เพื่อทำแผนนี้ทีละ task โดยใช้ checkbox (`- [ ]`) ติดตามสถานะ

- **เป้าหมาย:** สร้าง A1 `DesignApprovalPort` sandbox journey ตาม design ที่อนุมัติ ให้ preset Design Approval ตรวจ revision ที่ adapter เป็นเจ้าของและคืน record แบบไม่มีผลทางธุรกิจ โดยยังไม่เชื่อม MONOLITH runtime
- **จำนวน task โดยประมาณ:** 8
- **เวลาโดยประมาณ:** 7–10 ชั่วโมงทำงานแบบมีสมาธิ รวม review gates
- **ส่วนที่แตะ:** Parent LineOS ES modules, standalone HTML/CSS, Node tests, เอกสารสองภาษา และ local browser evidence
- **Design ที่อนุมัติ:** `LineOS/docs/superpowers/specs/2026-08-02-monolith-line-design-approval-port-a1-design.th.md`

## ปัญหาและระบบปัจจุบัน

Standalone Flex Studio ปัจจุบันส่งทุก preset ผ่าน browser-local demo path เดียว:

`editable draft -> demo transaction -> browser confirmation -> SHA-256 Verification Receipt — Demo`

เส้นทางนี้ผูกค่าจาก fixture ที่แก้ไขได้ เช่น `tenantId`, recipient, target และ revision ถ้อยคำระบุความเป็น demo อย่างซื่อตรง แต่ยังไม่ใช่ A1 boundary ที่อนุมัติ ซึ่งต้องมี opaque review token, adapter-owned review snapshot, adapter-issued idempotency key, stale-revision checks, session-only duplicate suppression และ record ที่ระบุชัดว่าไม่มีผลทางธุรกิจ

Nested MONOLITH repository มี product identity, customer design-view, approval RPC, RLS และ audit substrate อยู่แล้ว A1 ต้องไม่สร้างซ้ำหรือแก้ระบบนั้น A1 เป็น parent-only contract harness และยังไม่เชื่อม MONOLITH runtime

## แนวทางที่เสนอ

เพิ่ม `DesignApprovalPort` แบบแคบและ dependency-free เฉพาะ preset `design-approval`:

1. Flex JSON พา opaque sandbox review token ที่ไม่ใช่ secret ใน URI action เดิม
2. Studio เปิด snapshot จาก sandbox adapter แทนการอนุมาน authority จาก editable draft
3. Adapter ออก session/idempotency key, ตรวจ revision/version/expiry ใหม่ และบันทึก session-only attempt เพียงหนึ่งรายการ
4. Record builder แยกสร้าง `Sandbox Verification Record — Demo · No Business Effect` ที่ deeply frozen พร้อม deterministic SHA-256 integrity metadata
5. Presets อีกสี่รายการคง demo journey เดิมใน A1
6. Static และ browser checks พิสูจน์ zero external requests, ไม่มี persistent secret/token storage, forbidden-field handling ที่แน่นอน, bilingual accessibility และ nested-product scope ไม่เปลี่ยน

ไม่มี dependency, service, generic gateway, database table, Supabase mutation, LINE SDK, credential หรือ production signature ใหม่

## เปรียบเทียบก่อนและหลัง

| สถานการณ์ | ก่อน A1 | หลัง A1 |
|---|---|---|
| เปิด Design Approval | Review มาจาก editable Flex draft | Review มาจาก `DesignApprovalPort.openReview(reviewToken)` |
| Identity/scope display | Demo `tenantId` และ recipient ดูคล้าย receipt authority | Adapter-owned `providerContext`/`scopeContext`; tenant authority อยู่นอกขอบเขต A1 |
| Confirmation | Browser confirm local demo transaction | Browser ส่งคืนเฉพาะ session, adapter-issued key, expected revision และ `confirm` |
| Duplicate submit | มีเพียง UI guard และ local transaction binding | Adapter single-flight และ session ledger คืน record เดิมหนึ่งรายการ |
| Revision เปลี่ยน | เปรียบเทียบ draft values เท่านั้น | Adapter ตรวจ revision ID, manifest digest, workflow version และ expiry ใหม่ |
| Receipt | `Verification Receipt — Demo` | `Sandbox Verification Record — Demo · No Business Effect` |
| Presets อื่น | Demo journey เดิม | ไม่เปลี่ยนใน A1 |
| MONOLITH runtime | ยังไม่เชื่อม | ยังคงไม่เชื่อม; contract-ready เท่านั้น |

## สมมติฐานและความเสี่ยง

- **สมมติ:** Node.js 22.20.0 ขึ้นไปและ browser Web Crypto ยังพร้อมใช้; ตอนวางแผนพบ Node `v22.21.1` และ npm `11.6.2`
- **สมมติ:** Five-preset Flex model, validator, shell resource allowlist และ non-design demo journeys สี่รายการยังเป็น requirement
- **สมมติ:** A1 review token เป็น opaque non-secret fixture reference และไม่พา customer, tenant, role, recipient, project หรือ authorization claim
- **สมมติ:** Session-only ledger reset หลัง reload ได้ โดย UI ต้องเปิดเผยข้อจำกัด
- **ความเสี่ยง:** Journey สองแบบอาจ drift จำกัด branch ให้เป็น preset predicate ชุดเดียวและใช้ shared rendering helpers เท่าที่จำเป็น
- **ความเสี่ยง:** การเรียก browser digest ว่า signature จะสร้าง false authority Schema/copy tests ต้องปฏิเสธถ้อยคำ signature/approval
- **ความเสี่ยง:** Editable draft อาจไหลกลับเข้า Design Approval record Tests ต้อง mutate authority-like fields ทุกตัวแล้วพิสูจน์ว่า snapshot/record คงเดิม
- **ความเสี่ยง:** Concurrent confirm แข่งกันระหว่าง async digest Adapter ต้องมี per-key single-flight ไม่ใช่เพียง `Map.has`
- **ความเสี่ยง:** Parent/nested worktrees มีงานค้าง Execution ต้องใช้ isolated parent worktree และ exact-path checks ส่วน nested เป็น read-only
- **ความเสี่ยง:** เอกสารเดิมอธิบาย legacy demo path A1 guide ต้องแยก Design Approval ออกจาก presets อีกสี่รายการ

## ผลกระทบ

- Design Approval preset ได้ A1 contract และ truthful sandbox semantics ตามอนุมัติ
- Flex generation เดิมและ presets อีกสี่รายการคงเสถียร
- ไม่เพิ่ม customer, workflow, tenant, audit หรือ signing authority
- การตัดสินใจ A2 จะมี contract/browser evidence จริง แทน generic integration abstraction

## เงื่อนไขก่อน execution และ guardrails กลาง

1. REQUIRED SUB-SKILL: ใช้ `superpowers:using-git-worktrees` ก่อน Task 1 สร้าง isolated parent worktree จาก starting commit ที่อนุมัติ ไม่สร้าง nested-product worktree เพราะ A1 ไม่แก้ nested source
2. บันทึก parent/nested branch, full SHA, status count, Node/npm version และ baseline LineOS test summary ใหม่ Planning baseline คือ parent `aae611a6a`, nested `a1e9006add32`, parent 206 entries, nested 67 entries และ LineOS 72/72 ผ่าน
3. รักษางานที่ไม่เกี่ยวข้องทั้งหมด โดยเฉพาะ `supabase/functions/_shared/order-adapter.ts` และ `tests/line-oa-commerce/ts/orderNormalization.property.test.ts` อยู่นอก scope
4. แผนนี้ไม่อนุญาต commit, push, merge, PR, deploy, ส่ง LINE หรือใช้ production credentials หากเจ้าของยังไม่อนุมัติแยก
5. ทุก production-code task ต้องโหลด `superpowers:test-driven-development` และมีหลักฐาน RED -> GREEN -> REFACTOR
6. ห้ามลดความเข้ม HTML resource allowlist หรือเพิ่ม npm dependency
7. เอกสาร project-facing ทุกชุดต้องมี `.en.md`, `.th.md`, `.en.html`, `.th.html` ที่ตรงกัน
8. หลัง Task 1–8 ใช้ `superpowers:requesting-code-review`, `superpowers:scrutinize` และ `superpowers:verification-before-completion` ก่อน completion claim

## แผนที่ไฟล์

| ไฟล์ | ความรับผิดชอบ |
|---|---|
| `LineOS/line-design-approval-contract.mjs` | Allowed shapes, forbidden authority fields, outcomes และ canonical contract validation |
| `LineOS/line-design-approval-record.mjs` | สร้าง deterministic sandbox record, digest, deep freeze และ bilingual visible rows |
| `LineOS/line-design-approval-sandbox.mjs` | A1 fixture source, review sessions, expiry/revision/version checks, idempotency และ single-flight ledger |
| `LineOS/line-flex-presets.mjs` | เพิ่ม non-secret Design Approval review token เท่านั้น |
| `LineOS/line-flex-json.mjs` | ใส่ opaque token ใน Design Approval URI โดยไม่พา authority fields |
| `LineOS/line-flex-studio.mjs` | Route เฉพาะ Design Approval ผ่าน port; รักษา legacy journeys สี่รายการ |
| `LineOS/line-flex-studio.html` | Static sandbox disclosure และ semantic review/record hooks |
| `LineOS/line-flex-studio.css` | Trust Concierge sandbox, state, digest และ responsive styles |
| `LineOS/tests/line-design-approval-contract.test.mjs` | Contract และ Flex-token RED/GREEN tests |
| `LineOS/tests/line-design-approval-record.test.mjs` | Record integrity, forbidden-field และ bilingual-row tests |
| `LineOS/tests/line-design-approval-sandbox.test.mjs` | Session, stale, expiry, idempotency, replay และ concurrency tests |
| `LineOS/tests/line-design-approval-security.test.mjs` | Static no-network/no-storage/forbidden-authority inventory |
| Existing LineOS tests | Regression และ shell/controller integration coverage |

## ภาพรวม Tasks

> **สำหรับ implementation tasks:** REQUIRED SUB-SKILL: ใช้ superpowers:test-driven-development ก่อนแก้ production code ทุก task เป็น RED -> GREEN -> REFACTOR slice
> **Parallel-first:** หลังอนุมัติ execution ให้ spawn sub-agents แยกเฉพาะ lanes ที่เป็นอิสระ ห้าม parallel tasks ที่ชนไฟล์, generated HTML, evidence artifacts หรือ shared tests

1. **Contract และ safe Flex review token** — Lane A | Can run together: none | Must wait for: execution preflight | TDD: tests ที่ยังไม่มี -> validators/URI token ขั้นต่ำ -> targeted green
2. **Sandbox verification record** — Lane B | Can run together: Task 4 | Must wait for: Task 1 | TDD: bounded record ที่ยังไม่มี -> deterministic frozen record -> targeted green
3. **Sandbox port, ledger และ single-flight** — Lane B | Can run together: Task 4 | Must wait for: Task 2 | TDD: session/replay/stale/concurrency failures -> minimal adapter -> targeted green
4. **Trust Concierge sandbox shell** — Lane C | Can run together: Tasks 2–3 | Must wait for: Task 1 | TDD: semantic disclosure hooks ที่ขาด -> minimal HTML/CSS -> structure green
5. **Design Approval controller integration** — Lane A | Can run together: none | Must wait for: Tasks 3–4 | TDD: legacy draft-derived journey -> preset-scoped port routing -> controller/regression green
6. **Security inventory และ automated gate เต็มชุด** — Lane D | Can run together: Task 7 | Must wait for: Task 5 | TDD: fail-closed inventory ที่ขาด -> exact static/security tests/scripts -> core/full green
7. **คู่มือ A1 สองภาษาและ document contract** — Lane E | Can run together: Task 6 | Must wait for: Task 5 | TDD: A1 guide manifest ที่ขาด -> aligned docs/HTML/assertions -> docs green
8. **Browser evidence, implementation report และ final review gates** — Sequential | Can run together: none | Must wait for: Tasks 6–7 | TDD: evidence/report contract ที่ขาด -> observed artifacts/bounded report -> full verification

---

### Task 1: Contract และ Safe Flex Review Token

**ไฟล์:**

- Create: `LineOS/line-design-approval-contract.mjs`
- Create: `LineOS/tests/line-design-approval-contract.test.mjs`
- Modify: `LineOS/line-flex-presets.mjs:38-74`
- Modify: `LineOS/line-flex-json.mjs:3-14`
- Modify: `LineOS/tests/line-flex-json-validator.test.mjs:149-175`

**REQUIRED SUB-SKILL:** ใช้ `superpowers:test-driven-development` สำหรับ production task นี้

**Parallelization:**

- Can run with: `none`
- Must wait for: isolated-worktree และ baseline preflight
- Race risk: contract/URI shape เป็น dependency ของทุก task ถัดไป

- [ ] **Step 0: โหลด TDD discipline**

ใช้ `superpowers:test-driven-development` ก่อนแก้ production code

- [ ] **Step 1: เขียน failing contract tests**

ครอบคลุม behavior ที่แน่นอน:

- Design Approval preset มี opaque non-secret `reviewToken` หนึ่งค่า และไม่พา `tenant`, customer, role, recipient, project หรือ approval data
- Built URI มีเพียง approved demo path, preset และ encoded review token
- `assertReviewSnapshot` บังคับ approved A1 fields และ `mode: sandbox` / `businessEffect: none`
- ปฏิเสธ top-level/nested authority fields เช่น tenant assertions, customer identity, approval status, signature และ key material
- `assertConfirmReviewInput` รับเพียง session, adapter-issued key, expected revision และ `decision: confirm`
- Allowed outcome registry ตรง written spec และ deeply frozen

- [ ] **Step 2: รัน RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-design-approval-contract.test.mjs tests/line-flex-json-validator.test.mjs
```

คาดหวัง: FAIL เพราะ module/token/contract behavior ยังไม่มี โดย existing Flex tests ต้องยัง execute

- [ ] **Step 3: Implement contract และ URI change ขั้นต่ำ**

Reuse `canonicalize`/`deepFreeze` จาก `line-flex-model.mjs` ไม่เพิ่ม schema library และไม่เปิด token ให้แก้ใน Studio field list รักษา action selection และ JSON ของ non-design presets ให้คงเดิม

- [ ] **Step 4: รัน GREEN และ regressions**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-design-approval-contract.test.mjs tests/line-flex-json-validator.test.mjs tests/line-flex-model.test.mjs
```

คาดหวัง: Targeted tests ผ่านทั้งหมด Design Approval ยังคงเป็น `uri` action และ authority field ไม่เข้า Flex JSON

- [ ] **Step 5: Refactor หลัง green**

คง validators ให้ pure, own-property based และ fail-closed แล้ว rerun command เดิม

### Task 2: Sandbox Verification Record

**ไฟล์:**

- Create: `LineOS/line-design-approval-record.mjs`
- Create: `LineOS/tests/line-design-approval-record.test.mjs`
- Read-only reference: `LineOS/line-flex-receipt.mjs`
- Read-only reference: `LineOS/line-flex-model.mjs`

**REQUIRED SUB-SKILL:** ใช้ `superpowers:test-driven-development` สำหรับ production task นี้

**Parallelization:**

- Can run with: `Task 4`
- Must wait for: `Task 1`
- Race risk: none; เป็นโมดูลและ test ใหม่

- [ ] **Step 0: โหลด TDD discipline**

ใช้ `superpowers:test-driven-development`

- [ ] **Step 1: เขียน failing record tests**

บังคับชื่อ `Sandbox Verification Record — Demo · No Business Effect`, exact mode/effect, bounded identifiers, revision/manifest, canonicalization version, timestamps, requested action, outcome และ SHA-256 digest พร้อมพิสูจน์ว่า:

- canonical input เดิมให้ digest เดิม
- Bound field ทุกตัวเปลี่ยน digest
- Key order ไม่เปลี่ยน digest
- Record/descendants frozen
- Record keys และ TH/EN rows ตัด approval, signature, key, tenant, token และ product-audit claims
- Render ใช้ textContent-ready scalar values เท่านั้น

- [ ] **Step 2: รัน RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-design-approval-record.test.mjs
```

คาดหวัง: FAIL เพราะ record builder ยังไม่มี

- [ ] **Step 3: Implement record builder ขั้นต่ำ**

ใช้ browser/Node Web Crypto และ canonicalization helper เดิม Digest เป็น integrity metadata เท่านั้น ห้าม import/call `ApprovalSigner`, LINE, Supabase, storage หรือ network API

- [ ] **Step 4: รัน GREEN**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-design-approval-record.test.mjs tests/line-flex-actions-receipt.test.mjs
```

คาดหวัง: New record tests และ legacy receipt tests ผ่าน

- [ ] **Step 5: Refactor หลัง green**

แยก record construction ออกจาก DOM rendering และ rerun targeted command

### Task 3: Sandbox Port, Ledger และ Single-Flight

**ไฟล์:**

- Create: `LineOS/line-design-approval-sandbox.mjs`
- Create: `LineOS/tests/line-design-approval-sandbox.test.mjs`
- Use: `LineOS/line-design-approval-contract.mjs`
- Use: `LineOS/line-design-approval-record.mjs`

**REQUIRED SUB-SKILL:** ใช้ `superpowers:test-driven-development` สำหรับ production task นี้

**Parallelization:**

- Can run with: `Task 4`
- Must wait for: `Task 2`
- Race risk: ไม่ชน Task 4; ห้ามแก้ shell/controller files

- [ ] **Step 0: โหลด TDD discipline**

ใช้ `superpowers:test-driven-development`

- [ ] **Step 1: เขียน failing adapter tests**

สร้าง deterministic injection สำหรับ clock, ID factory, fixture source และ ledger แล้วทดสอบ:

- Valid/invalid review token โดยไม่เปิด resource enumeration
- Adapter-issued session/idempotency key
- Immutable adapter-owned snapshot ที่ editable draft เปลี่ยนไม่ได้
- Exact expiry boundary และ post-expiry rejection
- Stale revision ID, changed manifest และ workflow version conflict
- Key/payload เดิม replay แล้วได้ record เดิม
- Key เดิม/payload ต่างคืน `idempotency_conflict`
- `Promise.all` concurrent confirms สร้าง ledger entry/record เดียว
- Pre-record failure retry ด้วย key เดิมได้
- ไม่ใช้ browser persistence API และ adapter ใหม่มี ledger ว่าง

- [ ] **Step 2: รัน RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-design-approval-sandbox.test.mjs
```

คาดหวัง: FAIL เพราะ adapter ยังไม่มี

- [ ] **Step 3: Implement adapter ขั้นต่ำ**

เปิด `createSandboxDesignApprovalPort(dependencies)` และใช้ per-key pending-promise/single-flight เพื่อกัน async digest double-record เก็บ fixture identity เป็น private และคืน neutral bounded errors

- [ ] **Step 4: รัน GREEN**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-design-approval-sandbox.test.mjs tests/line-design-approval-record.test.mjs
```

คาดหวัง: PASS, concurrent case มี ledger entry เดียว และไม่มี skip

- [ ] **Step 5: Refactor หลัง green**

แยก snapshot recheck, ledger resolution และ error mapping เฉพาะเมื่อช่วยลด duplication แล้ว rerun

### Task 4: Trust Concierge Sandbox Shell

**ไฟล์:**

- Modify: `LineOS/line-flex-studio.html:44-53`
- Modify: `LineOS/line-flex-studio.css:36-80`
- Modify: `LineOS/tests/line-flex-structure.test.mjs:208-267`

**REQUIRED SUB-SKILL:** ใช้ `superpowers:test-driven-development` สำหรับ production task นี้

**Parallelization:**

- Can run with: `Tasks 2–3`
- Must wait for: `Task 1`
- Race risk: Task 5 ใช้ DOM hooks ชุดนี้และต้องรอ

- [ ] **Step 0: โหลด TDD discipline**

ใช้ `superpowers:test-driven-development`

- [ ] **Step 1: เขียน failing semantic-shell tests**

บังคับ local semantic elements สำหรับ:

- `SANDBOX — NO BUSINESS EFFECT` warning ที่อยู่ตลอดใน dialog
- mode/effect provenance
- review expiry และ digest display
- bounded outcome/error region
- sandbox record title/disclosure
- accessible dialog labels/live-region behavior
- ไม่มี script, image, inline handler, remote resource หรือ CSS URL ใหม่

- [ ] **Step 2: รัน RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-structure.test.mjs
```

คาดหวัง: FAIL ที่ sandbox hooks ที่ขาด ไม่ใช่ existing resource parser

- [ ] **Step 3: Implement HTML/CSS ขั้นต่ำ**

รักษา one stylesheet/one module allowlist ให้ warning เด่นบน desktop/mobile/reduced motion ห้ามใช้ `innerHTML` หรือ dynamic style attributes

- [ ] **Step 4: รัน GREEN**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-structure.test.mjs
```

คาดหวัง: Structure/resource/responsive tests ผ่านทั้งหมด

- [ ] **Step 5: Refactor หลัง green**

รวมเฉพาะ sandbox styles ที่ซ้ำ แล้ว rerun test

### Task 5: Design Approval Controller Integration

**ไฟล์:**

- Modify: `LineOS/line-flex-studio.mjs:1-8,115-218,297-417,484-752`
- Modify: `LineOS/tests/line-flex-studio-state.test.mjs:1-106`
- Modify: `LineOS/tests/line-flex-actions-receipt.test.mjs:24-40` เฉพาะเมื่อ routing regression ต้องมี assertion ที่แม่น
- Use: Design Approval modules ใหม่ทั้งสาม

**REQUIRED SUB-SKILL:** ใช้ `superpowers:test-driven-development` สำหรับ production task นี้

**Parallelization:**

- Can run with: `none`
- Must wait for: `Tasks 3–4`
- Race risk: central controller/shared bilingual copy ต้องมี owner เดียว

- [ ] **Step 0: โหลด TDD discipline**

ใช้ `superpowers:test-driven-development`

- [ ] **Step 1: เขียน failing controller/state tests**

เพิ่ม pure exports เท่าที่จำเป็น และพิสูจน์ว่า:

- เฉพาะ `presetId === "design-approval"` เลือก port journey
- Preset IDs อีกสี่รายการคง legacy demo path
- Design Approval visible rows มาจาก adapter snapshot/record ไม่ใช่ editable draft
- Switch preset/language, edit field, cancel, close, stale error และ expiry ล้าง active review อย่างปลอดภัย
- Adapter errors map ไป neutral TH/EN messages ที่แน่นอน
- Confirm button busy/disabled ระหว่าง submit แต่ adapter idempotency เป็น authority
- Final title/copy เป็น approved sandbox record และบอกว่า workflow state ไม่เปลี่ยน

- [ ] **Step 2: รัน RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-studio-state.test.mjs tests/line-design-approval-sandbox.test.mjs
```

คาดหวัง: FAIL เพราะ controller ยังใช้ legacy transaction สำหรับ Design Approval

- [ ] **Step 3: Implement preset-scoped routing ขั้นต่ำ**

ให้ `bindStudio(doc, options)` รับ injected port สำหรับ tests และสร้าง default sandbox port เฉพาะ browser binding ใช้ safe DOM APIs ห้ามลบ legacy modules หรือ migrate presets อื่น

- [ ] **Step 4: รัน GREEN และ focused regression**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-studio-state.test.mjs tests/line-design-approval-contract.test.mjs tests/line-design-approval-record.test.mjs tests/line-design-approval-sandbox.test.mjs tests/line-flex-actions-receipt.test.mjs
```

คาดหวัง: Targeted tests ผ่านทั้งหมด รวม legacy receipt behavior

- [ ] **Step 5: Refactor หลัง green**

Extract เฉพาะ journey-selection/row-render helpers ขนาดเล็กเมื่อช่วยลดความกำกวม แล้ว rerun command เดิม

### Task 6: Security Inventory และ Complete Automated Gate

**ไฟล์:**

- Create: `LineOS/tests/line-design-approval-security.test.mjs`
- Modify: `LineOS/package.json:6-10`
- Modify: existing tests เฉพาะที่มี exact security invariant ใหม่

**REQUIRED SUB-SKILL:** ใช้ `superpowers:test-driven-development` สำหรับ production task นี้

**Parallelization:**

- Can run with: `Task 7`
- Must wait for: `Task 5`
- Race risk: ห้ามแก้ `docs-contract.test.mjs`; Task 7 เป็น owner

- [ ] **Step 0: โหลด TDD discipline**

ใช้ `superpowers:test-driven-development`

- [ ] **Step 1: เขียน failing inventory tests**

ตรวจ A1 modules/shell แบบ recursive สำหรับ:

- `fetch`, XHR, WebSocket, EventSource, `sendBeacon`, LINE SDK, Supabase, authorization headers, service keys, token logging, `localStorage`, `sessionStorage`, IndexedDB, cookies และ dynamic remote imports
- Forbidden record authority keys และ production-claim copy
- Draft-to-record authority leakage
- Unclassified network-capable/persistent-storage calls
- Exact local module/resource inventory

Test ต้อง fail closed เมื่อใส่ synthetic unsafe fixture

- [ ] **Step 2: รัน RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-design-approval-security.test.mjs
```

คาดหวัง: FAIL ที่ missing inventory/allowlist behavior

- [ ] **Step 3: Implement tests/scripts ขั้นต่ำ**

เพิ่ม `test:design-approval` และรวม tests ใหม่ใน `test:core` โดยไม่ขยาย external-resource allowlists

- [ ] **Step 4: รัน GREEN และ full suite**

```powershell
npm.cmd --prefix LineOS run test:design-approval
npm.cmd --prefix LineOS run test:core
npm.cmd --prefix LineOS run test
```

คาดหวัง: Complete untruncated summaries, zero failures/skips/todos และ baseline 72 tests เดิมบวก tests ใหม่

- [ ] **Step 5: Refactor หลัง green**

ลบ scanner code ที่ซ้ำโดยไม่ลด exact source inventories แล้ว rerun ทั้งสาม commands

### Task 7: คู่มือ A1 สองภาษาและ Document Contract

**ไฟล์:**

- Create: `LineOS/docs/guides/line-design-approval-sandbox-a1-guide.en.md`
- Create: `LineOS/docs/guides/line-design-approval-sandbox-a1-guide.th.md`
- Generate: matching `.en.html` และ `.th.html`
- Modify: `LineOS/tests/docs-contract.test.mjs`
- Read: A1 spec ที่อนุมัติและแผนนี้

**Parallelization:**

- Can run with: `Task 6`
- Must wait for: `Task 5`
- Race risk: Task 8 จะต่อ `docs-contract.test.mjs` และต้องรอ

- [ ] **Step 0: ระบุ docs/config exception**

Task นี้แก้เอกสารและ executable manifest ใช้ failing docs-contract assertion แทน production-code TDD test

- [ ] **Step 1: เพิ่ม failing document-contract assertions**

บังคับ A1 spec/plan/guide แบบ TH/EN Markdown/HTML พร้อมข้อความแน่นอนเรื่อง:

- Contract-ready แต่ runtime-disconnected
- Design Approval-only A1 routing
- Opaque non-secret review token
- Session-only reset limitation
- `providerContext` แทน tenant authority
- Exact sandbox record title
- ไม่มี workflow mutation, LINE send, database write, signature หรือ audit claim
- Future A2 promotion gates

- [ ] **Step 2: รัน failing contract**

```powershell
npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs
```

คาดหวัง: FAIL เพราะ guide editions ใหม่ยังไม่มี

- [ ] **Step 3: เขียน TH/EN guides ที่ตรงกันและ render HTML**

```powershell
python tools/render_docs.py LineOS/docs/guides/line-design-approval-sandbox-a1-guide.en.md LineOS/docs/guides/line-design-approval-sandbox-a1-guide.th.md LineOS/docs/superpowers/plans/2026-08-02-monolith-line-design-approval-port-a1-implementation.en.md LineOS/docs/superpowers/plans/2026-08-02-monolith-line-design-approval-port-a1-implementation.th.md
```

- [ ] **Step 4: รัน docs GREEN gates**

```powershell
npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs
python tools/lint_claims.py LineOS/docs/guides/line-design-approval-sandbox-a1-guide.en.md LineOS/docs/guides/line-design-approval-sandbox-a1-guide.th.md LineOS/docs/superpowers/specs/2026-08-02-monolith-line-design-approval-port-a1-design.en.md LineOS/docs/superpowers/specs/2026-08-02-monolith-line-design-approval-port-a1-design.th.md
```

คาดหวัง: Docs contract ผ่าน; claim lint exit 0 โดยไม่มี debt ใหม่

- [ ] **Step 5: ตรวจ Markdown/HTML parity**

ตรวจ language tags, headings, tables, key claims, standalone resources, trailing whitespace และ replacement characters

### Task 8: Browser Evidence, Implementation Report และ Final Review Gates

**ไฟล์:**

- Create: `LineOS/artifacts/line-design-approval-a1/desktop-1440.png`
- Create: `LineOS/artifacts/line-design-approval-a1/mobile-390.png`
- Create: `LineOS/artifacts/line-design-approval-a1/verification-summary.json`
- Create: `LineOS/docs/reports/2026-08-02-line-design-approval-port-a1-implementation-report.en.md`
- Create: `LineOS/docs/reports/2026-08-02-line-design-approval-port-a1-implementation-report.th.md`
- Generate: matching report `.en.html` และ `.th.html`
- Modify: `LineOS/tests/docs-contract.test.mjs`
- Do not modify: nested MONOLITH product source

**Parallelization:**

- Can run with: `none`
- Must wait for: `Tasks 6–7`
- Race risk: shared evidence summary/report/docs contract ต้องมี owner เดียว

- [ ] **Step 0: โหลด verification และ browser disciplines**

ใช้ `superpowers:webapp-testing`, `superpowers:requesting-code-review`, `superpowers:scrutinize` และ `superpowers:verification-before-completion` ตาม gates

- [ ] **Step 1: เพิ่ม failing evidence/report contract**

ต่อ `docs-contract.test.mjs` ให้บังคับ:

- Exact repository commit/worktree provenance และ dirty-scope disclosure
- Automated command และ complete pass/fail/skip/todo counts
- TH/EN, desktop/mobile, keyboard journey results
- Successful sandbox confirmation, replay, stale revision, expiry, cancellation และ legacy-preset regression
- Zero external requests และ zero console/page errors
- Receipt forbidden-field scan
- Nested HEAD และ targeted status evidence
- Explicit `NO-GO_RUNTIME_INTEGRATION` และ A2 blockers

- [ ] **Step 2: รัน RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs
```

คาดหวัง: FAIL เพราะ fresh evidence/reports ยังไม่มี

- [ ] **Step 3: รัน automated suite เต็มก่อน browser evidence**

```powershell
npm.cmd --prefix LineOS run test
python tools/lint_claims.py LineOS/docs
git diff --check
```

บันทึก complete untruncated summaries ห้ามสร้าง JSON summary จากค่าคาดหมาย

- [ ] **Step 4: Serve local และเก็บ browser evidence**

Serve `LineOS/` ผ่าน localhost ไม่ใช้ `file://` ตรวจอย่างน้อย width 1440/390 ทั้งสองภาษา Exercise Design Approval success/replay/stale/expired/cancel, non-design legacy journey หนึ่งรายการ, keyboard focus return, reduced-motion และ record readability จับทุก request และพิสูจน์ว่าเป็น localhost ทั้งหมด มี zero external requests พร้อม capture console/page errors

- [ ] **Step 5: เขียน observed evidence เท่านั้น**

สร้าง `verification-summary.json` จากค่าที่สังเกตด้วย `apply_patch` ผูกกับ exact hashes ของ screenshots และ final source/commit snapshot ระบุ sandbox และ runtime integration เป็น false

- [ ] **Step 6: เขียน implementation reports สองภาษาและ render HTML**

รวม scope, two-root provenance, changed files, TDD evidence, complete test counts, browser matrix, network record, review findings/fixes, residual risks, A2 gates และ exact decision `NO-GO_RUNTIME_INTEGRATION`

```powershell
python tools/render_docs.py LineOS/docs/reports/2026-08-02-line-design-approval-port-a1-implementation-report.en.md LineOS/docs/reports/2026-08-02-line-design-approval-port-a1-implementation-report.th.md
```

- [ ] **Step 7: รัน review gates และแก้ findings แบบ test-first**

Request task-scoped code review แล้ว whole-change scrutiny ทุก accepted behavioral fix ต้องเริ่มจากหรืออัปเดต failing regression test และ rerun affected tests

- [ ] **Step 8: รัน final fresh complete gate**

```powershell
npm.cmd --prefix LineOS run test
python tools/lint_claims.py LineOS/docs
git diff --check
git status --short
git -C determined-williams rev-parse HEAD
git -C determined-williams status --short
```

คาดหวัง: Full LineOS suite ผ่านพร้อม complete counts; claim lint exit 0 โดยไม่มี debt ใหม่; diff check ไม่มี output; parent status มีเฉพาะ authorized A1 files บวก pre-existing changes; nested HEAD คง baseline และไม่มี A1 path

## Checklist ตรวจแผน

- [ ] ทุก production task มี RED -> GREEN -> REFACTOR และ exact command
- [ ] Tasks 2/3 กับ 4 มี write scope แยกและ parallel ได้; central controller เป็น sequential
- [ ] ไม่มี task แก้ nested runtime, migrations, dirty order adapter หรือ production credentials
- [ ] Legacy preset journeys สี่รายการเป็น explicit regression scope
- [ ] Session-only replay limitation และ no-business-effect copy เป็น acceptance criteria ที่ทดสอบได้
- [ ] Record digest แยกจาก production signature
- [ ] Tenant, customer identity, workflow status และ audit authority อยู่นอก browser control
- [ ] Project-facing docs วางแผนเป็น TH/EN Markdown และ standalone HTML
- [ ] ไม่มี task สั่ง implementer commit หรือ push
- [ ] A2 blockers ระบุชัดและไม่ซ่อนใน A1 tasks
