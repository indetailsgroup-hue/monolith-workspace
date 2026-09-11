# Roadmap การส่งมอบ MONOLITH

หมายเหตุการเผยแพร่: เอกสารอ้างหลักฐานตามวันที่เดิม ไม่ใช่การตรวจ runtime หรือ CI ใหม่ ไฟล์หลักฐานเฉพาะในเครื่องไม่ได้รวมในการเผยแพร่นี้ SC-01–SC-18 เป็นรหัสสายงาน roadmap แยกจากรหัสมติ Steering Committee

11 กันยายน 2026 · TH · ฉบับปรับปรุง 2 — เพิ่มการเทียบงาน SciSpace; ข้อเสนอส่งมอบยังต้องผ่านเกณฑ์แต่ละระยะ

## เป้าหมายและแนวทางที่แนะนำ

ทำให้โครงการตู้/งานตกแต่งหนึ่งงานเดินครบตั้งแต่ออกแบบ อนุมัติ หลักฐานการผลิต ติดตั้ง จนถึงปิดยอดการเงิน และตรวจย้อนกลับได้ แล้วจึงขยายระบบ เอกสารนี้เป็น roadmap ที่เสนอ ยังไม่ใช่ implementation plan ที่อนุมัติหรือคำอนุญาตตัดวัสดุจริง

พิจารณา 3 แนวทาง:
- **ปิดเส้นทางนำร่องหนึ่งโครงการก่อน — แนะนำ:** เห็นปัญหาการเชื่อมต่อจริงและใช้โมดูลเดิมได้เต็มที่ โดยเลื่อนการเพิ่มฟีเจอร์วงกว้างออกไป
- ทำทุกโมดูลให้ครบแยกกัน: ครอบคลุมมาก แต่รู้ช้าว่าทั้งโครงการทำงานร่วมกันได้หรือไม่
- นำด้วย AI และ marketplace: สาธิตได้น่าสนใจ แต่ยังพึ่งข้อมูลและการยอมรับงานปฏิบัติการที่ต้องพิสูจน์

สมมติฐานคือโครงการตู้/งานตกแต่งนำร่องเป็นเป้าหมายธุรกิจอันดับแรก ยังไม่ได้ยืนยันกำลังทีม ลูกค้านำร่อง เครื่องจักร และผู้ให้บริการ integration ลำดับระยะอิง dependency ส่วนระยะเวลาไม่ใช่คำรับปากส่งมอบ

## หลักฐานตั้งต้นและขอบเขต repository

GitHub main ที่ตรวจ: **52e0eeb12527d4bb3866ee726b4f30d4d74dca57** ส่วน governance root ในเครื่องคือ `[local governance workspace]` HEAD `aa1b30e` และ product root เป็น Git repository แยกใน `determined-williams/` HEAD `9c4bee6` ตรวจทั้งสอง worktree แยกกันแล้วและพบงานเดิมที่ยังเปลี่ยนค้าง ข้อสรุปผลิตภัณฑ์บน remote ด้านล่างอ้าง GitHub main ไม่ใช่ checkout เก่าในเครื่อง ได้อ่าน CONTEXT และข้อแก้ไขขอบเขตวันที่ 21 กรกฎาคมประกอบแล้ว

- มี implementation ด้านออกแบบตู้/3D, connectors, ลิ้นชัก/บานพับ, แผ่นโค้ง, DXF/CNC packet, workflow/LINE, หน้างาน, บัญชี และโมดูลบุคลากร/องค์กร
- เผยแพร่ v17.5.2 แล้ว แต่ Full Verify ยังล้มเหลว: lint มี 2,237 warnings เกินเพดาน 2,235 ทำให้ root tests/build และ E2E ที่ขึ้นต่อกันถูกข้ามในรอบนั้น ส่วน smoke, pgTAP และ checks ของหลาย service ผ่านแยกต่างหาก
- การตัดจริงยังถูกปิดด้วย shadow mode หลักฐานที่ตรวจยังมีลายเซ็น ADR-064 และการปิด dogfood ที่ค้าง
- Org Health PERFORMANCE ยังใช้ค่าคงที่ 75.0 และไม่พบ route ใน registry หลักที่ตรวจ การมี CRUD/store ของ AI ยังไม่พิสูจน์การเรียกโมเดลหรือการยอมรับผลทางธุรกิจ
- billing-report ยังไม่ทราบสาเหตุที่ล้มเหลว และมี dependency PR เปิดอยู่ 5 รายการ
- การมี source หรือจำนวนไฟล์ migration ไม่ได้แปลว่า deploy, apply หรือผ่าน acceptance แล้ว

