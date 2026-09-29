# Review การ port LINE acknowledgement

Baseline: main `fbaf046a1c54299a7fa4c9144a65b877e98a19fc` ตรวจเทียบ remote วันที่ 22 กันยายน 2026 ทำงานบน branch `codex/reconcile-github-main` ใน PR #124 ตรวจ parent governance และ nested product แยกกันและรักษางานเดิมไว้

## การจับคู่ migration

- Main จบที่ `20270327_issue_notification_retry.sql` เพิ่ม migration ที่ยังไม่ merge ชื่อ `20270328_line_group_plain_ack.sql`
- ไม่คัดลอก nested `0163_line_org_id_function_fix.sql` เพราะเลขชนกับ storage migration ของ main
- Handler ที่มีผลล่าสุดใน baseline คือ `0177_field_purchase_line_flow.sql` ไม่ใช่ `0097` รุ่นก่อนหน้าของ PR จะทำให้ FPR handling หาย ผล CI สีเขียวเดิมไม่ได้ยืนยันการรักษา behavior นี้ รายงานนี้แก้ไขข้อสรุปนั้น
- Ingest RPC อ้างอิง baseline `0097` โดยเพิ่ม tenant ID ที่ schema รุ่นหลังต้องการใน group branch และ receipt ที่ไม่เก็บเนื้อหาสำหรับ acknowledgement ใหม่

## ขอบเขตที่ port

เพิ่ม shared acknowledgement template หนึ่งรายการ หลัง command และ FPR branches เดิม ข้อความทั่วไปในกลุ่ม active ที่ผูกแล้วสร้าง push หนึ่งรายการโดยใช้ org_id ของกลุ่ม Ingest transaction เก็บ receipt เป็น JSON ว่าง การส่ง event ID เดิมซ้ำไม่สร้าง push เพิ่ม กลุ่มที่ยังไม่ผูก กลุ่ม archived และสื่ออื่นใช้ behavior เดิม ไม่เขียนทับ guard หรือ template เก่า ไม่แก้ historical migration

แบบเดิมของ nested เสนอให้ตอบกลุ่มที่ยังไม่ผูกด้วย แต่ยังไม่นำ behavior นี้เข้ามาเพราะไม่ได้ผ่าน review กับ guard ของ baseline ปัญหาเดิมของ baseline ไม่ถูกแก้เงียบ ๆ ใน port นี้

## หลักฐานและข้อจำกัด

- Preservation test ใหม่ล้มกับ handler รุ่นก่อนของ PR และผ่านหลังแก้ นอก acknowledgement block ที่ระบุ handler ตรงกับ baseline 0177 ทุกไบต์
- Node contract suite: ผ่าน 2 ล้ม 0
- PostgreSQL fixture แยกใน local: ผ่าน ack ในกลุ่มที่ผูกแล้ว, org_id, receipt ว่าง, ส่ง event ซ้ำตามลำดับ, ไม่ตอบ archived/unbound, ไม่ตอบสื่ออื่น และลำดับ command ก่อน ack แล้ว rollback fixture
- Fixture จำลอง signature verification/channel resolution และไม่ได้จำลอง schema ทั้งหมด, RLS, sender หรือ LINE delivery จึงไม่พิสูจน์ cryptography, production tenancy, concurrency หรือการส่งจริง
- เพิ่ม CI workflow ที่รัน contract ทั้งสองแบบ ยังต้องตรวจ full-baseline CI ของ revision นี้ ผลเดิมบน `74d3914` ไม่ยืนยัน revision ใหม่
- ยังไม่ merge หรือ deploy production ข้อกำหนด review/signature/required check ยังมีผล

## ตรวจเพิ่มเติมที่ 09333cf

- GitHub แสดงผ่าน 35, ล้มเหลว 4, ข้าม 8 และรอรายงาน 1 check สาเหตุคือรายงานขาดหลักฐาน certification และ regex มีช่องว่างผิดกฎ ซึ่งทำให้ warning-budget และ Full Verify ล้มตาม เพิ่มหลักฐานและแก้ regex โดยคงกฎ lint
- Validate Site Files ค้างเพราะ PR path filter ไม่ครอบคลุมไฟล์ชุดนี้ ปรับให้รันทุก PR ที่เข้า main โดยคงขั้นตอนตรวจและ push filters
- เพิ่ม SQL test บังคับให้คิว outbound ล้ม ก่อนแก้พบว่าเก็บ inbound พร้อมข้อความจริง หลังแก้ RPC ให้โยนข้อผิดพลาดที่ไม่เผยข้อมูลและ rollback ทั้ง batch โดยไม่บันทึก receipt เพื่อให้ retry ได้ ทดสอบผ่านแล้ว และไม่ตีความ unique violation ที่ไม่เกี่ยวข้องเป็น duplicate
- เพิ่ม pgTAP 13 assertions บน schema เต็ม ครอบคลุม FPR รูป/จำนวนเงิน คำสั่งผูก/แจ้งปัญหา และเจ้าของ/เนื้อหาของ ack ใช้ ownership trigger จาก 20270326 ซึ่ง fixture ขนาดเล็กไม่มี ผล CI ใหม่ยังรอตรวจ การเทียบโค้ดเหมือนกันไม่ใช่ผล runtime
- GitHub ต้องการ verified signatures และผู้รีวิวที่มี write access อนุมัติอย่างน้อยหนึ่งคน ผู้เปิด PR คือ indetailsgroup-hue พบ suparatyanvinitchai-byte มีสิทธิ์ write แต่ยังไม่ได้รับ approval
- การตรวจ schema เป้าหมาย deploy และทดสอบรับส่งจริงใน Monolith Team ต้องรอ merge ตามลำดับ ยังไม่มีผลยืนยันการส่งจริง