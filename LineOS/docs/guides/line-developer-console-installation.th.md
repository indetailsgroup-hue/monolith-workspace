# การติดตั้ง LINE Developer Console และส่งมอบอย่างมีการควบคุม

- สถานะ: operator runbook; production activation ยังติด gate
- ฉบับ: ภาษาไทย
- ตรวจ platform facts กับเอกสารทางการของ LINE เมื่อ 2026-08-02

## อ่านส่วนนี้ก่อน

**Flex JSON is not installed in Developer Console.** Console ใช้ตั้งค่า channels, webhooks และการลงทะเบียน LIFF app ส่วน Flex JSON คือ message payload: ให้นำไป prototype ใน **Flex Message Simulator** ทางการ ตรวจให้ผ่าน แล้วส่งต่อให้ server-side **Messaging API** integration ภายใต้ MONOLITH

คู่มือนี้บันทึกลำดับ configuration โดยไม่มี production credentials และไม่ได้อนุมัติ live send หรือลูกค้าจริง เงื่อนไขคือ **no production token** ใน standalone Studio, Flex JSON, LIFF client code, screenshots, source control หรือ URLs

หมายเหตุแพลตฟอร์มปัจจุบัน: LINE แนะนำ LINE MINI App สำหรับงานใหม่เนื่องจากทิศทางการรวมกับ LIFF คู่มือนี้ทำตาม scope LIFF ที่อนุมัติแล้ว แต่ต้องทบทวนตัวเลือกอีกครั้งที่ production architecture gate

## บทบาทและหลักฐานก่อนเริ่ม

| บทบาท | ความรับผิดชอบ |
|---|---|
| LINE Official Account owner | Business ID, ความเป็นเจ้าของ account และ Manager access |
| Provider/channel admin | การเลือก provider, channel membership และ configuration evidence |
| Security owner | Secrets, redirect allowlist, LIFF identity verification, MONOLITH transaction reference, OAuth/OIDC controls และ step-up |
| Platform operator | Webhook endpoint, workers, idempotency, monitoring และ rollback |
| Product owner | Trust P0 go/no-go และ journey ที่อนุมัติ |

บันทึก environment (`development`, `review`, `production`), owner, change ticket, provider ที่ตั้งใจใช้ และ rollback owner ก่อนตั้งค่า ห้ามถือว่า identifier ของ development ใช้แทน production ได้

## ลำดับการตั้งค่าที่ถูกต้อง

### 1. ลงทะเบียน Business ID และสร้าง/เลือก Official Account

ลงทะเบียน LINE Business ID สร้าง LINE Official Account หากจำเป็น และยืนยัน account ใน LINE Official Account Manager ใช้ account ที่องค์กรควบคุมและให้สิทธิ์ admin เท่าที่จำเป็น ห้ามใช้ personal shadow owner

หลักฐาน: account display name, accountable owner และ environment โดยไม่มี customer identifiers หรือ secrets

### 2. เปิด Messaging API ใน Official Account Manager

เปิด account ที่ต้องการใน LINE Official Account Manager และ enable **Messaging API** ตั้งแต่ 2024-09-04 ไม่สามารถสร้าง Messaging API channel โดยตรงจาก LINE Developers Console; การเปิด Messaging API ให้ Official Account จะสร้าง channel ให้ ห้ามสั่ง operator ให้เลือก “Create a Messaging API channel” ใน Developers Console

### 3. เลือก provider โดยเจตนา

เลือก provider ที่ควรเป็นเจ้าของ service LINE ระบุว่า provider assignment นี้เปลี่ยนหรือถอดภายหลังไม่ได้ เมื่อจำเป็นต้องให้ provider-scoped user identity ตรงกัน ให้ Messaging API channel และ LINE Login/LIFF channel อยู่ใต้ provider เดียวกัน ผู้ใช้จะได้ user ID ต่างกันในคนละ provider ดังนั้นนี่คือการตัดสินใจด้าน identity/tenancy ไม่ใช่การจัด folder