อ้างอิง [รายงานสถานะละเอียด](../reports/2026-09-10-monolith-work-status.th.html) และ [รายงานเทียบ repository](../reports/2026-09-11-monolith-cp06-comparison.th.html) รอบ roadmap นี้ไม่ได้รันชุดทดสอบผลิตภัณฑ์ในเครื่องใหม่

## ลำดับการส่งมอบ

| ระยะ | งานและผลลัพธ์ | เกณฑ์จบ | บทบาทรับผิดชอบที่เสนอ |
|---|---|---|---|
| R0 — ฐานระบบเชื่อถือได้ | เทียบ revision remote/local แยกพื้นที่ทำงาน แก้ lint ตรวจ billing-report ปรับสถานะเอกสารเก่าและคัดกรอง dependency PR | CI ที่บังคับผ่านบน candidate SHA เดียวกัน รวม checks ที่เคยถูกข้าม ทุก failure ที่เหลือมีข้อสรุปและเจ้าของชัดเจน | Tech lead + QA |
| R1 — โครงการและสิทธิ์ถูกต้อง | ตรวจ login, organization/project context, roles, tenant isolation, รุ่นการอนุมัติ และการอ้างหลักฐานของ pilot พร้อมซ้อม migration/backup/restore ใน staging | ทดสอบข้าม tenant และกระทำเกินสิทธิ์แล้วถูกปฏิเสธ ตรวจย้อนรุ่นแบบที่อนุมัติถึง packet ได้ และซ้อม restore ผ่าน | Backend/security lead + QA |
| R2 — นำร่องครบวงจรแบบ shadow | เดินหนึ่งโครงการผ่านออกแบบ → ใบเสนอราคา → ลูกค้าอนุมัติ → BOM/DXF/ตรวจ packet → จำลองส่งโรงงาน → บันทึกรับงานหน้างาน → กระทบยอดการเงิน โดยปิดช่องว่างจากโมดูลเดิม | มี evidence pack ผูก revision ครบทุกขั้น ทดสอบปฏิเสธ/แก้รุ่น/retry ได้ ไม่มีข้อบกพร่องวิกฤตของ pilot ค้าง และยังคงข้อจำกัด shadow | Product owner + ตัวแทนออกแบบ/โรงงาน/หน้างาน/การเงิน |
| R3 — นำร่องโรงงานแบบควบคุม | ปิด S17-1…5 รับลายเซ็น ADR-064 ปิด full-chain dogfood ตามข้อกำหนด calibrate machine profile และทบทวน verifier/การหยุด/rollback | มีหลักฐานครบ 4 เงื่อนไขอนุญาตตัดจริงเดิมและผู้มีอำนาจอนุมัติก่อนตัด ตรวจผล pilot เทียบค่าคลาดเคลื่อนที่ตกลง | Factory lead + PO/TL/Security |
| R4 — พร้อมปฏิบัติงานจริง | ปิด flow รูปหน้างาน/QC/แก้งาน/รับมอบ จัดซื้อ/คลัง/กระทบยอดบัญชี และ integration ที่เลือก พร้อม monitoring/support/recovery | ผู้ใช้งานที่ระบุยอมรับเส้นทางงานใน environment เป้าหมาย ยอดตรง กู้คืนได้ และมีเจ้าของ support กับหลักฐาน release | Operations/finance lead + release owner |
| R5 — ขยายธุรกิจและ AI | แทนค่า placeholder Org Health ด้วย metric ที่อนุมัติและ route ใช้งานได้ พิสูจน์ AI scheduler/quotation จริง แล้วพิจารณา capacity planning, benchmarks, DesignHub และ spatial | ทุกฟีเจอร์มีข้อมูลจริง ตรวจสิทธิ์ มี acceptance ที่วัดได้และเจ้าของ ส่วน AI ต้องมี evaluation, budget และ human review | Product owner + data/AI lead |

