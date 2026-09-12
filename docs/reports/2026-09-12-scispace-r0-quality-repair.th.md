# SciSpace / MONOLITH — การแก้ quality gate ระยะ R0 และงานที่เหลือ

12 กันยายน 2026 · TH · ชุดแก้ไขที่ตรวจแล้ว; รอการรวมและการยอมรับในการใช้งาน

## ผลลัพธ์และขอบเขตหลักฐาน

งานนี้ปิดการแก้ไขเฉพาะจุดในเครื่องสำหรับ lint warning gate และกฎการอ้างสถานะในเอกสาร ยังไม่ใช่การส่งมอบ MONOLITH ทั้งระบบ [Roadmap เดิม](../roadmap/2026-09-11-monolith-delivery-roadmap.th.md) ยังคงครอบคลุมงาน SciSpace ทั้งสิบแปดกลุ่มและระยะ R0–R5 ส่วน [intake review](2026-09-11-scispace-reconciliation-intake.th.md) ยังคงผลพิจารณา CON ทั้งสิบสามรายการ

ตรวจ parent governance repository ที่ aa1b30e509ece9d8efad3d68e949860aa79bdecf และ nested product repository แยกที่ 9c4bee6759f6d1919a320a2f56088ce683287f58 ทั้งสองมีงานเดิมค้างอยู่ งานแก้ไขใช้ clone ใหม่แยกต่างหากจาก remote product commit [793305be](https://github.com/indetailsgroup-hue/monolith-workspace/commit/793305bedb9eb901d122ca681207acc985eefcdd) บน branch codex/scispace-r0-quality-gates อ่าน CONTEXT และ scope correction วันที่ 21 กรกฎาคมแล้ว โดยไม่ได้แก้ checkout เดิม

Remote main มีการเปลี่ยนแปลงต่อระหว่างงาน การเปรียบเทียบถึง [662c0f72](https://github.com/indetailsgroup-hue/monolith-workspace/commit/662c0f72c7b98b2a14e0181544c7d1d8ac8995c5) พบแปด commit ที่แทรกเข้ามา โดยไม่มีไฟล์ซ้ำกับเก้าไฟล์ของชุดแก้ไขนี้ รุ่น upstream ดังกล่าวเปลี่ยนเพดานคำเตือนเป็น 2,280 ชุดแก้ไขนี้ไม่ได้เปลี่ยนเพดานหรือกฎ lint และผลในเครื่องยังผ่านเพดานเดิมที่เข้มกว่า คือ 2,235

## การแก้ไขและผลตรวจ

| งาน / การตรวจ | หลักฐาน |
|---|---|
| ชนิดข้อมูลใน CultureDashboard tests | แทนที่ any cast ที่ไม่จำเป็น 47 จุดบนค่า string ของ OrgPlan โดยคง input และ assertion ทั้งหมด |
| ESLint ทั้งต้นไม้ source ด้วยเพดานเดิม 2,235 | ก่อนแก้: 2,277 warnings, ศูนย์ errors, exit 1 หลังแก้: 2,230 warnings, ศูนย์ errors, exit 0 ตรวจ 2,145 ไฟล์ |
| ชุดทดสอบ CultureDashboard | ผ่าน 47 จาก 47 กรณี ทั้งก่อนและหลังแก้ |
| App TypeScript | ตรวจชนิดข้อมูลทั้ง project โดยไม่สร้าง output ผ่าน exit 0 |
| กฎการอ้างสถานะในเอกสาร | แก้สิบเอ็ด findings ใหม่ให้เป็นข้อสังเกตที่ระบุขอบเขต source และขีดจำกัดของ acceptance โดยคง allowlist เดิม |
| Certification gate | ผ่านภายใน allowlist เดิม โดยยังแสดงหนี้ทางประวัติศาสตร์ไว้ |
| เอกสาร TH/EN และ HTML | รายงาน work-status และ FieldFlow ตรงกับ HTML คู่กันของแต่ละภาษา |

สภาพแวดล้อมทดสอบในเครื่อง: Windows, Node 24.19.0 และ dependency ตาม lockfile การรัน root test suite ทั้งหมด, database replay และ live deployment อยู่นอกการตรวจเฉพาะจุดครั้งนี้ ยังต้องตรวจ GitHub checks ของชุดที่จะรวม รายงานเก่าคงหลักฐานตามวันที่เดิม การแก้ถ้อยคำไม่ได้เปลี่ยน snapshot เก่าให้เป็น audit ปัจจุบัน

## งานที่เหลือ เรียงตามการส่งมอบ

บทบาทรับผิดชอบด้านล่างเป็นข้อเสนอ ยังไม่ใช่การแต่งตั้งหรือ signoff

| ลำดับ / ขอบเขต | งานถัดไป | บทบาทรับผิดชอบที่เสนอ | หลักฐานปิดงาน |
|---|---|---|---|
| R0 — รวมชุดแก้ไขนี้ | ตรวจ Draft PR และผล checks เทียบกับ main ปัจจุบัน | Engineering + QA | lint, document gates และ tests ที่เกี่ยวข้องผ่านบน revision เดียวกัน พร้อมบันทึกการรวม |
| R0 — ตรวจฐานข้อมูล | เทียบ migration chain และ suites ที่ล้มล่าสุด ตรวจ EST policies ที่อ้าง user_profiles กับ helper ด้านสมาชิกองค์กรที่มีอยู่ | Database/security + QA | replay ฐานข้อมูลใหม่ผ่าน และทดสอบ same-org, cross-org, inactive member และ admin อย่างมีความหมาย |
| R0 — billing workflow | แก้การอ้าง secrets โดยตรงในเงื่อนไข notification step พร้อมรักษาพฤติกรรมแจ้งเตือนตามเงื่อนไข | Platform/CI | ตรวจรูปแบบ Actions และ fixtures กรณี token ว่าง/มีค่าผ่าน โดยจำลอง network ระหว่างทดสอบ |
| R0 — สถานะและ handoff | ผูกสถานะกับ commit/run ที่ตรงกัน ตรวจทานบันทึก Round 23/24 ก่อนรับแนวแก้ไขที่เสนอ | Engineering + programme owner | ทุกการปิดงานมี scope, revision, environment และผล; ค่าคาดหมายในอดีตยังระบุว่าเป็นค่าคาดหมาย |
| R0/R1 — เทียบงาน SciSpace | ทำ AIE/GAP semantic crosswalk, แยก namespace พร้อม source, ดูแลชื่อ VS-01 และ trace ตัวใช้ PFMEA | Product/architecture + QA | คง requirement ที่ต่างกันครบ ระบุ action ราย domain และบันทึกการตัดสินใจโดยผู้มีอำนาจ |
| R1/R2 — shadow pilot หนึ่งงาน | เลือก project, ผู้ใช้และ integrations ตรวจสิทธิ์และเส้นทาง design ถึง field/finance | Product + platform/field/finance | มีหลักฐานครบสาย denial/retry/revision paths และ acceptance จากผู้ใช้ที่ระบุ |
| R3/R4 — โรงงานและปฏิบัติการ | ปิด manufacturing, recovery และ field acceptance gates เดิม | Factory + security/release owners | หลักฐานเครื่องจักร signoff การปฏิบัติการและการกระทบยอดครบ |
| R5 / งานธุรกิจ | คงงาน AI, marketplace, BOI และความรู้ผู้ผลิตไว้ใน roadmap สิบแปดกลุ่มเดิม | Product และเจ้าของแต่ละ domain | มีขอบเขต requirement, owner และ acceptance ก่อนส่งมอบหรือใช้งานภายนอก |

พบ [EST migration failure](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34660023279) ที่ 779bba2e และ [billing startup failure](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34660379760) ที่ 578111bd ข้อค้นพบเหล่านี้ระบุ revision และต้องตรวจซ้ำเมื่อเริ่ม candidate ถัดไป เอกสาร GitHub ระบุว่าการอ้าง secrets โดยตรงในเงื่อนไข if ใช้ไม่ได้ [แนวทาง workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets#using-secrets-in-a-workflow)

การสำรวจ issue และ PR ที่เปิดอยู่ไม่พบรายการ ณ snapshot แรก แต่ยังมี backlog อยู่ ต้องพิจารณา PR ใหม่และ main ที่เปลี่ยนพร้อมกันเมื่อเริ่มงานถัดไป

## ขอบเขตการทำงานร่วมกัน

อ่าน roadmap และ intake จาก SciSpace ที่เผยแพร่ใน GitHub ได้ เซสชัน SciSpace ในเบราว์เซอร์ที่ตรวจแสดง Login จึงยังไม่ได้เข้าถึงบทสนทนาส่วนตัว งานนี้ไม่ได้ส่งข้อความไป SciSpace และไม่ได้เปลี่ยนคำนิยาม AIE/GAP ที่เป็น canonical, safety thresholds, อำนาจอนุญาตผลิต, ฐานข้อมูล production หรือ deployment

