# ตัวอ่าน catalog B12 — ขอบเขตที่ทดสอบแล้ว

ตัวอ่าน scripts/line-b12-catalog.sql ส่ง JSON หนึ่งก้อนใน transaction แบบอ่านอย่างเดียว รายงาน identity ตาม matrix ครบ 20 ตัว รายการที่หาย/role ที่หาย owner และ SECURITY DEFINER, สิทธิ์ EXECUTE กับ schema USAGE ของทุก database role, ACL/grantor รวมค่าเริ่มต้น PUBLIC, membership options, overload เกินมา, default ACL ของฟังก์ชันใหม่ และ trigger dependency ไม่เรียกฟังก์ชันเป้าหมาย ไม่ส่ง body, password ของ role, connection string หรือค่าคอนฟิกฟังก์ชัน

## การตรวจ

เทสต์แรกไม่ผ่านเพราะยังไม่มีตัวอ่าน (เห็นใน tool transcript แต่ชุดนี้ไม่มีไฟล์ดิบ RED) รอบสุดท้ายบนข้อมูลจำลอง exit ศูนย์ผ่าน 19 ข้อ ครอบคลุม object/role ที่หาย, NULL ACL, inherited EXECUTE, overload เพิ่ม, default grant, trigger dependency และ fingerprint ACL ฟังก์ชันที่ไม่เปลี่ยน ทุก body ของฟังก์ชันเป้าหมายจะ raise หากถูกเรียก รายการที่หายแสดงว่าหาย ไม่กรองทิ้ง ตัวนี้เป็น inventory ไม่ใช่การอนุมัติหรือการรับรองความปลอดภัยอัตโนมัติ

runner ใช้ image postgres:18 ที่มีในเครื่องโดยล็อก image ID, network none, ไม่เปิดพอร์ตและไม่ใช้ credential ภายนอก ถอดเฉพาะ container ของตนหลังตรวจ label เจ้าของ รอบนี้ยังไม่ได้ทดสอบ PostgreSQL 17 หรือ baseline MONOLITH ที่ migrate ครบ จึงไม่พิสูจน์ production exposure หรือพฤติกรรมหลัง revoke เก็บหลักฐานเก่าไว้ตามเดิม

## วิธีรันซ้ำและขอบเขต

รันจาก product root: python tests/line-oa-commerce/ci/b12_catalog_check.py --output <new-directory> --image postgres:18 โฟลเดอร์ผลต้องยังไม่มี และ image ต้อง cache อยู่แล้ว ต้องใช้สิทธิ์ Docker runner สร้างเฉพาะฐานจำลองใหม่ ไม่รับ connection ของฐานที่มีอยู่ ห้ามเพิ่มเข้า CI ปกติโดยยังไม่กำหนด Docker runtime และ image ที่ใช้

รอบ MONOLITH ที่อนุมัติในอนาคตต้องใช้ stack ใหม่แยก migrate ครบ บันทึก hash source/SQL และเวอร์ชัน baseline รัน SQL แบบ ON_ERROR_STOP เก็บ JSON พร้อมคำสั่ง UTC exit และ checksum แล้วเทียบทุก signature/ที่มาสิทธิ์กับ matrix หาก object หาย overload เกิน หรือ KEEP/DECIDE ยังไม่ยืนยัน caller ต้องตรวจต่อ ไม่สรุปว่าผ่าน เอกสารนี้ไม่อนุญาตเข้า shared/production

## ไฟล์และขั้นต่อไป

empty.json, populated.json และ missing-one-role.json เป็น snapshot จำลอง result.json เก็บรายการตรวจ image และ hash SQL ส่วน context.json เก็บ hash source กับ exit/คำสั่งที่ผู้ดำเนินการรายงาน SHA256SUMS ป้องกัน byte ของชุดนี้ ไม่ใช่หลักฐานรันจากภายนอก ตัวอ่านไม่สำรวจ application caller และไม่ตัดสินข้อมูล ops/integration ที่ค้าง ยังไม่มี 0199 การเปลี่ยน grant, push, cron หรือข้อความลูกค้า
