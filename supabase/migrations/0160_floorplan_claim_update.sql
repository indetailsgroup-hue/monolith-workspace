-- 0160: อัปเดต claim floor plan หลัง FP-1/FP-2 ส่งมอบจริง (ADR-062)
-- ตอนนี้พูดได้จริง: รับแปลนอ้างอิง image/PDF/DXF เป็น underlay (ยังห้าม: DWG, AI detect)

update public.customer_docs
set body = replace(body,
  '❌ ห้าม claim: "import แปลน image/PDF/DWG/DXF ได้" หรือ "AI ตรวจจับผนัง/ประตู/หน้าต่างอัตโนมัติ" (ยังไม่มีจริงในระบบ)',
  '✅ พูดได้แล้ว (FP-1/FP-2 ส่งมอบ 10 ก.ค. 2569): "รับแปลนอ้างอิง image/PDF/DXF วางเป็นภาพรองพื้นในจอออกแบบ" — ต้องพูดคู่เสมอว่าเป็นภาพอ้างอิง ไม่ใช่ขนาดผลิต' || chr(10) ||
  '❌ ยังห้าม claim: "รองรับ DWG" (ฟอร์แมตปิด — แนะนำลูกค้า export DXF จาก CAD แทน) และ "AI ตรวจจับผนัง/ประตู/หน้าต่างอัตโนมัติ" (ยังไม่มีจริง)')
where slug = 'sale_scripts'
  and body like '%【claim guardrail — Floor plan%'
  and body not like '%FP-1/FP-2 ส่งมอบ%';
