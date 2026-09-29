# แผนดำเนินงาน MONOLITH LINE Flex Studio

> **สำหรับ agentic workers:** REQUIRED SUB-SKILL: ใช้ superpowers:subagent-driven-development (แนะนำ) หรือ superpowers:executing-plans เพื่อดำเนินแผนนี้ทีละ Task โดยใช้ checkbox ติดตามผล

**เป้าหมาย:** สร้าง Flex Message Studio แบบ standalone สองภาษาใน LineOS ที่มีรูปทรงพร้อมต่อยอดสู่ production ประกอบด้วย 5 presets, preview/JSON/validation แบบ real-time, Mock LIFF ที่ปลอดภัย, demo receipt ที่ไม่กล่าวอ้างเกินจริง, รายงานวิจัยระดับคณะกรรมการ และคู่มือติดตั้งที่ทำตามได้จริง

**สถาปัตยกรรม:** แอป browser แบบไม่พึ่ง dependency อ่าน preset ที่แก้ไขไม่ได้เข้าสู่ FlexDraft กลางหนึ่งชุด โมดูล pure function สร้าง Flex JSON, ผลตรวจสอบ, demo transaction ที่ผูก exact action และ SHA-256 demo receipt ส่วน DOM controller บาง ๆ แสดง Studio Console โดยไม่เรียกเครือข่าย nested product repository ไม่ถูกแก้ไขและใช้เป็นหลักฐานอ้างอิงสำหรับ integration ในอนาคตเท่านั้น

**เทคโนโลยี:** Semantic HTML5, CSS custom properties, browser-native ES modules, Web Crypto, Node.js built-in test runner, `tools/render_docs.py` ของ repository และการตรวจใน local browser

> ชื่อ API, identifier, file path, test name และคำสั่งคงเป็นภาษาอังกฤษเพื่อป้องกันความคลาดเคลื่อน รายการโค้ดแบบ copy-paste ที่เป็นมาตรฐานอยู่ใน [แผนฉบับอังกฤษ](./2026-08-01-monolith-line-flex-studio-implementation.en.md) ฉบับภาษาไทยนี้รักษา Task, interface, test, gate, ลำดับทำงาน และผลที่คาดหวังให้ตรงกันครบถ้วน

## ข้อจำกัดกลาง

- ทำงานเฉพาะ parent root `C:\Users\thai3\determined-williams (2)`
- ใช้ Node.js 22.20.0 ขึ้นไป; ตอนวางแผนตรวจพบ v22.21.1 และ npm 11.6.2
- ห้ามแก้ nested product repository `determined-williams/`
- ตรวจ Git status แยกทั้งสอง root ก่อนทุก Task และรักษาการเปลี่ยนแปลงเดิมทั้งหมด
- จุดเริ่มต้น parent ที่ตรวจพบ: commit `f846044736c3`, branch `guardrails/claim-linters`, มี status entries 202 รายการ
- จุดเริ่มต้น nested ที่ตรวจพบ: commit `a1e9006add32`, branch `fix/dxf-truth-chain`, มี status entries 67 รายการ
- Runtime ต้องไม่เรียกเครือข่ายภายนอก ไม่มี LINE/Supabase credential และไม่มีเส้นทาง live send
- หน้าลูกค้าใช้แบรนด์ tenant-first พร้อม `Secured by MONOLITH`; หน้าภายในใช้ MONOLITH-first และแสดง tenant context ชัดเจน
- การแตะ Flex ไม่ถือเป็นการอนุมัติธุรกิจ งาน high risk ต้องเปิด Mock LIFF และคู่มือ production ต้องกำหนด Trust Kernel step-up
- ใบรับรองต้องชื่อ `Verification Receipt — Demo` และแสดง `DEMO — NOT A PRODUCTION SIGNATURE`
- v1 รองรับหนึ่ง bubble และ 5 presets ที่อนุมัติแล้วเท่านั้น ไม่รวม carousel/video authoring, raw JSON editing และ production integration
- UI และเอกสารต้องมีไทย/อังกฤษ และ Markdown ทุกไฟล์ต้องมี standalone HTML คู่กัน
- ข้อจำกัดเทคนิคต้องอ้าง official LINE source ส่วนข้อเสนอ MONOLITH ต้องระบุว่าเป็น best practice
- ใช้ TDD: เขียน behavior test → รันให้เห็น failure ที่คาดไว้ → เขียน production code ขั้นต่ำ → รันให้ผ่าน
- stage และ commit เฉพาะไฟล์ที่ Task นั้นระบุ

---

## แผนที่ไฟล์

### Runtime และโมดูลหลัก

| ไฟล์ | ความรับผิดชอบ |
|---|---|
| `LineOS/package.json` | คำสั่ง unit/contract tests แบบไม่มี dependency |
| `LineOS/line-flex-studio.html` | Semantic shell, tabs, dialogs และ live regions |
| `LineOS/line-flex-studio.css` | Trust Concierge tokens, 3-column layout, responsive tabs, focus และ reduced motion |
| `LineOS/line-flex-studio.mjs` | State reducer, safe DOM binding, preview/JSON/validation, copy/download/reset และ dialog flow |
| `LineOS/line-flex-model.mjs` | สร้าง/clone/update/canonicalize FlexDraft |
| `LineOS/line-flex-presets.mjs` | 5 bilingual frozen presets |
| `LineOS/line-flex-json.mjs` | สร้าง Flex JSON ใน supported subset และนับ UTF-8 bytes |
| `LineOS/line-flex-validator.mjs` | Registry/evaluator ที่ระบุ source และ classification |
| `LineOS/line-flex-actions.mjs` | เลือก action, risk guard และ expiring demo transaction |
| `LineOS/line-flex-receipt.mjs` | Canonical receipt payload และ SHA-256 digest |

