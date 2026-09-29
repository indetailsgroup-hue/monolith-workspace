# MONOLITH LINE Flex Studio — คู่มือผู้ใช้งาน

- สถานะ: คู่มือ prototype แบบ standalone ที่อนุมัติแล้ว
- ฉบับ: ภาษาไทย
- ตรวจเทียบกับ Studio ใน repository และเอกสารทางการของ LINE เมื่อ 2026-08-02

## 1. วัตถุประสงค์และขอบเขตความปลอดภัย

LINE Flex Studio เป็นเครื่องมือ local สำหรับสร้างและตรวจ Flex Message แบบหนึ่ง bubble ผู้ใช้เลือก preset ที่กำกับไว้ แก้ Header, Hero, Body และ Footer ดูตัวอย่างแบบ responsive ตรวจ JSON และซ้อมการตรวจ action แบบเจาะจงผ่าน Mock LIFF ได้

Studio ไม่ใช่ตัวส่ง Messaging API, LIFF production, ฐานข้อมูลหลัก, กลไกอนุญาต หรือบริการลงลายเซ็น มีเพียงตัวอ้างอิง tenant และผู้รับแบบ demo ห้ามใส่ข้อมูลส่วนบุคคลลูกค้า channel secret, channel access token, bearer token หรือความลับ production ใด ๆ Revision, permission, workflow และ audit ที่มีอำนาจต้องอยู่ใน MONOLITH

> ข้อสรุปของ standalone: no message was sent และ no business state changed ส่วน “Verification Receipt — Demo” ไม่ใช่ลายเซ็น production

## 2. เริ่มใช้งานด้วย local static server

จาก root ของ parent repository ให้เปิด local static server:

```powershell
python -m http.server 4177 --directory LineOS
```

เปิด `http://localhost:4177/line-flex-studio.html` คง terminal ไว้ระหว่างใช้งานและหยุด server เมื่อเสร็จ ใช้ prototype นี้ผ่าน localhost เท่านั้น ห้ามเติม production token หรือ secret ในคำสั่ง URL, JSON หรือ browser storage

## 3. แผนที่ Studio Console

| พื้นที่ | หน้าที่ | สิ่งที่ผู้ใช้ต้องตรวจ |
|---|---|---|
| App header | แสดง `Daph Studio · Secured by MONOLITH` และสลับ TH/EN | ยืนยัน demo tenant และภาษาก่อนแก้ไข |
| Editor | เลือก 5 presets และแก้ Header, Hero, Body, Footer | ตรวจ audience, revision, requester, deadline และผลกระทบ |
| LINE Preview | แสดงภาพประมาณการในเครื่องและเปิด Mock LIFF | ใช้ช่วยออกแบบ ไม่ใช่หลักฐาน official client |
| JSON Preview | อัปเดต JSON และขนาด bubble แบบ UTF-8 ทันที | ตรวจ payload และ validation ก่อนคัดลอก/ดาวน์โหลด |
| Validation | แสดง severity, rule ID, source classification และลิงก์อ้างอิง | แก้ทุก `error`; พิจารณาทุก `warning` และ `guidance` |

บนจอแคบ Editor, Preview และ JSON & Validation จะกลายเป็นแท็บที่ควบคุมด้วยคีย์บอร์ด

## 4. เลือกหนึ่งในห้า presets

เลือก preset ให้ตรงกับ business intent ห้ามเปลี่ยนข้อความจนความหมายเปลี่ยนแต่คง action intent เดิมไว้

| Preset ID | ใช้เมื่อ | ขอบเขต action เริ่มต้น |
|---|---|---|
| `design-approval` | แบบ revision ที่ระบุพร้อมให้ตรวจ | ความเสี่ยงสูง: URI เปิด LIFF เพื่อตรวจ revision และยืนยันอย่างชัดเจน |
| `quote-order` | ตรวจใบเสนอราคา ขอบเขต และ order intent | ความเสี่ยงสูง: ใช้ LIFF; ข้อความแชตไม่ใช่ order truth |
| `sla-escalation` | แจ้งพนักงานให้รับทราบ SLA | Postback ความเสี่ยงต่ำรับทราบเท่านั้น การอนุมัติเงินต้องเปิด work item |
| `site-update` | ส่งความคืบหน้าหน้างานที่คัดแล้วให้ลูกค้า | URI แบบอ่านอย่างเดียว รูปกลุ่มทีมไม่กลายเป็นหลักฐานลูกค้าโดยอัตโนมัติ |
| `issue-evidence` | รับทราบหลักฐานหน้างานที่ถูก quarantine | Postback ความเสี่ยงต่ำ มนุษย์ตรวจ actor/project ก่อน promote หรือ reject |

