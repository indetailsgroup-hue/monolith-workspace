# MONOLITH LINE Design Approval Port A1 — ข้อกำหนดการออกแบบ

- **ฉบับ:** ภาษาไทย
- **วันที่ออกแบบ:** 2 สิงหาคม 2026
- **สถานะ:** อนุมัติ Design แล้ว; written specification รอเจ้าของอนุมัติ
- **ประสบการณ์ที่อนุมัติ:** A — Trust Concierge
- **First slice ที่อนุมัติ:** Design Approval
- **ระดับ adapter ที่อนุมัติ:** A1 — Local sandbox product adapter
- **เจ้าของการตัดสินใจ:** เจ้าของ MONOLITH

> **มติการออกแบบ:** ให้ LINE เป็น Human Surface ตามธรรมชาติ โดยใช้ use-case boundary ชื่อ `DesignApprovalPort` ที่มีขอบเขตแคบ
>
> A1 พิสูจน์ contract สำหรับการตรวจแบบ, stale revision, idempotency และ receipt ด้วย sandbox adapter ที่ประกาศ `businessEffect: none` ส่วน generic integration gateway, workflow source of truth ชุดที่สอง, production tenant claim, การเชื่อม LIFF จริง, workflow mutation และ signed receipt อยู่นอกขอบเขต

## 1. มติสำหรับผู้บริหาร

ผลลัพธ์ A1 ที่อนุมัติคือ:

> **Human Surface contract-ready with sandbox adapter — ยังไม่เชื่อมต่อ MONOLITH runtime**

Journey แรกคือ:

`แบบพร้อมตรวจ -> เปิด private review -> ตรวจ revision ที่ผูกไว้ -> ยืนยัน sandbox attempt -> รับ Sandbox Verification Record — Demo · No Business Effect`

ระยะนี้ตั้งใจให้เล็กกว่าการเชื่อม runtime โดยพิสูจน์ client-side port, state machine, failure semantics, display provenance และ contract tests ที่จำเป็น ก่อนอนุญาต Local Supabase หรือ deployed LIFF adapter

## 2. ปัญหาและหลักการผลิตภัณฑ์

MONOLITH ใช้ LINE ในสามเส้นทางการสื่อสารตามธรรมชาติ:

1. LINE OA แบบ 1:1 สำหรับรับ lead, คุยขาย, ผูกตัวตนลูกค้า, ส่งเอกสาร, ขออนุมัติ และรับ order แบบมีโครงสร้าง;
2. LINE Push ส่วนบุคคลสำหรับแจ้งงาน, เตือน SLA, ขออนุมัติ และ escalation;
3. LINE Groups สำหรับสื่อสารหน้างาน, เก็บหลักฐาน, รับแจ้งปัญหา และส่งข้อมูลที่คัดแล้วให้ลูกค้า

หลักการควบคุมคือ:

> หน้าบ้านใช้ LINE ตามธรรมชาติได้ แต่ผลทางธุรกิจจริงทุกอย่างต้องกลับเข้าสู่ฐานข้อมูล, workflow, permission และ audit ที่มีอำนาจของ MONOLITH

A1 ไม่สร้างผลทางธุรกิจจริง จึงต้องระบุตัวเองว่าเป็น sandbox ในทุกจุดที่มีนัยสำคัญ และห้ามทำให้เข้าใจว่า workflow state ของ MONOLITH เปลี่ยนแล้ว

## 3. Evidence baseline และการแยก repository

ข้อสรุป current state ทั้งหมดในเอกสารนี้แยก Git roots สองชุดอย่างชัดเจน

