# Baseline MONOLITH สำหรับ B12 — หลักฐาน catalog

30 กันยายน 2026 ฐาน 5caee238e7f7d977353d7659d3c4e45ad0e01e7d รอบนี้สร้าง migration chain ของผลิตภัณฑ์บน stack ชั่วคราว ไม่ใช่ production หรือหลักฐานหลัง 0199

## ผล

Migrate จากศูนย์ครบ 193/193 ตามลำดับชื่อไฟล์ ไม่ใส่ shim และไม่ข้าม migration manifest ของ source ที่ apply ตรงกับ base commit โดยต่างได้เฉพาะ CRLF/LF ตามที่บันทึก ใช้ PostgreSQL 17.6 พร้อม auth/storage ระบุ local image ID แล้ว ตัวอ่าน B12 แบบ read-only รันสองครั้ง exit ศูนย์ JSON ที่ parse ได้เท่ากัน fingerprint ของ catalog ฟังก์ชัน/ตาราง/role ก่อนหลังไม่เปลี่ยนภายในชุดข้อมูลที่ runner ระบุ

พบ identity ที่ต้องการครบ 20 ตัว ไม่มี overload เพิ่มหรือ named role หาย ทั้ง 20 เป็น SECURITY DEFINER owner postgres จำนวน EXECUTE คือ anon 18/20, authenticated 19/20, service_role 20/20, authenticator 1/20 และ postgres 20/20 พบ PUBLIC EXECUTE เฉพาะ fn_welcome_on_group_bind มี trigger trg_welcome_group_bind บน line_groups ผลตรงกับ catalog เดิมและ pre-state ที่ matrix อ้าง

เทียบ matrix ที่เสนอครบ 60 ช่อง role/function: ต้องถอน 28 ช่อง, KEEP ที่ยังมีสิทธิ์ 28 ช่อง, DENY ที่ห้ามอยู่แล้ว 3 ช่อง และ recorder/authenticated ที่รอมติ 1 ช่อง ตัวเลขนี้เป็นช่องสิทธิ์ ไม่ใช่จำนวนฟังก์ชันไม่ซ้ำหรือคำสั่ง SQL ที่อนุมัติ ยังไม่ได้เปลี่ยน grant เพิ่มนอกเหนือจาก apply migration chain เดิมบน stack ใหม่

## การแยกสภาพแวดล้อมและรอบเริ่มไม่สำเร็จ

รอบสำเร็จใช้ Docker network แบบ internal ไม่เปิดพอร์ต และเรียก psql ภายใน container ที่งานสร้าง cron.launch_active_jobs เป็น off และ cron.job_run_details มี 0 แถว ถอด container/network ของงานหมดแล้ว การตรวจค่าลับที่สร้างแบบ exact bytes และ positive control ผ่าน

เก็บรอบแรกไว้ในโฟลเดอร์ข้างเคียง line-b12-monolith-catalog-2026-09-30: psql บน host เข้า port ของ internal network ไม่ได้ แม้ฐานข้อมูลรับคำสั่งภายในแล้ว ผู้ดำเนินการหยุดเฉพาะฐานของงาน runner บันทึก startup failure exit 3 และ cleanup รอบนั้นยังไม่รัน project migration รอบ 2 เปลี่ยนวิธีเชื่อมต่อ ไม่แก้เนื้อหา migration ป้ายชื่อบางจุดที่สืบทอดจาก runner เดิมยังเขียน aligned/unaligned แต่ทั้งสองไฟล์ในรอบ 2 เป็น JSON ส่วน logical DSN ใช้เลือก role ภายใน container ไม่ใช่ connection จาก host

## ตรวจซ้ำและรันซ้ำ

SHA256SUMS.run เก็บ hash ผลดิบแต่ละรอบ ส่วน SHA256SUMS ครอบคลุมชุดสุดท้าย ตรวจด้วย verify-b12-baseline.py จาก product root เพิ่ม --rev COMMIT เมื่อตรวจ blob ของ Git สำเนา catalog-checklist.sql ต้องตรง scripts/line-b12-catalog.sql ที่ base ส่วน 08-matrix-comparison.json เทียบทุกช่องกับผลจริง

หากรันซ้ำให้ใช้ checkout แยกที่ base เดิม image cache และ output ใหม่ เรียกสำเนา run-b12-catalog.sh โดยตั้ง B12_OUT และ B12_SQL=scripts/line-b12-catalog.sql runner รับ branch ที่กำหนดหรือ detached HEAD ปฏิเสธ output/resource ชื่อเดิม ใช้ local image ID และปิด cron ห้ามใช้ worktree ของงานอื่นหรือ shared stack ไม่ต้องใช้ credential ภายนอก ค่าลับที่สร้างอยู่ใน process และถูก scrub ก่อนเก็บ log

## สิ่งที่ยังไม่พิสูจน์

รอบนี้ไม่ได้เรียก business RPC ไม่รัน pgTAP/Python behavior suite ไม่ใช่ independent rerun, GitHub Actions หรือ production test การรู้ชื่อ owner ไม่รับรอง transitive call chain ทุกเส้นหรือสิทธิ์ owner ใน production ผู้เรียกภายนอก/ทำมือและ API exposure ยังไม่ยืนยัน catalog จึงรองรับ pre-state ของ B12 แต่ไม่อนุมัติ 0199 ไม่ตัดสิน recorder ไม่แก้ integration 0170/0191, containment หรือ P0-9 และไม่ปิด Phase A ไม่มี push, deploy, ข้อความจริง หรือเปิด cron
