# แบบระบบ MONOLITH LINE Flex Studio

- **ฉบับ:** ภาษาไทย
- **วันที่:** 1 สิงหาคม 2026
- **สถานะ:** อนุมัติ design ใน interactive review แล้ว; รอตรวจ written spec
- **ตำแหน่งส่งมอบ:** parent governance/bootstrap repository ภายใต้ **LineOS/**
- **Product repository:** nested repository แยกที่ **determined-williams/**; design นี้ไม่อนุญาตให้แก้ product runtime
- **แนวทางที่เลือก:** Production-shaped Standalone Studio
- **Journey หลัก:** แบบพร้อมอนุมัติ → ตรวจแบบส่วนตัวลักษณะ LIFF → ยืนยันเจตนาอย่างชัดเจน → Verification Receipt — Demo

## 1. คำตัดสินระดับบริหาร

MONOLITH จะสาธิต LINE ในฐานะ Human Surface ผ่านเครื่องมือสร้าง Flex Message และ simulator การตัดสินใจที่ทำงานใน browser แบบ standalone เครื่องมือนี้ใช้สำหรับการตัดสินใจของผู้บริหาร การออกแบบประสบการณ์ลูกค้า การฝึกทีม การตรวจ JSON และการวางแผน implementation รอบต่อไป โดยไม่เชื่อม LINE, Supabase, production credentials หรือการส่งข้อความถึงลูกค้าจริง

Design มีเป้าหมายสองด้านพร้อมกัน:

1. สร้างประสบการณ์ที่อบอุ่น พรีเมียม conversion สูง และทุกคนเข้าใจได้ทันที
2. ทำให้ trust boundary เห็นชัด: การแตะ Flex ไม่เท่ากับการอนุมัติทางธุรกิจ, LINE ไม่ใช่ system of record และ action ที่มีผลสำคัญต้องตรวจตัวตนและรายละเอียดผ่าน LIFF กับ MONOLITH Trust Kernel ใน production

การขยาย customer messaging ยังเป็น **NO-GO** จนกว่า Trust Foundation P0 gates ที่มีอยู่จะมีหลักฐานครบถ้วนและสดใหม่

## 2. Repository และ evidence baseline

MONOLITH เป็นระบบสอง Git root

| Root | บทบาทที่ยืนยันแล้วสำหรับ design นี้ | ผลต่อขอบเขต |
|---|---|---|
| Parent **C:\Users\thai3\determined-williams (2)** | Governance/bootstrap, research, LineOS HTML mock-up และ visual artifacts เดิม | Prototype standalone และเอกสารโครงการใหม่อยู่ภายใต้ **LineOS/** |
| Nested **C:\Users\thai3\determined-williams (2)\determined-williams** | Product source ปัจจุบัน มี LINE webhook, outbound sender, Flex template support, migrations, tests, workflow และ Trust Foundation design ที่อนุมัติแล้ว | Implementation เดิมเป็นหลักฐานและเป้าหมาย integration ในอนาคต Design นี้ไม่แก้ nested source และ source presence ไม่พิสูจน์ deployment หรือ production readiness |

Baseline นี้ทำตาม **CONTEXT.md** และ repository-scope correction วันที่ 21 กรกฎาคม 2026 ที่บังคับใช้ ตรวจ Git status ของทั้งสอง root แยกกันแล้ว และทั้งสองมี pre-existing changes ซึ่งยังอยู่นอกขอบเขต

Inventory ใน **LineOS/** มี role-based HTML mock-ups, archived variants หลายรุ่น, LINE OA/LIFF masterclass, งานวิจัย Coohom, แผนภาพ Flex blocks และ North Star approval flow แต่ยังไม่มี Flex editor ที่แก้แล้ว preview/JSON เปลี่ยน real time, validator, Mock LIFF journey หรือ receipt simulator ที่ทำงานได้จริง

Nested product มี:

- template composition model และ outbound sender ที่รองรับ Flex
- LINE OA webhook, identity, order, group, customer-document และ approval migrations
- LINE OA commerce test suites
- Trust Foundation design และ program plan หก wave ที่อนุมัติแล้ว

การมี source ไม่ใช่หลักฐาน deployment ดังนั้น design นี้ใช้ nested source เป็น production-shaped reference ไม่ใช่ live dependency

## 3. ฐานงานวิจัยและ evidence labels

ดำเนินการ Perplexity Deep Research สาม track เสร็จเมื่อวันที่ 1 สิงหาคม 2026:

1. LINE Messaging API, Flex Message, LIFF, Developer Console, performance และ security
2. Trust Kernel, tenant isolation, step-up, inbox/outbox reliability, audit, privacy และ human factors
3. ความครบถ้วนของผลิตภัณฑ์ตั้งแต่งาน interior design ถึง installation, roles, ความหลากหลายของตู้และ millwork, tools, service design และ ethical adoption

Implementation report ต้องแยก:

- **Official constraint:** ข้อกำหนดจาก LINE, มาตรฐาน, regulator หรือ primary authority
- **Verified local fact:** ข้อเท็จจริงที่พบใน Git root และไฟล์ที่ระบุ
- **Research evidence:** หลักฐาน peer-reviewed หรือ authoritative publication
- **Inference:** ข้อสรุปที่อนุมานจากข้อเท็จจริง
- **MONOLITH best practice:** กติกาการทำงานที่เราเสนอ
- **Unknown:** สิ่งที่หลักฐานปัจจุบันยังพิสูจน์ไม่ได้

Vendor maximum, ขนาดตู้ตามภูมิภาค หรือคำแนะนำจากงานวิจัยจะไม่กลายเป็น canonical product truth หากไม่มี provenance และ tenant/project configuration

## 4. Owner decisions ที่อนุมัติแล้ว

| เรื่องตัดสินใจ | ผลที่อนุมัติ |
|---|---|
| เรื่องหลัก | แบบพร้อมอนุมัติ → ตรวจ revision → ยืนยัน → รับ evidence receipt |
| Visual direction | Trust Concierge: อบอุ่น พรีเมียม และน่าเชื่อถือ |
| ลำดับแบรนด์ภายนอก | Tenant-first พร้อม trust mark **Secured by MONOLITH** ที่สุภาพ |
| ลำดับแบรนด์ภายใน | MONOLITH-first พร้อม tenant context ชัด |
| Simulator layout | Studio Console: เห็น editor, phone preview และ JSON/validation พร้อมกัน |
| Delivery boundary | Standalone browser demo; ไม่เชื่อม LINE หรือ Supabase จริง |
| Presets | ห้าชุด: design approval, quote/order, SLA escalation, curated site update และ issue/evidence |
| ความซื่อสัตย์ของ receipt | **Verification Receipt — Demo** พร้อม digest; ไม่อ้าง production signature เท็จ |
| แนวทางพัฒนา | Production-shaped standalone modules ไม่ใช่ story-only showroom และไม่ใช่ sandbox integration |
| ภาษา | UI และเอกสารภาษาไทยและอังกฤษ |

## 5. วัตถุประสงค์

Implementation แรกต้อง:

1. ให้ผู้ใช้แก้ Header, Hero, Body และ Footer
2. อัปเดต LINE-like phone preview, generated JSON และ validation real time
3. มี presets ห้าชุดโดยไม่ใช้ mutable state ร่วมกัน
4. สอนเส้นแบ่งที่ถูกต้องระหว่าง Flex actions, LIFF review และ MONOLITH business authority
5. จำลอง approval journey ที่ผูกกับ action เฉพาะและสร้าง demo receipt ที่ติดป้ายชัด
6. แสดง errors, warnings และ guidance พร้อมวิธีแก้สองภาษา
7. copy, download และ reset ได้โดยไม่พึ่ง network
8. ใช้งานได้ที่ desktop, tablet และ mobile widths
9. ใช้งานด้วย keyboard และอ่านข้อความไทย/อังกฤษได้ดี
10. มีเอกสาร research, installation และ decision ระดับคณะผู้บริหารสองภาษา

## 6. สิ่งที่ไม่อยู่ในขอบเขต

Implementation แรกจะไม่:

- ส่ง LINE message จริง
- สร้างหรือแก้ LINE Official Account, provider, channel หรือ LIFF app
- ใช้ channel access token, channel secret, service-role key หรือ production credential
- เรียก Supabase, LINE API, CDN, analytics หรือ external endpoint ใด ๆ
- authenticate LINE user จริง
- ลงนาม production receipt ด้วย governed private key
- อ้าง full Messaging API conformance เพียงเพราะ local validator ผ่าน
- แทนที่ official LINE Flex Message Simulator หรือการทดสอบบนเครื่องจริง
- ให้แก้ raw JSON โดยตรง
- ทำให้ LINE เป็น system of record, authorization service หรือ internal chat product
- นิยามขนาดตู้สากลแบบเดียว
- แก้ nested active product repository

## 7. Architecture และ safety boundary

### 7.1 Browser-only authoring path

Authoring path คือ:

**Preset Gallery / Block Editor → canonical FlexDraft → Phone Preview + JSON Builder + Validator**

Output ทั้งสามอ่านจาก immutable draft snapshot เดียว ไม่มี output ใดถือ business state แยก การเปลี่ยน tenant, recipient, revision, action หรือ expiry ต้องอัปเดตทุก derived surface

### 7.2 Simulated consequential-action path

Approval path คือ:

**Flex URI action → demo action router → Mock LIFF review → explicit confirmation → Verification Receipt — Demo**

Demo action router ผูก:

- tenant identity
- audience และ recipient
- project/resource reference
- revision
- canonical action
- payload digest input
- created time และ expiry
- correlation identifier

Mock LIFF แสดงผลกระทบที่แน่นอนและไม่ยืนยันหาก bound values ที่จำเป็นหาย หมดอายุ หรือขัดกัน จากนั้น simulator สร้าง evidence receipt แบบ deterministic นี่เป็นกลไกสอนและ review ไม่ใช่ production authorization ceremony

### 7.3 Future production boundary

เส้นทาง production ที่บันทึกไว้แต่ไม่เชื่อมคือ:

**Unified ingress → tenant/resource/principal resolution → Trust Kernel decision → domain command → decision audit + business state + atomic outbox → LINE delivery worker**

Production Trust Kernel ส่งผล **PERMIT**, **DENY**, **STEP_UP** หรือ **QUARANTINE** Standalone simulator จะไม่ทำเป็นว่าได้รันเส้นทางนี้

### 7.4 Non-bypass invariants

1. การแตะ Flex ไม่เท่ากับ business approval
2. High-risk action เปิด LIFF-style review ใน simulator เสมอ และ production ต้องใช้ Trust Kernel step-up
3. Tenant identity ต้องชัดใน draft, intent และ receipt แม้ภายนอกใช้ tenant-first branding
4. Group evidence ที่ quarantine ห้ามเปลี่ยน workflow state
5. Generated JSON ห้ามมี secret, bearer token, raw personal-data master หรือ authoritative business state
6. ราคา ขนาด revision และ status ใน presets เป็น demo data จนกว่าจะอ่านจาก MONOLITH ผ่าน integration ที่อนุมัติในอนาคต

## 8. User experience architecture

### 8.1 Desktop Studio Console

Desktop layout มีสามพื้นที่ถาวร:

1. **ซ้าย:** tenant/language context, preset gallery, block selector และ field controls
2. **กลาง:** LINE-like phone preview และ Run Journey control
3. **ขวา:** generated JSON, copy/download controls และ validation summary

Header แสดง MONOLITH platform identity, tenant ปัจจุบัน, ภาษา และ help ส่วน customer-facing preview ใช้ tenant-first branding

### 8.2 Tablet และ mobile

เมื่อจอแคบ สามพื้นที่เปลี่ยนเป็น tabs:

- Editor
- Preview
- JSON & Validation

การเปลี่ยน tab รักษา FlexDraft เดิม ไม่ทิ้งข้อมูลหรือ validation state และ primary action ต้องเข้าถึงด้วย keyboard โดยไม่พึ่ง hover

### 8.3 Trust Concierge visual system

Visual system ใช้:

- warm neutrals สำหรับ project imagery และความเป็น hospitality
- MONOLITH green สำหรับ trust, primary action และ verified state
- restrained gold สำหรับ deadline หรือ attention
- spacing โปร่ง, rounded surfaces และ plain-language labels
- CTA หลักหนึ่งตัวที่เด่น
- revision, sender, expiry และ private-link cues ที่ชัด
- tenant logo/name นำใน customer-facing message
- trust mark **Secured by MONOLITH** แบบสุภาพ

Motion เป็น optional, สั้น และปิดเมื่อผู้ใช้เลือก reduced motion ข้อความ approval ไม่แสดง celebratory animation ก่อนยืนยัน

## 9. Canonical draft และ derived records

### 9.1 FlexDraft

| กลุ่ม | Fields ที่ต้องมี |
|---|---|
| Context | draft version, preset ID, tenant ID/name, audience, language และ demo status |
| Header | eyebrow, title, tenant mark และ status label |
| Hero | local preview asset ID, exported HTTPS URL placeholder, aspect ratio, aspect mode และ accessible description |
| Body | project, resource, revision, requester, amount/scope, deadline, summary และ trust note |
| Footer | primary label, secondary label เมื่ออนุญาต และ action intents |
| Intent | canonical action, risk tier, target mode, target reference และ expiry |
| Evidence | correlation ID, created time, recipient reference และ digest input |

Draft model มี domain-neutral fields เท่าที่ห้า presets ต้องใช้ และไม่พัฒนาเป็น generic workflow engine

### 9.2 Generated Flex JSON

JSON Builder สร้าง LINE Flex message envelope ที่มี alternative text และหนึ่ง bubble พร้อม Header, Hero, Body และ Footer ตามลำดับมาตรฐาน

รุ่นแรกรองรับหนึ่ง bubble ส่วน carousel authoring, video, rich text spans, raw JSON import และ arbitrary component nesting อยู่นอกขอบเขต Validator อาจสอนข้อจำกัด carousel/video แต่ editor จะไม่สร้างสิ่งเหล่านั้น

### 9.3 Demo transaction

Demo transaction สร้างเมื่อกด Run Journey โดยมี exact intent และ snapshot digest input หากเปลี่ยน bound value จะทำให้ transaction และ receipt เดิมใช้ไม่ได้

### 9.4 Verification Receipt — Demo

Receipt แสดง:

- ป้าย **DEMO — NOT A PRODUCTION SIGNATURE** ที่เห็นชัด
- tenant และ customer-facing provider
- recipient reference
- project/resource และ revision
- canonical action และ outcome
- created และ confirmed timestamps
- correlation identifier
- SHA-256 integrity digest ของ canonical demo fields
- ข้อความว่า production signing และ audit ต้องผ่าน MONOLITH Trust Kernel

Digest แสดงการตรวจจับการเปลี่ยนแปลง และจะไม่ถูกเรียกว่า non-repudiation, legal signature, immutable archive หรือ production attestation

## 10. Contract ของ presets ทั้งห้า

| Preset | LINE surface | หน้าที่ของ Flex | หน้าที่ของ Mock LIFF / MONOLITH | Shortcut ที่ห้าม |
|---|---|---|---|---|
| Design Approval | OA 1:1 หรือ personal push | สรุป revision, consequence, sender และ deadline; URI เปิด review | ผูก recipient/tenant/revision/expiry; explicit confirmation; receipt | อนุมัติด้วย postback แตะครั้งเดียว |
| Quote / Structured Order | OA 1:1 | สรุปราคาและเงื่อนไข; URI เปิด review; message action ใช้ขอให้มนุษย์ติดต่อกลับได้ | เลือก option, ยืนยันผู้สั่งและ delivery details, สร้าง structured intent | ถือ free text เป็น order |
| SLA Escalation | Personal push | Postback ใช้ acknowledge receipt ที่ low-risk; URI เปิด authoritative work item | แสดง owner, SLA clock, delegation และ exact action; high-risk ต้อง step-up | ถือ acknowledgement เป็น approval หรือ workflow transition |
| Curated Site Update | Customer group | แสดง progress ที่มนุษย์คัดแล้ว; URI เปิด curated gallery ได้ | บังคับ audience policy และ approved evidence set | auto-forward รูป internal |
| Issue / Evidence | Internal group | Postback ใช้รับทราบ; URI เปิด review queue | เก็บ provenance; unknown actor เข้า quarantine; มนุษย์ promote หรือ reject | ให้ evidence ที่ quarantine เปลี่ยน business state |

## 11. กฎเลือก Flex action เทียบกับ LIFF

| เงื่อนไข | Action ที่เลือก |
|---|---|
| ผลที่ต้องการคือ conversational text ที่ผู้ใช้เห็น | Message action |
| ตัวเลือก low-risk, reversible และ server reauthorize ได้ครบ | Postback action พร้อม opaque intent reference |
| ปลายทางเป็น read-only content, เว็บไซต์ทั่วไป หรือ telephone link | URI action |
| งานต้องใช้ identity, sensitive details, form, comparison, accessibility, confirmation หรือ policy explanation | URI action ที่เปิด LIFF |
| Action เปลี่ยนเงิน สิทธิ์ scope revision release policy หรือ state ที่ย้อนยาก | LIFF พร้อม production Trust Kernel step-up |

LIFF ไม่ใช่ Messaging API action type แยก ปุ่ม Flex เปิด LIFF ผ่าน URI action Postback data จะไม่บรรจุ tenant, role, amount หรือ approval truth ที่เป็น authoritative; production MONOLITH ต้อง resolve และ reauthorize current state ใหม่

## 12. Validation contract

### 12.1 Rule metadata

Validation rule ทุกข้อมี:

- stable rule ID
- severity
- block และ field ที่เกี่ยวข้อง
- title, explanation และ remediation ภาษาไทย/อังกฤษ
- classification ว่าเป็น official constraint หรือ MONOLITH best practice
- primary source URL เมื่อมี
- last-verified date
- client/version note เมื่อจำเป็น

### 12.2 Severity behavior

| Severity | ความหมาย | พฤติกรรม UI |
|---|---|---|
| Error | Generated message ไม่อยู่ใน supported subset หรือ safety field ที่จำเป็นหาย | Highlight field/block; รักษา input; ปิด JSON export และ Run Journey |
| Warning | Message อาจ render ไม่ดี เกิน MONOLITH soft budget ทำให้ intent สับสน หรือใช้ unsafe action pattern | Export ได้พร้อม warning count ที่เห็นชัดและวิธีแก้เฉพาะ |
| Guidance | การสอน ขั้น official simulator real-device check หรือ production-boundary reminder | ไม่ block และมี source link |

### 12.3 Official constraints ที่รองรับ

Initial registry ครอบคลุมอย่างน้อย:

- Flex message type, alternative text และ contents ที่จำเป็น
- หนึ่ง bubble พร้อม blocks ตามลำดับ Header → Hero → Body → Footer
- alternative-text maximum 1,500 characters
- one-bubble definition size ceiling 30 KB
- HTTPS image URL, supported format และ aspect behavior
- image URL maximum 2,000 characters, image maximum 1024×1024 pixels และ 10 MB ในฐานะ acceptance ceilings
- button action และ button-label requirements
- Postback และ Message data/text limits 300 characters
- URI limit 1,000 characters
- known feature/version notes เมื่อเกี่ยวข้อง

Official acceptance ceilings ไม่ใช่ performance targets

### 12.4 MONOLITH best-practice warnings

Initial best-practice registry ครอบคลุม:

- dominant CTA มากกว่าหนึ่ง
- high-risk postback
- transaction-critical facts อยู่เฉพาะในรูป
- fixed-height text container
- copy ยาว, Thai/English wrapping และชื่อที่ไม่จำกัด
- contrast ต่ำหรือไม่มี textual equivalent
- image ratio/cropping risk ที่ไม่ชัด
- external URL host ที่ไม่อยู่ใน future production allowlist
- ไม่มี deadline, revision, sender, audience หรือ consequence
- ไม่ติดป้าย demo/prod boundary

## 13. Performance และ rendering contract

1. Prototype ใช้ local visual assets และไม่ส่ง external request
2. HTTPS image URL ที่ผู้ใช้กรอกจะแสดงใน JSON แต่รุ่นแรกไม่ fetch; preview ใช้ local placeholder และแยกแสดง exported URL
3. ไม่ฝัง base64 image ใน generated Flex JSON
4. วัด generated bubble JSON เป็น UTF-8 bytes เทียบ official ceiling 30 KB
5. UI เตือนก่อนชน ceiling โดยใช้ MONOLITH soft budget 24 KB
6. Preview widths มี 320, 360 และ 390 pixels พร้อม desktop canvas scaling
7. Tests ครอบคลุมไทย อังกฤษ ชื่อยาว emoji currency date และ explicit line wrapping
8. Layout ตื้นและไม่พึ่ง pixel-perfect assumption ของ LINE clients
9. Official image/video maxima บันทึกเป็น ceilings; guide แนะนำ media ที่เล็กกว่ามาก
10. Simulator ใช้งานได้แม้ไม่มีรูป
11. Reduced-motion preference ตัด animation ที่ไม่จำเป็น
12. Standalone app ไม่มี analytics, remote fonts หรือ third-party runtime library

## 14. Error และ state handling

- Invalid field ไม่ลบหรือ reset input อื่น
- Validation focus field และ block ที่ผิด
- การสลับ preset สร้าง fresh draft snapshot และไม่ mutate source preset
- Reset ขอ confirmation เฉพาะเมื่อ draft ต่างจาก preset
- Copy และ download รายงาน success หรือ failure ชัด
- ปิด Run Journey ขณะมี blocking errors
- Demo transaction ที่หมดอายุหรือ inconsistent ต้อง fail closed และอธิบาย bound value ที่เปลี่ยน
- Hero ที่หายหรือเสียใช้ local fallback โดย layout ไม่ยุบ
- Receipt generation ไม่แสดง production-success claim
- App อาจเก็บ local draft เพื่อรอด refresh แต่ approval correctness ไม่พึ่ง storage; Clear Draft ลบ local demo data

## 15. Accessibility และ ethical adoption

Prototype มุ่ง WCAG 2.2 AA practices ที่เหมาะกับ standalone demonstration:

- semantic headings, labels, buttons, tables และ dialogs
- keyboard operation ครบและ focus มองเห็น
- ไม่ใช้สีเพียงอย่างเดียวสื่อ state
- contrast อ่านได้และ text scale ได้
- alternative text และ validation สองภาษา
- reduced motion
- error summary ผูกกับ field
- อธิบาย consequence ด้วยภาษาง่ายก่อน confirm

Service-design guidance ห้าม coercive retention, false urgency, preselected consent, hidden refusal, notification spam และ success animation ก่อน business confirmation Retention ต้องเกิดจากลดงานซ้ำ ตัดสินใจเร็ว โปร่งใส มี quiet hours, consent, portability, human support และ service recovery ที่ดี

## 16. รูปแบบเอกสาร

เอกสารโครงการสร้างภาษาอังกฤษและไทย โดยแต่ละภาษามี Markdown และ standalone HTML

| Deliverable | เนื้อหาบังคับ |
|---|---|
| Executive Deep Research Report | LINE สามเส้น, P0–P3 gaps, threat model, product/domain matrix, role scorecard, ethical adoption, roadmap, KPI hypotheses และ board go/no-go |
| Flex Studio User Guide | Presets, editing, preview, validation, copy/download, Mock LIFF และ receipt |
| Developer Console Installation Guide | OA/provider/channel/LIFF setup, endpoint/scopes/webhook configuration, validation, test และ rollback steps |
| Flex Action vs LIFF Guide | Decision matrix, examples, risk tier และ anti-patterns |
| Performance and Rendering Checklist | Payload, media, layout, ไทย/อังกฤษ, device/version, accessibility และ failure testing |
| Design และ Implementation Records | Spec นี้, implementation plan, verification report และ residual-risk statement |

Installation guide ต้องระบุวันที่ตรวจ LINE console/document เพราะ UI และ terminology เปลี่ยนได้ และใช้ official LINE sources สำหรับ technical instructions

## 17. Planned file boundary

Implementation plan สร้างไฟล์ได้เฉพาะภายใต้ **LineOS/** เว้นแต่ owner decision ในอนาคตขยายขอบเขต

| Planned file | หน้าที่ |
|---|---|
| **LineOS/line-flex-studio.html** | Semantic application shell และ dialogs |
| **LineOS/line-flex-studio.css** | Trust Concierge tokens, layout, responsive และ print styles |
| **LineOS/line-flex-studio.mjs** | UI controller และ event wiring |
| **LineOS/line-flex-model.mjs** | Draft creation, immutable updates และ canonicalization |
| **LineOS/line-flex-presets.mjs** | Preset definitions สองภาษาห้าชุดแบบ immutable |
| **LineOS/line-flex-json.mjs** | Flex JSON generation สำหรับ supported subset และ byte measurement |
| **LineOS/line-flex-validator.mjs** | Validation registry พร้อม source labels และ evaluation |
| **LineOS/line-flex-actions.mjs** | Action-risk selection และ demo transaction binding |
| **LineOS/line-flex-receipt.mjs** | Canonical receipt input และ SHA-256 digest |
| **LineOS/assets/line-flex-studio/** | Local demo visuals และ icons |
| **LineOS/tests/*.test.mjs** | Node built-in unit tests |
| **LineOS/docs/** | Research, guides, design, plan และ reports สองภาษา |

ไม่มีไฟล์ใน nested product repository อยู่ใน implementation cycle นี้

## 18. Verification strategy

### 18.1 Test-first core behavior

เขียน automated tests ก่อน production module behavior สำหรับ:

- immutable preset/draft isolation
- deterministic JSON
- required field และ byte-limit validation
- official-constraint เทียบ best-practice classification
- action selection ตาม intent และ risk
- high-risk postback rejection
- transaction expiry และ bound-value invalidation
- deterministic receipt digest
- digest เปลี่ยนเมื่อ tenant, recipient, revision หรือ action เปลี่ยน
- secret-shaped value rejection เมื่อเกี่ยวข้อง

### 18.2 Browser verification

Browser checks ครอบคลุม:

- presets ทั้งห้า
- ทุก editable field และ block
- preview/JSON/validation update แบบ real time
- copy/download/reset
- Mock LIFF review และ explicit confirmation
- expired และ changed-revision failures
- receipt label และ digest
- keyboard-only navigation
- layout ที่ 1440, 1024, 768, 390, 360 และ 320 pixels
- long text ไทย/อังกฤษ, broken hero และ reduced motion
- ไม่มี external network request

### 18.3 Documentation verification

Checks ยืนยัน:

- มีคู่ English/Thai Markdown และ HTML
- HTML เริ่มด้วย doctype, ประกาศภาษาให้ถูก และเปิดเดี่ยวได้
- headings, tables, links และ code samples render
- ไม่มี placeholder, status ขัดกัน, broken internal link หรือ unsupported production claim
- official technical claim ทุกข้อมี primary source

## 19. Acceptance gates

1. Presets ทั้งห้าสร้าง deterministic JSON โดยไม่มี shared mutable state
2. การแก้ทุก block อัปเดต preview, JSON และ validation ทันที
3. High-risk action เปิด Mock LIFF เสมอ; postback จำกัดที่ low-risk acknowledgement patterns
4. Invalid draft export หรือ run journey ไม่ได้ และได้รับ bilingual field-level remediation
5. Receipt digest เปลี่ยนเมื่อ tenant, recipient, revision, action หรือ canonical payload เปลี่ยน
6. App ไม่ส่ง external request และไม่มี secret หรือ live-send path
7. Keyboard และ responsive checks ผ่านที่ widths ที่ประกาศ
8. Thai/English wrapping, long text, missing media และ payload warnings ผ่านการตรวจ
9. Installation และ action guidance แยก official LINE constraints จาก MONOLITH best practices
10. Executive report ระบุ **NO-GO** สำหรับ broader customer messaging จน Trust P0 release gates ผ่านทั้งหมด

## 20. Production expansion gates

Prototype ไม่เปลี่ยน Trust Foundation stop rule ที่อนุมัติแล้ว ก่อน broader customer messaging หรือ tenant ที่สองแบบ live MONOLITH ต้องพิสูจน์:

1. tenant mapping ที่ไม่กำกวมสำหรับ active LINE/project records
2. unified signature-verified ingress และ safe processing leases
3. OAuth/OIDC state และ nonce verification
4. action-bound, expiring, one-time step-up
5. group actor authorization และ unknown-actor quarantine
6. atomic business state, decision audit และ delivery intent
7. outbox concurrency, stable retry, duplicate และ unknown-after-send recovery
8. cross-tenant denial, revocation, expiry และ non-transitive delegation
9. tamper-evident audit, retention, purge และ secret/PII controls
10. second-tenant shadow proof โดย block live delivery
11. backup/restore, monitoring, operator reconciliation และ rollback rehearsal
12. ไม่มี Critical หรือ High finding ที่ยังไม่แก้ใน Trust Foundation scope

## 21. Primary references

- [LINE Flex Message elements](https://developers.line.biz/en/docs/messaging-api/flex-message-elements/)
- [Using Flex Messages](https://developers.line.biz/en/docs/messaging-api/using-flex-messages/)
- [Flex Message layout](https://developers.line.biz/en/docs/messaging-api/flex-message-layout/)
- [Messaging API actions](https://developers.line.biz/en/docs/messaging-api/actions/)
- [Registering LIFF apps](https://developers.line.biz/en/docs/liff/registering-liff-apps/)
- [LIFF development guidelines](https://developers.line.biz/en/docs/liff/development-guidelines/)
- [Verify webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)
- [Retrying API requests](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)
- [OAuth 2.0 Security Best Current Practice, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)
- [NIST SP 800-207 Zero Trust Architecture](https://csrc.nist.gov/pubs/sp/800/207/final)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคลของประเทศไทย](https://www.mdes.go.th/uploads/tinymce/source/%E0%B8%AA%E0%B8%84%E0%B8%AA/Personal%20Data%20Protection%20Act%202019.pdf)
- Local **CONTEXT.md**
- Local repository-scope correction วันที่ 21 กรกฎาคม 2026
- Nested **docs/superpowers/specs/2026-07-26-line-trust-foundation-design.th.md**
- Nested **docs/superpowers/plans/2026-07-26-line-trust-foundation-program.th.md**

## 22. Completion definition ของ design cycle

Design cycle เสร็จเมื่อ:

- มี written spec ภาษาอังกฤษและไทยพร้อม standalone HTML คู่กัน
- ไฟล์ผ่าน placeholder, consistency, scope และ ambiguity review
- ผู้ใช้อนุมัติ written spec
- สร้าง implementation plan สองภาษาผ่าน approved planning workflow

การอนุมัติ design นี้ไม่ได้หมายความว่า implementation เริ่มหรือเสร็จแล้ว
