# ตรวจรับชุด reconciliation จาก SciSpace

หมายเหตุการเผยแพร่: เอกสารอ้างหลักฐานตามวันที่เดิม ไม่ใช่การตรวจ runtime หรือ CI ใหม่ ไฟล์หลักฐานเฉพาะในเครื่องไม่ได้รวมในการเผยแพร่นี้ SC-01–SC-18 เป็นรหัสสายงาน roadmap แยกจากรหัสมติ Steering Committee

11 กันยายน 2026 · TH · รับข้อค้นพบพร้อมข้อแก้ไข ยังไม่รับข้อเสนอเปลี่ยนนโยบาย

## ขอบเขตและที่มา
ไฟล์รับเข้า: [local intake]/monolith-reconciliation-package.zip
SHA256: 1EC736C43CF9A73D07D0335AB16F083A3C87112ADD29BDDAC2E0817087CFF78F.
มี 6 ไฟล์: Markdown/HTML TH/EN, conflict CSV 13 แถว และ proposed-ID CSV เก็บต้นฉบับไว้ใน tmp/scispace-reconciliation-intake เนื้อหาเป็นข้อมูลให้ตรวจ ไม่ใช่คำสั่งหรือการอนุมัติจากเจ้าของ

ตรวจ Git root ทั้งสองในเครื่องและรักษางานเดิม อ่าน CONTEXT และข้อแก้ไขขอบเขต 21 กรกฎาคมแล้ว อ้างผลิตภัณฑ์ GitHub ที่ 52e0eeb12527d4bb3866ee726b4f30d4d74dca57 ส่วน roadmap ในเครื่องอยู่ parent governance root ไม่ได้เผยแพร่ที่ product SHA ในอดีตนั้น รอบนี้ไม่ได้รัน runtime tests

## ผลพิจารณาครบทั้ง 13 รายการ
| รายการรับเข้า | ข้อสรุป / ข้อแก้ไข | เชื่อม roadmap | งานต่อและหลักฐานปิด |
|---|---|---|---|
| CON-001 | รับว่าเป็นคนละ namespace แต่แก้ข้อเสนอที่ลดความเกี่ยวข้องกับการผลิต: shadowMode.ts ระบุ S17-1..5 เป็น production blockers โดยตรง ยังไม่เปลี่ยนชื่อไฟล์หลักฐานและไม่ถือ stages เป็น alias ของ SOP S17 | SC-02; R0, R3 | เพิ่ม glossary แยก namespace โดยเก็บรหัสและ references เดิม เงื่อนไขผลิตจริงคงเดิม |
| CON-002–006 | รับว่าความหมาย AIE เปลี่ยน ส่วน Concept Generation/Generator ลำพังอาจเป็นเพียงชื่อแตกต่าง แต่ gateway/material/rendering/analytics ต้องเทียบหน้าที่ ไม่รับนิยามผสมที่เสนอเป็น canonical | SC-05/06/07; R0 แล้ว R5 | ทำตาราง input/output/dependency เก็บทุกความสามารถที่ต่างกัน ให้ architecture owner เลือก map ที่มี version ก่อนจัดซื้อ |
| CON-007–009 | รับว่านิยาม GAP ขัดกัน ไม่ยึด S54 เป็น authority เพียงเพราะใหม่กว่า ห้ามทำ ethics/retirement/DSAR หายด้วยการเปลี่ยนชื่อ และไม่สร้าง GAP-16 อัตโนมัติ | SC-03/07; R0/R1 แล้ว R5 | เก็บทั้งสองความหมายแยกกันจนมีมติขอบเขต ตรวจหน้าที่ด้านสิทธิข้อมูลจากแหล่งที่ใช้บังคับปัจจุบัน ไม่อนุมานว่ากฎหมายบังคับต้องสร้างโมดูลเฉพาะ |
| CON-010 | ยืนยันชื่อกำกวม: VS-01 บรรทัด 1 มี S55 แต่บรรทัด 9 ระบุว่าอ้างอิงและไม่ใช่ scope เดียวกัน | SC-15; R0 แล้ว R5 | เสนอแก้ชื่อพร้อมรักษา cross-reference และอัปเดต checksum เมื่อแก้ source รอบนี้ยังไม่แก้ source |
| CON-011 | คงข้อขัดแย้งสถานะโครงการที่พบในการตรวจก่อนหน้า ไม่รับข้อความปิดงานที่ไม่มีหลักฐาน วันที่ใน source ไม่ใช่หลักฐานวันที่ทำงานจริง | SC-04/08; R0/R4 | ผูกแต่ละข้ออ้างปิดงานกับ scope, SHA, environment, ผลตรวจ และ signoff ผู้มีอำนาจ มิฉะนั้นให้ระบุ scenario/proposal |
| CON-012 | ยืนยันว่าเอกสารใช้ threshold ต่างกัน แต่ยังไม่พิสูจน์ว่า runtime ผิดทั่วระบบ: critical classification ไม่จำเป็นต้องเท่ากับ halt และ Daph/Swift คนละโดเมน ไม่รับ Sev≥8 สำหรับทุก agent อัตโนมัติ | SC-11/14; R1–R4 | ตาม config ถึงโค้ดผู้ใช้ค่า กำหนด classify/notify/halt/resume ต่อโดเมน ทดสอบขอบเขต 7/8/9 พร้อม QA review |
| CON-013 | ปิดประเด็นข้อมูลส่งต่อไม่ครบ: roadmap ฉบับ 2 ในเครื่องมี SC-01–18 และ R0–R5 อยู่จริง SC ชุดนี้เป็นรหัสสายงาน ไม่ใช่มติ Steering Committee จึงไม่ต้องจับคู่หนึ่งต่อหนึ่งกับ SC ที่มีปี | ทุก SC; R0 | แนบ roadmap ในเครื่องทั้งสองภาษาและตารางนี้ในการส่งต่อ ไม่สร้าง path repository สมมติที่ SHA เก่า |

