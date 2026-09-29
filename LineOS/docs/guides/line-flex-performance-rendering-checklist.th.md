# Checklist ประสิทธิภาพและ Rendering ของ Flex Message

- สถานะ: release checklist สำหรับ v1 standalone authoring scope
- ฉบับ: ภาษาไทย
- ตรวจข้อจำกัด LINE ทางการเมื่อ 2026-08-02

## 1. Release rule

ใช้ checklist นี้กับทุก preset, language และการเปลี่ยนเนื้อหาสำคัญ Studio preview เป็นภาพประมาณในเครื่อง มีเพียง exported HTTPS assets, official simulator และ LINE clients จริงที่ใช้ delivery rendering path การผ่านด้านภาพไม่สามารถยกเว้น validation, security, authorization หรือ Trust P0

v1 Studio สร้าง **one bubble only** ไม่ได้อนุมัติ carousel composition หรือ live delivery

Failure matrix ที่ต้องตรวจครอบคลุม unavailable image, LINE API 4xx/429/5xx, duplicate delivery และ `unknown-after-send`

## 2. Payload ceilings และ budget

| รายการ | LINE ceiling | MONOLITH release rule |
|---|---|---|
| Flex bubble definition | JSON **30 KB** | เป้าหมายไม่เกิน **24 KB**; เกิน 24 KB warning และเกิน 30 KB block |
| Flex carousel definition | JSON **50 KB** | นอก v1 authoring scope; ต้อง design review |
| Carousel bubbles | สูงสุด **12** | v1 Studio authors one bubble only |
| Flex `altText` | **1,500** ตัวอักษร | ต้องมี ความหมายถูกทั้ง TH/EN และทดสอบใน notification/chat list |

วัด UTF-8 bytes ของ `contents` object ที่จะส่งจริง ห้ามถือว่า character count เท่ากับ byte count โดยเฉพาะภาษาไทยและ emoji ต้องมี margin ต่ำกว่า hard ceiling เพราะ copy/URL เปลี่ยนแล้ว payload โตได้

- [ ] Bubble ≤ 24 KB soft budget
- [ ] กรณี 24–30 KB มีเหตุผล owner และ reduction plan
- [ ] Block export เมื่อเกิน 30 KB
- [ ] `altText` ถูกต้องและ ≤ 1,500 ตัวอักษร
- [ ] ไม่มี component/style/nesting ที่ไม่จำเป็น

## 3. Image acceptance

Flex image component ต้องใช้ **HTTPS** URL และ **JPEG หรือ PNG** ที่รองรับ ขีดรับทางการคือ **1024×1024** pixels และ **10 MB** ต่อภาพ LINE แนะนำให้ภาพแต่ละไฟล์ไม่เกิน 1 MB เพื่อลด display delay ตัวเลขขีดรับไม่ใช่ performance target

- [ ] HTTPS/TLS ที่รองรับ และ redirect chain ยังเป็น HTTPS
- [ ] MIME/content เป็น JPEG/PNG ไม่ใช่ HTML error page
- [ ] Dimensions ไม่เกิน 1024×1024
- [ ] ไฟล์ไม่เกิน 10 MB และ production target เล็กกว่ามาก (ปกติ ≤ 1 MB)
- [ ] URL encode ตามข้อกำหนด อยู่ได้นานพอกับ message และไม่มี token/secret
- [ ] ตรวจ cache policy และ content replacement
- [ ] ภาพเสียแล้ว essential meaning/CTA ยังเข้าใจได้

Standalone bundle ใช้ **no base64**, ไม่มี remote fonts และไม่มี third-party runtime ต้องรักษาขอบเขตนี้: base64 ทำ payload โต, remote fonts เพิ่ม availability/privacy/rendering drift และ third-party runtime ทำให้ local safety artifact พึ่ง external code

## 4. Local preview กับ exported URL

Hero preview ใน Studio ใช้ bundled local SVG จาก `LineOS/assets/line-flex-studio/` ส่วน generated JSON ใช้ Hero **Export HTTPS URL** ภาพในเครื่องถูกไม่ได้พิสูจน์ว่า exported URL มีอยู่ ส่ง bytes ถูก หรือเปิดจาก LINE ได้

- [ ] ตรวจ generated `hero.url` โดยตรง ห้ามอนุมานจาก local preview
- [ ] เปิด HTTPS asset จาก environment นอกเครื่องพัฒนา
- [ ] ตรวจ status, content type, dimensions, file size, certificate, redirect
- [ ] วาง payload ใน Flex Message Simulator
- [ ] ทดสอบ asset ผ่าน LINE clients จริงและ poor network