เมื่อเปลี่ยน preset หรือภาษา ระบบสร้าง draft ใหม่และทำให้ demo transaction/receipt ในหน้าเดิมใช้ต่อไม่ได้

## 5. แก้ Header, Hero, Body และ Footer

ใช้แท็บ block ตามลำดับ:

1. **Header:** แก้ eyebrow, title, status และ `altText` ให้ข้อความสำรองสื่อสารได้ด้วยตัวเอง LINE กำหนดให้ `altText` จำเป็นและไม่เกิน 1,500 ตัวอักษร
2. **Hero:** ระบุ HTTPS URL สำหรับ export, aspect ratio และ aspect mode ตัวอย่างในเครื่องใช้ SVG ที่ bundle ไว้ แต่ JSON ที่ export ใช้ HTTPS URL ภาพ production ต้องเผยแพร่แยกภายใต้ media control ที่อนุมัติ
3. **Body:** ตรวจ project, revision, requester, amount/scope, deadline, summary และ trust note ห้ามสื่อว่าข้อความแชตเป็น business state ที่มีอำนาจ
4. **Footer:** ทำ primary CTA ให้เด่นเพียงหนึ่งรายการ ใช้ secondary CTA เท่าที่จำเป็น และตรวจ requested action type intent ความเสี่ยงสูงห้ามใช้ Message หรือ Postback เป็นการอนุญาตขั้นสุดท้าย

ทุก input อัปเดต preview, JSON, byte count และ findings จาก in-memory draft เดียวกัน

## 6. ความกว้าง Preview และการตัดบรรทัดสองภาษา

ใช้ responsive mode ของ browser ตรวจหน้าและการ์ดที่ **320**, **360** และ **390** CSS pixels phone frame ของ v1 ยืดหยุ่นได้จนถึง 360 px; ความกว้างทั้งสามเป็น test conditions ไม่ใช่ official LINE client emulator สามตัว

ทุกความกว้างต้องตรวจ:

- ฉบับภาษาไทยและอังกฤษ
- ชื่อโครงการและชื่อบุคคลที่ยาว
- การตัดบรรทัดภาษาไทยซึ่งอาจไม่มีช่องว่าง
- การ wrap ภาษาอังกฤษ ตัวเลข สกุลเงิน และ emoji
- การตั้งค่า system font ขนาดใหญ่
- การ crop ภาพแบบ cover และการมองเห็น CTA

official LINE clients อาจ render Flex เดียวกันต่างกันตาม OS, LINE version, resolution, language และ font จึงต้องทดสอบบน client จริงก่อน controlled delivery

## 7. คัดลอกและดาวน์โหลด JSON

แผง JSON คือ Flex payload ที่สร้างอยู่ในขณะนั้น ตัวชี้วัด byte วัด bubble definition:

- ไม่เกิน 24 KB: อยู่ใน MONOLITH soft budget
- เกิน 24 KB ถึง 30 KB: เขต warning ควรลดความซับซ้อนก่อน release
- เกิน 30 KB: เป็น LINE hard-limit `error` และ block export

ระบบปิด `Copy JSON`, `Download JSON` และ `Run Journey` เมื่อพบ blocking `error` เพื่อ block draft ที่ทราบว่า invalid/unsafe จาก handoff ส่วน warning และ guidance ยังแสดงเพื่อการพิจารณา หลังคัดลอกหรือดาวน์โหลด ให้ถือไฟล์เป็น untrusted input ของ controlled integration; authority ในการส่งต้องมาจาก integration ที่ผ่านการควบคุม

Action URI และ Hero export URL ของ v1 ใช้ `example.com` demo placeholders Controlled server integration ต้อง resolve LIFF/media URL ที่อนุมัติและแยกตาม environment ห้ามส่ง standalone export ให้ลูกค้าโดยตรง

## 8. อ่านผล Validation