### Visual assets ภายในเครื่อง

`LineOS/assets/line-flex-studio/` ต้องมี `design-approval-hero.svg`, `quote-order-hero.svg`, `sla-escalation-hero.svg`, `site-update-hero.svg` และ `issue-evidence-hero.svg` โดย contract ต้อง reject script, bitmap และ external reference เพื่อคง SVG แบบ self-contained

### Tests

| ไฟล์ | สัญญาที่ตรวจ |
|---|---|
| `LineOS/tests/line-flex-model.test.mjs` | Draft isolation, immutable update และ preset contract |
| `LineOS/tests/line-flex-json-validator.test.mjs` | Deterministic JSON, source rules, size/action limits |
| `LineOS/tests/line-flex-actions-receipt.test.mjs` | Risk routing, transaction binding, expiry และ digest |
| `LineOS/tests/line-flex-structure.test.mjs` | Semantic HTML, local assets และ contract ที่ reject remote runtime dependency |
| `LineOS/tests/line-flex-studio-state.test.mjs` | Reducer, language/preset/block change และ export gating |
| `LineOS/tests/docs-contract.test.mjs` | คู่ TH/EN Markdown/HTML และข้อจำกัดด้าน claim/status |

### เอกสารและหลักฐาน

- `LineOS/docs/research/2026-08-01-monolith-line-human-surface-deep-research.{en,th}.{md,html}`
- `LineOS/docs/guides/line-flex-studio-user-guide.{en,th}.{md,html}`
- `LineOS/docs/guides/line-developer-console-installation.{en,th}.{md,html}`
- `LineOS/docs/guides/line-flex-action-vs-liff-decision-guide.{en,th}.{md,html}`
- `LineOS/docs/guides/line-flex-performance-rendering-checklist.{en,th}.{md,html}`
- `LineOS/docs/reports/2026-08-01-line-flex-studio-implementation-report.{en,th}.{md,html}`
- `LineOS/artifacts/line-flex-studio/` สำหรับภาพ desktop/mobile และ machine-readable verification summary

---

### Task 1: สัญญา FlexDraft แบบ immutable และ 5 presets

**ไฟล์:** สร้าง `LineOS/package.json`, `line-flex-model.mjs`, `line-flex-presets.mjs`; ทดสอบด้วย `tests/line-flex-model.test.mjs`

**Interfaces:** ต้อง export `deepFreeze`, `cloneDraft`, `createDraft`, `updateDraftAtPath`, `canonicalize`, `PRESET_IDS`, `PRESETS`, `getPreset` และห้าม consumer ใดแก้ `PRESETS`

- [ ] **Step 1: สร้าง test command และ failing tests**

`package.json` ใช้ `type: module`, Node `>=22.20.0`, `test: node --test`, พร้อม `test:core` และ `test:contracts` ตามรายชื่อในฉบับ EN Tests ต้องพิสูจน์ว่า:

1. มี preset IDs ตามลำดับ `design-approval`, `quote-order`, `sla-escalation`, `site-update`, `issue-evidence` เท่านั้น;
2. registry และ preset ทุกตัวถูก freeze;
3. draft ไทย/อังกฤษแยกจากกันและไม่แก้ source;
4. nested path update ไม่ mutate draft เดิม;
5. `canonicalize` เรียง object keys ซ้ำทุกระดับ

- [ ] **Step 2: รันให้เห็น RED**

```powershell
npm.cmd --prefix LineOS run test -- --test-name-pattern "approved immutable|isolated bilingual|nested field|canonicalize"
```

คาดหวัง: FAIL เพราะโมดูลยังไม่มี

- [ ] **Step 3: สร้าง immutable model ขั้นต่ำ**

ใช้ `structuredClone`, clone ก่อน nested update, recursive `deepFreeze` และ recursive key-sorted `canonicalize` ตาม code listing ใน Task 1 ฉบับ EN; language ที่ไม่รองรับต้อง throw `unsupported_language` และ preset ที่ไม่รู้จักต้อง throw `unknown_preset`

- [ ] **Step 4: สร้างข้อมูล 5 bilingual presets ให้ครบ**

ทุก preset ต้องมี `context`, `header`, `hero`, `body`, `footer`, `intent`, `evidence` และใช้ tenant demo `tenant_daph_demo` โดย Daph เป็นเพียง tenant ตัวอย่างหนึ่งราย:

| Preset | Audience | Canonical action | Risk | Requested action |
|---|---|---|---|---|
| design-approval | customer | design.approve_revision | high | liff_uri |
| quote-order | customer | commerce.submit_order_intent | high | liff_uri |
| sla-escalation | internal | workflow.acknowledge_sla | low | postback |
| site-update | customer_group | field.view_curated_update | low | uri |
| issue-evidence | internal_group | evidence.acknowledge_issue | low | postback |