## 5. Width, language และ font matrix

ตรวจที่ **320**, **360**, **390** CSS-pixel viewport widths ทุกความกว้างต้องครบ:

| Case | Pass condition |
|---|---|
| Thai | Wrap เป็นธรรมชาติ สระ/วรรณยุกต์ไม่ถูกตัด และ facts ยังจับคู่ labels |
| English | คำ/ชื่อยาว wrap ไม่ overflow และ CTA ยังเห็น |
| Emoji/symbols | Emoji, currency, percent, en dash, bullet ไม่มี replacement box |
| Long name | Project/customer/requester wrap โดยไม่บัง revision/deadline |
| Large font | Device large-font ไม่ overlap, crop หรือซ่อน action meaning |

ห้ามบังคับ copy ให้ตรง screenshot เดียว LINE ระบุว่า OS, LINE version, resolution, language และ font ทำให้ Flex render ต่างกันได้

## 6. Hero crop และ safe visual area

- [ ] ทดสอบ `cover` cropping ทุก width และ source ทั้ง tall/wide
- [ ] วาง focal subject ใน safe visual area กลางภาพและเผื่อขอบมากพอ
- [ ] ห้าม bake revision, price, deadline, approval consequence หรือ essential text ในภาพ
- [ ] ใส่ essential text ใน Flex text components และ `altText`
- [ ] ตรวจ crop ของหน้า/วัสดุ/สินค้า โลโก้ และ contrast
- [ ] ภาพ unavailable แล้วการ์ดยังเข้าใจได้

`cover` อาจตัดขอบ source image ตามการออกแบบ Approval truth ต้องอยู่นอกภาพ

## 7. Layout resilience

- [ ] Layout ตื้นและลบ container ตกแต่งที่ไม่จำเป็น
- [ ] Important text ตั้ง wrap และรองรับบรรทัดเพิ่ม
- [ ] fixed-height prohibition สำหรับ text-bearing container เพราะข้อความแปลหรือขยายอาจถูก clip
- [ ] ห้ามจัด facts ด้วย spaces หรือ hard-coded line breaks
- [ ] spacing/labels กระชับและ touch target เพียงพอ
- [ ] ทดสอบ optional text หายและข้อความยาวสุด
- [ ] ตรวจ fallback ของ feature ที่ขึ้นกับ LINE version

## 8. Primary CTA clarity

- [ ] มี primary CTA เด่นหนึ่งรายการ
- [ ] Label บอกสิ่งที่จะเปิด/เกิด เช่น “ตรวจและยืนยัน” ไม่ใช่ “OK”
- [ ] Trust note บอกว่า consequential state เปลี่ยนหลัง private confirmation เท่านั้น
- [ ] Secondary route consequence ต่ำกว่าและ bypass review ไม่ได้
- [ ] Action ตรง approved Message/Postback/URI/LIFF matrix
- [ ] High-risk action เปิด LIFF และใช้ MONOLITH step-up

## 9. Accessibility และ motion

- [ ] Studio/review journey ใช้ keyboard ได้ทั้งหมด
- [ ] Tab order ตาม reading order, focus มองเห็นและกลับ trigger หลัง dialog
- [ ] Header/Hero/Body/Footer และ mobile pane tabs รองรับ arrows, Home, End
- [ ] Contrast เพียงพอใน normal/disabled/warning/error
- [ ] Control มี semantic labels และ validation เชื่อม rule กับ field
- [ ] ไม่สื่อความหมายด้วยสี ภาพ หรือ animation อย่างเดียว
- [ ] `altText` สื่อ actionable summary
- [ ] เคารพ reduced-motion; หลีกเลี่ยง essential animation
- [ ] ตรวจ screen-reader order และ large font บนอุปกรณ์จริง

## 10. Real-device matrix

ใช้ test accounts ที่องค์กรควบคุมและบันทึก date, OS, device class, current installed LINE version แบบเจาะจงให้ครบ iOS, Android และ desktop คำว่า “latest” ที่ไม่มี version/date ไม่ใช่ evidence

| Client | Minimum cases |
|---|---|
| iOS LINE | 320/390-class, normal/large font, TH/EN, image available/unavailable, LIFF open/cancel/confirm |
| Android LINE | 360/390-class, normal/large font, TH/EN, image available/unavailable, LIFF open/cancel/confirm |
| Desktop LINE (Windows/macOS ตามที่รองรับ) | Window narrow/wide, URI fallback, keyboard, unsupported-feature fallback |
| External browser จาก LIFF | Login, exact redirect, cancel, stale/expired transaction, support fallback |