หยุดหากไม่พบ provider ที่ตั้งใจใช้หรือ operator ไม่มี Admin role ให้แก้ ownership แทนการสร้าง provider ซ้ำ

### 4. ยืนยัน Messaging API channel

เปิด LINE Developers Console เลือก provider จากข้อ 3 ตรวจ channel ที่สร้างให้ Official Account และบันทึก channel ID ใน controlled environment registry ตรวจ mapping ของ account/provider/channel แบบสองคน Channel ID เป็น identifier ไม่ใช่ secret แต่ยังต้องหลีกเลี่ยง screenshot ที่ควบคุมไม่ได้

### 4A. ปิดหรือกำกับ default-message paths ของ Official Account

เปิด LINE Official Account Manager ทันทีและตรวจ Messaging API response settings LINE ระบุว่าสองค่านี้ Enabled เป็นค่าเริ่มต้นตอนสร้าง channel และสามารถส่งข้อความนอก MONOLITH workers

| Setting | Required state for a closed environment | Evidence |
|---|---|---|
| Greeting messages | Disabled | Dated, redacted Official Account Manager evidence |
| Auto-reply messages | Disabled | Dated, redacted Official Account Manager evidence |

**Every environment claiming delivery closed must keep both settings Disabled.** บันทึก environment, operator, timestamp และ setting view ที่ redact แล้ว หาก approved operating model ตั้งใจเปิดค่าใด ต้องกำกับ **ownership, content, audience, approval, and rollback** ทดสอบ duplicate/conflicting responses และ **remove the absolute closed-delivery claim** สำหรับ environment นั้น

### 5. กำหนด secret boundary

ถือ channel secret และ channel access token ทุกชนิดเป็น production secrets:

- เก็บใน approved server-side secret manager เท่านั้น
- จำกัดสิทธิ์ read/rotate/revoke และบันทึก rotation evidence
- ห้ามใส่ใน Flex JSON, LIFF client code, frontend environment variables, URLs, logs, screenshots, tickets หรือ standalone Studio
- ห้ามส่ง secret ไป browser
- แยก credentials และ identifiers ต่อ environment

คำว่า **no production token** เป็น release condition ของ standalone artifact ทุกชิ้น

### 6. ตั้งค่าและ Verify webhook

1. Deploy public HTTPS endpoint ด้วย TLS configuration ที่อนุมัติ
2. เก็บ raw request body แล้วตรวจ `x-line-signature` แบบ HMAC-SHA256 ด้วย channel secret ก่อน parse valid signature พิสูจน์ transport origin/integrity ไม่ใช่ business authorization
3. รองรับ verification POST ของ LINE ที่มี `events: []` และตอบ HTTP `200`
4. ในแท็บ Messaging API ระบุ Webhook URL แล้วคลิก **Verify**
5. เปิด **Use webhook**
6. เปิด **Webhook redelivery** หลังมี idempotent ingestion ด้วย `webhookEventId` แล้วเท่านั้น Redelivery อาจซ้ำ สลับลำดับ และไม่รับประกัน delivery
7. เปิด/ติดตาม webhook error statistics และทดสอบ alert routing ให้ตอบ webhook เร็วแล้วประมวลผลแบบ asynchronous

ระหว่าง connectivity verification ให้ business mutation path ของ worker ปิดอยู่

### 7. สร้าง LINE Login channel

ใต้ provider ที่ตั้งใจใช้ สร้างหรือเลือก LINE Login channel สำหรับ environment นั้น ตรวจ provider, region, service identity, admin/tester membership และ callback policy ห้ามเพิ่ม LIFF app ใน Messaging API channel; คู่มือนี้ให้ LIFF app อยู่ใน LINE Login channel

### 8. เพิ่ม LIFF app

เปิดแท็บ **LIFF** ของ LINE Login channel แล้วเลือก **Add** official UI จะสร้าง LIFF ID และ LIFF URL บันทึก configuration evidence โดยไม่มี secrets หรือ personal user IDs

### 9. ตั้งชื่อ ขนาด และ endpoint ของ LIFF

กำหนด:

- ชื่อ app ที่สื่อ service
- ขนาด `Compact`, `Tall` หรือ `Full` ให้เหมาะกับ review task
- HTTPS Endpoint URL แบบ public และไม่มี URL fragment
- scopes/options เท่าที่จำเป็น

Endpoint ต้องคงที่สำหรับ environment นั้น ห้ามซ่อน tenant, amount, revision, bearer token หรือ authority ใน endpoint/LIFF URL

### 10. ลด LIFF scopes ให้ต่ำสุด

| Scope | เลือกเมื่อ |
|---|---|
| `openid` | Server ต้องใช้ ID token; จำเป็นสำหรับ `liff.getIDToken()` / decoded token |
| `profile` | UI ต้องใช้ `liff.getProfile()` หรือ friendship data จริง ไม่ใช่ permission เปลี่ยน MONOLITH |
| `chat_message.write` | มี approved requirement สำหรับ `liff.sendMessages()` เท่านั้น approval form ปกติไม่ต้องใช้ |

ห้ามขอ email หรือ optional scope อื่นโดยไม่มี purpose, privacy basis, retention rule และ review

### 11. บันทึก LIFF ID/URL แยกตาม environment

บันทึก LIFF ID และ LIFF URL ของ `development`, `review`, `production` แยกกัน พร้อม channel ID, provider, endpoint, scopes, owner, capture date และ approval status ถือ registry เป็น configuration evidence ห้ามใช้ review LIFF URL ใน production Flex โดยเงียบ ๆ

### 12. ทำ supported LIFF identity path และ transaction verification ที่แยกกัน

ใช้ LIFF identity path ที่รองรับก่อน bind LINE identity กับ MONOLITH principal:

1. เรียก `liff.init()` ที่ registered endpoint และเรียกอีกครั้งหลัง external-browser redirect ตามเอกสาร ใน external browser หรือ LINE in-app browser ให้ใช้ `liff.login()` เมื่อจำเป็น ส่วน LIFF browser จัดการ login ผ่าน initialization
2. หลัง init/login ให้ส่ง **raw `liff.getIDToken()` ID token or access token** ไป server ผ่าน HTTPS ห้ามใช้ decoded profile เป็น identity proof
3. ฝั่ง server ให้ **verify using LINE's documented server flow**: ตรวจ ID token กับ expected LINE Login channel ID รวม issuer/audience/expiry/signature ตามเอกสาร หรือ verify access token แล้วเรียก profile จาก LINE ตามเอกสาร
4. Map เฉพาะ verified LINE subject กับ stored MONOLITH principal binding แล้วทำ tenant/resource authorization แยก

**Direct LINE Login authorization requests inside the LIFF browser are not guaranteed**; LINE กำหนดให้ LIFF app ใช้ `liff.login()` ใน in-app/external-browser LIFF login path โดย documented input ของ `liff.login()` ระบุ `redirectUri` ส่วน application-supplied OAuth `state` หรือ OIDC `nonce` ต้องอยู่ใน separate supported authorization flow ที่รองรับค่าเหล่านั้น

แยกสี่แนวคิดให้ชัด:

| Concept | Meaning and required handling |
|---|---|
| MONOLITH transaction reference | opaque reference แบบ server-created, server-stored, high-entropy พร้อม CSRF/session binding; bind tenant, principal/audience, resource, revision, action, expiry และ exact return target; one-time consumed แบบ atomic และไม่ใช่ ID-token nonce |
| LINE-managed liff.state | ข้อมูลเพิ่มเติมของ LIFF URL ที่ LINE ส่งต่อ เป็น untrusted routing input; not OAuth state, not permission และ not the MONOLITH transaction reference ประมวลผล routing หลัง `liff.init()` resolve เท่านั้น |
| OAuth state | CSRF correlation สำหรับ separate supported authorization flow; flow นั้นสร้าง/เก็บเอง; not liff.state และไม่ใช่ business permission |
| OIDC nonce | ID-token replay/correlation input; compare only when a separate supported authorization flow lets MONOLITH supply it และ LINE คืน claim; omit expected nonce เมื่อ flow ไม่ได้ส่ง nonce |