| Severity | ความหมาย | การตอบสนองที่ต้องทำ |
|---|---|---|
| `error` | ขัดข้อบังคับ LINE หรือขอบเขตความปลอดภัย MONOLITH | แก้ก่อน export หรือ Mock LIFF ปุ่ม Fix จะพาไปยัง field |
| `warning` | เกิน budget ด้าน usability/safety หรือจำเป็นต้องตัดสินใจโดยเจตนา | บันทึกเหตุผลและโดยปกติควรแก้ก่อน release |
| `guidance` | เตือนเรื่อง preview substitute หรือ production control ในอนาคต | ยืนยัน owner และ evidence ของ downstream production |

Source classifications:

- `official_constraint` ลิงก์ไปเอกสาร LINE Developers ปัจจุบัน
- `monolith_best_practice` ลิงก์ไป approved MONOLITH design specification

ลิงก์ source รองรับกติกา แต่ไม่รับรอง draft ปัจจุบันหรือ production deployment

## 9. ซ้อม Mock LIFF แบบ exact-action review

1. แก้ blocking errors ทั้งหมด
2. เลือก `design-approval` โดยไม่เชื่อม LIFF จริง; ขั้นตอน standalone นี้จบด้วย **Verification Receipt — Demo**
3. เลือก **Run Journey**
4. ใน **PRIVATE REVIEW — DEMO** ให้เทียบ tenant, recipient, project, revision, canonical action, consequence, action mode และ expiry กับการ์ด
5. หากค่าใดผิดให้ Cancel หากตรงทั้งหมดให้เลือก **Confirm demo intent** หนึ่งครั้ง
6. หาก bound field เปลี่ยน รายการหมดอายุ มี tampering หรือ transaction ไม่ตรงกัน ระบบจะ fail closed และต้องเริ่ม review ใหม่

บริการจริงเริ่มด้วย `liff.init()` และใช้ `liff.login()` เมื่อ documented external/in-app-browser path ต้อง login จากนั้นส่ง **raw `liff.getIDToken()` ID token or access token** ไป server ผ่าน HTTPS แล้ว **verify using LINE's documented server flow** ก่อน map verified LINE subject กับ stored MONOLITH principal ข้อจำกัดสำคัญคือ **Direct LINE Login authorization requests inside the LIFF browser are not guaranteed** จึงต้องใช้ supported LIFF login path แทนการสร้าง direct authorization request ภายใน LIFF

แยก identity, routing, authorization correlation และ business transaction authority ดังนี้:

| Concept | Meaning and required handling |
|---|---|
| MONOLITH transaction reference | opaque reference แบบ server-created, server-stored, high-entropy พร้อม CSRF/session binding; bind tenant, principal/audience, resource, revision, action, expiry และ exact return target; one-time consumed แบบ atomic และไม่ใช่ ID-token nonce |
| LINE-managed liff.state | ข้อมูลเพิ่มเติมของ LIFF URL ที่ LINE ส่งต่อ เป็น untrusted routing input; not OAuth state, not permission และ not the MONOLITH transaction reference ให้ประมวลผล routing หลัง `liff.init()` resolve แล้วเท่านั้น |
| OAuth state | CSRF correlation สำหรับ separate supported authorization flow; flow นั้นสร้างและเก็บเอง; not liff.state และไม่ใช่ business permission |
| OIDC nonce | ID-token replay/correlation input; compare only when a separate supported authorization flow lets MONOLITH supply it และ LINE คืน ID-token claim |

หลัง verify identity แล้ว server ต้องโหลด authoritative revision และ permission ใหม่ bind exact-action review กับ MONOLITH transaction reference ใช้ MONOLITH step-up สำหรับ consequential action consume reference พร้อม command result แบบ atomic และเขียน immutable audit evidence ส่วน forwarded URL และ `liff.state` เสนอ routing ได้เท่านั้น ไม่ให้ permission และไม่เลือก authoritative tenant/resource/revision/action values

## 10. ตีความ Verification Receipt — Demo

Receipt แบบ demo ผูก generated transaction ID กับ demo tenant, recipient, revision, canonical action, outcome และเวลา confirmation แล้วแสดง local digest พร้อมแถบ `DEMO — NOT A PRODUCTION SIGNATURE`

Receipt นี้พิสูจน์เพียงว่า browser demo ปัจจุบันเดินผ่าน exact-value path ในเครื่อง ไม่ใช่ LINE delivery receipt, human identity proof, legal signature, MONOLITH audit record หรือ authorization decision ส่วน Signed Receipt จริงต้องใช้ Trust Kernel, authoritative server records, approved signer/key management, one-time transaction consumption และ durable audit