ทุก preset ต้องมี copy ไทย/อังกฤษ, local SVG, HTTPS export URL, target reference, expiry, correlation prefix, revision, requester, amount/scope, deadline, summary, trust note, primary/secondary label และ alt text ตามฉบับ EN

- [ ] **Step 5: รัน GREEN**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-model.test.mjs
```

คาดหวัง: PASS 4 tests, 0 failures

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- LineOS/package.json LineOS/line-flex-model.mjs LineOS/line-flex-presets.mjs LineOS/tests/line-flex-model.test.mjs
git commit -m "feat(lineos): add immutable Flex Studio presets"
```

---

### Task 2: Flex JSON แบบ deterministic และ validation ที่บอกแหล่งที่มา

**ไฟล์:** สร้าง `line-flex-json.mjs`, `line-flex-validator.mjs`; ทดสอบด้วย `tests/line-flex-json-validator.test.mjs`

**Interfaces:** `buildFlexMessage(draft)`, `measureUtf8Bytes(value)`, `VALIDATION_RULES`, `validateDraft(draft,message)`; finding ต้องมี `{ ruleId, severity, block, field, classification, sourceUrl, title, explanation, remediation }`

- [ ] **Step 1: เขียน failing tests** ให้ตรวจลำดับ Header→Hero→Body→Footer, deterministic output, UTF-8 size, approved preset ไม่มี error, high-risk postback ถูก block, official limits และ soft/hard size gate โดยใช้ ASCII payload เพื่อให้ byte count แน่นอน
- [ ] **Step 2: รัน RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-json-validator.test.mjs
```

- [ ] **Step 3: สร้าง supported Flex subset**

Envelope ต้องเป็น `{type:"flex",altText,contents:{type:"bubble",size:"mega",header,hero,body,footer}}`; action รองรับ message/postback/URI, footer มี dominant CTA เดียว, และ byte count ใช้ `TextEncoder` กับ JSON ของ `contents`

- [ ] **Step 4: สร้าง immutable validation registry**

| Rule | Severity | Classification | เงื่อนไข |
|---|---|---|---|
| LINE-ALT-001/002 | error | official_constraint | altText ว่าง/เกิน 1,500 |
| LINE-SIZE-001 | error | official_constraint | bubble เกิน 30 KB UTF-8 |
| LINE-IMG-001/002 | error | official_constraint | ไม่ใช่ HTTPS/URL เกิน 2,000 |
| LINE-BTN-001 | error | official_constraint | label ว่าง/เกิน 40 |
| LINE-POSTBACK-001 | error | official_constraint | data เกิน 300 |
| LINE-MESSAGE-001 | error | official_constraint | text เกิน 300 |
| LINE-URI-001 | error | official_constraint | URI เกิน 1,000 |
| MON-SIZE-001 | warning | monolith_best_practice | มากกว่า 24 KB แต่ไม่เกิน 30 KB |
| MON-ACT-001 | error | monolith_best_practice | high risk ขอ postback/message |
| MON-CTA-001 | warning | monolith_best_practice | มี dominant CTA มากกว่าหนึ่ง |
| MON-TRUST-001 | warning | monolith_best_practice | revision/deadline/requester/audience/trust note ไม่ครบ |
| MON-MEDIA-001 | guidance | monolith_best_practice | local preview ไม่ fetch export URL |
| MON-PROD-001 | guidance | monolith_best_practice | production action ต้องผ่าน Trust Kernel |

ใช้ official URLs ของ LINE Messaging API, Flex elements และ Actions; best practice ชี้ไป approved design spec ในเครื่อง การแสดงผลต้องเลือก copy `th/en`, เรียง error → warning → guidance แล้วเรียง rule ID ภายในระดับเดียวกัน โค้ด registry/evaluator ที่ต้องใช้ระบุครบใน Task 2 ฉบับ EN

- [ ] **Step 5: รัน focused และ full tests**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-json-validator.test.mjs
npm.cmd --prefix LineOS run test
```

คาดหวัง: focused PASS 5/5 และทั้งหมด 0 failures

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- LineOS/line-flex-json.mjs LineOS/line-flex-validator.mjs LineOS/tests/line-flex-json-validator.test.mjs
git commit -m "feat(lineos): generate and validate Flex JSON"
```

---

### Task 3: Action ตามความเสี่ยง, bound transaction และ receipt ที่ไม่กล่าวอ้างเกินจริง

**ไฟล์:** สร้าง `line-flex-actions.mjs`, `line-flex-receipt.mjs`; ทดสอบด้วย `tests/line-flex-actions-receipt.test.mjs`

**Interfaces:** `selectActionMode`, `createDemoTransaction`, `confirmDemoTransaction`, `createDemoReceipt`

- [ ] **Step 1: เขียน failing tests** ให้พิสูจน์ว่า high risk ถูกบังคับเป็น `liff_uri`, low-risk acknowledgement ใช้ postback ได้, transaction ผูก tenant/recipient/target/revision/action/amount/deadline/expiry, revision เปลี่ยนหรือหมดอายุต้อง fail closed และ digest เปลี่ยนเมื่อ bound input เปลี่ยน
- [ ] **Step 2: รัน RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-actions-receipt.test.mjs
```

