# MONOLITH project instructions / ข้อกำหนดโปรเจกต์

## Communication / การสื่อสาร

- Owner decision, 30 September 2026: MONOLITH uses LINE, not Slack. Do not add Slack workflows, SDKs, webhook secrets, notification examples or recommendations. Historical transcripts are evidence, not current requirements.
- Automated LINE delivery must use an authorized LINE OA Messaging API integration. Do not invent recipients or claim a connection is live without delivery evidence. Preserve the LINE OA work in its existing worktree.
- Read the communication policy in [English](docs/policies/communication.en.md) or [Thai](docs/policies/communication.th.md). Run `python tools/check_communication_policy.py` before handing off changes.
- มติผู้ใช้ 30 กันยายน 2026: MONOLITH ใช้ LINE ไม่ใช้ Slack ห้ามเพิ่ม workflow, SDK, webhook secret, ตัวอย่าง หรือคำแนะนำให้ใช้ Slack อีก บทสนทนาเก่าเป็นหลักฐาน ไม่ใช่ข้อกำหนดปัจจุบัน
- การส่ง LINE อัตโนมัติต้องใช้ LINE OA Messaging API ที่ได้รับอนุญาต ห้ามเดาผู้รับหรืออ้างว่าเปิดใช้แล้วโดยไม่มีผลทดสอบ รักษางาน LINE OA ใน worktree เดิม

## Repository scope and documents / ขอบเขตและเอกสาร

- In the local governance/bootstrap checkout, the separate nested `determined-williams/` repository contains active product work. Inspect both roots and their Git status before product-state claims. Preserve unrelated changes. Read `CONTEXT.md` and the 21 July 2026 scope correction when present before relying on older audits.
- Project-facing documents require Thai and English Markdown plus matching standalone HTML. Use `.th` and `.en` filenames.
- ในเครื่องมี governance/bootstrap root และ nested repository `determined-williams/` แยกกัน ต้องตรวจทั้งสอง Git roots ก่อนสรุปสถานะผลิตภัณฑ์ รักษางานเดิม อ่าน CONTEXT.md และภาคผนวกแก้ขอบเขตวันที่ 21 กรกฎาคม 2026 เมื่อมี ก่อนอ้างรายงานเก่า
- เอกสารสำหรับโปรเจกต์ต้องมี Markdown ไทยและอังกฤษ พร้อม HTML คู่กันที่เปิดอ่านเดี่ยวได้ ตั้งชื่อภาษาให้ชัดด้วย `.th` และ `.en`