Dependency: R0 → R1 → R2 → R3 เริ่มเตรียม R4 หลัง R2 ควบคู่ความพร้อมโรงงานได้ แต่ release ที่ตัดจริงต้องผ่าน R3 ส่วนการสำรวจ R5 เริ่มก่อนได้โดยไม่แย่งงานที่ขวาง pilot

R2 อาจใช้การผลิตจำลองและ acceptance หน้างาน/การเงินบน staging แต่ต้องติดป้ายหลักฐานให้ชัด ส่วน R3 ต้องผ่านนิยาม dogfood/signoff จริงของ repository ห้ามถือว่าหลักฐานจำลอง R2 ให้สิทธิ์ตัดจริงโดยอัตโนมัติ

## กรอบงานสองสัปดาห์แรก

เป็นกรอบจัดลำดับงาน ไม่ใช่การรับประกันว่าจบภายในสองสัปดาห์

1. ตรึง candidate revision และทำรายการงานในเครื่องก่อนรวมงาน ระบุ branch ที่จะรับการแก้ไข
2. หาต้นเหตุ warnings ที่เพิ่มและแก้โดยไม่เพิ่มเพดานเพียงเพื่อให้ผ่าน จากนั้นรัน Full Verify และตรวจ failure ที่เพิ่งปรากฏ
3. ตรวจ billing-report แยกต่างหาก คัด dependency PR ตาม compatibility/ความเสี่ยง และรวมเมื่อ checks ผ่าน
4. ทำ backlog กลางที่แยก มี implementation / เชื่อมแล้ว / ทดสอบแล้ว / ผู้ใช้ยอมรับแล้ว ปรับ checklist เก่าโดยรักษาหลักฐานประวัติ
5. เลือกโครงการนำร่อง ผู้ใช้งาน และ integration ขั้นต่ำ พร้อมกำหนด acceptance ของทุกจุดส่งต่องานใน R2
6. เริ่มทดสอบสิทธิ์และรุ่นโครงการของ R1 บน flow ที่เลือก แล้วจึงเขียน implementation plan ของ R2 เมื่อขอบเขตตกลงแล้ว

ผลที่ต้องได้คือ baseline ที่เชื่อถือได้ รายการ blocker พร้อมเจ้าของ และ pilot ที่ทดสอบได้หนึ่งโครงการ หาก CI ยังไม่ผ่านให้ทำงานปิด failure ต่อ ไม่สรุปว่าพร้อม pilot

## จุดทบทวนและตัววัด

- **วันที่ 30:** ตรวจหลักฐาน R0/R1 และ blocker ปรับกำหนดส่งจากกำลังทีมจริง
- **วันที่ 60:** ตรวจความครบของ shadow pilot และหลักฐานเงื่อนไขตัดจริง
- **วันที่ 90:** ตัดสินใจว่าหลักฐานพอให้ rollout แบบควบคุมหรือไม่ ขยายเมื่อผ่าน acceptance

นับจาก kickoff ที่ตกลงกันและเป็นวันทบทวน ไม่ใช่วันสัญญาว่าระยะต้องจบ ติดตามอัตราผ่าน required CI บน SHA เดียว จำนวนขั้น pilot ที่ผ่าน acceptance ข้อบกพร่องวิกฤตค้าง ผล tenant isolation ความครบหลักฐาน ความคลาดเคลื่อนงานผลิตและยอดกระทบ กำหนดตัวเลขเป้าหมายธุรกิจร่วมกับเจ้าของ pilot ก่อน R2 โดยไม่สมมติค่าผลงานปัจจุบัน

## งานเลื่อนและเรื่องที่ต้องตกลง

CP06 อยู่นอก roadmap นี้ ส่วน FieldFlow เป็น artifact แยกที่ยังไม่ครบ ต้องเทียบกับ field app เดิมของ MONOLITH ก่อนตัดสินใจนำส่วนใดมาใช้

เลื่อน marketplace/UGC/learning ขนาดใหญ่ AI อัตโนมัติวงกว้าง และผลิตภัณฑ์ spatial ใหม่ จน pilot แสดงความจำเป็น ส่วน People/Training/OrgChart/QC ที่มีแล้วให้บำรุงรักษาและตรวจ regression แทนการตั้งต้นสร้างใหม่