## 11. ใช้งานด้วยคีย์บอร์ด

- ใช้ `Tab` และ `Shift+Tab` ไปยัง control; กด `Enter` หรือ `Space` เพื่อใช้ปุ่ม
- บนแท็บ Header/Hero/Body/Footer ใช้ `ArrowLeft`, `ArrowRight`, `Home`, `End`
- บนแท็บ Editor/Preview/JSON ในจอแคบ ใช้ปุ่มเดียวกัน
- ใช้ skip link เพื่อข้ามไปพื้นที่ทำงาน
- native dialog จะกัก focus ระหว่างเปิด ใช้ Cancel หรือ `Escape` ออกจาก review แล้ว focus กลับ Run Journey
- ไม่ใช้ CTA ใน preview โดยตรง เพราะตั้งใจถอดออกจากลำดับ focus; Run Journey คือ controlled demo trigger

## 12. ล้าง demo state

- เลือก **Reset** เพื่อคืน current preset ระบบถามยืนยันเมื่อ draft ต่างจาก baseline เท่านั้น
- เปลี่ยน preset หรือ TH/EN เพื่อ rebuild draft และล้าง in-page transaction/receipt
- Reload หน้าเพื่อล้าง current-page memory; v1 Studio ไม่เก็บ draft แบบ persistence
- ลบไฟล์ JSON ที่ดาวน์โหลดเมื่อเลิกใช้ตามกติกา document retention ขององค์กร

## 13. แก้ปัญหา

| อาการ | ตรวจอะไร | การตอบสนองที่ปลอดภัย |
|---|---|---|
| Preview ว่าง | static server ทำงานหรือไม่ และเปิดผ่าน localhost แทน raw file หรือไม่ | Reload จาก localhost; เปิด browser console เฉพาะ development environment |
| Hero เสีย | local preview กับ exported URL เป็นคนละค่า ตรวจ `LineOS/assets/line-flex-studio/` และ Hero HTTPS URL | Restore preset; production ในอนาคตต้อง publish HTTPS JPEG/PNG ที่ถูกต้องแล้วทดสอบใหม่ |
| Invalid URL | Hero export URL ต้องเริ่ม HTTPS และอยู่ในขีดจำกัด URL | แก้ Hero field ห้ามใช้ `data:`, base64 หรือ URL ที่มี secret |
| Payload เกิน budget | byte status warning เมื่อเกิน 24 KB และ error เมื่อเกิน 30 KB | ลดข้อความ/โครงสร้างตกแต่งแล้วทดสอบใหม่ ห้าม bypass block |
| Clipboard denial | browser policy หรือ permission ปฏิเสธ clipboard | เลือก JSON ที่เห็นและ copy เอง หรือ Download JSON หลัง validation ห้ามลด browser security |
| Journey ไม่เปิด | มี blocking validation หรือขาด Web Crypto/dialog APIs | แก้ error หรือใช้ browser ปัจจุบัน อาการนี้ไม่ใช่หลักฐานว่า LIFF จริงเสีย |

## 14. ข้อสรุปหลังตรวจ

หลังซ้อมสำเร็จ ให้บันทึก preset, language, ความกว้างที่ตรวจ, การจัดการ findings และ demo receipt digest ไว้ใน review note ข้อสรุปที่ถูกต้องยังคงเป็น: **no message was sent และ no business state changed** ห้ามเปิด live customer delivery จน MONOLITH Trust P0 gates ผ่านด้วย fresh evidence

## แหล่งข้อมูลทางการ

Retrieved 2026-08-02:

- [Send Flex Messages และความต่างของ rendering](https://developers.line.biz/en/docs/messaging-api/using-flex-messages/)
- [Flex Message Simulator tutorial](https://developers.line.biz/en/docs/messaging-api/using-flex-message-simulator/)
- [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/nojs/)
- [Messaging API actions](https://developers.line.biz/en/docs/messaging-api/actions/)
- [Adding a LIFF app](https://developers.line.biz/en/docs/liff/registering-liff-apps/)
- [LIFF API reference: initialization และ login](https://developers.line.biz/en/reference/liff/)
- [Developing a LIFF app](https://developers.line.biz/en/docs/liff/developing-liff-apps/)
- [Opening a LIFF app และ `liff.state`](https://developers.line.biz/en/docs/liff/opening-liff-app/)
- [LINE Login API reference: server token verification](https://developers.line.biz/en/reference/line-login/)