สำหรับ approved LIFF path ให้สร้าง MONOLITH transaction reference ใน server session ก่อนแสดง exact-action review Bind กับ verified principal/audience และ business values ทั้งหมด บังคับ exact allowlisted return target ตรวจ authorization/revision freshness ใหม่ และ consume แบบ atomic พร้อม command/audit result ส่วน forwarded URL และ `liff.state` เลือกได้เพียง proposed route ไม่ให้ permission หรือ authoritative tenant/resource state

### 13. ตั้งปุ่ม Flex ให้ถูกชนิด

ปุ่มใน Flex JSON ใช้ URI action มาตรฐาน:

```json
{
  "type": "uri",
  "label": "Review and confirm",
  "uri": "https://liff.line.me/{environment-specific-liff-id}"
}
```

LIFF ไม่ใช่ Flex action type แยกต่างหาก Action คือ `uri` และปลายทางคือ approved LIFF URL ห้ามใส่ bearer tokens, tenant authority, amounts, roles หรือ reusable command IDs ใน URI

v1 standalone Studio สร้าง action `https://example.com/monolith/demo/...` เป็น demo placeholder โดยเจตนา ค่านี้ไม่ใช่ LIFF deployment target และห้ามส่งให้ลูกค้า Governed server-side builder ต้องแทนด้วย environment-approved LIFF entry point หลังผ่าน Trust P0 และ configuration review

### 14. ใช้ Flex Message Simulator สำหรับ official prototyping

Copy Studio export เมื่อ validation แสดง zero blocking errors เปิด **Flex Message Simulator** ทางการ วาง exported JSON ใน JSON workflow แล้วตรวจ official simulator preview หาก simulator เวอร์ชันปัจจุบันรับเฉพาะ container ให้ใช้ `contents` bubble จาก export และคง `type: flex` กับ `altText` ไว้ใน Messaging API message envelope

Simulator ช่วย prototype layout โดยไม่ส่ง ไม่ได้ deploy message, register template หรือ authorize send ย้ำอีกครั้ง: **Flex JSON is not installed in Developer Console.**

### 15. ทดสอบ LINE clients จริงและ fallback

ก่อน controlled send ให้ทดสอบด้วย test accounts ที่อนุมัติบน LINE เวอร์ชันปัจจุบันสำหรับ iOS, Android และ desktop ตรวจ Thai/English wrap, large font, image failure, Compact/Tall/Full LIFF, external-browser login, cancel, expiry, stale revision, forwarded link, duplicate tap, replay, offline/timeout และ customer-support fallback ที่ปลอดภัย บันทึก app/OS version และวันที่

ห้ามถือ Studio preview หรือ Flex Message Simulator ว่าเทียบเท่า real client

### 16. ปิด customer delivery จน Trust P0 ผ่าน

Live customer delivery ถือว่าปิดได้เมื่อ Official Account default-message settings ทั้งสองเป็น Disabled และทุก MONOLITH Trust P0 gate มี fresh evidence: tenant/principal/resource authorization, webhook signature verification ก่อน parse, replay/idempotency, secure identity binding, revision freshness, step-up สำหรับ consequential action, one-time command, durable audit, consent/preferences, delivery reconciliation, monitoring และ tested rollback Product approval ไม่สามารถยกเว้น gate ที่ fail

### 17. Rollback อย่างปลอดภัย

เมื่อ release ไม่ปลอดภัย มี compromise, ambiguous delivery หรือ uncontrolled error rate:

1. ใน Official Account Manager ตั้ง **Greeting messages** และ **Auto-reply messages** เป็น Disabled แล้วเก็บ dated, redacted evidence; หาก intentionally enabled ให้ใช้ approved owner/content/audience rollback และถอด closed-delivery claim
2. ปิด affected command policy และ new LIFF entry point
3. ปิด **Use webhook** เมื่อจำเป็นต้องหยุดรับ; มิฉะนั้น quarantine ingestion และหยุด business workers
4. หยุด outbound/command workers โดยไม่ทิ้ง durable queue
5. Revoke/rotate secrets เมื่อสงสัย compromise
6. เก็บ audit, raw evidence, request/retry identifiers และ unknown-after-send state
7. Reconcile accepted, failed, duplicate และ ambiguous outcomes ห้าม blind resend และห้าม delete unexplained delivery state
8. ส่งผู้ใช้ไป authenticated web/operator fallback ที่อนุมัติ
9. ต้องมี Trust P0 evidence ชุดใหม่ก่อน restore