ก่อนทำ implementation plan ต้องระบุโครงการและเจ้าของ pilot ยืนยันกำลังทีม/เครื่องจักร เลือก environment/ผู้ให้บริการภายนอก และตกลง tolerance งานผลิตกับผู้รับ acceptance บทบาทในตารางเป็นข้อเสนอ ยังไม่ใช่การมอบหมายบุคคล

## ความเสี่ยงและจุดควบคุม

- Remote/local ต่างกัน: แยกพื้นที่ revision ที่เลือกและรักษางานเดิม
- สถานะเสร็จในเอกสารล้าสมัย: ผูก acceptance กับ revision, environment และวันที่
- ยังไม่มีเครื่องจักรหรือลายเซ็น: ทำ shadow validation ต่อและคงการปิดตัดจริง
- Integration ภายนอกยังไม่พร้อม: ใช้หลักฐาน staging ที่ระบุชัด ไม่ปิดสถานะ live acceptance
- ขอบเขตขยาย: งานใหม่ต้องแก้ blocker ของ pilot หรืออยู่ในระยะถัดไปที่ตกลงแล้ว

## ฉบับปรับปรุง 2 — รวมงาน SciSpace

**การอนุมัติ:** ผู้ใช้อนุมัติให้รวมงาน SciSpace เข้า roadmap เมื่อ 11 กันยายน 2026 เป็นการอนุมัติปรับเอกสารครั้งนี้ ไม่ใช่การอนุมัติงบ จัดซื้อ deploy หรือลายเซ็นผลิตจริง ลำดับส่งมอบยังใช้ R0–R5

**ความครอบคลุม:** เพิ่มกลุ่ม SciSpace ที่พบก่อนหน้าและงานเกี่ยวข้องที่พบเพิ่มใน changelog ของชุดเดียวกัน เป็นการเทียบระดับสายงาน ยังไม่ใช่การตรวจทุกไฟล์หรือประวัติทั้งหมดในบัญชี SciSpace หลักฐานผู้จัดทำโดยตรงอยู่ในบันทึก S14/S16–20 สคริปต์ S51–58 และสคริปต์สร้างเอกสารในเครื่อง ส่วนงานอื่นเชื่อมโยงจาก changelog ของชุด ยังไม่ได้ยืนยันผู้เขียนแต่ละไฟล์แยกกัน

**ความหมายสถานะ:** D = มีเอกสาร/spec หรือบันทึกการจัดทำ; C = มี source/config/prototype; V = ทดสอบ runtime; A = ยอมรับใช้งานจริง การมี D/C ไม่ได้แปลว่าผ่าน V/A และ “ยังไม่ยืนยัน” ไม่ได้แปลว่าไม่มี implementation รอบนี้ไม่ได้รันทดสอบ runtime ใหม่

### ตารางเชื่อมหลักฐานกับงานส่งมอบ

