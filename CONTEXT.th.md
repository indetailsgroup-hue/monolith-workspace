# บริบท MONOLITH Repository

## วัตถุประสงค์

Repository นี้เป็นฐานที่มี governance สำหรับ MONOLITH ซึ่งเป็นแพลตฟอร์ม multi-tenant ที่ให้บริการแบรนด์ครัว สตูดิโอ ตัวแทน นักออกแบบ โรงงาน ช่างติดตั้ง ลูกค้า และลูกค้าของลูกค้า Daph เป็น pilot tenant หนึ่งรายและไม่ได้เป็นเจ้าของ governance หรือข้อมูล canonical กลางของแพลตฟอร์ม

## สถานะอำนาจปัจจุบัน

- สถานะ repository: ขั้น bootstrap ยังไม่ใช่ production
- Governance records: เป็น Proposed จนกว่า evidence และ ratification gates จะผ่าน
- Runtime claims: ไม่มี Contracts, schemas และ reference engines ไม่ได้พิสูจน์ isolation ที่ deploy แล้ว ความปลอดภัยการผลิต หรือ field use
- Canonical shared knowledge: แก้ไขผ่าน MONOLITH governance เท่านั้น
- Tenant data: ใช้ ADR-001 Bridge model เป็นนโยบาย isolation ส่วน runtime implementation เป็นงานในอนาคต

## หลักฐานต้นทาง

Kitchen encyclopedia และ reference implementation เดิมอยู่ใน `All aboute kitchen/` ส่วน artifacts ที่อยู่ภายใต้ governance ใหม่อยู่ใน `docs/`, `packages/`, `data/` และ `tests/` การคัดลอก evidence ต้องเก็บ provenance ไว้เสมอ

## กติกาการทำงาน

1. แยก `VERIFIED FACT`, `OWNER DECISION`, `INFERENCE`, `PROPOSAL`, `UNKNOWN` และ `CONTRADICTED`
2. ห้ามยกระดับ unit test ที่ผ่านให้เป็น production-readiness claim
3. เก็บ supplier-native codes โดยไม่สูญข้อมูล และ mapping ต้องมี provenance/rights metadata
4. ถือ `MON-BS-001` เป็น internal interoperability profile ไม่ใช่มาตรฐาน ISO/EN
5. Deliverables ของโปรเจกต์ต้องมีอังกฤษและไทย พร้อม standalone HTML ที่ตรงกับ Markdown
