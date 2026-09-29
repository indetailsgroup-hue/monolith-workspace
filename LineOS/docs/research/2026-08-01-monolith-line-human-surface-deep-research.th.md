# MONOLITH + LINE Human Surface: รายงานวิจัยเชิงลึกสำหรับบอร์ด

- **ฉบับภาษา:** ไทย (TH)
- **วันที่ใช้ตัดสินใจ:** 2 สิงหาคม 2026
- **ขอบเขตการตัดสินใจ:** ทิศทางผลิตภัณฑ์ที่มี governance และ pilot หนึ่ง tenant; เอกสารนี้ไม่ใช่หลักฐานรับรอง production deployment และไม่ใช่คำแนะนำทางกฎหมาย

## 1. คำตัดสินสำหรับบอร์ด

**ข้อเสนอคือ conditional GO เฉพาะ local prototype work; NO-GO for broader customer messaging** Daph is one pilot tenant ไม่ใช่ขอบเขตของผลิตภัณฑ์ Daph customer messaging ยัง gated จน Trust P0 ทุกข้อในหัวข้อ 8 fresh pass ใน target environment และการขยายพ้น Daph ต้องผ่าน board gates ระยะถัดไปด้วย

- **[Proposal]** กำหนด MONOLITH เป็น multi-tenant, revision-controlled project and product operating system และกำหนด LINE เป็น Human Surface adapter ที่เปลี่ยนทดแทนได้เหนือ governed domain services ไม่ใช่ system of record
- **[Verified local fact]** parent Git root มี LINE Flex Studio แบบ standalone ครอบคลุม model, presets, JSON builder, validator, action transaction, demo receipt, DOM shell และ tests ที่ parent commit `eca050ac8e7b76a1cb690e5d2cc4e3687c476bd7` (`LineOS/line-flex-*.mjs`, `LineOS/line-flex-studio.html`, `LineOS/tests/line-flex-*.test.mjs`) ข้อนี้ยืนยันเฉพาะการมี source/test ใน root นี้
- **[Verified local fact]** nested active-product Git root มี source สำหรับ LINE ingress/outbound, audit/schema migrations, acceptance, notification และ security tests ที่ nested commit `a1e9006add32fe3ce5346eb6ca94e8bdce1d13ab` (`supabase/functions/line-webhook/index.ts`, `supabase/functions/line-outbound-sender/index.ts`, migrations ที่เกี่ยวข้อง และ `tests/line-oa-commerce/`) ข้อนี้เป็นหลักฐานใน repository ไม่ใช่หลักฐานของ target environment
- **[Inference]** สอง root มีส่วนประกอบด้าน presentation และ trust foundation ที่มีประโยชน์ แต่คำตัดสิน release ยังต้องใช้หลักฐาน cross-root integration, tenant isolation, operational telemetry, accessibility และ recovery drill
- **[Unknown]** สถานะ live LINE, Supabase, identity provider และ production signature ของ target tenant อยู่นอกชุดหลักฐานที่ตรวจ

## 2. วิธีวิจัยและวินัยด้านหลักฐาน

Perplexity Deep Research สาม track—LINE technical lifecycle; trust/security/human factors; และ interior-design lifecycle/ecosystem—ถูกสังเคราะห์ไว้ใน approved design specification วันที่ 1 สิงหาคม 2026 แหล่งสังเคราะห์ที่เก็บถาวรเป็นหลักคือไฟล์ parent root `LineOS/docs/superpowers/specs/2026-08-01-monolith-line-flex-studio-design.en.md` ที่ parent commit `eca050ac8e7b76a1cb690e5d2cc4e3687c476bd7` พร้อมฉบับไทยข้างกัน วันที่ 2 สิงหาคมมีการเรียกเครื่องมือ Perplexity ใหม่แยกทั้งสาม track แต่ทุกครั้งหยุดที่ `401 insufficient_quota` ก่อนคืนผล รายงานนี้จึงใช้ approved specification เป็น archived synthesis และตรวจคำกล่าวเชิงเทคนิคอีกครั้งกับ primary sources ที่ลิงก์ไว้ Raw Perplexity transcripts ไม่ได้ถูกเก็บเป็น artifact แยก ช่องว่าง provenance นี้ยังเป็น **[Unknown]**

ใช้ evidence label ห้าชนิดเท่านั้น:

| Label | ความหมายในรายงานนี้ |
|---|---|
| **Official constraint** | ข้อบังคับหรือขีดจำกัดจาก standards body, platform owner, regulator หรือ manufacturer installation/compatibility document; คำอธิบาย catalogue/tool capability เพียงอย่างเดียวไม่เข้า classification นี้ |
| **Verified local fact** | ไฟล์ test หรือ commit ที่ตรวจโดยตรงใน Git root ที่ระบุ |
| **Inference** | ข้อสรุปแบบจำกัดขอบเขตจากหลักฐานที่อ้าง ไม่ใช่ platform guarantee |
| **Proposal** | ทางเลือก control target หรือ workflow ที่รออนุมัติและลงมือทำ |
| **Unknown** | หลักฐานยังไม่มี ยังไม่ตรวจ หรือขึ้นกับ environment |

**[Proposal]** decision record ในอนาคตต้องเก็บ source URL, retrieval date, root/commit สำหรับหลักฐาน local, owner, expiry และ verification artifact ตัวเลข KPI ในหัวข้อ 16 เป็น hypothesis จนกว่าจะ baseline ตัวอย่าง manufacturer แสดงรูปทรงของ input เท่านั้น ไม่ใช่มาตรฐานตู้สากล

## 3. แผนที่ current state ของสอง Git root

ข้อสรุป topology อาศัยเอกสาร **untracked working-tree evidence** สองฉบับที่ inspected 2026-08-02 เอกสารทั้งสองไม่อยู่ใน parent commit `eca050ac8e7b76a1cb690e5d2cc4e3687c476bd7` และเป็น **not commit or deployment evidence**: `CONTEXT.md` มี SHA-256 `715E4865B1A4498AC08C6E9AC7A0C7881A54645A645C088B130FE0572A92DE99`; `docs/reports/2026-07-21-ima-schelling-monolith-repository-scope-correction.en.md` มี SHA-256 `6966AB9BB1C3B97E3856A66A35190E2D404627E5B88BFFE720462E96C296FD42` เนื้อหาที่ hash เหล่านี้ระบุ parent เป็น governance/bootstrap และ `determined-williams/` เป็น active-product Git root แยกต่างหาก รายงานรักษา provisional provenance นี้และไม่ได้ promote เอกสารทั้งสองเข้าสู่ commit history

