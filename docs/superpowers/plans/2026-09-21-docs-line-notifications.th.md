# ข้อกำหนดแจ้งเตือน deployment — LINE

การตัดสินใจเจ้าของวันที่ 21 กันยายน 2026: ใช้ LINE แจ้งผล deployment เอกสาร แทนข้อกำหนด Slack workflow และ Slack curl ในสเปกตรวจเดิม ส่วน Generator/Changelog ยังส่งผ่าน PR ที่ต้อง review (PR #122 merge เป็น fbaf046a1c54299a7fa4c9144a65b877e98a19fc)

## แผนแก้ไขและตรวจสอบ

1. เปลี่ยน notify-slack-deploy.yml เป็น notify-line-deploy.yml ติดตามชื่อ workflow ของ Pages ทั้งสองเส้นทาง นำตัวส่ง Slack ภายใน Auto-Deploy SciSpace Site ออกเพื่อเหลือทางแจ้งเตือนเดียวต่อ workflow run พร้อมปรับ badge และตัวเลือกไฟล์ของ Docs CI
2. ใช้ LINE Messaging API push กับชื่อ secret เดิม LINE_MONOLITH_CHANNEL_ACCESS_TOKEN และ secret ปลายทางเฉพาะ LINE_DEPLOY_RECIPIENT_ID ส่งข้อความ TH/EN หนึ่งข้อความ ระบุผล workflow, source workflow SHA และลิงก์ run ข้อมูลนี้ไม่ใช่หลักฐานว่า bytes ที่ deploy ตรง commit หรือว่า SciSpace เผยแพร่แล้ว workflow ที่ผ่านอาจมี deployment job ถูกข้าม
3. ทดสอบกรณีการตั้งค่าไม่ครบ ข้อความ Unicode/JSON, retry key เดิม, ใบตอบรับซ้ำ, HTTP และ network failure ด้วย mock ก่อน review เปิด PR และตรวจ CI จริงเพื่อเสนอเจ้าของ merge

## การตั้งค่าและใช้งาน

- ตั้ง repository Actions secret LINE_MONOLITH_CHANNEL_ACCESS_TOKEN เป็น channel access token ของ LINE Official Account ที่ต้องการ ชื่อนี้ถูกอ้างอยู่ใน .github/workflows/ci.yml แต่การอ้างชื่อไม่ได้ยืนยันว่า secret ถูกตั้งหรือใช้งานได้
- ตั้ง LINE_DEPLOY_RECIPIENT_ID เป็น user/group/room ID ที่เจ้าของยืนยัน ไม่อนุมานปลายทางจากข้อมูลผลิตภัณฑ์ เก็บค่า token และ recipient ใน secrets แทน source หรือแชต ต้องมีเงื่อนไขสมาชิกกลุ่ม/เพื่อนและสิทธิ์ channel ที่รองรับปลายทางนั้น
- เมื่อ workflow บน main ของ repository นี้จบ notifier จะ checkout main ที่เชื่อถือได้ ใช้สิทธิ์ contents:read และรับข้อมูล event ผ่าน environment variables
- หาก token หรือ recipient ยังไม่ครบ ให้ warning และ summary ว่า SKIPPED โดยไม่เรียก HTTP ส่วน HTTP/network error ทำให้ notification job ล้มเหลว แยกจาก deployment ที่จบไปแล้ว
- HTTP 200 หมายถึง LINE รับคำขอ มิใช่ยืนยันผู้รับได้รับข้อความ ยอมรับ 409 เฉพาะเมื่อมี x-line-accepted-request-id ใช้ retry key จาก repository, source run ID, ผล workflow, recipient และ payload ที่ตรงกัน การกันซ้ำมีช่วงเวลา 24 ชั่วโมงตาม LINE การ rerun ผลเดิมจึงไม่ส่งซ้ำในช่วงนั้น
- การยืนยันรับข้อความจริงรอการตั้งค่าปลายทางและตรวจรับโดยผู้รับที่อนุมัติ งาน implementation นี้ยังไม่ได้ส่งข้อความ LINE จริง

## ผลตรวจหลัง merge ที่เกี่ยวข้อง

Generator run [35597895466](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/35597895466) สร้าง signed commit 408469f3e294af6933f1de59cbd404fb307633a8 บน codex/automated-site-data ได้แล้ว แต่ GitHub ปฏิเสธการเปิด PR เพราะ Actions ไม่มีสิทธิ์สร้างหรืออนุมัติ PR เจ้าของต้องตัดสินใจการตั้งค่า repository แยก โดยคง branch protection ส่วน Changelog ไม่ถูก trigger จาก PR #122 เพราะ merge ครั้งนั้นแก้ workflows แทน site files

ขอบเขตคือ documentation workflows ใน worktree แยกของ governance repository ที่เริ่มจาก fbaf046a1 งานนี้รักษา nested product repository ไว้ รายงานเดิมเป็นหลักฐานย้อนหลัง ส่วนข้อกำหนด LINE นี้แทนคำแนะนำ Slack เดิม

อ้างอิง: [LINE Messaging API — push messages](https://developers.line.biz/en/reference/messaging-api/#send-push-message)
