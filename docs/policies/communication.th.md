# นโยบายการสื่อสาร MONOLITH

มติเจ้าของ: 30 กันยายน 2026 ฉบับอังกฤษ: [Communication policy](communication.en.md)

## ข้อตกลง

MONOLITH ใช้ LINE สำหรับการสื่อสารของทีมและการแจ้งเตือนถึงคน มติสุดท้ายของเจ้าของให้ถอดผู้ให้บริการสื่อสารที่ยกเลิกออกจากชุดไฟล์ปัจจุบันทั้งหมด ทั้งโค้ดที่ใช้งาน ตัวอย่าง สคริปต์สร้างเอกสาร ข้อความประวัติ เอกสาร Word ที่ส่งมอบ และเนื้อหาใน ZIP ไม่มีข้อยกเว้นให้เก็บไว้ ห้ามคืนเนื้อหาที่ลบออกแล้วจากบทสนทนาเก่า template หรือ roadmap

การส่ง LINE อัตโนมัติต้องใช้ LINE OA ผ่าน Messaging API ที่ได้รับอนุญาต การเลือกช่องทางไม่ได้พิสูจน์ว่าเชื่อมต่อสำเร็จ ต้องตรวจผู้รับ สิทธิ์ การส่ง และการจัดการความล้มเหลวก่อนอ้างว่าเปิดใช้ ห้ามสร้างตัวส่งใหม่หรือส่งข้อความทดสอบเพียงเพื่อแทน workflow ที่ยกเลิก ให้ประสานตามขอบเขตงาน LINE OA ที่มีอยู่ การถอดครั้งนี้ไม่ยกเลิกสัญญา Email, Teams หรือ PagerDuty ที่ไม่เกี่ยวข้อง

## รายการ source และสิ่งที่ยังขาด — 30 กันยายน 2026