| Root และหลักฐาน | สิ่งที่รองรับ | ข้อสรุปที่บอร์ดใช้ได้ |
|---|---|---|
| Parent `C:\Users\thai3\determined-williams (2)` @ `eca050a…`: `LineOS/line-flex-model.mjs`, presets, JSON, validator, actions, receipt, studio และ tests | contract สำหรับ local Flex composition/demo แบบ deterministic; preset ห้ารายการ; ป้าย demo receipt ที่ปลอดภัย | **[Verified local fact]** มี standalone source/test capability ใน governance root |
| Nested `C:\Users\thai3\determined-williams (2)\determined-williams` @ `a1e9006…`: webhook/sender, LINE migrations, `tests/line-oa-commerce/`, `src/workflow/notification/quiet-hours.ts` | source ฝั่ง product สำหรับ signature, ingest/outbound, audit, acceptance และ notification controls | **[Verified local fact]** มี product ingredients ใน active-product root |
| Cross-root runtime, live credentials, deployed migrations, telemetry, accessibility study, recovery drill | ไม่ได้รับ target-environment evidence ในการตรวจครั้งนี้ | **[Unknown]** สรุป release maturity จาก source inventory ไม่ได้ |

**[Inference]** รูปแบบ migration ที่เหมาะคือ adapter integration ไม่ใช่คัดลอก parent studio ไปสร้าง domain model ชุดที่สองใน nested product Domain objects, authorization, revision state, audit และ outbox ต้องอยู่หลัง application boundary ที่คงที่ ส่วน Human Surface มีหน้าที่ render และส่ง command ผ่าน boundary นี้

## 4. LINE ในฐานะ Human Surface ที่เปลี่ยนทดแทนได้

