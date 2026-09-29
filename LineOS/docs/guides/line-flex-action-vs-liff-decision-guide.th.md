# คู่มือตัดสินใจ Flex Action กับ LIFF

- สถานะ: approved decision contract สำหรับ MONOLITH LINE Human Surface
- ฉบับ: ภาษาไทย
- ตรวจพฤติกรรมแพลตฟอร์มทางการเมื่อ 2026-08-02

## 1. หลักตัดสินใจ

เลือก action ตามผลกระทบ ไม่ใช่ตามปุ่มที่ทำง่ายที่สุด LINE เป็น Human Surface; MONOLITH เป็นผู้มีอำนาจสำหรับ tenant, identity, permission, resource, revision, workflow และ audit

ปุ่ม Flex ใช้ LINE action objects ส่วน LIFF เปิดผ่าน Flex **URI action**; LIFF ไม่ใช่ Flex action type แยก LIFF ให้ private review surface แต่ server ยังต้อง authenticate, authorize, bind exact transaction และตรวจ current state ใหม่

Action payload ไม่ใช่ permission และ no production token ต้องไม่อยู่ใน action data หรือ URL

## 2. Exact approved matrix

| Need | Action |
|---|---|
| Visible conversational text | Message |
| Low-risk reversible choice, reauthorized server-side | Postback with opaque intent ID |
| Read-only web/tel/LINE scheme | URI |
| Form, identity, sensitive detail, comparison or explicit confirmation | URI opening LIFF |
| Money, access, release, policy, scope or hard-to-reverse change | LIFF plus MONOLITH step-up |

ให้เลือกแถวที่มี consequence สูงสุดที่ control อาจทำได้ หากปุ่มรวม acknowledgement และ approval ให้แยก journey: การ์ดรับทราบก่อน แล้ว authenticated work surface ค่อย authorize

## 3. Action แต่ละชนิดทำอะไรจริง

### Message

Message action ส่ง text ที่กำหนดเข้า chat ในฐานะข้อความจากผู้ใช้ ใช้เมื่อ visible conversational text คือผลลัพธ์ที่ต้องการ เช่น “กรุณาติดต่อกลับ” Free text ไม่ใช่ structured order, approval, identity binding หรือ workflow mutation

### Postback

Postback action ส่ง postback event เข้า webhook พร้อม `data` ใช้ opaque intent ID สั้น ๆ ที่ resolve ไป server-side record เมื่อรับแล้วตรวจ webhook signature, map actor, resolve tenant/resource จาก authoritative context, reauthorize, enforce expiry/idempotency แล้วทำเฉพาะ operation ความเสี่ยงต่ำและย้อนกลับได้ตาม policy

### URI

URI action เปิด `http`, `https`, `line` หรือ `tel` ที่ LINE รองรับ ใช้กับ read-only page, โทรศัพท์ และ LINE scheme ที่อนุมัติ ถือ query ทุกค่าเป็น untrusted และ read-only destination ห้าม mutate state ด้วย GET

### URI opening LIFF

ใช้ URI action ปลายทางเป็น environment-approved LIFF URL สำหรับ form, sensitive detail, comparison และ explicit confirmation ส่วน login เป็นเพียง identity step แรกและไม่ใช่ business authorization

Supported identity sequence: เรียก `liff.init()`; ใช้ `liff.login()` ใน external/in-app-browser ตามเอกสาร; ส่ง **raw `liff.getIDToken()` ID token or access token** ไป server; แล้ว **verify using LINE's documented server flow** ก่อน map verified subject กับ stored principal ข้อกำหนดสำคัญคือ **Direct LINE Login authorization requests inside the LIFF browser are not guaranteed** จึงต้องรักษา `liff.login()` path ของ LINE แทนสร้าง authorization request ภายใน LIFF

แยก identity, routing และ transaction values:

| Concept | Meaning and required handling |
|---|---|
| MONOLITH transaction reference | opaque reference แบบ server-created, server-stored, high-entropy พร้อม CSRF/session binding; bind tenant, principal/audience, resource, revision, action, expiry และ exact return target; one-time consumed แบบ atomic และไม่ใช่ ID-token nonce |
| LINE-managed liff.state | ข้อมูลเพิ่มเติมของ LIFF URL ที่ LINE ส่งต่อ เป็น untrusted routing input; not OAuth state, not permission และ not the MONOLITH transaction reference |
| OAuth state | CSRF correlation สำหรับ separate supported authorization flow; flow นั้นสร้าง/เก็บเอง; not liff.state และไม่ใช่ business permission |
| OIDC nonce | ID-token replay/correlation input; compare only when a separate supported authorization flow lets MONOLITH supply it และ LINE คืน ID-token claim |