| ID / งาน | เอกสารและที่มา | หลักฐาน implementation | ทดสอบ / acceptance | งานค้างและหลักฐานปิดงาน | ระยะ / เจ้าของที่เสนอ |
|---|---|---|---|---|---|
| SC-01 SOP, สรุปโครงการ, executive decks และ training | Changelog ชุดเอกสาร; S14 มีผู้แก้โดยตรง; ประวัติ S1–15 | มีสคริปต์และเอกสารส่งมอบ ไม่อนุมานเป็นฟีเจอร์ระบบ | D; V/A ไม่ใช้กับการสร้างเอกสาร ส่วนข้ออ้าง runtime ยังไม่ยืนยัน | ทำ index กลาง เทียบข้อกำหนด SOP กับโมดูลจริง ระบุข้ออ้างที่ยังไม่มีหลักฐานและรักษา TH/EN ให้ตรงกัน | R0; product/document owner |
| SC-02 การประสาน agents, KPI/SLA, incident — S16–18 | มี tracked-change ระบุ SciSpace โดยตรง | มี source workflow/LINE เดิม แต่ยังไม่ได้ตรวจตามสัญญานี้ครบวงจร | D; V/A ยังไม่ยืนยัน | ระบุ agent/event ของ pilot ทดสอบ retry, deduplication, escalation, ส่งต่อคน และวัด KPI ที่ตกลง | R1–R2 และซ้อมงาน R4; integration lead |
| SC-03 Privacy, ethics, lifecycle, audit, steering — S19–23 | S19–20 ระบุผู้จัดทำ; S21–23 อยู่ในบันทึกชุด | มี IAM/role/workflow แต่ยังไม่ยืนยันบังคับนโยบายครบ | D; V/A ยังไม่ยืนยัน | เทียบสิทธิ์/อายุข้อมูล human review การเลิกใช้ agent และเจ้าของ audit พร้อม negative tests และผลทบทวน | R1 และ R4; security/governance owner |
| SC-04 แผนแก้ไขโครงการและเรื่องราว deployment — S24–50 | Changelog และ SOP-to-GitHub mapping รวมปีโครงการในอนาคต | ข้อความในเอกสารสำหรับสถานะปิดโครงการที่กล่าวอ้าง | D; ยังไม่ยืนยัน go-live/ratification อิสระ | แยก proposal/ประวัติ/acceptance ที่มีหลักฐาน เทียบ mapping S1–52 กับ revision ปัจจุบัน แทนวันที่และ coverage สมมติด้วยหลักฐาน | R0 แล้ว R5; programme owner |
| SC-05 จัดซื้อ AI Creative Engine — S51 | สคริปต์ระบุ Scispace Agent | RFP/spec และ Thai procurement brief ยังไม่ยืนยันเลือกผู้ขายแล้ว | D; procurement acceptance ยังไม่ยืนยัน | แก้ความหมาย AIE ที่ขัดกันก่อน ยืนยัน business case ขอบเขต เจ้าของงบ เกณฑ์ประเมิน และซื้อหรือสร้าง ก่อนออก RFP | R0 นิยาม; R5 ส่งมอบ; product/procurement |
| SC-06 Vendor integration และ go-live AI — S52–53 | สคริปต์ SciSpace และ vendor brief | มีแผน integration/SLA/cutover ยังไม่ยืนยันบริการ AIE ที่เชื่อมจริง | D; V/A ยังไม่ยืนยัน | หลัง SC-05 ตกลงแล้ว ตรวจ interface แยก tenant UAT rollback และผล support จริง | R5 หลัง SC-05; integration/release owner |
| SC-07 นิยาม Phase 3, RFP, onboarding, go-live — S54–57 | สคริปต์ SciSpace ทั้งสี่ | แผน biophilic/design freeze/sensory/POE/CX/materials/model governance ยังไม่ทราบความครบของฟีเจอร์ | D; V/A ยังไม่ยืนยัน | แก้ GAP ID เทียบความสามารถแต่ละรายการกับ source เดิมก่อนเปิดงานใหม่ จัดตารางเฉพาะขอบเขตธุรกิจที่รับแล้ว | R0 เทียบเอกสาร; R5 ขยาย; product/data lead |
| SC-08 BAU Governance — S58 | สคริปต์โดยตรงและ template ใบปิดโครงการ | การสร้างเอกสาร ไม่ใช่หลักฐานอิสระว่าปิดโครงการจริง | D; ลายเซ็น/operational acceptance ยังไม่ยืนยัน | ระบุ support owner รอบทบทวน หลักฐาน incident/recovery ออกเอกสารปิดเฉพาะ scope ที่ส่งมอบจริง | R4 สำหรับ pilot; R5 โครงการขยาย; operations |
| SC-09 MCP, automation, LINE/LIFF และ API reference | บันทึก MCP implementation, automation spec, customer journey และ API 55 tools | ตัวอย่างโค้ดใน HTML; runtime workflow/LINE เดิมเป็นหลักฐานอีกชุด | D/C; ยังไม่ยืนยัน deploy ครบ 55 tools | เทียบ endpoint ในเอกสารกับของจริง ปรับ identity/payload ทดสอบ event pilot พร้อมสิทธิ์ retry และใบรับการส่ง | R1–R2; integration lead |
| SC-10 RAG, prompts, knowledge approval, agent evaluation | Changelog มี pgvector roadmap, prompt engineering, approval workflow, evaluation | Spec/ตัวอย่าง ยังไม่ยืนยัน retrieval/model evaluation จริง | D; V/A ยังไม่ยืนยัน | เก็บที่มา/สิทธิ์ข้อมูล กำหนดอนุมัติก่อนเผยแพร่ความรู้ ประเมิน retrieval/model ด้วย dataset ที่ระบุ | R1 governance; R5 AI; knowledge/AI owner |
| SC-11 Installation agent และ PFMEA | Installation spec และบันทึก PFMEA dashboard | HTML ฝังข้อมูลและสถานะ local พร้อม source QC/field เดิมของผลิตภัณฑ์ | D/C; ยังไม่ยืนยัน incident/halt จริง | ตกลง severity/checklist ที่ขัดกัน ผูก defect/รูปกับรุ่นโครงการ ทดสอบเหตุวิกฤตและให้คนอนุญาตทำต่อ | R2–R4; field/QA lead |
| SC-12 ต้นแบบติดตั้ง HTML | thai_installation_agent_fieldapp.html | ตรวจพบ simulateSync() และการลงทะเบียน service worker โดยตรง | C prototype; sync/offline acceptance ยังไม่ยืนยัน | เทียบกับ field app เดิม เก็บ UX ที่ใช้ได้ พิสูจน์ API/offline/conflict recovery จริงก่อนอ้าง sync | R2 เลือกสถาปัตยกรรม; R4 acceptance; field lead |
| SC-13 FieldFlow native mobile และ onboarding | สคริปต์ pack ระบุ SciSpace, DOCX/PDF และ Expo source ในชุดเดียวกัน | มี T1–T12 บางส่วน Drizzle schema และ tests ตาม audit artifact | C บางส่วน; ไม่มีผล build/device/RLS ใหม่ | เลือกใช้ field app เดิมหรือลงทุน native ถ้าเลือก native ให้แก้ package/types, photo contract, storage isolation/recovery, magic-link callback, offline/search และทดสอบอุปกรณ์/integration | ตัดสินใจ R1–R2; ส่งมอบที่เลือก R4; mobile/backend leads |
| SC-14 ขอบเขต platform/client, configs และตัวอย่าง Swift | Platform spec, registry, client JSON และ validator ในบันทึกชุด | มี config/validator/showcase ผลผ่านใน changelog เป็นประวัติ | C; ยังไม่ยืนยัน deployment ลูกค้าหรือ multi-tenant จริง | เทียบกับ tenant model หลัก ตรวจ secret ฝั่ง server และ isolation ของ runtime เก็บ Swift logistics เป็นตัวอย่างรอระยะขยาย | R1 ขอบเขต Daph/platform; R5 ธุรกิจอื่น; platform/security |
| SC-15 VS-01 Vision-to-BOQ | Draft ใน docs/specs พร้อม HTML/checksum และ changelog | Spec/prompts/schema/AC ละเอียด แต่ยังไม่ยืนยัน pipeline จริงที่ตรงกัน | D; ยังไม่ยืนยัน AC-VS01-01–10 ผ่าน | แก้ชื่อและข้ออ้าง canonical values เมื่อเริ่มทำให้ benchmark โมเดลที่เหมาะขณะนั้น บังคับ confidence/refusal/provenance/human review และ AC ทั้ง 10 | R5 sandbox หลัง R1; AI/design owner |
| SC-16 BOI Executive Summary | create_boi_summary.py ระบุผู้จัดทำและมี DOCX | เอกสารธุรกิจ ไม่ใช่ฟีเจอร์หรือผลอนุมัติ BOI | D; ยังไม่ตรวจรับด้านธุรกิจ/กฎหมาย/การเงิน | ปรับ scope/ต้นทุน/หลักฐานให้ตรง roadmap ตรวจคุณสมบัติและการเงินปัจจุบันก่อนใช้ภายนอก | สายธุรกิจคู่ R0/R2; business/finance owner |
| SC-17 ความรู้และงานวิจัย Barausse | สคริปต์ในเครื่องและ SCISPACE_REFERENCES ในเอกสารสกัด 4 หัวข้อ | Notes ภาษาไทยและตารางวิจัย ยังไม่ยืนยัน import เข้า canonical knowledge | D; supplier/engineering acceptance ยังไม่ยืนยัน | ตรวจรุ่นแหล่งข้อมูล สิทธิ์ หน่วย รหัสผู้ผลิต แยกตรวจข้อมูลตลาดจากข้อเท็จจริงเทคนิคก่อนนำเข้าความรู้ | R1 ทบทวนความรู้; R5 catalog ใช้ซ้ำ; knowledge/domain owner |
| SC-18 Barausse BOM, checklist และ worksheet | สคริปต์ระบุ SciSpace และผลลัพธ์ DOCX/HTML | เอกสารประตู SECRET เฉพาะโครงการ รวม BOM 1 ห้องนอน/2 ห้องน้ำ | D; ยังไม่ยืนยันขนาดจริง/ติดตั้ง/ต้นทุน | ให้เจ้าของโดเมนตรวจขนาด ความเข้ากันได้ hardware จำนวน และขั้นตอนหน้างาน ใช้ใน pilot เมื่อโครงการเลือกประตูนี้เท่านั้น | R2–R4 แบบมีเงื่อนไข; design/installation lead |