LINE รองรับ reply และ push ไปยัง user, group และ multi-person room; สมาชิกทุกคนใน group/room เห็นข้อความ bot และหนึ่ง group มี LINE Official Account ได้หนึ่งบัญชี Narrowcast ใช้กับ user ไม่ใช่ group **[Official constraint]** แหล่ง: [sending messages](https://developers.line.biz/en/docs/messaging-api/sending-messages/) และ [group chats](https://developers.line.biz/en/docs/messaging-api/group-chats/)

**[Proposal]** Adapter boundary คือ:

1. รับ platform event ที่ตรวจ signature แล้ว
2. resolve `tenant + principal + conversation` ผ่าน server-side binding
3. authorize named command ต่อ resource และ revision
4. append immutable intent/audit evidence และ enqueue outbox item
5. render channel response จาก governed data
6. บันทึก delivery acceptance แยกจาก business completion

**[Inference]** Boundary นี้ทำให้ web, email หรือ chat surface อื่นแทน LINE ได้โดยไม่ย้าย project truth Conversation ID และ user ID เป็น routing identifier ไม่ใช่ tenant authority Platform มีหลายวิธีให้ได้ user ID และ provider boundary มีผลต่อความสอดคล้องของ identifier **[Official constraint]** แหล่ง: [getting user IDs](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/) และ [LINE Login FAQ](https://developers.line.biz/en/faq/tags/line-login/)

**[Proposal]** ค่าเริ่มต้นของ group chat เป็น low-noise: status digest, explicit mention, safe read-only card และ deep link การยอมรับราคา scope change release-to-manufacture refund credential และ privacy action ต้องย้ายไป authenticated surface ที่มี assurance สูงกว่าและยืนยัน revision

## 5. Contract การโต้ตอบของ Flex Message และ LIFF

Flex message ต้องมี `type`, `altText`, `contents`; `altText` ได้สูงสุด 1,500 ตัวอักษร Bubble JSON จำกัด 30 KB, carousel 50 KB และ carousel สูงสุด 12 bubbles Image URL ต้องเป็น HTTPS/TLS 1.2 ขึ้นไปพร้อมข้อจำกัด JPEG/PNG Postback data และ display text ได้อย่างละ 300 ตัวอักษร URI ได้ 1,000 ตัวอักษร **[Official constraint]** แหล่ง: [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/nojs/) ภาพรวม action element และวิธีใช้ Flex อยู่ที่ [Messaging API](https://developers.line.biz/en/docs/messaging-api/), [actions](https://developers.line.biz/en/docs/messaging-api/actions/), [Flex elements](https://developers.line.biz/en/docs/messaging-api/flex-message-elements/) และ [using Flex messages](https://developers.line.biz/en/docs/messaging-api/using-flex-messages/)

| Interaction | Channel contract | วิธีใช้ใน MONOLITH |
|---|---|---|
| Read-only status card | alt text กระชับ; แสดง owner/revision/state; primary action หนึ่งรายการ | **[Proposal]** ใช้ได้ใน 1:1 และ group ที่อนุมัติเมื่อ tenant binding ผ่าน |
| Postback command | opaque command reference; server resolve resource/revision ปัจจุบัน | **[Proposal]** Client payload ไม่บรรจุ authority, price truth หรือ personal data |
| URI/deep link | HTTPS พร้อม server-side authenticated resolution | **[Proposal]** ใช้สำหรับงานซับซ้อน sensitive หรือ assurance สูง |
| LIFF form | LINE Login channel, declared scopes, HTTPS endpoint, server token verification | **[Official constraint]** Scope และ endpoint rule อยู่ใน [LIFF server API](https://developers.line.biz/en/reference/liff-server/) |

LIFF guidance ให้ส่ง access token หรือ ID token ไป server แล้ว verify กับ LINE แทนการเชื่อ profile data จาก client หลีกเลี่ยง sensitive data ใน LIFF URL และการ tracking/linking ข้ามบริการต้องมี consent ที่เหมาะสม **[Official constraint]** แหล่ง: [using profile information](https://developers.line.biz/en/docs/liff/using-user-profile/) และ [LIFF development guidelines](https://developers.line.biz/en/docs/liff/development-guidelines/)

**[Unknown]** เอกสาร LIFF บางส่วนปัจจุบันแนะนำ LINE MINI App สำหรับงานใหม่ ทางเลือกผลิตภัณฑ์และ migration horizon ต้องตรวจ platform ณ เวลาลงมือจริง แหล่ง: [LIFF server API](https://developers.line.biz/en/reference/liff-server/)

## 6. Developer Console และ channel lifecycle

ตั้งแต่กันยายน 2024 ต้องเปิดใช้ Messaging API channel จาก LINE Official Account ใน Official Account Manager แทนการสร้างตรงใน Developers Console และ provider ที่เลือกแล้วย้ายภายหลังไม่ได้ **[Official constraint]** แหล่ง: [Messaging API getting started](https://developers.line.biz/en/docs/messaging-api/getting-started/) LIFF app อยู่ใน LINE Login channel และ user ID ที่สอดคล้องกันระหว่าง Messaging API กับ LINE Login ต้องอาศัย channels ใต้ provider เดียวกัน **[Official constraint]** แหล่ง: [LINE Login getting started](https://developers.line.biz/en/docs/line-login/getting-started/) และ [LINE Login FAQ](https://developers.line.biz/en/faq/tags/line-login/)

**[Proposal]** กำกับ lifecycle เป็น change ที่มีหลักฐาน:

| ระยะ | หลักฐานบังคับ | Stop condition |
|---|---|---|
| Provider/channel design | tenant owner, data class, region, name, provider relation, least scopes | ownership หรือ credential boundary คลุมเครือ |
| Credential issuance | custodian, secret-store reference, rotation date, environment แยก | secret ปรากฏใน source/chat/browser storage/report |
| Webhook activation | HTTPS endpoint, signature test, empty-event verify, replay/idempotency test | unsigned/transformed-body path เข้าสู่ business processing |
| LIFF publication | exact redirect URI, PKCE/nonce, scopes, consent copy, accessibility check | scope กว้างหรือเชื่อ client identity |
| Operations | delivery/error dashboard, owner, quiet hours, incident/rollback runbook | ไม่มี alert owner หรือ tenant boundary ตรวจไม่ได้ |
| Retirement | disable webhook, revoke token, เก็บ audit ตามนโยบาย, ยืนยัน routing shutdown | credential ยัง active หรือ queued work ไม่ resolve |

Platform รองรับการปิด Use webhook และ revoke channel access token **[Official constraint]** แหล่ง: [stop using the Messaging API](https://developers.line.biz/en/docs/messaging-api/stop-using-messaging-api/)

Webhook activation ต้องมี delivery-lifecycle controls ด้วย: ตรวจ HMAC บน raw body ก่อน parse, acknowledge เร็วแล้ว process asynchronous, deduplicate redelivery ด้วย event ID, ใช้ retry key เฉพาะเงื่อนไขที่เอกสารกำหนด และ monitor webhook/error statistics **[Official constraint]** แหล่ง: [signature verification](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/), [receiving/redelivery](https://developers.line.biz/en/docs/messaging-api/receiving-messages/), [retry keys](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/) และ [error statistics](https://developers.line.biz/en/docs/messaging-api/check-webhook-error-statistics/)

## 7. Operating model ของ Trust Kernel

NIST zero trust ยกเลิก implicit trust จาก network location และต้อง authenticate/authorize ก่อน session เข้าถึง resource; logical model เน้น per-session least-privilege access ต่อ resource รายตัว **[Official constraint]** แหล่ง: [NIST SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final) และ [SP 800-207 PDF](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-207.pdf)

**[Proposal]** Trust Kernel ประเมิน tuple `tenant, principal, role, resource, revision, command, grant, risk, assurance, time` และเก็บอย่างน้อย:

- tenant/project membership พร้อม effective dates
- principal binding สำหรับ LINE user/conversation และ stronger identity
- resource ownership และ revision lineage
- role, explicit grant, delegation, constraint และ expiry
- command risk tier กับ assurance ที่ต้องการ
- idempotency, intent, authorization decision, outbox, delivery และ business outcome evidence
- revocation, retention, export และ deletion state

**[Proposal]** Policy result มีสี่สถานะชัดเจน: `PERMIT` execute ตาม constraint ที่บันทึก; `DENY` ปฏิเสธพร้อมเหตุผล; `STEP_UP` ขอ authentication ที่สูงขึ้น approver เพิ่ม หรือ revision ปัจจุบัน; `QUARANTINE` เก็บ intent โดยยังไม่ execute จน operator ที่มีสิทธิ์แก้ ambiguity ค่า default และ evaluation error คือ `DENY` หรือ `QUARANTINE` ไม่ใช่ implicit permission

**[Inference]** Signed webhook ยืนยัน origin ไม่ได้ยืนยัน business authority ของมนุษย์ LINE profile ระบุ platform subject ไม่ใช่ MONOLITH tenant role และ send API success คือ platform acceptance ไม่ใช่ human receipt หรือ command completion การแยกสามชั้นนี้อิง signature, identity และ retry semantics ที่อ้างในหัวข้อ 4, 5 และ 9

OAuth 2.0 security best current practice กำหนด exact redirect-URI matching และ PKCE สำหรับ public client พร้อมอธิบาย sender-constrained access token เพื่อลด token replay **[Official constraint]** แหล่ง: [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html) LINE Login กำหนด matching `redirect_uri`, รองรับ PKCE และอธิบาย ID-token/nonce validation **[Official constraint]** แหล่ง: [LINE Login API reference](https://developers.line.biz/en/reference/line-login/) และ [secure login process](https://developers.line.biz/en/docs/line-login/secure-login-process/)

## 8. Evidence ledger ของ Trust P0–P3

| Priority | Control และ fresh pass evidence | กฎสำหรับบอร์ด |
|---|---|---|
| P0 — Trust foundation | Raw-body HMAC-SHA256 ก่อน parse; server-side tenant resolution; deny-by-default authz ต่อ resource/revision/command; idempotent webhook/command; transactional intent + outbox; secret isolation/rotation; immutable security audit; tested revocation; fail closed | **[Proposal]** ทุกข้อผ่านใน target environment ก่อนส่ง customer message |
| P0 | Cross-tenant negative tests สำหรับ object access, conversation rebinding, stale revision, forged postback, replay, expired delegation และ admin override | **[Proposal]** leak, ambiguous result หรือ missing log อย่างใดอย่างหนึ่งคือ release stop |
| P1 — Governed experience | Delivery/error observability, quiet hours/digest, accessible alternative, incident runbook, restore/reconciliation drill, export/deletion workflow | **[Proposal]** ต้องผ่านก่อนขยาย scenario ภายใน Daph pilot |
| P2 — Lifecycle intelligence | Per-tenant template/policy, delegated approval, recovery journey, role analytics, multilingual governance และ revision-linked project/product insight | **[Proposal]** ต้องผ่านก่อนเพิ่ม tenant ที่สอง |
| P3 — Controlled scale | Channel optimization, machine-assisted composition, advanced personalization, Human Surface เพิ่ม | **[Proposal]** ทำได้เมื่อ P0–P2 มีหลักฐานแข็งแรงต่อเนื่อง |

Webhook signature ใช้ HMAC-SHA256 กับ request body ตามที่รับจริงและ channel secret ต้อง validate ก่อน deserialize และ invalid request ต้องไม่ถูก process **[Official constraint]** แหล่ง: [verify webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)

Webhook redelivery อาจทำให้ event ซ้ำและลำดับเปลี่ยน และไม่รับประกันว่าจะ redeliver; `webhookEventId` กับ `isRedelivery` ช่วยตรวจ duplicate **[Official constraint]** แหล่ง: [receiving messages](https://developers.line.biz/en/docs/messaging-api/receiving-messages/) Retry key ทำ repeated API execution ปลอดภัยขึ้นสำหรับ server error/timeout บางชนิด แต่ accepted request ยังอาจไม่ถึง user **[Official constraint]** แหล่ง: [retrying an API request](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)

## 9. Threat model และ failure containment

| Threat/failure | กลไก | Control และหลักฐานที่ต้องมี |
|---|---|---|
| Forged webhook | ผู้โจมตีสร้าง event | **[Proposal]** raw-body signature test, invalid denial, secret rotation drill |
| Cross-tenant confused deputy | routing ID ถูกใช้เป็น authority | **[Proposal]** server binding, tenant-scoped query, negative isolation tests |
| Replay/duplicate execution | webhook redelivery หรือ client retry | **[Proposal]** unique event/command key, atomic transition, deterministic replay result |
| Stale approval | Flex card เก่าเรียก resource ปัจจุบัน | **[Proposal]** expected revision ฝั่ง server; mismatch ไป read-only refresh |
| Forwarded link | authenticated link ไปถึงคนหรือ context อื่น | **[Proposal]** short life, audience binding, single-use/nonce ตามเหมาะสม และ server reauthorization |
| Unknown group actor | principal binding ใน shared group ยัง unresolved | **[Proposal]** ตอบ read-only; `STEP_UP` ใน 1:1/authenticated web; actor authority ต้องใช้ explicit principal binding |
| Wrong audience | ข้อมูล sensitive/tenant-specific ส่งผิด recipient/conversation | **[Proposal]** audience class, recipient preview, server binding, minimum-data template, reconciliation/incident route |
| duplicate-send | webhook redelivery, client retry หรือ sender retry execute ซ้ำ | **[Proposal]** เก็บ stable retry key; บังคับ sender idempotency และ command uniqueness; วัด zero duplicate business execution |
| unknown-after-send | timeout หรือ ambiguous response ทำให้ delivery acceptance ยัง unresolved | **[Proposal]** Persist request/retry identifiers and acceptance state; reconcile outcome; ส่ง ambiguity ไป operator resolution; never blind resend **[Official constraint]** LINE ระบุว่า accepted retry ยังอาจไม่ถึง user: [retry semantics](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/) |
| Identity substitution | เชื่อ client profile หรือ redirect result | **[Proposal]** server token validation, nonce, PKCE, exact redirect, short-lived command token |
| Notification abuse | prompt มากเกินสร้างแรงกดดัน | **[Proposal]** quiet hours, digest, role relevance, opt-down, escalation cap, complaint/recovery |
| Vendor/channel outage | LINE ใช้งานไม่ได้หรือ account ถูกปิด | **[Proposal]** durable queue, web fallback, operator runbook, replaceable adapter |
| Audit tampering | ผู้กระทำแก้หรือลบ decision history | **[Proposal]** append-only/immutable controls, restricted query, integrity monitoring, retention, independent review |
| Unsafe manufacture release | approval ข้าม revision/compatibility evidence | **[Proposal]** step-up, four-eyes gate, frozen BOM/drawing/CAM package, signed release record |

LINE มี webhook delivery statistics และ error causes รวมถึง response-time/error classes; เอกสารกำหนดให้ตอบ webhook เร็วและ process แบบ asynchronous **[Official constraint]** แหล่ง: [receiving messages](https://developers.line.biz/en/docs/messaging-api/receiving-messages/) และ [webhook error statistics](https://developers.line.biz/en/docs/messaging-api/check-webhook-error-statistics/)

## 10. Human factors, accessibility และ ethical retention

Randomized field experiment หนึ่งวันกับผู้เข้าร่วม 247 คนพบว่า การปิด smartphone notification ลด interruption/strain และปรับ performance ใน setting นั้น **[Inference]** ผลนี้สนับสนุนการทดลอง quiet hours และ digest แต่ไม่ใช่ MONOLITH baseline หรือผลสากล แหล่ง: [peer-reviewed original study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10244611/)

WCAG 2.2 AA มีข้อกำหนดที่เกี่ยวข้อง เช่น programmatic relationship, keyboard operation, focus visibility/not-obscured, minimum target size, error identification, ลด redundant entry และ accessible authentication **[Official constraint]** แหล่ง: [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

**[Proposal]** Human-surface policy:

- หนึ่ง primary action ต่อ card; ภาษาชัดเจนเรื่องผลลัพธ์ owner due date revision และ undo/recovery
- alt text สื่อ task และ urgency ได้โดยไม่พึ่ง visual layout
- web fallback ที่ใช้ keyboard/screen reader ได้ และช่องทาง non-chat สำหรับงาน sensitive
- quiet hours ตาม tenant/role; digest เป็น default สำหรับ noncritical group update; จำกัด escalation และ opt-down ชัดเจน
- แยก service message จาก marketing; อธิบายเหตุผลที่ติดต่อ; หลีกเลี่ยง countdown pressure, disguised ad, forced continuity และ obstructed cancellation
- complaint, correction, export และ deletion path พร้อม service owner
- portable project/customer export ใน format ที่มีเอกสาร และ channel-independent route เพื่อทำงานต่อหรือออกได้โดยไม่มี punitive friction

US FTC อธิบาย interface pattern ที่หลอกหรือชักจูง เช่น disguised advertising, buried terms, cancellation ที่ยาก และ data-extraction tricks **[Official constraint]** ใช้เป็น policy evidence ไม่ใช่ข้อวินิจฉัยกฎหมายเฉพาะเขต แหล่ง: [FTC report](https://www.ftc.gov/reports/bringing-dark-patterns-light) ISO 10002 อธิบาย complaint handling ที่เปิด ใช้งานได้ และนำ complaint analysis ไปปรับบริการ **[Official constraint]** แหล่ง: [ISO 10002:2018](https://www.iso.org/standard/71580.html)

## 11. Interior-design lifecycle และ revision spine

RIBA Plan of Work จัดงาน built environment ตั้งแต่ strategic definition, preparation/brief, concept, spatial coordination, technical design, manufacturing/construction, handover ถึง use **[Official constraint]** รายงานนี้ใช้เป็น lifecycle analogue ไม่ใช่ข้อบังคับสากลของ studio แหล่ง: [RIBA Plan of Work 2020](https://www.architecture.com/-/media/GatherContent/Test-resources-page/Additional-Documents/2020RIBAPlanofWorktemplatepdf.pdf)

**[Proposal]** Project states และ control points ของ MONOLITH โดย LINE is not the system of record: route ด้านล่างพาผู้ใช้ไปยัง action แต่ authoritative object และ decision ยัง revisioned อยู่ใน MONOLITH

| State | Human Surface path | Authoritative MONOLITH record/fields | Required revision evidence | High-risk exit gate |
|---|---|---|---|---|
| Lead / qualify | OA 1:1 intake; personal push หลัง consent เท่านั้น | tenant, project/lead, customer, consent, conversation, principal, owner, intent | source, consent version, qualification revision | accepted brief owner |
| Discover / survey | OA 1:1 assignment; groups สำหรับ field coordination ที่อนุมัติ; Flex→LIFF เพื่อ upload survey | tenant/project, resource/revision, survey/evidence, principal, issue owner | site, datum, units, tolerances, photos, constraints | survey approval และ issue log |
| Brief / concept | OA 1:1 และ personal push สำหรับ task; groups สำหรับ read-only coordination; Flex→LIFF เพื่อ selection | project/customer, consent, resource/revision, brief, option, decision, audit | requirements, options, assumptions, room/product links | selected concept และ budget band |
| Spatial coordination | groups สำหรับ approved-team digest; OA 1:1 สำหรับ assigned issue; Flex→LIFF เพื่อ resolution | project, resource/revision, drawing/evidence, issue, decision, audit | dimensions, interfaces, clashes, utilities, accessibility | coordinated revision |
| Technical design | personal push สำหรับ assigned review; groups สำหรับ safe digest; Flex→LIFF สำหรับ high-risk approval | project, resource/revision, drawing, spec, BOM, grant, decision, audit | drawings, specs, schedules, compatibility, approvals | frozen issue package |
| Price / contract / change | OA 1:1 summary และ personal push; Flex→LIFF สำหรับ price/change acceptance | tenant/project/customer, price, change, resource/revision, grant, decision, audit | priced revision, inclusions, exclusions, taxes, dependencies | authorized commercial baseline |
| Procurement / manufacture | personal push สำหรับ exception; groups สำหรับ approved operations; Flex→LIFF เพื่อ release | project, BOM, drawing, spec, supplier evidence, revision, grant, decision, audit, outbox | supplier, lead-time, CAM/CNC package, QA plan | release to manufacture |
| Logistics / install | personal push สำหรับ assigned event; groups สำหรับ approved crew; Flex→LIFF เพื่อ exception/acceptance | project, logistics, delivery, install, QA/evidence, revision, outbox, audit | pack/location IDs, condition, site readiness, install checks | installed acceptance |
| Handover / warranty / referral | OA 1:1 service; consented personal push; Flex→LIFF สำหรับ defect, acceptance หรือ privacy choice | tenant/project/customer, consent, as-built, warranty, defect, delivery, decision, audit | as-built, manuals, defects, warranty, consented follow-up | closeout และ service ownership |

ISO 19650-1 กล่าวถึงการแลกเปลี่ยน บันทึก version และจัดระบบข้อมูลตลอด asset lifecycle; ฉบับ 2018 ที่เผยแพร่ถูกทำเครื่องหมายว่ารอ revision **[Official constraint]** แหล่ง: [ISO 19650-1](https://www.iso.org/standard/68078.html) ISO 10007 กล่าวถึง configuration management ตลอด product/service lifecycle **[Official constraint]** แหล่ง: [ISO 10007:2017](https://www.iso.org/standard/70400.html)

## 12. Product-family และ parameter model

**[Proposal]** Product family คือ governed schema ไม่ใช่ fixed width table Field ขั้นต่ำคือ family/version, source URL/document revision, market, application, geometry, material/finish, hardware/appliance interface, clearance/ventilation/service zone, load/tolerance assumptions, manufacturing method, certifications, effective dates, substitutions และ approval evidence

| Family | ตัวอย่าง parameter | กฎหลักฐาน |
|---|---|---|
| Base, wall, tall/larder, vanity, wardrobe, media, office, island, shelving, custom | width/height/depth, carcass, reveal, plinth, back, scribe, service/equipment/cable void | **[Proposal]** ค่าอ้าง current market/manufacturer/project source; custom ยังต้องมี project engineering/source evidence |
| Door, drawer, lift-up, sliding, pocket | front geometry, overlay/inset, gap, mass, hinge/runner/lift, opening envelope | **[Proposal]** compatibility ตรง hardware family/revision |
| Sink, hob, hood, oven, refrigerator, dishwasher, laundry | cutout, ventilation, heat/moisture clearance, utilities, service access | **[Proposal]** installation document ของ appliance เป็นหลัก; ใช้ safety clearance ที่มากกว่า |
| Panel, stone, glass, metal, upholstery, finish | stock size, thickness, grain, edge, radius, seam, batch, care | **[Proposal]** source/batch/revision เดินทางเข้า BOM และ QA |

**Primary-source capability fact:** IKEA Thailand METOD buying guide แสดง base, wall, high cabinet หลายขนาด เป็นตัวอย่างที่มีวันที่และเฉพาะตลาด ไม่ใช่มาตรฐานสากล แหล่ง: [METOD guide](https://www.ikea.com/th/en/files/pdf/ea/22/ea22e971/metod_bg_apr21_th.pdf) Blum เผยแพร่ product data, technical drawing, CAD และ configurator collision checks; Häfele เผยแพร่ connector family ตาม application แหล่ง: [Blum product database](https://www.blum.com/gb/en/services/planning-construction-product-selection/product-database/), [Blum configurator](https://www.blum.com/gb/en/services/planning-construction-product-selection/cabinet-configurator/index.html), [Häfele connectors](https://www.hafele.com/us/en/products/furniture-fittings-living-solutions/connectors-shelf-supports/connectors/50/) คำอธิบาย catalogue/configurator นี้รองรับ schema/workflow design แต่ installation compatibility ต้องตรวจจาก current product/project document

**[Inference]** Configuration ต้องเป็น data ที่มี provenance และ compatibility rules งานที่ generate แล้วยังคงเป็น revisioned instance ของ sourced parameters ไม่ใช่หลักฐานว่าขนาดของ brand หนึ่งใช้ได้กับทุก market/application

## 13. Materials, survey, CAD/BIM, CAM/CNC และ factory chain

RICS measured-survey guidance กำหนดให้ client กับ surveyor ตกลง purpose, accuracy, control, datum, content และ deliverables **[Official constraint]** แหล่ง: [RICS measured surveys](https://www.rics.org/profession-standards/rics-standards-and-guidance/sector-standards/land-standards/measured-surveys-of-land-buildings-and-utilities) IFC เป็น open vendor-neutral schema สำหรับ built-environment data โดย IFC 4.3 ADD2 เผยแพร่เป็น ISO 16739-1:2024 **[Official constraint]** แหล่ง: [buildingSMART IFC](https://www.buildingsmart.org/standards/bsi-standards/industry-foundation-classes/?lang=en)

**Primary-source capability fact:** HOMAG อธิบาย SmartWOP ว่าสร้าง CNC programs, panel-cutting parts lists, fitting lists และ technical drawings และส่ง production data ไป machine/production apps; woodWOP CAM import external 3D model พร้อมจำลอง machining/collision แหล่ง: [HOMAG SmartWOP](https://digital.homag.com/en/smart-wop/) และ [woodWOP CAM plugin](https://www.homag.com/en/software-detail/software/work-preparation/woodwop-cam-plugin) Biesse อธิบาย B_SOLID เป็น 3D CAD/CAM พร้อม machining simulation และ virtual prototyping แหล่ง: [Biesse B_SOLID](https://biesse.com/gb/en/software/b_solid/) Vendor capability เหล่านี้ไม่ qualify งาน MONOLITH, machine, tooling, material หรือ post-processor รายตัว

**[Proposal]** Evidence chain คือ `survey source → coordinated model → approved product revision → drawing/specification/BOM → machine-specific post-process → simulation → first-article/QA → pack/location → installation → as-built/warranty` Native และ exchange file เชื่อมด้วย revision/checksum ผู้ควบคุมเครื่องอนุมัติ post-processed program สำหรับ machine/tooling/material ที่ระบุ CAD/BIM exchange เป็น coordination evidence ส่วน CAM output เป็น machine-context evidence

Appliance instruction อาจกำหนด ventilation, clearance, local-condition check และให้ใช้ safety distance ที่มากกว่า **[Official constraint]** แหล่ง: [Bosch installation instructions](https://media3.bosch-home.com/Documents/9000952998_A.pdf) FSC chain-of-custody อาศัยการระบุ แยก และติดตาม certified material ตลอด supply chain **[Official constraint]** แหล่ง: [FSC chain of custody](https://connect.fsc.org/certification/chain-custody-certification)

## 14. Role และ accountability scorecard

| Role | Accountable outcomes | Human Surface default | Step-up events |
|---|---|---|---|
| Executive / board / product owner | risk appetite, investment, tenant boundary, stop rules | portfolio digest | expansion/risk acceptance |
| Tenant owner / studio director | policy, membership, retention, escalation | operational digest | role/grant/retention change |
| Sales / relationship lead | qualified lead, consented contact, handoff | task/reminder | offer/discount approval |
| Project manager | baseline, scope, schedule, dependency, change | exception/approval cards | baseline/change release |
| Designer / architect | brief, model, drawing, coordinated revision | review card | design freeze |
| Surveyor | datum, accuracy, constraints, signed survey | checklist | survey acceptance |
| Estimator / QS | quantity, rate, assumption, exclusion | variance card | commercial baseline |
| Procurement / supplier | approved item, provenance, lead time, substitution | exception card | substitution acceptance |
| Engineer / technical checker | compatibility, structural/services constraints | issue card | technical release |
| CAM/CNC programmer / factory planner | post-process, setup, simulation, cut list | release queue | manufacture release |
| QA / logistics / installer | inspection, pack/location, readiness, as-built | checklist/exception | shipment/install acceptance |
| Finance | invoice, allocation, refund evidence | status only | refund/write-off |
| Partner / consultant / trade contractor | bounded deliverable, interface, evidence, expiry | assigned package/issue only | delegation/substitution/release |
| Customer approver | explicit scope/design/price acceptance | summary + secure link | binding approval |
| Customer-of-customer / occupant | consented update, access need, defect report | minimum necessary update | identity/privacy action |
| Support / warranty / privacy / security | recovery, complaint, rights request, incident | routed case | override/deletion/disclosure/breach |

**[Proposal]** แต่ละ scorecard entry ต้อง resolve ไป named commands, data fields, assurance, service level, escalation และ substitute owner “Administrator” ไม่ใช่ universal authority; override ต้อง resource-scoped, time-bounded, reason-coded และ independent review

## 15. Capability matrix: now, next และ later

| Capability และ current local evidence | Gap | Owner | Dependency | Principal risk | Measurable outcome |
|---|---|---|---|---|---|
| Flex composition — **[Verified local fact]** Parent @ `eca050a…`: presets/JSON/validator | governed domain adapter และ tenant templates | Human Surface lead | stable resource/revision API | presentation กลายเป็น truth ชุดที่สอง | deterministic render + template version ทุก card |
| Demo actions — **[Verified local fact]** Parent @ `eca050a…`: actions/receipt; `DEMO — NOT A PRODUCTION SIGNATURE` | server command/current authz/production evidence | Trust lead | identity/grants/revision/audit | demo ถูกเข้าใจเป็น approval | high-risk 100% bind authorized expected revision |
| Webhook/outbound/audit — **[Verified local fact]** Nested @ `a1e9006…`: functions/migrations/tests | deployed P0 และ reconciliation telemetry | Platform/security lead | target environment/secret custody | forgery/replay/cross-tenant send | P0 fresh pass 100%; duplicate business execution 0 |
| Quiet hours — **[Verified local fact]** Nested @ `a1e9006…`: quiet-hours source/tests | tenant/role policy และ digest experiment | Service design lead | consent/preferences/scheduler | fatigue หรือ missed urgent work | baseline burden/opt-out; critical bypass มี owner |
| Project/product truth — **[Verified local fact]** Nested เป็น active-product root ตาม scope correction | stable API สำหรับ revision/grants/audit | Product/domain lead | command/resource ontology | cross-root drift | authoritative revision หนึ่งชุดทุก surface |
| Product/factory chain — **[Proposal]** หัวข้อ 12–13 | family/supplier/machine/first article ที่คุมได้ | Technical/factory lead | survey/catalogue/CAM/QA | unsafe/untraceable release | release provenance ครบและ first-article sign-off |

การมี source ไม่ได้พิสูจน์ deployment หรือความพร้อมใช้งานจริงระดับ production

**[Unknown]** Single executable cross-root pilot path, deployed-schema state, live credentials และ target telemetry รอการตรวจ Matrix นี้แยก repository presence จาก operational proof อย่างตั้งใจ

## 16. KPI hypotheses และ baseline plan

ตัวเลขทุกค่าด้านล่างเป็น **[Proposal]** hypothesis ไม่ใช่ current result หรือ commitment ให้ baseline สี่สัปดาห์ใน cohort ภายใน/เฉพาะ Daph ที่มี consent เก็บ median/P90 ตามเหมาะสม แล้วกำหนด threshold จาก distribution จริงและ risk appetite

| KPI hypothesis | นิยาม | Hypothesis เริ่มต้นเพื่อทดสอบ |
|---|---|---|
| Trust P0 pass rate | fresh P0 checks ที่ผ่าน / ที่ใช้ได้ | 100% เท่านั้นจึง promote |
| Cross-tenant isolation | unauthorized success / negative attempt | 0 success |
| Duplicate business execution | command ที่เกิดมากกว่าหนึ่ง business transition / commands | 0 |
| Revision-safe completion | high-risk command ตรง authorized expected revision / completed | 100% |
| Message usefulness | ผู้รับที่ให้ useful / surveyed recipients | baseline ก่อน; เพิ่มโดยไม่สร้างแรงกดดัน |
| Notification burden | noncritical messages ต่อ active person/workday และ after-hours | baseline ตาม role; ลด P90 ด้วย digest/quiet hours |
| Accessibility completion | representative task ที่ทำสำเร็จด้วย keyboard/screen reader / attempts | baseline กับ users; critical task ทุกงานมี viable path |
| Recovery time | เวลาจาก failed/withdrawn action ถึง reconciled state | baseline ตาม scenario; ซ้อม P0 recovery |
| Design-to-release rework | revision ที่ reopen หลัง technical/manufacturing release / releases | baseline ตามเหตุ; ไม่กดการแก้ที่จำเป็น |
| Evidence completeness | required provenance/revision/owner field ที่ครบ / controlled objects | 100% ที่ release gate |
| Complaint closure quality | resolved พร้อม reason/remedy/owner/recurrence tag / closed complaints | evidence 100%; satisfaction วัดแยก |
| Conversion | qualified/consented leads ที่ถึง named next state / qualified/consented leads | baseline ตาม journey; อ่านคู่ burden/complaint |
| Approval latency | เวลาจาก approval-ready revision ถึง valid decision | baseline median/P90 ตาม risk; ห้ามข้าม review เพื่อเร่ง |
| Notification opt-out | ผู้รับที่ลด/หยุด nonessential notification / ผู้รับที่ได้ control | baseline ตาม role/journey; ตรวจ pressure/irrelevance |
| Quarantine age | เวลาที่ unresolved command อยู่ใน `QUARANTINE` | baseline median/P90; ทุก item มี owner/expiry |
| SLA breach | owned case ที่พลาด service target / eligible cases | baseline ตาม severity/tenant พร้อม cause/recovery |
| Delivery reliability | intended message ที่ reconcile และรู้ acceptance/delivery outcome / queued messages | baseline ตาม result; acceptance ไม่ใช่ human receipt |
| Service recovery | case ที่คืน agreed state พร้อม reason/remedy / recoverable failures | baseline outcome/time และ review recurrence |
| Adoption | eligible active roles ที่จบ governed journey / eligible active roles | baseline หลัง access/usability; voluntary use เท่านั้น |

**[Proposal]** จับคู่ conversion/speed metrics กับ burden, complaint, accessibility, override และ recovery metrics Growth outcome ห้าม override trust stop rule

## 17. Phased roadmap และ migration sequence

| Phase | Deliverable | Exit evidence |
|---|---|---|
| P0 Trust closure | freeze boundary; implement signature, binding/authz, idempotency, intent/outbox, secret/audit/revocation; negative/recovery drills | P0 fresh pass ทุกข้อใน target environment, threat/data map และ rollback owner |
| Bounded Daph pilot | low-risk workflow และ product family อย่างละหนึ่ง; read-only ก่อน controlled command | consented cohort, telemetry, accessibility/recovery evidence, P1 exception มี owner |
| Five governed journeys | qualify/brief; design/revision review; commercial change; procurement/manufacture release; handover/warranty | role/evidence schema/service/recovery target และ fresh gate ต่อ journey |
| Tenant-2 shadow | replay sanitized/consented events โดยไม่ external message หรือ business mutation | independent isolation/portability review, policy/config diff, cross-tenant result 0 |
| Controlled scale | board-authorized tenant ที่สองและ/หรือ Human Surface เพิ่ม | P0–P2 current ตลอด observation window; incident/complaint/reliability/adoption review |

**[Proposal]** Migration ใช้ strangler seams: adapter interface ก่อน ตามด้วย read-only view, low-risk command และ high-risk command สุดท้าย แต่ละขั้นมี routing rollback, queued-work reconciliation และ evidence expiry Parent demo ใช้อ้าง presentation contract ส่วน nested domain/trust เป็น product authority

## 18. Board GO/NO-GO gates และ rollback

**GO ตอนนี้** สำหรับ research, architecture, P0 implementation, local tests, controlled source integration และ non-customer Daph rehearsal **Conditional GO** สำหรับ Daph customer messaging เมื่อ P0 ทุกข้อ fresh pass ใน target environment และเจ้าของยอมรับ P1 risk ที่เหลือ **NO-GO for broader customer messaging** จน P0 เขียวตลอด observation window ที่กำหนดและ P1 operational/accessibility/recovery evidence ได้อนุมัติ Daph is one pilot tenant.

Stop ทันทีเมื่อเกิด signature bypass, tenant ambiguity, cross-tenant access, stale-revision execution, unowned/exposed credential, double business execution, missing immutable audit, unreconciled outbox, critical path ที่เข้าไม่ถึง, coercive/unconsented messaging, missing incident/rollback owner หรือ manufacture release โดยไม่มี frozen evidence

| Mandatory gate | Owner | Required evidence | Failure response | Rollback |
|---|---|---|---|---|
| Trust P0 | Trust/security lead + independent reviewer | fresh target P0 ledger และ negative tests | หยุด messaging และ quarantine ambiguity | disable command/outbound; เก็บ queue/audit |
| Tenant/audience isolation | Platform lead | cross-tenant, group actor, forwarded link, wrong audience tests | incident triage/affected-tenant review | revoke binding/token; reconcile send |
| Revision/high-risk approval | Product/domain + business owner | expected revision, step-up, four-eyes, immutable decision | deny release; reopen revision | invalidate link; restore approved baseline |
| Human/accessibility | Service design/accessibility owner | representative critical tasks, quiet hours/opt-down, complaint route | pause journey; assisted alternative | accessible web/operator support |
| Delivery/recovery | Operations lead | outbox reconciliation, dashboard, restore/retirement drill | stop expansion; recover ambiguity | pause worker, reconcile, disable webhook/revoke token |
| Manufacture release | Technical/factory/QA leads | frozen survey/model/BOM/drawing/CAM, simulation, first article | quarantine package; stop machine release | last signed package; re-post-process/reapprove |

**[Proposal]** Rollback: ปิด command policy ที่กระทบ; หยุด outbound worker โดยเก็บ durable queue; รักษา intent/audit; reconcile ambiguous requests; ส่งผู้ใช้ไป authenticated web/operator support; revoke/rotate credential เมื่อสงสัย compromise; ปิด webhook สำหรับ retirement; แจ้ง tenant owner ตาม incident process; และต้องสร้าง P0 evidence ใหม่ก่อน restore Platform retirement controls อยู่ที่ [stop using the Messaging API](https://developers.line.biz/en/docs/messaging-api/stop-using-messaging-api/)

## 19. Evidence ledger

| URL/evidence | Publisher | Date/version | Classification | Supported claim | Caveat |
|---|---|---|---|---|---|
| [Messaging API](https://developers.line.biz/en/docs/messaging-api/), [reference](https://developers.line.biz/en/reference/messaging-api/nojs/), [signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/), [redelivery](https://developers.line.biz/en/docs/messaging-api/receiving-messages/), [retry](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/) | LINE Developers | retrieved 2026-08-02 | Official constraint | message types/limits, signature, redelivery/retry | rules เปลี่ยนได้; acceptance ไม่ใช่ human receipt |
| [Getting started](https://developers.line.biz/en/docs/messaging-api/getting-started/), [LINE Login](https://developers.line.biz/en/docs/line-login/getting-started/), [LIFF](https://developers.line.biz/en/reference/liff-server/) | LINE Developers | retrieved 2026-08-02 | Official constraint | provider/channel/LIFF lifecycle | current docs มี MINI App direction |
| [SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final) | NIST | 2020 | Official constraint | zero-trust resource/session model | ไม่ใช่ implementation proof |
| [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html) | IETF/RFC Editor | 2025 | Official constraint | redirect/PKCE/token protection | ใช้ตาม client/threat model |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | W3C | Recommendation 2023 | Official constraint | accessible interaction | conformance ต้องตรวจ UI/content จริง |
| [RIBA](https://www.architecture.com/-/media/GatherContent/Test-resources-page/Additional-Documents/2020RIBAPlanofWorktemplatepdf.pdf), [ISO 19650-1](https://www.iso.org/standard/68078.html), [RICS](https://www.rics.org/profession-standards/rics-standards-and-guidance/sector-standards/land-standards/measured-surveys-of-land-buildings-and-utilities) | RIBA / ISO / RICS | 2020 / 2018 / current page | Official constraint | lifecycle/revision/survey framing | analogue/guidance; project rule ยังเป็นหลัก |
| [IKEA METOD](https://www.ikea.com/th/en/files/pdf/ea/22/ea22e971/metod_bg_apr21_th.pdf), [Blum](https://www.blum.com/gb/en/services/planning-construction-product-selection/product-database/), [Häfele](https://www.hafele.com/us/en/products/furniture-fittings-living-solutions/connectors-shelf-supports/connectors/50/), [HOMAG](https://digital.homag.com/en/smart-wop/), [Biesse](https://biesse.com/gb/en/software/b_solid/) | official manufacturers | retrieved 2026-08-02; document-specific | Primary-source capability fact | catalogue dimensions, configuration, CAD/CAM tool capabilities | descriptive และ market/product/machine specific; ไม่ใช่ installation compatibility/qualification |
| [Bosch installation instructions](https://media3.bosch-home.com/Documents/9000952998_A.pdf), [FSC chain of custody](https://connect.fsc.org/certification/chain-custody-certification) | Bosch / FSC | retrieved 2026-08-02; document-specific | Official constraint | appliance installation clearance และ certified-material traceability | ใช้กับ exact product/certification scope และ current revision |
| Parent `LineOS/line-flex-*.mjs`, studio/tests @ `eca050a…` | local parent Git root | inspected 2026-08-02 | Verified local fact | standalone demo contracts | repository evidence เท่านั้น |
| Nested LINE functions/migrations/tests/quiet-hours @ `a1e9006…` | local nested Git root | inspected 2026-08-02 | Verified local fact | active-product ingredients | repository evidence; preserve dirty tree |
| หัวข้อ 3–17 | synthesis นี้ | 2026-08-02 | Inference | boundary/priorities/lifecycle | ต้อง validate ใน context |
| P0–P3, KPI, roadmap, gates | board proposal | 2026-08-02 | Proposal | authorization/verification plan | targets เป็น hypothesis |
| Live deployment/telemetry/users/transcripts | unavailable evidence | 2026-08-02 | Unknown | บล็อก broader release | ต้องมี fresh artifacts |

## 20. ข้อจำกัด คำถามเปิด และข้อสรุป

เอกสารนี้เป็น source-and-primary-research decision report ไม่ได้รับรอง production deployment, live LINE/Supabase integration, legal/regulatory conclusion, universal accessibility, universal furniture dimensions, real-machine qualification หรือ production receipt signature การเรียก Perplexity วันที่ 2 สิงหาคมติด quota; approved design specification วันที่ 1 สิงหาคมเป็น archived synthesis และ primary-source verification แสดงอยู่ในรายงาน Manufacturer document ขึ้นกับเวลา ตลาด product และ machine Standards/platform guidance เปลี่ยนได้ จึงต้อง revalidate ณ วัน implementation และ evidence expiry

คำถามที่ยังเป็น **[Unknown]**: target tenant/legal entity/region; retention/lawful-basis; identity provider และ provider/channel ownership; command risk; deployed schema; secret custody; load/error budgets; LINE plan/account limits; accessibility participants; factory machine/post-processor; supplier market; recovery objectives; และผู้ลงนามอิสระของ P0 แต่ละข้อ

บอร์ดควรอนุมัติโปรแกรมหลักฐานเฉพาะ Daph แต่งตั้ง Trust P0 owner หนึ่งคนและ independent reviewer หนึ่งคน เลือก low-risk workflow กับ product family อย่างละหนึ่ง และบังคับ decision record ใหม่ก่อนเพิ่ม tenant หรือ scenario

**ข้อสรุป:** MONOLITH should be a multi-tenant, revision-controlled project and product operating system. LINE is a replaceable Human Surface. Daph is one pilot tenant. Broader customer messaging remains NO-GO until every Trust P0 gate passes with fresh evidence.
