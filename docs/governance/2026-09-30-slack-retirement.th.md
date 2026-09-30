# ยกเลิก Slack สำหรับการแจ้งเตือน deploy

วันที่ 30 กันยายน 2026 มติของเจ้าของ: นำ Slack ออกจากการแจ้งเตือน deploy ของโครงการนี้ทั้งหมด

## ขอบเขตและสิ่งที่แก้

แพตช์นี้เริ่มจาก main ของ governance repository ที่ `14ec24bc` ส่วน nested product repository และงาน LINE OA Phase A เป็นงานแยกและไม่ได้ถูกแก้ไข

ลบ `notify-slack-deploy.yml`, badge ในเอกสาร และการอ้างอิงใน CI/tests แพตช์นี้ใช้รายการ workflow จาก main ปัจจุบันแทนไฟล์ใน checkout เก่า ผล deploy ยังดูได้จาก GitHub Actions

`tests/docs/test_notification_policy.py` ตรวจหาการอ้างอิง Slack ในทุก workflow, local action, สคริปต์ automation ของเอกสาร และ README ของเว็บไซต์ โดย CI เอกสารที่บังคับอยู่แล้วจะรันเทสต์นี้ทุก pull request ห้ามนำตัวส่ง, การตั้งค่า webhook หรือ Slack action จาก branch เก่ากลับมา ส่วนคลังบทสนทนาเก่ายังคงเป็นหลักฐาน ไม่ใช่การตั้งค่าที่ใช้งาน

## งาน LINE ที่แยกกัน

PR #123 เสนอการแจ้งเตือน deploy ผ่าน LINE และยังเป็น draft การถอด Slack ไม่ต้องรอให้งานนั้นเสร็จและไม่ได้เปิดส่ง LINE งานแจ้งเตือน deploy ผ่าน LINE ในอนาคตต้องรักษามติยกเลิกนี้ ไม่มีการแก้โค้ด LINE OA ที่สื่อสารกับลูกค้า

## การตรวจและการมีผลใช้งาน

เทสต์นโยบายใหม่ล้มเมื่อยังมีตัวส่งเดิม และผ่านหลังลบ รันชุด regression ของเอกสารด้วย `python -m unittest discover -s tests/docs -v` หลังติดตั้ง `scripts/docs/requirements.txt`

การแก้ source นี้มีผลบน GitHub หลัง merge เข้า main ไม่มีการส่งข้อความภายนอก การลบไฟล์ source ไม่ได้แก้ secrets ระดับ repository, environment หรือ organization และไม่ได้หยุด workflow ที่กำลังรันอยู่ เทสต์ในเครื่องนี้ไม่ยืนยันสถานะจริงของรายการเหล่านั้น