การลบ LIFF registration หรือ event history ไม่ใช่การตอบสนองแรก ต้อง preserve และ reconcile ก่อน retirement cleanup

## นโยบาย Screenshot

ฉบับนี้ไม่มี screenshot เพราะไม่ได้ capture official console UI ปัจจุบันระหว่าง execution ให้เพิ่มเฉพาะภาพจาก official UI ระหว่าง governed change ทุกภาพต้องระบุ capture date/environment และปิด provider/channel identifiers, user IDs, webhook paths, secrets, tokens ห้ามใส่ simulated console image

## Operator sign-off

| Gate | Evidence | Owner | Result |
|---|---|---|---|
| Provider/channel mapping reviewed | Registry entry และ second reviewer | Channel admin | Pass/Fail |
| Greeting messages | Disabled พร้อม dated, redacted Official Account Manager evidence หรือ approved governed exception ที่ถอด closed claim | OA owner | Pass/Fail |
| Auto-reply messages | Disabled พร้อม dated, redacted Official Account Manager evidence หรือ approved governed exception ที่ถอด closed claim | OA owner | Pass/Fail |
| Webhook verify + empty-event 200 | Timestamped non-secret result | Platform | Pass/Fail |
| Signature-before-parse + idempotency | Test evidence | Security/Platform | Pass/Fail |
| LIFF scopes/endpoint minimized | Configuration export/redacted capture | Security | Pass/Fail |
| LIFF identity flow | `liff.init()` / `liff.login()` พร้อม raw-token server-verification evidence | Security | Pass/Fail |
| MONOLITH transaction reference | CSRF/session binding, exact values/return target และ one-time-consume adversarial evidence | Security | Pass/Fail |
| OAuth state / OIDC nonce | ใช้เฉพาะ separate supported flow ที่มีวิธี supply ตามเอกสาร | Security | Pass/Fail |
| Real-client/fallback matrix | Device evidence | QA | Pass/Fail |
| Trust P0 | Signed gate record | Product + Security | Pass/Fail |
| Rollback drill | Drill/reconciliation record | Incident owner | Pass/Fail |

หากมี Fail ผลคือ NO-GO สำหรับ live customer delivery

## แหล่งข้อมูลทางการ

Retrieved 2026-08-02:

- [Get started with the Messaging API](https://developers.line.biz/en/docs/messaging-api/getting-started/)
- [Build a bot and configure webhook](https://developers.line.biz/en/docs/messaging-api/building-bot/)
- [Verify webhook URL](https://developers.line.biz/en/docs/messaging-api/verify-webhook-url/)
- [Receive messages and Webhook redelivery](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)
- [Verify webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)
- [Webhook error statistics](https://developers.line.biz/en/docs/messaging-api/check-webhook-error-statistics/)
- [Adding a LIFF app and scopes](https://developers.line.biz/en/docs/liff/registering-liff-apps/)
- [LIFF API reference: initialization และ login](https://developers.line.biz/en/reference/liff/)
- [Developing a LIFF app](https://developers.line.biz/en/docs/liff/developing-liff-apps/)
- [Opening a LIFF app และ `liff.state`](https://developers.line.biz/en/docs/liff/opening-liff-app/)
- [Using user profile information safely](https://developers.line.biz/en/docs/liff/using-user-profile/)
- [LIFF development guidelines](https://developers.line.biz/en/docs/liff/development-guidelines/)
- [LINE Login API: server token verification และ conditional ID-token nonce](https://developers.line.biz/en/reference/line-login/)
- [Flex Message Simulator tutorial](https://developers.line.biz/en/docs/messaging-api/using-flex-message-simulator/)