### ข้อขัดแย้งที่ต้องปิดก่อนทำ implementation ที่เกี่ยวข้อง

1. **รหัส S17 ชนกัน:** S17 ใน DOCX SciSpace เป็น KPI/SLA ของ agent ส่วน S17-1…5 ของ manufacturing เป็นคนละชุด ห้ามใช้ปิดแทนกัน
2. **AIE ความหมายเปลี่ยน:** S51 ใช้ AIE-003 rendering, AIE-004 QA, AIE-005 integration gateway แต่ acceptance ของ S52 เป็น material SKUs, mood boards และ presentation rendering ตามลำดับ ต้องตรึง requirement map ที่มี version ก่อนจัดซื้อหรือเขียน tests
3. **GAP ความหมายเปลี่ยน:** S53 ใช้ GAP-13 ethics, GAP-14 decommissioning, GAP-15 data-subject requests ส่วน S54 ใช้ CX, sustainable procurement และ model governance ต้องบันทึก mapping หรือเปลี่ยนรหัสอย่างชัดเจนและเก็บต้นฉบับทั้งสอง
4. **ปีโครงการและสถานะปิด:** มีเรื่องราวตามปีโครงการอนาคตและข้อความปิดงาน การสร้าง changelog, accept tracked changes ใน Word หรือจำนวน validator ผ่านในอดีต ไม่ยืนยันลายเซ็นจริง deployment จำนวนลูกค้า หรือ coverage ที่ทำได้แล้ว
5. **ชื่อ VS-01:** หัวข้อ spec ณ SHA ที่ตรวจยังมี “S55” แม้บันทึกชุดระบุใช้ VS-01 เพื่อหลีกเลี่ยงชน S55 จัดซื้อ ต้องปรับ references และตรวจ canonical values ที่กล่าวอ้างกับสัญญาหลักปัจจุบันก่อนทำ
6. **เกณฑ์หน้างาน:** รายละเอียดในชุดใช้ severity/checklist threshold ต่างกัน ต้องเลือกกฎตามโดเมนที่รับรองแล้ว ไม่รวมค่าเริ่มต้นที่ขัดกันเงียบ ๆ และห้ามนับ HTML simulated sync ว่าผ่าน backend acceptance

