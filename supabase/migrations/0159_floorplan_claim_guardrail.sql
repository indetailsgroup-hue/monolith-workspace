-- 0159: claim guardrail — Floor plan import (ADR-062, มติ owner ก+ข 10 ก.ค. 2026)
-- ก: แก้ claim ให้ตรงจริงทันที · ข: import เป็น roadmap แบบ human-in-loop (underlay เท่านั้น)

update public.customer_docs
set body = body || chr(10) || chr(10) ||
  '【claim guardrail — Floor plan (ADR-062)】' || chr(10) ||
  '❌ ห้าม claim: "import แปลน image/PDF/DWG/DXF ได้" หรือ "AI ตรวจจับผนัง/ประตู/หน้าต่างอัตโนมัติ" (ยังไม่มีจริงในระบบ)' || chr(10) ||
  '✅ เรื่องจริงที่แข็งแรงกว่า (accuracy-first):' || chr(10) ||
  '  • MONOLITH ไม่เดาจากแปลนเก่า — ทีมวัดจริงหน้างานทุกโซน บันทึกเป็น verified record มีคนรับผิดชอบต่อตัวเลข' || chr(10) ||
  '  • เฟอร์นิเจอร์ parametric สร้างจากขนาดที่วัดจริง — Manufacturing is Deterministic' || chr(10) ||
  '  • ทุกขั้นตอนมีคนวัดเช็คจริงก่อนอนุมัติ — ไม่มีตัวเลขไหนถึงโรงงานโดยไม่ผ่านมือคน' || chr(10) ||
  '  • (เมื่อ roadmap ADR-062 เปิด) แปลนที่ import = ร่างอ้างอิง/underlay เท่านั้น ไม่ใช่ขนาดผลิต'
where slug = 'sale_scripts'
  and body not like '%【claim guardrail — Floor plan%';