- [ ] **Step 3: สร้าง action guard และ bound transaction**

High risk คืน `liff_uri` เสมอ Transaction ใช้ canonical payload และ expiry จาก `expiresInMinutes`; confirmation เปรียบเทียบ payload ปัจจุบันกับ `boundPayload` และ throw `transaction_expired` หรือ `bound_value_changed` ก่อนสร้าง outcome

- [ ] **Step 4: สร้าง SHA-256 demo receipt**

Digest ต้องมาจาก canonical payload ที่มี receiptVersion, transaction, tenant, recipient, target, revision, canonical action, createdAt, confirmedAt และ outcome ใช้ Web Crypto `SHA-256`; output ต้องมี label `DEMO — NOT A PRODUCTION SIGNATURE` และข้อความว่า production signing/audit ต้องใช้ MONOLITH Trust Kernel

- [ ] **Step 5: รัน focused/full tests**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-actions-receipt.test.mjs
npm.cmd --prefix LineOS run test
```

คาดหวัง: focused PASS 5/5 และทั้งหมด 0 failures

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- LineOS/line-flex-actions.mjs LineOS/line-flex-receipt.mjs LineOS/tests/line-flex-actions-receipt.test.mjs
git commit -m "feat(lineos): add safe demo approval receipts"
```

---

### Task 4: Semantic Studio Console และ Trust Concierge assets ภายในเครื่อง

**ไฟล์:** สร้าง `line-flex-studio.html`, `line-flex-studio.css`, SVG 5 ไฟล์ และ `tests/line-flex-structure.test.mjs`

**Interfaces:** HTML ต้อง expose IDs `language-toggle`, `tenant-context`, `preset-list`, `block-tabs`, `field-panel`, `phone-preview`, `json-output`, `validation-list`, `payload-count`, `copy-json`, `download-json`, `reset-draft`, `run-journey`, `liff-dialog`, `receipt-dialog`, `toast-live`; โหลดเฉพาะ CSS/MJS ภายในเครื่อง

- [ ] **Step 1: เขียน structural contract** ตรวจ semantic main, polite live region, native dialogs, module script, reject remote script/style/font/tracking และกำหนดให้ SVG ทุกไฟล์เริ่มด้วย `<svg`, มี `aria-hidden="true"` พร้อม reject URL/script/foreignObject
- [ ] **Step 2: รัน RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-structure.test.mjs
```

- [ ] **Step 3: สร้าง semantic shell** ตาม hierarchy ใน Task 4 ฉบับ EN: skip link, MONOLITH header, tenant context, 3 panes, editor/preset/block fields, phone preview, JSON/validation, buttons, Mock LIFF dialog, receipt dialog และ live announcer
- [ ] **Step 4: สร้าง Trust Concierge layout** ด้วย palette เขียวเข้ม/เขียว action/พื้น warm/gold attention, 3 columns ที่กว้างกว่า 1000, 2 แถวที่ 721–1000 และ tabs ที่ 720 ลงมา ต้องมี focus visible, disabled state, long digest wrapping, print CSS และ reduced-motion support โค้ด CSS มาตรฐานอยู่ในฉบับ EN
- [ ] **Step 5: สร้าง 5 SVG** ขนาด `viewBox="0 0 1200 780"`: ครัว isometric อบอุ่น, material/quote cards, SLA clock/workflow lane, curated site frames และ evidence/provenance/quarantine boundary ใช้ vectors ที่ระบุในฉบับ EN
- [ ] **Step 6: รัน structural/full tests**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-structure.test.mjs
npm.cmd --prefix LineOS run test
```

คาดหวัง: structure PASS 3/3 และทั้งหมด 0 failures

- [ ] **Step 7: Commit Task 4**

```powershell
git add -- LineOS/line-flex-studio.html LineOS/line-flex-studio.css LineOS/assets/line-flex-studio LineOS/tests/line-flex-structure.test.mjs
git commit -m "feat(lineos): add Trust Concierge Studio shell"
```

---

### Task 5: Controller แบบ real-time, Mock LIFF ที่ปลอดภัย และ responsive interaction

**ไฟล์:** สร้าง `line-flex-studio.mjs`, `tests/line-flex-studio-state.test.mjs`; แก้ `line-flex-json.mjs`, HTML/CSS และ regression tests ที่เกี่ยวข้อง

**Interfaces:** `createInitialStudioState`, `reduceStudioState`, `deriveStudioView`, `bindStudio`; controller ใช้ pure state และ DOM API ที่ปลอดภัย