| Git root | บทบาทของหลักฐาน | Snapshot ตอนออกแบบ | ขอบเขตข้อสรุป |
|---|---|---|---|
| `C:\Users\thai3\determined-williams (2)` | Governance/bootstrap root และ standalone LineOS Human Surface prototype ปัจจุบัน | `guardrails/claim-linters` / `f0753224b4e2f62df67347e08aa5063284b1a9ff` | รองรับข้อสรุปเรื่อง Flex Studio, mock review, demo receipt, เอกสาร และ design นี้เท่านั้น |
| `C:\Users\thai3\determined-williams (2)\determined-williams` | MONOLITH TypeScript/React/Supabase product repository ที่ใช้งานพัฒนาอยู่ | `fix/dxf-truth-chain` / `a1e9006add32fe3ce5346eb6ca94e8bdce1d13ab` | รองรับข้อสรุปเรื่อง product identity, LIFF gatekeeper, workflow, RLS, approval RPC, audit, lineage และ trust components |

ทั้งสอง worktrees มีการเปลี่ยนแปลงเดิมหรือ concurrent work อยู่ Targeted status checks คืนสถานะ clean สำหรับไฟล์ LineOS Flex และ nested design-view/approval ที่ตรวจ ส่วน nested worktree มีงานเดิมที่ไม่เกี่ยวข้อง เช่น `supabase/functions/_shared/order-adapter.ts`, `tests/line-oa-commerce/ts/orderNormalization.property.test.ts`, generated `dist` assets และ cache files การทำ A1 ต้องรักษาเส้นทางเหล่านั้นไว้นอก scope

Repository-scope correction วันที่ 21 กรกฎาคม 2026 ยังคงเป็นหลักควบคุม: nested repository มี implementation ของผลิตภัณฑ์จำนวนมาก แต่ยังไม่พิสูจน์ production readiness และ canonical platform-tenant boundary โดย migrations ปัจจุบันใช้ site scope; `site_code` ไม่ใช่ tenant โดยอัตโนมัติ

## 4. Substrate ที่ตรวจพบแล้ว

### 4.1 Parent Human Surface

Standalone LineOS prototype ปัจจุบันทำงานเฉพาะ local ตามเส้นทางนี้:

`preset -> editor -> validator -> Flex JSON -> risk routing -> mock private review -> demo transaction -> Verification Receipt — Demo`

หลักฐานสำคัญได้แก่:

- `LineOS/line-flex-studio.html` — Studio และ mock dialogs แบบ standalone;
- `LineOS/line-flex-studio.mjs` — state, preview, review journey และการแสดง receipt;
- `LineOS/line-flex-actions.mjs` — browser-local transaction binding และ expiry checks;
- `LineOS/line-flex-receipt.mjs` — SHA-256 demo digest ที่ระบุชัดว่าไม่ใช่ production;
- `LineOS/line-flex-presets.mjs` — ค่าสาธิตที่แก้ไขได้ ไม่ใช่ product authority

Prototype ปัจจุบันยังไม่เชื่อม LINE SDK, MONOLITH API, Supabase, workflow หรือ product audit

### 4.2 Nested MONOLITH product

Nested product มี substrate ที่การเชื่อมในอนาคตต้องนำกลับมาใช้แทนการสร้างใหม่:

- `supabase/functions/customer-design-view/index.ts` ตรวจ LIFF ID token, resolve canonical customer identity และเรียก server-side allowlist RPC;
- `supabase/migrations/0026_customer_sla_and_design_view.sql` จำกัด customer view ให้เฉพาะ work item ที่ตรงกัน, safe design artifacts และ pending customer approvals;
- `supabase/functions/approval-postback/index.ts` จัดการ transport ของ signed LINE webhook approval;
- `supabase/migrations/0031_order_keyed_process_model.sql` มี approval decision logic ปัจจุบัน, authorization, optimistic locking, idempotency, quorum effects และ audit writes;
- `supabase/migrations/0003_workflow_audit_immutability.sql` บังคับ workflow audit ให้ append-only;
- `src/core/lineage/lineageTypes.ts` กำหนด revision identity ด้วย content hash แต่ lineage writer ที่ตรวจพบยังบันทึก JSONL ใน browser จึงไม่ใช่ server authority

