# P0-10 งานติดตามหลักฐาน — รายงานส่งมอบ

30 กันยายน 2026 ฐาน `3bdd6f3e5217f3252292cd11c858be151c01f977` Phase A ยังเป็น `EVIDENCE_INCOMPLETE`

## สิ่งที่ส่งมอบ

E1: check/assemble บังคับให้ stderr มีจริง ชื่อตรง suite และ SHA256 ตรงที่บันทึก ไฟล์หาย ถูกลบ ถูกแทนที่หรือชื่อผิดไม่ผ่าน ส่วนไฟล์ว่างและ SQL error ที่ negative test ตั้งใจสร้างยังใช้ได้

E2: replica local รอบใหม่ส่ง base SHA, ref, run ID เดียวกัน, migration 193 ไฟล์ และ digest ของ tested-source manifest ครบ สรุป provenanceComplete=true ไม่มี field ขาด หมายถึงข้อมูลครบ ไม่ใช่รับรองการรันจากภายนอก Base SHA กับ source digest ใช้ระบุ patch ที่ทดสอบก่อน commit

E3: เพิ่ม fullPgTapPass และ verdictScope=pgtap-only ระบุขอบเขตผล ส่วน workflowPass=null หมายถึงยังไม่ได้ประเมิน คง pass/fullPass เป็น alias ของผล pgTAP เต็มเพื่อความเข้ากันได้ ไม่อนุมานว่าทั้ง workflow ผ่าน

Source ที่ทำงานจริงของ product เปลี่ยนเพียงตัวตรวจและ unit tests ไม่แก้ 0198, SQL suites หรือ workflow PRD เป็น 1.11 และมีเอกสารสองภาษาสำหรับตัดสินใจ integration/B12 โดยไม่สร้าง 0199 เปลี่ยน grant หรือแก้ conflict manufacturing

## หลักฐานทดสอบ

| รายการ | ผล |
| --- | --- |
| RED ทดสอบก่อนแก้ implementation | ผ่าน 22 / ล้ม 11 รันครบ 33 |
| GREEN ตัวตรวจ | 33/33 ไม่มี skip |
| Migration บน stack ชั่วคราวใหม่ | 193/193 จากศูนย์ |
| Fail-closed SQL | 28/28 |
| LINE suites เดิม | 107/107 และ 133/133 |
| Python 12 ไฟล์ | 72/72 ไม่มี fail/skip |
| Claim race | 10+10 ซ้ำศูนย์ |
| pgTAP เต็ม | รันครบ 12 ผ่าน 11 ส่วน containment 6/8 exit 3 |
| Replica ในเครื่อง | Exit 1 คงผลเต็มไม่ผ่าน ส่วน verifier exit 0 |
| เก็บกวาด | ไม่เหลือ container/network/CI directory ของรอบนี้ cron ไม่ได้รัน |

การขาดฟังก์ชัน factory แบบ 12 arguments ยังเป็น failure เดียวของ suite เต็ม ไม่ใช้ผลกรองมาแทน ยังไม่ได้ทดสอบ GitHub Actions หรือ production ในรอบนี้

## การตรวจและข้อจำกัดหลักฐาน

Opus 5.5 สร้าง patch สองไฟล์จาก packet source สามไฟล์ที่สแกนแล้วและปิดเครื่องมือ Codex รัน RED/GREEN กับ stack ชั่วคราว จัดเอกสารและ gate มี Codex agent แยกตรวจ commit เดิมและ diff ใหม่ ไม่พบ blocker เพิ่ม แต่ไม่ได้รันฐานข้อมูลหรือรับรองข้ามค่าย บันทึกคำรายงานไว้ใน REVIEW-NOTES.txt

สำเนาไฟล์ที่เปลี่ยนถูกเก็บก่อนทดสอบ ส่วน manifest ของ source ทั้งหมดสร้างหลัง direct tests และคัดลอก scratch โดย final gate เทียบแต่ละรายการกับ Git วิธีนี้อาศัย source คงที่และผู้เขียนคนเดียว ไม่ใช่หลักฐานป้องกันการเปลี่ยนไฟล์ชั่วคราวจากผู้เขียนอื่น ไม่แก้หลักฐานเก่า

Actions workflow ที่ไม่แก้ยังไม่ส่ง testedSourceSha256 จึงจะรายงาน provenance ว่าไม่ครบตามจริง งานนี้แก้รอบ local และเปิดเผย field ที่ขาด ไม่อ้างว่า runner ทุกตัวส่งครบ การตรวจข้อมูลลับใช้ pattern พร้อม positive controls ไม่รับประกันตรวจได้ทุกรูปแบบ

## เรื่องที่เตรียมให้เจ้าของตัดสิน

เอกสาร integration/B12 ระบุความเสี่ยง grant กลับมาหากลง 0170 หลัง 0191, invalid ref ที่ยังค้าง, ผู้เรียก RPC ภายนอกที่ยังไม่ยืนยัน และขอบเขต authenticated บน rpc_record_line_send_result พร้อมเสนอเทสต์และเส้นทางที่ต้องรักษา ต้องระบุเจ้าของ manufacturing/integration ส่วน tenant และเจ้าของงานทับซ้อนยังรอมติ ไม่อนุมัติเลข migration หรือ role matrix แทนผู้ใช้

ยังรอการตรวจรับอิสระ งานรวม containment แยก และ CI จริงผ่านหลังอนุมัติ push ส่วน B12/0199, default ACL, production catalog และ G-C1 ที่ส่ง LINE จริงเป็นด่านแยก ไม่ได้ push/deploy/ส่งข้อความจริง/ต่อ shared-production