- [ ] **Step 1: เขียน failing state tests** ตรวจ state เริ่มต้น, immutable field update, preset/language isolation, active block และ invalid draft ที่ต้องปิด Copy/Download/Run Journey
- [ ] **Step 2: รัน RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-studio-state.test.mjs
```

- [ ] **Step 3: สร้าง pure reducer/derived view** ตาม code listing ฉบับ EN ทุก field change ต้องล้าง transaction/receipt; derived view สร้าง message, formatted JSON, byte count, findings และ export/journey gates จาก error จริง
- [ ] **Step 4: เชื่อม risk-aware action** ให้ `actionFor` เรียก `selectActionMode`; high-risk draft ที่ขอ postback ต้อง export URI ไป demo LIFF แต่ validator ยังต้องแจ้ง `MON-ACT-001`
- [ ] **Step 5: Bind DOM อย่างปลอดภัย**

ต้อง render 5 presets/4 blocks/labelled fields/phone/JSON/findings, ใช้ `createElement`, `replaceChildren`, `textContent` เท่านั้น, update preview/JSON ทุก input โดยไม่สร้าง field control ใหม่จน focus หลุด, disable output เมื่อมี error, copy พร้อม failure message, download Blob แล้ว revoke URL, reset พร้อม confirmation, ใช้ ARIA state และสลับ copy ไทย/อังกฤษทั้งหมด โค้ด controller มาตรฐานและ field map อยู่ใน Task 5 ฉบับ EN

- [ ] **Step 6: สร้าง Mock LIFF และ receipt dialogs**

Run Journey ต้องสร้าง transaction จาก draft ปัจจุบัน แสดง tenant/recipient/project/revision/action/consequence/mode/expiry พร้อม `PRIVATE REVIEW — DEMO` ยืนยันได้จากปุ่ม explicit เท่านั้น ตรวจ current draft และ expiry ซ้ำแบบ fail closed แล้วสร้าง/แสดง receipt + digest พร้อม `DEMO — NOT A PRODUCTION SIGNATURE` ห้ามใช้ localStorage และคืน focus ให้ปุ่มต้นทาง

- [ ] **Step 7: เพิ่ม mobile pane tabs และ error recovery**

ที่ ≤720 px ใช้ Editor/Preview/JSON & Validation tablist โดย pane ทุกตัวอยู่ใน DOM, visibility คุมด้วย `hidden`, ARIA state ถูกต้อง; ที่กว้างกว่านั้นแสดงทุก pane First blocking error ต้องมี Fix button ที่เปิด block และ focus field ที่ถูกต้อง

- [ ] **Step 8: รัน focused/full tests**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-studio-state.test.mjs tests/line-flex-actions-receipt.test.mjs
npm.cmd --prefix LineOS run test
```

- [ ] **Step 9: เปิด local server และ smoke check**

```powershell
python -m http.server 4177 --directory LineOS
```

ตรวจ `http://localhost:4177/line-flex-studio.html`: approval preset ภาษาไทย, revision เปลี่ยน preview/JSON, alt text ว่างปิด output/journey, preset/language ไม่รั่วค่า, journey แสดง exact review/receipt และ network มีเฉพาะ localhost จากนั้นหยุด server

- [ ] **Step 10: Commit Task 5**

```powershell
git add -- LineOS/line-flex-studio.mjs LineOS/line-flex-json.mjs LineOS/line-flex-studio.html LineOS/line-flex-studio.css LineOS/tests/line-flex-studio-state.test.mjs LineOS/tests/line-flex-actions-receipt.test.mjs
git commit -m "feat(lineos): make Flex Studio interactive"
```

---

### Task 6: รายงาน Deep Research สองภาษาระดับคณะกรรมการ

**ไฟล์:** สร้าง `tests/docs-contract.test.mjs`, รายงาน `.en.md/.th.md` และ generate `.en.html/.th.html`

**Interfaces:** ใช้ approved design, หลักฐานจาก Git roots ทั้งสอง และ Perplexity Deep Research 3 tracks; technical claim ใช้ primary source และ local claim ต้องบอก Git root/ไฟล์