การมี source ไม่ได้พิสูจน์ hosted deployment, migration state ปัจจุบัน, live tenant isolation หรือ production qualification

## 5. ผล scrutinize และทางเลือกที่อนุมัติ

ข้อเสนอแรกสร้าง generic MONOLITH Integration Gateway แต่การ scrutinize แบบ end-to-end ปฏิเสธรูปแบบนี้สำหรับ A1 เพราะซ้ำกับ LIFF gatekeeper ที่มีอยู่ และสร้าง identity/trust boundary ชุดที่สอง

พิจารณาสามแนวทาง:

| แนวทาง | ผลลัพธ์ | มติ |
|---|---|---|
| Generic integration gateway | abstraction กว้างครอบคลุม identity, project, workflow, audit และ receipt | ปฏิเสธ: ซ้ำกับ product boundary เดิมและใหญ่เกิน first slice |
| Direct Local Supabase integration | ทดสอบ schema, RLS, RPC และ Edge Functions จริง | เลื่อนไป A2: มีคุณค่าเมื่อปิด revision/tenancy decisions และมี database contract tests แล้ว |
| `DesignApprovalPort` แบบแคบพร้อม sandbox adapter | พิสูจน์ Human Surface contract โดยไม่แก้ product state | **อนุมัติสำหรับ A1** |

สถาปัตยกรรมที่เล็กกว่าซึ่งอนุมัติคือ:

`Flex liff_uri พร้อม opaque review token -> private review UI -> DesignApprovalPort -> A1 sandbox adapter`

Target mapping สำหรับ production ในอนาคตคือ:

`DesignApprovalPort -> customer-design-view identity/read path เดิม -> LIFF confirmation transport แบบเฉพาะงาน -> customer approval RPC + workflow audit เดิม`

Production mapping เป็น design target ไม่ใช่ขอบเขต implementation ของ A1

## 6. Architecture และเส้นแบ่งความรับผิดชอบ

### 6.1 ความรับผิดชอบของ Human Surface

LineOS ทำได้ดังนี้:

- render Flex Message และ Trust Concierge review experience ที่อนุมัติ;
- พา opaque, single-purpose review token;
- แสดง review snapshot ที่ server หรือ adapter เป็นเจ้าของ;
- ส่งคืน server-issued idempotency key ตอนยืนยัน;
- แสดง bounded outcomes และ sandbox record

LineOS ห้ามกำหนดสิ่งต่อไปนี้อย่างมีอำนาจ:

- tenant, organization, site, customer identity, actor, role หรือ permission;
- work-item ownership หรือ approval-request eligibility;
- canonical revision identity, artifact manifest digest หรือ workflow version;
- approval outcome, audit status, signature status หรือ business effect

### 6.2 ความรับผิดชอบของผลิตภัณฑ์

MONOLITH product ยังคงเป็นเจ้าของ identity resolution, scope authorization, revision authority, workflow state, idempotency, audit, signing, revocation และ delivery จริงทั้งหมดในอนาคต A1 ไม่ implement ผลของผลิตภัณฑ์เหล่านั้น

### 6.3 ไม่สร้าง generic gateway ใหม่

`DesignApprovalPort` เป็น use-case boundary ไม่ใช่ enterprise gateway ใหม่ โดยเปิดเพียงสอง operations ที่ journey นี้ต้องใช้ LINE Push, Groups, orders, SLA acknowledgement และ presets อื่นห้ามผ่าน port นี้หากยังไม่ได้ออกแบบและอนุมัติแยก

## 7. A1 port contract

### 7.1 `openReview(reviewToken)`

Adapter เป็นเจ้าของ identity context ภายใน UI components ไม่ได้รับหรือจัดการ LINE ID token ใน A1

`ReviewSnapshot` ที่คืนมาต้องมี:

- `reviewSessionId` — opaque และอายุสั้น;
- `serverIssuedIdempotencyKey` — ผูกกับ session และ action นี้;
- `mode: sandbox`;
- `businessEffect: none`;
- `providerContext` — display provenance ไม่ใช่ tenant assertion;
- `workItemRef` และ `approvalRequestRef` — opaque sandbox references;
- `revisionLabel`;
- `revisionId` — content hash ที่ adapter เป็นเจ้าของ;
- `artifactManifestSha256`;
- `digestAlgorithm` และ `canonicalizationVersion`;
- `expectedWorkflowVersion`;
- review artifacts ที่ผ่าน allowlist เท่านั้น;
- requested canonical action และผลกระทบภาษาคน;
- `issuedAt` และ `expiresAt`

Flex body เป็นเพียง invitation และ display content A1 ห้ามใช้ project, revision, recipient หรือ tenant-like fields ที่แก้ไขได้เป็น authority

### 7.2 `confirmReview(input)`

UI ส่งคืนเฉพาะ:

- `reviewSessionId`;
- `serverIssuedIdempotencyKey`;
- `expectedRevisionId`;
- `decision: confirm`

UI ห้ามส่ง tenant, customer identity, role, project owner, authoritative approval status หรือ effect mode ที่ caller เลือกเอง

### 7.3 Outcomes

A1 คืนได้เฉพาะ:

- `sandbox_recorded`;
- `sandbox_replayed`;
- `expired`;
- `stale_revision`;
- `version_conflict`;
- `idempotency_conflict`;
- `unauthorized`;
- `not_available`;
- `invalid_request`;
- `temporarily_unavailable`

ห้ามคืน `approved`, `signed`, `audited` หรือ production claim ที่มีความหมายเทียบเท่า

## 8. State machine และ idempotency

State sequence ที่อนุญาตคือ:

`issued -> opened -> sandbox_recorded -> demo_record`

Alternate terminal states คือ:

- `expired` เมื่อเกิน TTL;
- `stale_revision` เมื่อ revision ที่ผูกไว้เปลี่ยน;
- `version_conflict` เมื่อ workflow snapshot เปลี่ยนพร้อมกัน;
- `cancelled` เมื่อผู้ใช้ออกโดยไม่ยืนยัน;
- `not_available` หรือ `unauthorized` เมื่อเปิดเผย bounded review ไม่ได้

กติกา idempotency คือ:

1. adapter เป็นผู้ออก key; browser ไม่เป็นผู้เลือก;
2. key เดิมและ canonical payload เดิมต้องคืน record เดิมภายใน A1 session;
3. key เดิมแต่ payload ต่างกันต้องคืน `idempotency_conflict`;
4. double-click และ concurrent calls สร้าง sandbox ledger entry เดียว;
5. ความล้มเหลวที่ยังไม่ได้บันทึก entry retry ด้วย key เดิมได้;
6. การ disable ปุ่มเป็นเพียง UX; adapter เป็นเจ้าของ duplicate suppression

เพราะ A1 ledger เป็น session-only การรับประกัน replay ไม่คงอยู่หลัง browser restart UI และ evidence ต้องเปิดเผยข้อจำกัดนี้

## 9. Revision integrity contract

A1 ผูก review session กับ:

- approval request reference;
- work item reference;
- revision ID;
- artifact manifest SHA-256;
- expected workflow version;
- canonical action และ consequence;
- issue/expiry timestamps;
- canonicalization version

ก่อนบันทึก confirmation adapter ต้องตรวจ bound snapshot ใหม่ หากค่าใดไม่ตรงต้อง fail closed

Contract นี้ยังไม่กำหนด production revision source โดย project schema ปัจจุบันมี version และ timestamps แต่ customer design-view response ยังไม่มี canonical server revision digest ส่วน product lineage types กำหนด content-hash identity แต่ writer ที่ตรวจพบเป็น browser-local A2 จึงถูก block จนกว่าเจ้าของจะอนุมัติ server-owned revision source และ persistence path