### LIFF plus MONOLITH step-up

งานด้าน money, access, release, policy, scope หรือเปลี่ยนแล้วย้อนกลับยาก ต้องให้ LIFF เรียก MONOLITH authorization path โหลด authoritative data ใหม่ อธิบาย consequence ทำ step-up/two-person control ตาม policy consume one-time command แบบ atomic แล้วออก durable Signed Receipt การ login LIFF สำเร็จเพียงอย่างเดียวไม่ใช่ approval

## 4. การตัดสินใจสำหรับห้า presets

| Preset | Primary control | เหตุผล | ผลฝั่ง server |
|---|---|---|---|
| `design-approval` | URI opening LIFF แล้ว MONOLITH step-up | exact design revision กระทบ release และงาน downstream | โหลด revision จริง ตรวจ signer scope/freshness approve/reject ครั้งเดียวและออก durable receipt |
| `quote-order` | URI opening LIFF แล้ว MONOLITH step-up | ต้องเทียบ price, scope, tax/terms และยืนยัน order intent | Reprice/reload quote ตรวจ customer/project/current terms แล้วสร้าง structured order intent ครั้งเดียว |
| `sla-escalation` | Postback with opaque intent ID เพื่อรับทราบ; URI สำหรับเปิดงาน | Acknowledgement ความเสี่ยงต่ำ แต่อนุมัติเงินมี consequence | บันทึกรับทราบแบบ idempotent; ส่ง approval ไป authenticated work item พร้อมตรวจ permission/limit |
| `site-update` | Read-only URI | ลูกค้าดู evidence set ที่ curate ตาม audience แล้ว | Resolve short-lived audience-scoped view และ log ตาม policy โดยไม่ mutate workflow ตอนเปิด |
| `issue-evidence` | Postback with opaque intent ID | รับทราบย้อนกลับได้ แต่ promote/reject ต้องตรวจ actor/project | Mark “review requested” ครั้งเดียว และ quarantine evidence จนมนุษย์ที่มีสิทธิ์ตรวจ |

Secondary button ห้ามสร้าง hidden alternative approval route ให้มี dominant CTA เดียวและ fallback ที่ consequence ต่ำกว่าอย่างชัดเจน

## 5. Duplicate, replay และ retry

LINE webhook redelivery และ network/client retry อาจสร้าง duplicate events และลำดับ redelivery อาจต่างจากลำดับเหตุการณ์ ออกแบบทุก route สำหรับ at-least-once observations:

1. Verify `x-line-signature` บน raw body เดิมก่อน parse
2. Deduplicate inbound webhook ด้วย `webhookEventId` และเก็บ processing result แรก
3. Resolve opaque intent ID ไป record ที่ bind tenant, actor/audience, resource, revision, action, expiry และ use count
4. Reject intent ที่ expired, consumed, mismatch หรือ stale การ replay ต้องคืน prior safe result หรือ explicit rejection และห้าม execute business command ซ้ำ
5. ใช้ atomic idempotency/command key ครอบ business mutation และ audit record
6. แยก duplicate delivery จาก `unknown-after-send` เมื่อ outbound result คลุมเครือ ให้เก็บ request/retry identifiers และ acceptance state, reconcile outcome และ never blind resend

ห้ามใช้ LINE reply token เป็น business idempotency key เพียงอย่างเดียว และห้ามถือ event order เป็น authoritative workflow order

## 6. Transport proof ไม่ใช่ authorization

Valid webhook signature พิสูจน์ว่า raw body ถูก sign ด้วย channel secret และไม่ถูกแก้ระหว่างทาง นี่คือ transport authenticity/integrity แต่ไม่พิสูจน์ว่า:

- LINE user bind กับ MONOLITH principal ที่ตั้งใจ
- actor อยู่ tenant หรือมีสิทธิ์ต่อ resource
- action ผ่าน role, limit, policy หรือ separation of duties
- revision ยัง current
- group participant ถูกระบุตัวและมีสิทธิ์
- command ยังไม่หมดอายุหรือยังไม่เคย execute

ดังนั้น signature verification เป็น ingress gate แรก แล้วตามด้วย identity binding, tenant/resource resolution, policy authorization, freshness, idempotency และ audit

## 7. Data contracts