รายการลงวันที่นี้ครอบคลุมตัวส่งข้อความ LINE ขาออกใน [monolith-workspace ที่ 14ec24bc](https://github.com/indetailsgroup-hue/monolith-workspace/tree/14ec24bcb1186914893dd7aa43448c9a794fe15c) เป็น snapshot ของ source ไม่ใช่รายงานสถานะสดหรือหลักฐานการ deploy หรือการส่งสำเร็จ ไม่รวมการส่งอีเมล การยืนยันตัวตน ต่ออายุ token และรับสื่อ เช่น line-login, line-token-refresh, capture-media-worker และ customer-design-view

| ส่วนประกอบใน supabase/functions | หลักฐานใน source | ผลตรวจ |
|---|---|---|
| notify-overdue/index.ts | บรรทัด 112 เรียก notify-api.line.me/api/notify | LINE Notify รุ่นเก่า ขัดกับนโยบายที่ต้องใช้ Messaging API ยังรอแก้ |
| etax-risk-notify/index.ts | บรรทัด 61 เรียก notify-api.line.me/api/notify | ปัญหารุ่นเก่าเช่นเดียวกัน ยังรอแก้ |
| field-purchase-line/index.ts | บรรทัด 267 และ 283 เรียก Messaging API reply/push | มี implementation ตัวส่ง ยังไม่ตรวจการส่งจริงในงานนี้ |
| notification-retry-worker/index.ts | บรรทัด 204 เรียก Messaging API push | มี implementation ตัวส่ง ยังไม่ตรวจการส่งจริงในงานนี้ |
| line-outbound-sender/index.ts | บรรทัด 527 ระบุ endpoint ของ Messaging API | มี implementation ตัวส่ง ยังไม่ตรวจการส่งจริงในงานนี้ |
| line-oa-dispatch-worker/index.ts | บรรทัด 155–183 สร้างคำขอไป Messaging API | มี implementation ตัวส่ง ยังไม่ตรวจการส่งจริงในงานนี้ |
| การแจ้ง deploy ของ GitHub | ไม่พบตัวส่งแจ้ง deploy ผ่าน LINE ใน workflow ที่ตรวจ | หลังยกเลิก workflow เดิม ชุด workflow นี้ไม่มีช่องทางแจ้ง deploy อัตโนมัติ ต้องดู GitHub Actions โดยตรง |

LINE Notify สิ้นสุดบริการวันที่ 31 มีนาคม 2025 และ API ใช้งานไม่ได้แล้ว การเรียกสองจุดข้างต้นใช้แทน LINE OA ไม่ได้ [ประกาศทางการของ LINE](https://developers.line.biz/en/news/2025/04/01/line-notify/)

เมื่อปรับรายการ ต้องระบุ repository และ revision ของ source ที่ตรวจ ถ้า workspace แยก governance กับผลิตภัณฑ์เป็นคนละ repository ต้องตรวจทั้งสอง ห้ามขยายผลจาก checkout เดียวเป็นข้อสรุปทั้งผลิตภัณฑ์ การมี source และเทสต์ผ่านเพียงอย่างเดียวไม่ได้ยืนยันการส่งจริง

## การถอดและป้องกันการกลับมา

การแก้ไขนี้ลบ workflow แจ้ง deploy เดิมและรายการอ้างอิงใน CI, test และ README ปรับ roadmap ตัวอย่าง alert เอกสาร onboarding และสคริปต์สร้างเอกสารให้ใช้ช่องทางที่ตกลง และระบุส่วนที่ยังไม่ทำว่าเป็นข้อกำหนด บรรทัดบทสนทนาเก่าที่อ้างผู้ให้บริการที่ยกเลิกถูกแทนด้วยข้อความแจ้งการลบอย่างชัดเจน จึงไม่ใช่สำเนาประวัติแบบทุกตัวอักษรอีกต่อไป สารบัญของ archive ระบุหกแชตที่ถูกแก้ และไฟล์ checksum คำนวณใหม่ให้ตรงกับไฟล์ที่แก้แล้ว ส่วน hash ของต้นทางและจำนวนนับใน manifest เป็นค่าของข้อมูลก่อนตัดเนื้อหา การแก้นี้ไม่ได้สร้างหลักฐานเท็จว่า LINE เคยส่งได้ในอดีต ส่วนที่ไม่เกี่ยวข้องยังคงอยู่

เจ้าของไม่ให้เก็บ comment migration เดิม เนื้อหาการสื่อสารเดิมใน Word/ZIP หรือข้อความเดิมของสคริปต์สร้างเอกสาร จึงคงการลบใน migration 0180 ไว้ แม้แก้เพียง comment แต่ path ใต้ `supabase/migrations/**` ตรงกับเงื่อนไข push ของ ci.yml ซึ่งอาจต่อจากการตรวจ schema production ไป deploy Edge Functions เมื่อผ่านเงื่อนไข ต้องประเมินผลนี้ก่อน merge การแก้นี้มีโอกาสสั่ง deploy ได้

required check เดิมชื่อ Validate Site Files รันตัวตรวจนโยบายการสื่อสารทุก PR เข้า main ตรวจไฟล์ปกติที่ติดตามด้วย Git และไฟล์ใหม่ที่ไม่ถูก ignore ชื่อไฟล์ และ byte ดิบ ASCII/UTF-8 กับ UTF-16 LE/BE รวมเนื้อหาหลัง NUL byte ด้วย ตรวจสมาชิก ZIP/Office แบบซ้อน ชื่อสมาชิก comment และข้อความที่แสดงใน XML/HTML รวมคำที่แบ่งคนละ text run และ entity รายงานเฉพาะตำแหน่ง ไม่แสดงเนื้อหาที่พบหรือค่า secret

ไฟล์ owner-lock ของ Office ที่ขึ้นต้นด้วย `~$` เก็บข้อมูลเจ้าของแบบ binary ไม่ใช่ workbook ตัวตรวจยังตรวจชื่อและเนื้อหาดิบ รวมถึง ZIP ภายในถ้ามี ไม่ยอมรับ manifest ข้อยกเว้น การนำ manifest เดิมกลับมาจะทำให้ตรวจไม่ผ่าน ชื่อที่ห้ามถูกประกอบจาก code point ในตัวตรวจและเทสต์ จึงไม่ต้องยกเว้น source ของตัวตรวจเอง Archive ที่อ่านไม่ได้ เข้ารหัส หรือเกินขีดจำกัดจะล้มแทนการข้าม ขีดจำกัดต่อไฟล์ชั้นนอกคือ archive 8 ชั้น เนื้อหาหลังคลายบีบอัด 128 MiB และสมาชิกที่เป็นไฟล์ 10,000 รายการ

แยกนับไฟล์ปกติ สมาชิก archive ที่ตรวจ payload ดิบ และ path ที่ไม่ใช่ไฟล์ปกติซึ่งข้าม ไม่ตรวจเป้าหมาย symlink, submodule, repository ซ้อน, ไฟล์ที่ ignore, ประวัติ Git หรือ OCR ของภาพ Encoding แบบอื่นและ string ที่คำนวณขึ้นยังต้องให้คนตรวจ ผล PASS ยืนยันเฉพาะการตรวจเนื้อหาตามขอบเขต ไม่ใช่การตรวจความหมายอย่างครบถ้วนหรือหลักฐานของ repository อื่น ถ้า Git อ่านรายการไฟล์ไม่สำเร็จ คำสั่งจะคืน exit status ที่ไม่ใช่ศูนย์

รันตรวจในเครื่อง:

```bash
python tools/check_communication_policy.py
python -m unittest discover -s tests/docs -v
python -m scripts.docs.site_data
```

## เอกสารส่งมอบและ archive

การถอดวันที่ 30 กันยายน 2026 ปรับไฟล์แปดรายการข้างล่างในตำแหน่งเดิม รวม Word อีกหกสำเนาที่ซ้อนอยู่ใน SOP package โดยไม่สร้างสำเนาเก็บเนื้อหาเดิม ไฟล์ที่มีคำว่า “backup” ในชื่อก็ถูกแก้ด้วย ชื่อไฟล์ไม่ได้ให้สิทธิ์ยกเว้น ฉบับ accepted ถูกปรับจริง ไม่จัดเป็นหลักฐานประวัติที่ห้ามแตะ สคริปต์สร้างเอกสารปัจจุบันและสำเนาใน package คงข้อความเกณฑ์เปิดใช้ที่ปรับแล้ว

| ไฟล์ | ขอบเขตการถอด |
|---|---|
| monolith/monolith_project_summary_v25_accepted.docx | ข้อความเอกสารหลัก พร้อมข้อความแจ้งการปรับสองภาษา |
| monolith/monolith_project_summary_v25_accepted_pre_accept_s56_backup.docx | ปรับแบบเดียวกัน |
| monolith/monolith_project_summary_v25_accepted_pre_accept_s57_backup.docx | ปรับแบบเดียวกัน |
| monolith/monolith_project_summary_v25_accepted_pre_accept_s58_backup.docx | ปรับแบบเดียวกัน |
| monolith/monolith_project_summary_v25_accepted_pre_s57_backup.docx | ปรับแบบเดียวกัน |
| monolith/monolith_project_summary_v25_accepted_pre_s58_backup.docx | ปรับแบบเดียวกัน |
| MONOLITH_SOP_Package_v2.5.zip | สมาชิก HTML สามไฟล์ |
| monolith/MONOLITH_SOP_Package_v2.5.zip | สคริปต์ Python สองไฟล์ HTML สองไฟล์ และ Word ซ้อนหกไฟล์ |

ข้อความ LINE ในเอกสารเหล่านี้กำหนดว่าต้องได้รับอนุญาตและยืนยันการส่งก่อนเปิดใช้ ไม่ใช่การอ้างว่า LINE เคยใช้งานในอดีตหรือพิสูจน์การส่งแล้ว XML ของ Word ที่ปรับยังแก้การ escape อักขระใน text node ที่ผิดรูปแบบเดิม โดยไม่เปลี่ยนข้อความที่แสดง การตรวจ ZIP และ XML ไม่ได้ยืนยันหน้าตาเอกสาร การเปิดดู Word ที่ render แล้วเป็นการตรวจอีกขั้นเมื่อมี renderer ที่รองรับ

## ขอบเขตการนำขึ้นใช้งาน

workflow แจ้ง deploy เดิมถูกปิดด้วยมือบน GitHub วันที่ 30 กันยายน 2026 การลบ workflow ใน repository มีผลผ่านกระบวนการ release ที่ผ่าน review นโยบายนี้ไม่ได้เปิดตัวแจ้ง deploy ผ่าน LINE ผู้ดูแลต้องดู GitHub Actions โดยตรงจนกว่าตัวทดแทนจะมีหลักฐานการส่ง patch นี้ไม่เขียนประวัติ Git หรือประวัติ workflow บน remote ใหม่ ส่วน secret ระดับ repository หรือ environment ถ้ามี ต้องตรวจด้วยสิทธิ์ที่เหมาะสมโดยดูเฉพาะชื่อ ไม่จำเป็นต้องอ่านค่า ตัวตรวจไม่เรียกข้อมูลจากระบบจัดเก็บ credential หรือแสดงค่าที่ค้นพบ