## 10. Identity, tenancy และ security rules

### 10.1 A1 identity

A1 ใช้ `SandboxIdentityFixture` ที่ adapter เลือก UI แก้ไขไม่ได้ Journey ต้องแสดง `SANDBOX — NO BUSINESS EFFECT` ในทุกขั้นที่มีนัยสำคัญ

### 10.2 Future LIFF identity

Adapter ในอนาคตอาจรับ LINE ID token จาก LIFF runtime และส่งตรงไป existing server-side verification boundary โดย UI components, browser logs, receipt fields, analytics, URLs และ persistent storage ห้ามมี token

Server ต้อง verify identity และ authorization ใหม่ทั้งตอน open และ confirm การ open สำเร็จไม่ถือเป็นอำนาจให้ confirm ภายหลังโดยอัตโนมัติ

### 10.3 Tenant boundary

A1 กำหนด contextual provenance ด้วย `providerContext` หรือ `scopeContext` ส่วน tenant assertion อยู่นอก scope ของ A1 Daph และ site ทุกแห่งจึงคงสถานะ unverified ในมิติ platform tenant การเท่ากับ `site_code = tenant` และการเพิ่ม `tenant_id` ต้องรอ tenant–organization–site mapping, migration, RLS, uniqueness, key, export, deletion และ denial-test contract ที่อนุมัติแยก

### 10.4 Threats ที่ต้อง fail closed

Design ครอบคลุมอย่างชัดเจน:

- client-field tampering;
- object-reference enumeration;
- token leakage;
- replay และ double submission;
- stale revision และ concurrent workflow updates;
- cross-customer หรือ cross-scope disclosure;
- receipt confusion และ false production authority;
- raw internal errors หรือ secrets หลุดไป LINE

## 11. Failure และ disclosure contract

| เงื่อนไข | Contract result | UX ที่ต้องทำ |
|---|---|---|
| Session หมดอายุ | `expired` | ปิด confirmation และเริ่ม review ใหม่ |
| Revision เปลี่ยน | `stale_revision` | โหลด revision ล่าสุด; ห้าม confirm snapshot เดิม |
| Workflow version เปลี่ยน | `version_conflict` | Refresh สถานะปัจจุบัน |
| Key เดิมแต่ payload ต่างกัน | `idempotency_conflict` | ปฏิเสธและแสดง correlation ID |
| Identity หรือ permission ไม่ผ่าน | `unauthorized` | แสดง unavailable message กลาง; ไม่เปิด internal identifiers |
| Resource lookup miss / อยู่ใน scope ของลูกค้าคนอื่น | `not_available` | ใช้ข้อความกลางเดียวกันเพื่อกัน enumeration |
| ระบบขัดข้องชั่วคราว | `temporarily_unavailable` | Retry ด้วย adapter-issued key เดิม |

ห้ามส่ง raw SQL error, stack trace, internal role, customer ID, secret, token หรือ implementation detail ไป LINE หรือแสดงใน receipt

## 12. Sandbox ledger และ receipt semantics

### 12.1 Sandbox ledger

A1 ใช้ session-only component ชื่อ `SandboxAttemptLedger` โดยจัด product database effect และ MONOLITH audit authority ไว้นอก A1 Tests inject deterministic store เพื่อพิสูจน์ idempotency และ concurrency ได้ Reload หรือ restart อาจล้าง ledger และ UI ต้องแจ้ง

### 12.2 ชื่อ record

ใช้ชื่อตายตัว:

> **Sandbox Verification Record — Demo · No Business Effect**

### 12.3 Fields ที่ต้องมี

