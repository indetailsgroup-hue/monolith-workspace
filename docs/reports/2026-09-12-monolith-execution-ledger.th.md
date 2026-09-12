# MONOLITH — บันทึกดำเนินงานที่ได้รับอนุมัติ

12 กันยายน 2026 · TH · บันทึกสำหรับเผยแพร่ candidate

เจ้าของอนุมัติการแบ่งงาน SciSpace/Codex และให้ลงมือแทนแล้ว Codex พัฒนาชุดงานวิศวกรรมด้านล่างในสำเนาแยก ส่วนการส่งงาน SciSpace และการเพิกถอนโทเคนยังรอคำตอบเฉพาะสองรายการตามด้านล่าง บันทึกนี้ไม่ได้ประกาศว่าทั้งโครงการเสร็จสมบูรณ์

## สถานะงาน

| งาน | ผู้รับผิดชอบ | สถานะเมื่อเผยแพร่ | หลักฐาน / ขั้นตอนที่เหลือ |
|---|---|---|---|
| O-01 ข้อมูลรับรองที่เปิดเผย | Codex ร่วมกับเจ้าของบัญชี | รอยืนยันรายการเพิกถอนที่แน่นอน | เข้าสู่ระบบ GitHub และตรวจรายการโทเคนทั้งสองประเภทแล้ว แต่ยังจับคู่ค่าที่ปรากฏในประวัติกับชื่อในหน้าตั้งค่าไม่ได้แน่นอน จึงมีคำถามเฉพาะเสนอห้ารายการที่เกี่ยวข้อง ยังไม่ได้เพิกถอนหรือทดลองใช้ |
| C-01 ชุดทดสอบ transport | Codex | แก้แล้วและตรวจชุดซ่อมบน GitHub ผ่าน | Node สี่กลุ่มรัน 28 ไฟล์ / 202 ข้อ มี guard regression หกข้อกันชุดว่างหรือข้ามบางข้อ Workflow, Edge และ entitlement ผ่านที่ b89727f2 |
| C-02 รวมงาน | Codex | บันทึกโค้ดแล้ว รอ CI ของ candidate สุดท้าย | รวม main 1c554a3c ไม่มี conflict เผยแพร่ชุดซ่อม b89727f2 แล้ว ตามด้วยหน้าจอและชนิดข้อมูล 97822d0 ติดตามรุ่นล่าสุดและผลตรวจใน PR #106 |
| C-03 รายงานค่าใช้จ่าย | Codex | แก้แล้วและชุด offline บน GitHub ผ่าน | ใช้ jobs API ที่รองรับ ระบุค่าประมาณจากตัวอย่าง ข้อมูลไม่ครบเป็นข้อผิดพลาด เก็บ CSV/log/summary ยังไม่ได้ยืนยันการเก็บรายงานรายเดือนจริง |
| C-04 หน้าจอผิดพลาด | Codex | แก้และตรวจบน GitHub ผ่าน | การบันทึก OrgHealthScoreBoard ผ่าน regression ในเครื่องและ Chromatic ที่ b89727f2 |
| C-05 Team Pulse Check | Codex; SciSpace ให้ requirements | สร้างหน้าจอและตรวจในเครื่องแล้ว | ตรวจหน้าผู้ดูแล/สมาชิก วงจรรอบ แบบตอบ การเปลี่ยนตัวตน store และขอบเขตฐานข้อมูลแล้ว ยังแยกผล CI ของหน้าจอใหม่และการยอมรับใช้งานจริง |
| S-01 ทะเบียนแหล่งข้อมูล/สถานะ | SciSpace; Codex ตรวจหลักฐาน | รออนุญาตข้อความที่จะส่งโดยเฉพาะ | เตรียมร่างใน Elastic Monolith Review พร้อมแหล่ง Roadmap/Intake แล้ว ระบบอนุมัติอัตโนมัติปฏิเสธการส่ง |
| S-02 ทบทวนความหมาย | SciSpace | รอการส่งร่างเดียวกัน | รักษาความสามารถ AIE/GAP และแยก namespace ใช้มติที่มีหลักฐานจริง |
| S-03 SOP/API/งานภาคสนามของ pilot | SciSpace | รอการส่งร่างเดียวกัน | ระบุบทบาท input/output การรับมือความผิดพลาดและเกณฑ์ยอมรับ โดยใช้การตัดสินใจ pilot เป็นข้อมูลเข้า |
| S-04 ความรู้ซัพพลายเออร์/BOM | SciSpace | รอการส่งร่างและขึ้นกับ pilot | รักษางาน Barausse/Blum และแหล่งที่มา ตรวจหน่วย จำนวน และการเผยแพร่ |
| S-05 ธุรกิจ/วิจัย/ฝึกอบรม | SciSpace | รอการส่งร่างและขึ้นกับขอบเขตธุรกิจ | อนุญาตเตรียมหลักฐาน ไม่อนุมานงบ การซื้อ สิทธิ์เข้าร่วม หรือการปิดโครงการ |