ทดสอบซ้ำเมื่อ Flex เปลี่ยนสาระ, image/CDN เปลี่ยน, LIFF SDK/platform เปลี่ยน และ LINE client update ที่มีนัยสำคัญ

## 11. Media delivery

**Future production guidance** — ไม่ใช่หลักฐานว่า deploy CDN แล้ว:

- ใช้ approved first-party media host/CDN แบบ HTTPS มี monitoring และ owner ชัด
- Publish immutable/content-addressed/versioned asset URL ป้องกัน approved message เปลี่ยนเงียบ ๆ
- หลีกเลี่ยง signed URL ที่หมดอายุก่อน message lifecycle; ห้าม embed bearer credential
- Optimize JPEG/PNG dimensions/quality ก่อน upload; ห้ามพึ่ง transformation ตอน view โดยไม่มี pinned contract
- ตั้ง content type, cache headers, safe redirects ให้ถูก
- Monitor origin/CDN errors/latency และมี accessible text fallback
- กำหนด takedown, privacy, retention, incident procedure

Production host, SLA, region และ retention ยังเป็น architecture decisions ต้อง revalidate ตอน release

## 12. Failure และ recovery checks

### Unavailable image

- [ ] จำลอง DNS failure, 404/403, slow response และ wrong MIME
- [ ] Essential text/CTA อยู่นอกภาพ
- [ ] Operator replace/version asset ได้โดยไม่ rewrite historical evidence

### LINE API `4xx`

- [ ] ถือ validation/auth/recipient error เป็น terminal จน classify; ห้าม blind retry
- [ ] เก็บ non-secret request ID, payload hash, error body, environment สำหรับ audit
- [ ] Quarantine invalid payload และคืน owner

### LINE API `429`

- [ ] ทำตาม platform rate constraints และ controlled backoff/queue policy
- [ ] ห้ามหลาย worker ทวี retry
- [ ] Monitor queue age, tenant fairness, SLA impact

### LINE API `5xx` หรือ timeout

- [ ] ใช้ LINE retry-key semantics เฉพาะ endpoint ที่รองรับ และคง retry key เดิมสำหรับ request เดิม
- [ ] จำกัด retry ด้วย backoff และ circuit/incident threshold
- [ ] ห้ามถือ API acceptance เป็น human receipt

### Duplicate delivery

- [ ] Deduplicate inbound ด้วย `webhookEventId` และ business command ด้วย stable idempotency key
- [ ] Replayed action คืน stored safe result และไม่ repeat state transition

### `unknown-after-send`

- [ ] Persist request ID, retry key, payload hash, target reference, acceptance state ก่อนส่ง
- [ ] Mark ambiguous outcome หยุด blind resend แล้ว reconcile ด้วย platform evidence/operator review
- [ ] Escalate ambiguity ที่ยังไม่จบและรักษา queue/audit trail

## 13. Release evidence record

| Evidence | Required value |
|---|---|
| Payload | Preset/revision, JSON hash, UTF-8 bytes, alt-text length |
| Visual | 320/360/390 captures สำหรับ TH/EN, large font, image failure |
| Official simulation | Flex Message Simulator date/result |
| Devices | OS, device, LINE version, environment, tester |
| Accessibility | Keyboard/focus/contrast/labels/reduced-motion |
| Failure | Image, `4xx`, `429`, `5xx`, timeout, duplicate, replay, unknown-after-send |
| Authorization | Action decision, Trust P0, step-up evidence |
| Rollback | Owner, disable path, worker stop, reconciliation drill |

หาก hard limit แตก, essential text ซ่อนในภาพ, primary CTA ไม่ชัด, ขาด real-device evidence, accessibility fail หรือ consequential-action gate ยังไม่จบ ผลคือ NO-GO

## แหล่งข้อมูลทางการ

Retrieved 2026-08-02:

- [Messaging API reference: Flex/carousel/alt text/image](https://developers.line.biz/en/reference/messaging-api/nojs/)
- [Send Flex Messages และ rendering variability](https://developers.line.biz/en/docs/messaging-api/using-flex-messages/)
- [Flex Message Simulator image requirements](https://developers.line.biz/en/docs/messaging-api/using-flex-message-simulator/)
- [Flex Message layout](https://developers.line.biz/en/docs/messaging-api/flex-message-layout/)
- [Receive messages และ webhook duplicates](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)
- [Retrying a Messaging API request](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)
- [Messaging API status codes](https://developers.line.biz/en/reference/messaging-api/nojs/#status-codes)