### Safe postback

```json
{
  "type": "postback",
  "label": "Acknowledge SLA",
  "data": "intent=it_7mF2kQp9"
}
```

Opaque value ทำหน้าที่เป็นตัวอ้างอิงเท่านั้น ส่วน Server record ที่แยกจาก `data` เป็นที่เก็บ tenant, resource, revision, allowed action, risk, expiry และ one-time status

### Safe LIFF URI

```json
{
  "type": "uri",
  "label": "Review and confirm",
  "uri": "https://liff.line.me/{environment-liff-id}"
}
```

สร้าง MONOLITH transaction reference ฝั่ง server หลังเข้าและ bind กับ authenticated session รวม exact return target หลีกเลี่ยง business authority ที่อ่านหรือ reuse ได้ใน URI ส่วน `liff.state` และ forwarded URL เสนอ routing ได้เท่านั้น Server ต้อง reload tenant/resource/revision/action และ authorization ก่อน one-time consumption

## 8. Prohibited anti-patterns

| Anti-pattern | เหตุผลที่ fail | วิธีแทน |
|---|---|---|
| tenant/amount/role in postback data | Payload ที่ผู้ใช้ส่งต่อ/ควบคุมได้ดูเหมือน authority และ leak context | Opaque intent ID, authoritative lookup และ reauthorization |
| free-text order truth | Text คลุมเครือ ขาด schema/revision binding | Structured order form ใน LIFF และ reload authoritative quote |
| one-tap approval | ไม่มี exact-value review, freshness, step-up หรือ consequence acknowledgement | LIFF review + MONOLITH step-up + one-time command |
| bearer tokens in URLs | URL รั่วผ่าน logs, history, referrers, screenshots และ forwarding | Server session, secure exchange และ opaque one-time reference |
| group membership as permission | Actor ในกลุ่มอาจไม่ bind, membership เปลี่ยน และทุกคนเห็นข้อความ | Bind principal และ resolve tenant/resource authorization ฝั่ง server |

สิ่งต้องห้ามเพิ่ม: state-changing GET, reusable command ID, เชื่อ LIFF-decoded client profile, auto-promote group evidence, hidden approval CTA และถือ message acceptance เป็น human receipt

## 9. Review checklist

- [ ] Business need ตรงหนึ่งแถวใน approved matrix
- [ ] Consequential action ใช้ URI opening LIFF plus MONOLITH step-up
- [ ] Postback มีเฉพาะ opaque expiring intent ID
- [ ] Message action ใช้เป็น conversational text เท่านั้น
- [ ] Read-only URI ไม่ mutate บน GET และไม่มี secret
- [ ] ตรวจ webhook signature ก่อน parse แล้วแยก authorization
- [ ] Tenant, principal, resource, revision, policy มาจาก authoritative server state
- [ ] Duplicate/replay/expiry/stale/forwarded-link tests fail safely
- [ ] One-time command และ audit atomic
- [ ] Reconcile `unknown-after-send` โดยไม่ blind resend
- [ ] Live delivery ปิดจน Trust P0 ผ่าน
- [ ] LIFF ใช้ `liff.init()` / `liff.login()` และ raw-token server verification; decoded client profile ไม่ใช่ identity proof
- [ ] MONOLITH transaction reference, LINE-managed `liff.state`, OAuth state และ OIDC nonce แยกจากกัน

## แหล่งข้อมูลทางการ

Retrieved 2026-08-02:

- [Messaging API action objects](https://developers.line.biz/en/docs/messaging-api/actions/)
- [Messaging API reference: Message, Postback, URI](https://developers.line.biz/en/reference/messaging-api/nojs/)
- [Receive messages และ webhook redelivery](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)
- [Verify webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)
- [Adding a LIFF app and scopes](https://developers.line.biz/en/docs/liff/registering-liff-apps/)
- [LIFF API reference: initialization และ login](https://developers.line.biz/en/reference/liff/)
- [Developing a LIFF app](https://developers.line.biz/en/docs/liff/developing-liff-apps/)
- [Opening a LIFF app และ `liff.state`](https://developers.line.biz/en/docs/liff/opening-liff-app/)
- [Using profile information in LIFF safely](https://developers.line.biz/en/docs/liff/using-user-profile/)
- [LIFF development guidelines](https://developers.line.biz/en/docs/liff/development-guidelines/)
- [LINE Login API: token and nonce](https://developers.line.biz/en/reference/line-login/)
- [Retrying a Messaging API request](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)