## ขอบเขต repository และรุ่นโค้ด

Governance root คือ C:/Users/thai3/determined-williams (2), HEAD aa1b30e509ece9d8efad3d68e949860aa79bdecf ส่วน product root แยกที่ determined-williams/ อยู่ที่ 9c4bee6759f6d1919a320a2f56088ce683287f58 ตรวจสถานะแยกพบ parent มี tracked changes 11 และ untracked entries 599 ซึ่งรวมบันทึกนี้แล้ว ส่วน nested เป็น 22 / 61 จำนวนนี้จัดกลุ่มโฟลเดอร์ untracked ตามค่าเริ่มต้น รักษาการแก้ source เดิมไว้ การเพิ่มรายงานภายหลังอาจเพิ่มจำนวน untracked ใน parent

อ่าน CONTEXT.md และข้อแก้ไขขอบเขตวันที่ 21 กรกฎาคมแล้ว ข้อแก้ไขเป็นแหล่งใน parent ที่ docs/reports/2026-07-21-ima-schelling-monolith-repository-scope-correction.th.md ยังไม่ได้คัดลอกเข้า product repository

พัฒนาใน C:/Users/thai3/.codex/worktrees/monolith-scispace-r0-20260912 สาขา codex/scispace-r0-quality-gates ใช้ main 1c554a3cdf33c43ae4971ce1b984d39572f5d47a รวมเป็น ba3fde65 ชุดซ่อมที่ผ่าน review คือ [b89727f2](https://github.com/indetailsgroup-hue/monolith-workspace/commit/b89727f26328e1bc32bfef0ff33254785151b620) ส่วนหน้าจอและ matcher types คือ 97822d0d6138fd219a4da98e14d0d4003043683f ไม่ได้หยุดงาน SciSpace ที่กำลังทำอยู่

## สิ่งที่เปลี่ยนและหลักฐานการตรวจ

- **Transport:** การยกเว้นใน root ทำให้ทั้งสี่ชุดหา test ไม่พบ จึงแยก Node config ให้ workflow + LINE OA commerce (15 ไฟล์ / 67 ข้อ), Edge (12 / 117) และ entitlement (1 / 18) ตัว guard บังคับให้ทุกไฟล์ในรายการมีเฉพาะข้อที่ผ่าน การแก้ migration เรียก Edge tests ที่อ่านสัญญา SQL ฝั่งโรงงานแล้ว
- **Billing:** เปลี่ยนเงื่อนไข secrets ที่ผิดและเส้นทาง timing/LINE Notify ที่ยุติบริการ รายงานสุ่มได้สูงสุดสิบ completed runs ต่อ workflow ตามช่วงสร้าง run รวม retry ที่อาจอยู่นอกช่วง ระบุว่าเป็นค่าประมาณ gross ของ standard runner ไม่ใช่ใบเรียกเก็บหรือยอดรายเดือน API ล้มเหลวหรือ runner ที่คิดราคาไม่ได้ทำให้ข้อมูลไม่ครบและจบด้วยสถานะผิดพลาด พร้อมเก็บหลักฐาน Node สี่ข้อและ Python 13 ข้อผ่าน รวมกรณี retry ข้ามเดือน นำข้อมูลจริงจาก GitHub API หนึ่ง run มาทดลองตัวคำนวณได้ด้วย แต่ไม่ใช่การเก็บรายงานรายเดือนจริง
- **หน้าจอเดิม:** Storybook คืน mock สู่ implementation ที่ไม่ส่ง Promise จึงใช้ async implementation ตั้งต้นแทน ชุดที่เกี่ยวข้อง 31 ข้อ การโต้ตอบในเบราว์เซอร์ห้าข้อ และ Chromatic บน GitHub ผ่าน
- **TPC store/ฐานข้อมูล:** action คืนผลสำเร็จที่ยืนยันแล้ว ปฏิเสธบริบทไม่ตรง และทิ้งผลกลับที่ล้าสมัย การเขียน session เดียวกันไม่ทำให้ผลเก่าย้อน CLOSED ที่ยืนยันแล้วในหน้าจอ Composite foreign key ผูกองค์กรคำตอบกับองค์กรของ session นโยบาย insert ต้องเป็น session ACTIVE ในองค์กรเดียวกัน และ summary view ใช้ RLS ของผู้เรียก รุ่นเดิมทดสอบพบสมาชิกอ่านผลที่ไม่ควรเห็น ส่วนรุ่นแก้ผ่าน 18 กรณี PostgreSQL จริงทั้งฐานจำลองที่แก้ต่อและฐานใหม่ ชุด GitHub PostgreSQL 15 และ 18 ผ่านเช่นกัน Fixture จำลองเฉพาะ prerequisite องค์กร/auth ไม่ใช่ migration chain Supabase ทั้งระบบ
- **TPC interface:** ผู้ดูแลสร้าง เปิด ปิดรอบ และดูผลสรุป สมาชิกตอบรอบ ACTIVE ได้ ใช้ gate PROFESSIONAL/ENTERPRISE เดิม เปลี่ยนผู้ใช้/บทบาท/องค์กร/แพลนแล้วสร้างหน้าจอใหม่และล้าง cache ก่อนแสดงผล บันทึกไม่สำเร็จยังเก็บค่าฟอร์มไว้ ชุดเฉพาะ 137 ข้อประกอบด้วย board 24, portable story หนึ่ง, dashboard 48 และ store 64 ตรวจ Storybook หกสถานการณ์ด้วยข้อมูลจำลอง พบและแก้ความต่างสีเมื่อ host ใช้ธีมมืดแล้วตรวจภาพซ้ำ คำตอบไม่เก็บ user ID แต่ยังต้องเป็นสมาชิก ข้อความอาจระบุตัวบุคคลได้ และไม่รับประกันหนึ่งคำตอบต่อคน
- **People typings:** GitHub พบ DOM matcher type ขาด 41 จุด ทำซ้ำด้วยคำสั่งเดียวกันแล้วผ่านหลังเพิ่มชนิดของ Vitest ให้ตรง runtime ไม่เปลี่ยน assertion หรือ exclusion และเพิ่ม trigger เมื่อค่าตั้งที่เกี่ยวข้องเปลี่ยน

Root suite หลังรวมหน้าจอครั้งแรกผ่าน 7,324/7,324 ข้อใน 359 ไฟล์ ไม่มีข้ามหรือล้มเหลว จากนั้นเพิ่มกรณีเปลี่ยนเฉพาะผู้ใช้อีกหนึ่งข้อและปรับสี โดยชุดเฉพาะสุดท้าย 137 ข้อผ่าน ตรวจชนิดข้อมูลทั้งโครงการและสร้างแอปผ่าน มีคำเตือน bundle ใหญ่ ESLint ไม่มี error และมี 2,216 warnings ภายในงบเดิม 2,280 ส่วน actionlint 1.7.12 ตรวจหก workflow ที่เกี่ยวข้องผ่าน

ที่ b89727f2 มี 17 workflows ผ่าน และ Dependabot Auto-Merge ถูกข้าม People & Culture CI ล้มเหลวเฉพาะ matcher typecheck ซึ่งแก้ใน candidate ถัดมาแล้ว หลักฐานรวม [Full Verify](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34665220209), [FPR](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34665220196), [pgTAP](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34665220166), [DB Verify](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34665220133), [Entitlement](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34665220159), [Edge](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34665220097), [TPC role isolation](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34665220240), [Billing offline checks](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34665220132) และ [Chromatic](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34665220181) ผลของชุดซ่อมตามรุ่นนี้ไม่แทนการตรวจ candidate สุดท้าย ดูรุ่นและ checks ปัจจุบันที่ [PR #106](https://github.com/indetailsgroup-hue/monolith-workspace/pull/106)

## งานภายนอกที่ยังรอ

ระบบอนุมัติอัตโนมัติปฏิเสธการส่งร่าง SciSpace เพราะมีรายละเอียดสถานะภายในโครงการไปยังปลายทางภายนอก และไม่ถือว่าการอนุมัติแบบกว้างระบุ payload เพียงพอ ร่างยังไม่ได้ส่ง คำถามที่รอระบุ S-01–05, ลิงก์ Roadmap/Intake, รหัสงาน, ข้อแก้ไขสถานะ และรุ่น source โดยไม่มีค่ารหัสผ่านหรือโทเคน

อีกคำถามระบุโทเคนห้ารายการที่เสนอให้เพิกถอน การเชื่อมต่อที่ใช้อยู่จะหยุดจนกว่าจะตั้งค่าใหม่อย่างปลอดภัย ไม่ได้นำค่าที่เปิดเผยกลับมาใช้ คัดลอกลงรายงาน หรือทดลองใช้ และยังไม่สร้างข้อมูลรับรองใหม่

ปิด PostgreSQL และ Storybook ชั่วคราวหลังทดสอบแล้ว ไม่อ้างว่า deploy production หรือผ่านการยอมรับจากเจ้าของโดเมน

[การแบ่งงานที่อนุมัติ](2026-09-12-monolith-work-allocation.th.md) · [บันทึกหน้าจอ TPC](2026-09-12-team-pulse-interface.th.md) · [English edition](2026-09-12-monolith-execution-ledger.en.md)