- `recordVersion`;
- `mode: sandbox`;
- `businessEffect: none`;
- `recordId` และ `correlationId`;
- `reviewSessionId`;
- provider/scope context;
- work item และ approval request references;
- revision label, revision ID และ artifact manifest digest;
- requested canonical action;
- outcome;
- created/confirmed timestamps;
- digest algorithm และ canonicalization version;
- record digest

### 12.4 Fields และ claims ที่ห้ามมี

Record ห้ามมีหรือทำให้เข้าใจว่าเป็น:

- `approved` หรือ workflow result ความหมายเทียบเท่า;
- cryptographic signature, `keyId` หรือ verified-signer status;
- tenant assertion;
- production audit completion;
- LINE token, secret หรือ personal data ที่ไม่จำเป็น

Digest เป็น integrity metadata ไม่ใช่ signature ส่วน Production Signed Receipt เป็น artifact คนละชนิดในอนาคตซึ่งต้องผ่าน Trust Kernel, key custody, verification, revocation และ audit requirements

## 13. Trust Concierge experience

Visual direction ที่อนุมัติคืออบอุ่น พรีเมียม และน่าเชื่อถือ Journey ต้อง:

1. ใช้ Design Approval Flex preset และ primary `liff_uri` action;
2. เปิด private review แทนการแก้ business state จากปุ่ม Flex;
3. แสดง provider provenance, project display name, revision, artifact digest, consequence และ expiry;
4. แสดง sandbox warning ต่อเนื่องและเด่นชัด;
5. confirm เฉพาะ sandbox attempt;
6. render bounded sandbox record;
7. อธิบายว่า workflow และ approval status ไม่เปลี่ยน

Premium styling ต้องไม่ลด ซ่อน ทำให้คลุมเครือ หรือทำให้ no-business-effect disclosure เด่นน้อยลง

## 14. Repository และ delivery boundary

| พื้นที่ | การทำงาน A1 |
|---|---|
| Parent `LineOS/` | เพิ่ม port contract, sandbox adapter, review integration, record rendering และ tests |
| Nested MONOLITH source | ใช้เป็น evidence และ future mapping เท่านั้น; A1 ไม่แก้ production runtime หรือ migrations |
| Local Supabase | ยังไม่เริ่มใน A1 |
| LINE Platform | ไม่เรียก live API, credential, webhook, push, LIFF deployment หรือส่งข้อความ |

Implementation plan ของ A1 ต้องกำหนดไฟล์อย่างชัดเจนหลัง written specification นี้ได้รับอนุมัติ ต้องรักษาการเปลี่ยนแปลงที่ไม่เกี่ยวข้องทั้งหมด และห้ามแตะ existing nested order-adapter lane

## 15. Verification และ acceptance criteria

A1 ยอมรับได้เมื่อมี fresh evidence พิสูจน์ว่า:

- Design Approval Flex action ใช้ `liff_uri`;
- Flex payload ไม่มี token, tenant authority หรือ internal secret;
- UI controls แก้ identity, revision digest, idempotency key หรือ effect mode ไม่ได้;
- revision เปลี่ยนระหว่าง open และ confirm แล้วถูกปฏิเสธ;
- expired session ถูกปฏิเสธ;
- key/payload เดิมคืน record เดิมภายใน session;
- key เดิมแต่ payload ต่างกันคืน `idempotency_conflict`;
- double-click และ concurrent confirmation ได้ ledger record เดียว;
- forbidden-field scanner ปฏิเสธ `approved`, signature, key ID, tenant assertion และ audit-complete claim;
- A1 ไม่สร้าง external network request;
- browser storage และ logs ไม่มี token หรือ secret;
- Journey ภาษาไทย/อังกฤษ desktop/mobile/keyboard ทำงาน;
- ไม่มี browser console หรือ page error;
- Flex Studio tests เดิมผ่านทั้งหมด;
- unit, contract, state-machine, negative และ browser tests ใหม่ผ่าน;
- claim lint และ placeholder/secret scans ผ่าน;
- specification สี่ไฟล์สองภาษาตรงกันและเปิดอ่าน standalone ได้;
- nested product worktree ไม่มี A1 diff ใหม่