- [ ] **Step 1: เขียน failing docs contract** ตรวจว่ามีทั้ง 4 editions, HTML standalone/lang ถูกต้อง, คง `NO-GO for broader customer messaging`, ระบุ Daph เป็น pilot tenant หนึ่งราย และมี evidence labels `Official constraint`, `Verified local fact`, `Inference`, `Proposal`, `Unknown` พร้อม LINE, RFC 9700, NIST 800-207 และ WCAG 2.2 sources
- [ ] **Step 2: รัน RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs
```

- [ ] **Step 3: เขียนรายงานอังกฤษ และ Step 4: เขียนรายงานไทยที่ตรงกัน**

ทั้งสองฉบับต้องมี 20 ส่วน:

1. Board decision: broader customer messaging เป็น NO-GO; อนุมัติเฉพาะ local prototype แบบมีเงื่อนไข
2. วิธีวิจัย: Perplexity 3 tracks, local inspection, official verification, evidence labels
3. Current state สอง Git roots พร้อม dirty/non-production caveats
4. LINE Human Surface: OA 1:1, personal push, groups และข้อมูลใดต้องกลับ MONOLITH
5. Flex/LIFF: envelope, bubble 30 KB, carousel 50 KB/12 bubbles, alt/media/action limits และ LIFF ผ่าน URI
6. Developer Console/delivery lifecycle: channel/provider/LIFF, webhook, redelivery, retry, observability
7. Trust Kernel: tenant, principal, resource, revision, grants, delegation, risk, assurance และ PERMIT/DENY/STEP_UP/QUARANTINE
8. Gap ledger P0–P3
9. Threat model ครบ cross-tenant, forged/replay, forwarding, stale revision, unknown group actor, wrong audience, duplicate/unknown send, audit tamper, notification abuse
10. Human factors/ethical retention: quiet hours, fatigue, accessibility, recovery, portability, ห้าม dark patterns
11. Interior-design lifecycle ตั้งแต่ lead ถึง warranty/referral
12. Product/configuration matrix: base/wall/tall-larder/vanity/wardrobe/media/office/custom และมิติเป็น sourced parameters ไม่ใช่มาตรฐานเดียว
13. Materials/hardware/toolchain: provenance, appliances, CAD/BIM/CAM/CNC, survey, QA, installation evidence
14. Role scorecard ครบผู้บริหาร ฝ่ายขาย นักออกแบบ ถอดราคา จัดซื้อ โรงงาน QA ขนส่ง ติดตั้ง การเงิน partner ลูกค้า และลูกค้าของลูกค้า
15. Capability matrix: local evidence, gap, owner, dependency, risk, measurable outcome
16. KPI hypotheses โดยห้ามกล่าวเป็น baseline ที่พิสูจน์แล้ว
17. Roadmap: P0 Trust → bounded Daph pilot → 5 governed journeys → Tenant-2 shadow → controlled scale
18. Board go/no-go scorecard
19. Evidence ledger พร้อม URL/publisher/date/classification/claim/caveat
20. Limitations: ไม่มี deployment/real-machine/legal/universal-dimension/production-signature proof

ข้อสรุปต้องยืนยันว่า MONOLITH เป็น multi-tenant revision-controlled project/product operating system, LINE เป็น replaceable Human Surface, Daph เป็น pilot tenant หนึ่งราย และ broader messaging ยัง NO-GO จน Trust P0 ทุก gate ผ่านด้วยหลักฐานใหม่

- [ ] **Step 5: Render HTML**

```powershell
python tools\render_docs.py "LineOS\docs\research\2026-08-01-monolith-line-human-surface-deep-research.en.md" "LineOS\docs\research\2026-08-01-monolith-line-human-surface-deep-research.th.md"
```

- [ ] **Step 6: ตรวจ contract และ claim lint**

```powershell
npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs
python tools\lint_claims.py "LineOS\docs\research\2026-08-01-monolith-line-human-surface-deep-research.en.md" "LineOS\docs\research\2026-08-01-monolith-line-human-surface-deep-research.th.md"
```

- [ ] **Step 7: Commit Task 6**

```powershell
git add -- LineOS/tests/docs-contract.test.mjs LineOS/docs/research/2026-08-01-monolith-line-human-surface-deep-research.en.md LineOS/docs/research/2026-08-01-monolith-line-human-surface-deep-research.th.md LineOS/docs/research/2026-08-01-monolith-line-human-surface-deep-research.en.html LineOS/docs/research/2026-08-01-monolith-line-human-surface-deep-research.th.html
git commit -m "docs(lineos): add LINE Human Surface deep research"
```

---

### Task 7: คู่มือผู้ใช้ ติดตั้ง Action/LIFF และ performance สองภาษา

**ไฟล์:** สร้าง Markdown 8 ไฟล์, HTML 8 ไฟล์ใน `LineOS/docs/guides/`; แก้ docs contract

- [ ] **Step 1: เพิ่ม contract ก่อนสร้างคู่มือ** สำหรับ 4 stems ใน File map ทุก stem ต้องมี `.en.md/.th.md/.en.html/.th.html` Installation guide ต้องมี `Flex Message Simulator`, `Messaging API`, `Use webhook`, `Webhook redelivery`, `LIFF`, `state`, `nonce`, `no production token` และประโยค `Flex JSON is not installed in Developer Console`
- [ ] **Step 2: รัน RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs
```

- [ ] **Step 3: คู่มือ Flex Studio** ครบ purpose/safety, quick start, console map, 5 presets, Header/Hero/Body/Footer, widths/wrapping, JSON gates, severity/source, Mock LIFF, demo receipt, keyboard, clear state, troubleshooting และยืนยันว่าไม่มี message/business-state change
- [ ] **Step 4: คู่มือติดตั้ง Developer Console** ตามลำดับที่ถูกต้อง:

1. Business ID + LINE OA;
2. เปิด Messaging API ใน OA Manager;
3. เลือก provider และใช้ provider เดียวกันเมื่อ user ID ต้อง align ระหว่าง Messaging API กับ LINE Login/LIFF;
4. ยืนยัน channel ID;
5. เก็บ channel secret/token เป็น production secrets;
6. ตั้ง HTTPS webhook, Verify, ตอบ empty-event ด้วย HTTP 200, เปิด Use webhook, Webhook redelivery, error statistics;
7. สร้าง LINE Login channel;
8. เพิ่ม LIFF app จาก LIFF tab;
9. ตั้งชื่อ/Compact-Tall-Full/HTTPS endpoint ไม่มี fragment/least scopes;
10. ใช้ `openid`, `profile`, `chat_message.write` เท่าที่จำเป็น;
11. แยก LIFF ID/URL ตาม environment;
12. ตรวจ server-side state/nonce, exact redirect URI, expiry, one-time consumption ก่อน bind identity;
13. ปุ่ม Flex ใช้ URI เปิด LIFF เพราะ LIFF ไม่ใช่ Flex action type แยก;
14. วาง JSON ใน official Flex Message Simulator เพื่อ prototype ไม่ใช่ “ติดตั้ง JSON” ใน Developer Console;
15. ทดสอบ real LINE clients/fallbacks;
16. ปิด live customer delivery จน Trust P0 ผ่าน;
17. มี rollback ที่หยุด webhook/entry point/workers แต่รักษา audit/evidence