### สิ่งที่เพิ่มในเกณฑ์แต่ละระยะและ backlog เริ่มต้น

- **R0 เพิ่ม:** index SC-01/04, ID/source hash, conflict register สำหรับข้อ 1–5 และข้อสรุปว่าจะทำ/รอ/ทบทวนสำหรับทุก SC row ผล CI เดิมยังอ้างวันที่และ SHA เดิม รอบนี้ไม่ได้อ้างว่ารัน CI ใหม่
- **R1 เพิ่ม:** agent/knowledge governance ที่เลือกจาก SC-02/03/10, platform boundary จาก SC-14 และข้อสรุป field app หนึ่งทางที่เทียบ SC-12/13 กับผลิตภัณฑ์เดิม
- **R2 เพิ่ม:** contract tests ของ pilot จาก SC-09 และหลักฐาน defect/handoff จาก SC-11 ส่วน SC-18 ใช้เมื่อ Barausse อยู่ใน pilot เท่านั้น
- **R3 คงเดิม:** เงื่อนไขผู้มีอำนาจอนุญาตผลิตจริงยังบังคับ เอกสาร go-live หรือ BAU ของ SciSpace ข้ามเงื่อนไขนี้ไม่ได้
- **R4 เพิ่ม:** device/offline acceptance ของ field implementation ที่เลือก ซ้อม incident/support และเจ้าของ BAU ตาม scope จาก SC-08
- **R5 ระบุชัด:** SC-05/06/07/10/15 และการขยายลูกค้าแบบเลือกทำจาก SC-14 เป็น backlog ที่มองเห็น ไม่ใช่สัญญาว่าจะสร้างทั้งหมด
- **สายธุรกิจ/ความรู้:** ตรวจ SC-16/17 ควบคู่ได้ การได้ BOI และการทำวิจัยตลาดครบไม่ใช่ blocker โรงงานโดยอัตโนมัติ