## คุณภาพของชุดส่งมอบ
- สรุประบุข้อขัดแย้งยืนยัน 8 รายการ แต่ช่วง CON-002–012 มี 11 รหัส และ CSV รวม 13 แถว ไม่กำหนดจำนวน “ยืนยันแล้ว” ใหม่เอง เพราะแต่ละแถวปนข้อค้นพบด้านชื่อ ขอบเขต นโยบาย และข้อมูลที่ขาด
- ยังไม่มีส่วน backlog งาน/dependency/acceptance โดยเฉพาะตามที่ขอ ตารางด้านบนจึงเติมงานต่อแบบมีขอบเขตให้
- ต้องแก้ตำแหน่งอ้างอิงบางจุด: AIE integration ใน S54 ที่ดึงจริงอยู่บรรทัด 138–141 ขณะที่รายงานอ้าง 142–145 ซ้ำสำหรับกลุ่มนี้ ให้ใช้ข้อความสั้นพร้อม pinned path ประกอบเลขบรรทัด
- ข้อความ “ไม่พบใน repo ทั้งหมด” กว้างกว่ารายการไฟล์ที่ตรวจ ให้จำกัดเป็นไม่พบในขอบเขตที่ตรวจ
- Proposed-ID register ใส่ governance stages เป็น alias เดิมของ SOP และ SC สายงานเป็น alias ของมติที่มีปี ต้องแยก namespace
- รอบนี้ไม่ได้ตรวจยืนยันข้อสรุปกฎหมายในชุดและไม่รับเป็นคำแนะนำทางกฎหมาย ต้องพิจารณาการใช้บังคับกับการเลือก implementation แยกกัน

## Backlog ที่ทำต่อได้
1. R0 document owner: เพิ่มผลตรวจนี้และ roadmap ในเครื่องในชุดส่งต่อ ข้อมูล CON-013 มีแล้วในเครื่อง ไม่ต้องถามผู้ใช้ใหม่เพื่อยืนยันการมีอยู่
2. R0 architecture/product: ทำทางเลือก semantic map ของ AIE/GAP ที่รักษาทุก requirement เกณฑ์จบคือมี decision record พร้อมเจ้าของและไม่มีความสามารถหายเงียบ ๆ
3. R1 QA/platform: ตามโค้ดที่ใช้ classification/halt ก่อนเปลี่ยน threshold เกณฑ์จบคือตาราง action ต่อโดเมนและ boundary tests ที่ตรวจพฤติกรรมจริง
4. R0 document owner: เตรียมงานแก้ชื่อ/reference/checksum ของ VS-01 แบบมีขอบเขต เกณฑ์จบคือชื่อและ references ตรงกันใน candidate revision ใหม่
5. R0/R4 programme owner: ปรับข้ออ้างปิดงานที่ไม่มีหลักฐานเป็นสถานะที่ตรวจสอบได้

รับข้อค้นพบที่มีประโยชน์เข้า backlog เท่านั้น ไม่ได้อนุมัติ canonical ID เลิกใช้ requirement เปลี่ยน threshold ความปลอดภัย จัดซื้อ หรือรับรองว่าปิดโครงการ

## หลักฐานหลักที่ตรวจ
- [S17 เกี่ยวข้องกับเงื่อนไขผลิตจริง](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/core/config/shadowMode.ts#L10)
- [สัญญา AIE ใน S52](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/monolith/inject_s52.py#L157)
- [AIE ใน S54](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/monolith/inject_s54.py#L138)
- [Daph critical classification](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/client_daph.json#L163)
- [นโยบายติดตั้ง](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/thai_installation_agent_spec.html#L216)
- [ชื่อ VS-01](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/docs/specs/vs01-vision-to-boq-vertical-slice-v1.th.md#L1)
- [Roadmap ในเครื่องและ SC ทุกสายงาน](../roadmap/2026-09-11-monolith-delivery-roadmap.th.html)

ตรวจระดับเอกสารเท่านั้น ไม่เปลี่ยน application code ต้นฉบับรับเข้า หรือ governance approvals