ใช้ภาพ official UI เฉพาะที่จับจากหน้าจอปัจจุบันจริง ระบุวันที่ และปิดบัง identifier/secret ห้ามใช้ภาพ console จำลอง

- [ ] **Step 5: คู่มือ Action vs LIFF**

| ความต้องการ | Action |
|---|---|
| ข้อความสนทนาที่เห็นในแชต | Message |
| ตัวเลือก low-risk/reversible และ server reauthorize | Postback พร้อม opaque intent ID |
| เว็บ/tel/LINE scheme แบบ read-only | URI |
| Form, identity, sensitive detail, comparison, explicit confirmation | URI เปิด LIFF |
| Money/access/release/policy/scope/hard-to-reverse | LIFF + MONOLITH step-up |

ต้องมีตัวอย่างครบ 5 presets, duplicate/replay behavior, อธิบายว่า webhook signature พิสูจน์ transport ไม่ใช่ authorization และห้ามใส่ tenant/amount/role ใน postback, ใช้ free-text เป็น order truth, one-tap approval, bearer token ใน URL หรือถือ group membership เป็น permission

- [ ] **Step 6: Performance/rendering checklist** ครบ bubble 30 KB, carousel 50 KB/12 bubbles, alt 1,500, HTTPS JPEG/PNG 1024×1024/10 MB, MONOLITH soft budget 24 KB, no base64/remote font/third-party runtime, local vs export hero, 320/360/390, ไทย/อังกฤษ/emoji/ชื่อยาว/large font, cover safe area, text outside image, shallow layout/wrap/no fixed height, CTA clarity, keyboard/focus/contrast/semantics/reduced motion, real-device matrix, future CDN guidance และ failure handling สำหรับ image/API 4xx/429/5xx/duplicate/unknown-after-send
- [ ] **Step 7: Render 8 HTML files**

```powershell
$guideFiles = Get-ChildItem -LiteralPath "LineOS\docs\guides" -Filter "*.md" -File | Select-Object -ExpandProperty FullName
python tools\render_docs.py $guideFiles
```

- [ ] **Step 8: ตรวจ docs/claims**

```powershell
npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs
python tools\lint_claims.py LineOS\docs\guides
```

- [ ] **Step 9: Commit Task 7**

```powershell
git add -- LineOS/tests/docs-contract.test.mjs LineOS/docs/guides
git commit -m "docs(lineos): add Flex and LIFF operating guides"
```

---

### Task 8: ความสอดคล้องข้ามเอกสาร, standalone HTML และ claim verification

**ไฟล์:** แก้ `tests/docs-contract.test.mjs`; regenerate Markdown companions ใต้ `LineOS/docs/`

- [ ] **Step 1: เพิ่ม integrity tests** ตรวจคำค้าง `TBD/TODO/FIXME/implement later/fill in details`, Unicode replacement character, HTML doctype/viewport/lang, คู่ TH/EN และห้ามสรุปว่า source presence หรือ test presence เท่ากับ production readiness
- [ ] **Step 2: พิสูจน์ missing-companion RED และ restore แบบ fail-safe**

```powershell
$source = "LineOS\docs\guides\line-developer-console-installation.en.html"
$held = "LineOS\docs\guides\line-developer-console-installation.en.html.hold"
Move-Item -LiteralPath $source -Destination $held
try {
  npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs
  if ($LASTEXITCODE -eq 0) { throw "Expected the missing-companion contract to fail" }
}
finally {
  Move-Item -LiteralPath $held -Destination $source
}
npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs
if ($LASTEXITCODE -ne 0) { throw "Document contract did not recover after restoration" }
```

- [ ] **Step 3: Regenerate HTML ทั้งหมด**

```powershell
$docFiles = Get-ChildItem -LiteralPath "LineOS\docs" -Recurse -Filter "*.md" -File | Select-Object -ExpandProperty FullName
python tools\render_docs.py $docFiles
```

- [ ] **Step 4: ตรวจเอกสารทั้งหมด**

```powershell
npm.cmd --prefix LineOS run test:contracts
python tools\lint_claims.py LineOS\docs
git diff --check -- LineOS
```

คาดหวัง: contracts PASS, claim lint exit 0, diff check ไม่มี output

- [ ] **Step 5: Commit Task 8**

```powershell
git add -- LineOS/tests/docs-contract.test.mjs LineOS/docs
git commit -m "test(lineos): enforce bilingual document contracts"
```

---

### Task 9: Browser evidence, final verification และ implementation report สองภาษา

**ไฟล์:** สร้าง `desktop-1440.png`, `mobile-390.png`, `verification-summary.json`, implementation report `.en.md/.th.md/.en.html/.th.html`; แก้ docs contract

- [ ] **Step 1: เพิ่ม report contract** บังคับ 4 editions และหัวข้อ scope, commits, automated tests, browser checks, network evidence, acceptance gates, residual risk, NO-GO และ next decision
- [ ] **Step 2: รัน RED**
- [ ] **Step 3: รัน automated suite พร้อม output สดที่ไม่ถูกตัด**

```powershell
npm.cmd --prefix LineOS run test
```

คาดหวัง: ทุก suite PASS, 0 failures; output ที่ถูกตัดไม่ถือเป็น PASS evidence