เพิ่มในกรอบสองสัปดาห์แรก: ทำ inventory และแก้ศัพท์/รหัสที่ขัดกัน แยกข้ออ้างสถานะโครงการ เลือกแนวทาง field app เลือกข้อมูล Barausse ที่ตรง pilot และระบุเจ้าของทบทวน BOI แล้วจึงทำ implementation plan เฉพาะงานพร้อมไฟล์และ tests ไม่ดำเนินการจัดซื้อ/deploy ทุกขั้นตามเอกสารเก่าโดยอัตโนมัติ

### หลักฐานของฉบับปรับปรุง

- [Changelog ชุด SciSpace](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/changelog_v25.md)
- [SOP × source mapping ในอดีต](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/sop_github_mapping.md)
- [S51](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/monolith/inject_s51.py) / [S52](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/monolith/inject_s52.py)
- [S53](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/monolith/inject_s53.py) / [S54](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/monolith/inject_s54.py) / [S58](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/monolith/inject_s58.py)
- [ต้นแบบ field HTML](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/thai_installation_agent_fieldapp.html)
- [VS-01 spec](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/docs/specs/vs01-vision-to-boq-vertical-slice-v1.th.md)
- [ผลตรวจ FieldFlow ในเครื่อง](../reports/2026-09-11-fieldflow-artifact-status.th.html)
- โฟลเดอร์ชุดในเครื่อง: ../../agent-artifacts-zip_abcf131c-4325-49f4-af02-38af4d5555d6_1789040566/ — หลักฐานผู้จัดทำใน create_fieldflow_pack.py, create_boi_summary.py, build_barausse_notes.py, build_barausse_bom.py, build_barausse_checklist.py และ build_worksheet_p1.py


## ผลตรวจชุด SciSpace ที่ส่งกลับ

ตรวจชุดส่งกลับและระบุข้อแก้ไขแล้ว จับคู่ CON ทั้ง 13 รายการกับ SC/ระยะ R ใน [ผลตรวจรับ](../reports/2026-09-11-scispace-reconciliation-intake.th.html) ปิด CON-013 ว่าเป็นข้อมูล roadmap ในเครื่องที่ไม่ได้ส่งต่อ ยังไม่รับนิยาม canonical AIE/GAP หรือการเปลี่ยน PFMEA threshold ทุกโดเมน งานเทียบความหมาย R0 และตรวจพฤติกรรมรายโดเมน R1 ยังอยู่ใน backlog

## แหล่งอ้างอิง

- [Source ณ revision ที่ตรวจ](https://github.com/indetailsgroup-hue/monolith-workspace/tree/52e0eeb12527d4bb3866ee726b4f30d4d74dca57)
- [หลักฐาน Full Verify](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34459950518)
- [หลักฐาน Lint](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34459950559)
- [ข้อจำกัดตัดจริง](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/core/config/shadowMode.ts)
- [Roadmap เดิม — ฐานแผนในอดีต](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/docs/prd/monolith-complete-roadmap-v1.en.md)

รอบนี้จัดทำเอกสารเท่านั้น ไม่ได้เปลี่ยน product code, migration, release settings, approval หรือ deployment