Production work ในอนาคตต้องมี database integration tests เพิ่มสำหรับ customer-design-view allowlisting, cross-customer denial, not-found non-disclosure, stale revision, optimistic locking, idempotency, concurrent confirmation, audit completeness และ forbidden-artifact leakage

## 16. Promotion gate ไป A2 — Local Supabase

A2 ต้องได้รับอนุมัติแยกจากเจ้าของ และเริ่มได้เมื่อ:

1. A1 contract และ browser evidence ผ่าน;
2. canonical server-owned revision source ได้รับอนุมัติ;
3. tenant–organization–site mapping ได้รับอนุมัติ หรือ slice ถูกจำกัดอย่างชัดเจนด้วย non-tenant scope model;
4. customer-design-view database contract tests มีและผ่าน local;
5. narrow LIFF confirmation transport design ผ่าน security review;
6. rollback, idempotency, audit และ error semantics ถูกพิสูจน์;
7. local environment และ secret-handling authority ได้รับอนุมัติ

A2 ต้อง reuse design-view และ customer approval substrate เดิม ห้ามนำ generic gateway ที่ถูกปฏิเสธกลับมา

## 17. Non-goals

A1 ไม่รวม:

- LINE Login หรือ real LIFF SDK initialization;
- LINE webhook, push, group messaging หรือ live send;
- Local/hosted Supabase mutation;
- product workflow transition;
- product intent table ใหม่;
- production tenant-isolation claim;
- cryptographic signing หรือ Production Signed Receipt;
- deployment, production credentials, merge, push, PR หรือ release authorization

## 18. Implementation sequence หลัง written-spec approval

หลังเจ้าของอนุมัติ written specification นี้ จะสร้าง detailed implementation plan แยกเพื่อ:

1. freeze fresh two-root status และ exact file scope;
2. กำหนด contract schemas และ forbidden-field tests;
3. implement sandbox adapter แบบ test-first;
4. เชื่อม port เข้ากับ Design Approval journey;
5. เปลี่ยนถ้อยคำ demo receipt ที่กำกวมเป็น sandbox record semantics ที่อนุมัติ;
6. เพิ่ม state, idempotency, stale-revision, failure, accessibility และ browser tests;
7. อัปเดตเอกสาร user-facing TH/EN และ HTML ให้ตรงกัน;
8. รัน full LineOS verification, claim lint, secret scans, browser evidence และ exact diff checks;
9. ทำ code review และ final whole-range scrutiny;
10. จัดทำ bounded implementation report

Written-spec document นี้เพียงอย่างเดียวยังไม่อนุญาต implementation code จนกว่าเจ้าของจะอนุมัติอย่างชัดเจนและมี implementation plan แล้ว

## 19. Written-spec self-review checklist

- **Intent:** เอกสารระบุเป้าหมายจริงและทางเลือกที่เล็กกว่าซึ่งอนุมัติแล้ว
- **Repository truth:** แยก parent Human Surface ออกจาก nested product evidence
- **No duplication:** ปฏิเสธ generic gateway อย่างชัดเจน
- **Authority:** ไม่ยกระดับ client display data เป็น product authority
- **Revision:** ระบุ canonical server digest ที่ขาดว่าเป็น A2 blocker
- **Tenancy:** ไม่เท่ากับ `site_code = tenant`
- **Workflow:** A1 ไม่มี real approval หรือ product intent table
- **Receipt:** แยกความหมาย digest และ signature
- **Security:** identity, replay, enumeration, stale state และ disclosure failure เป็น fail-closed
- **Claims:** A1 เป็น contract-ready ไม่ใช่ runtime-connected หรือ production-ready
- **Placeholders:** ต้องรัน pre-publication placeholder และ implementation-promise scan