- [ ] **Step 4: เปิด static server**

```powershell
python -m http.server 4177 --directory LineOS
```

ใช้ `http://localhost:4177/line-flex-studio.html` ไม่ใช้ file URL

- [ ] **Step 5: ตรวจ 5 journeys ทั้งไทย/อังกฤษ**

ทุก preset ต้องเลือก → ตรวจ local hero/tenant/audience/action → แก้อย่างน้อยหนึ่ง field ใน Header/Hero/Body/Footer → ตรวจ preview/JSON/validation → ทำ error และแก้ → copy/download → run journey → ตรวจ exact-action review → confirm/receipt → สลับภาษาและตรวจไม่รั่วค่า สำหรับ design approval ให้เปลี่ยน revision หลังเปิด Mock LIFF แล้วต้อง fail closed

- [ ] **Step 6: ตรวจ responsive/accessibility/network** ที่ 1440, 1024, 768, 390, 360, 320; keyboard-only, focus, dialog focus return, reduced motion, Thai/English long text, emoji, hero-load failure fallback, ค่า horizontal page overflow ต้องเท่ากับ 0 และ request log ต้องมีเฉพาะ localhost จับภาพ `desktop-1440.png` กับ `mobile-390.png` ตอน approval preset valid ก่อน confirm
- [ ] **Step 7: สร้าง machine-readable evidence จากค่าที่ตรวจจริงเท่านั้น**

```powershell
Get-Date -AsUTC -Format "o"
git rev-parse HEAD
git branch --show-current
node --version
```

`verification-summary.json` ต้องมี schemaVersion 1, UTC time, parent commit 40 ตัว, branch, Node/browser version, served URL, test command/exitCode/pass count/failures, presets 5, languages `["th","en"]`, widths `[1440,1024,768,390,360,320]`, externalRequests 0, acceptanceGates 10 รายการที่ status PASS พร้อม evidence จริง, `liveLineMessageSent:false`, `productionSignatureCreated:false`, `broaderCustomerMessagingDecision:"NO-GO_PENDING_TRUST_P0"` Contract ต้อง reject hash/browser/test count/gate/evidence ที่ไม่สมบูรณ์

- [ ] **Step 8: เขียน implementation reports ที่ตรงกัน** ระบุ parent/nested commits, dirty-tree caveat, files in scope, test counts, browser matrix/screenshots, external requests, gate evidence, สิ่งที่ไม่ได้ทดสอบ, residual risks, NO-GO จน Trust P0 ผ่าน และ next decision ระหว่างเก็บ standalone prototype หรือเริ่ม sandbox-integration design cycle ใหม่
- [ ] **Step 9: Render และตรวจทั้งหมดซ้ำ**

```powershell
python tools\render_docs.py "LineOS\docs\reports\2026-08-01-line-flex-studio-implementation-report.en.md" "LineOS\docs\reports\2026-08-01-line-flex-studio-implementation-report.th.md"
npm.cmd --prefix LineOS run test
python tools\lint_claims.py LineOS\docs
git diff --check -- LineOS
```

- [ ] **Step 10: หยุดเฉพาะ server ที่ตรวจแล้วและ commit**

```powershell
git add -- LineOS/artifacts/line-flex-studio LineOS/docs/reports LineOS/tests/docs-contract.test.mjs
git commit -m "docs(lineos): record Flex Studio verification evidence"
```

- [ ] **Step 11: Final post-commit gate**

```powershell
npm.cmd --prefix LineOS run test
git status --short --branch
git log -10 --oneline --decorate
```

คาดหวัง: tests PASS พร้อม summary ครบ, status รักษางานเดิมนอก scope และเห็น Task commits ล่าสุด ห้ามเรียก repository ว่า clean ถ้า status จริงไม่ clean

---

## Checklist ตรวจแผนก่อนดำเนินงาน

- [ ] ทุก requirement ใน approved design map ไปอย่างน้อยหนึ่ง Task
- [ ] ทุกไฟล์อยู่ใต้ `LineOS/`
- [ ] ไม่มี Task แก้ nested product repository
- [ ] ทุก production module มี failing test ก่อน implementation
- [ ] บังคับคู่ Thai/English Markdown/HTML
- [ ] Flex action vs LIFF ถูกทดสอบ ไม่ใช่เพียงเขียนคู่มือ
- [ ] ถ้อยคำ receipt ไม่ทำให้เข้าใจว่าเป็น production signature
- [ ] ไม่มี external network หรือ live-send path
- [ ] Browser evidence ครบ 5 presets, 2 ภาษา, 6 widths
- [ ] Final report คง Trust P0 NO-GO

## การส่งต่อเพื่อดำเนินงาน

แผนเสร็จสมบูรณ์ มีสองทางเลือก:

1. **Subagent-Driven** — มอบแต่ละ Task ให้ agent ใหม่และมี review gate ระหว่าง Task ใช้ได้เมื่อผู้ใช้อนุญาต subagents โดยชัดแจ้งเท่านั้น
2. **Inline Execution** — ดำเนินแผนใน session ปัจจุบันด้วย superpowers:executing-plans และ checkpoints ที่ชัดเจน

ห้ามเริ่ม implementation จนกว่าผู้ใช้จะเลือกวิธีดำเนินงาน
