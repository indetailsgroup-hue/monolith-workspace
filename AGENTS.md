# MONOLITH project instructions / ข้อกำหนดโปรเจกต์

## Communication / การสื่อสาร

- Owner decision, 30 September 2026: MONOLITH uses LINE. Remove the retired communication provider from the current file snapshot, including historical text, delivered documents, archives and generators. Do not keep preservation exceptions or restore removed content.
- Automated LINE delivery must use an authorized LINE OA Messaging API integration. Do not invent recipients or claim a connection is live without delivery evidence. Preserve the LINE OA work in its other worktrees and do not alter work owned by other tasks.
- Read the communication policy in [English](docs/policies/communication.en.md) or [Thai](docs/policies/communication.th.md). Run `python tools/check_communication_policy.py` before handing off changes.
- มติเจ้าของ 30 กันยายน 2026: MONOLITH ใช้ LINE ให้ถอดผู้ให้บริการสื่อสารที่ยกเลิกออกจากชุดไฟล์ปัจจุบันทั้งหมด รวมข้อความประวัติ เอกสารส่งมอบ archive และสคริปต์สร้างเอกสาร ห้ามเก็บข้อยกเว้นหรือคืนเนื้อหาที่ลบออกแล้ว
- การส่ง LINE อัตโนมัติต้องใช้ LINE OA Messaging API ที่ได้รับอนุญาต ห้ามเดาผู้รับหรืออ้างว่าเปิดใช้แล้วโดยไม่มีหลักฐานการส่ง รักษางาน LINE OA ที่อยู่ใน worktree อื่น และห้ามแก้งานที่ task อื่นรับผิดชอบ
- อ่านนโยบายการสื่อสาร[ภาษาไทย](docs/policies/communication.th.md)หรือ[ภาษาอังกฤษ](docs/policies/communication.en.md) และรัน `python tools/check_communication_policy.py` ก่อนส่งมอบ

## Repository scope and documents / ขอบเขตและเอกสาร

- MONOLITH has two Git roots: the governance/bootstrap root, and the separate nested `determined-williams/` repository that holds the active product. Inspect both roots and their Git status before any current-state, maturity, gap, test, migration, runtime or roadmap claim, and name the root, branch and status supporting each claim. Do not infer product absence from the parent `apps/` or `packages/` directories. Preserve unrelated changes.
- Read `CONTEXT.md` and the 21 July 2026 repository-scope correction in the governance root before relying on older audits.
- Project-facing documents require Thai and English Markdown plus matching standalone HTML. Use `.th` and `.en` filenames.
- MONOLITH มีสอง Git root คือ governance/bootstrap root และ repository `determined-williams/` ที่ซ้อนอยู่แยกกันซึ่งเป็นผลิตภัณฑ์ที่ใช้งานจริง ต้องตรวจทั้งสอง root และ Git status ก่อนสรุปเรื่องสถานะปัจจุบัน ความพร้อม ช่องว่าง เทสต์ migration runtime หรือ roadmap และระบุ root, branch กับสถานะที่รองรับแต่ละข้อสรุป ห้ามอนุมานว่าผลิตภัณฑ์ไม่มีจากโฟลเดอร์ `apps/` หรือ `packages/` ของ root แม่ รักษางานเดิมที่ไม่เกี่ยวข้อง
- อ่าน `CONTEXT.md` และภาคผนวกแก้ขอบเขต repository วันที่ 21 กรกฎาคม 2026 ใน governance root ก่อนอ้างรายงานตรวจสอบเก่า
- เอกสารสำหรับโปรเจกต์ต้องมี Markdown ไทยและอังกฤษ พร้อม HTML คู่กันที่เปิดอ่านเดี่ยวได้ ตั้งชื่อภาษาให้ชัดด้วย `.th` และ `.en`
