# 40_SPECS

สเปกเชิงตัวเลขที่ดึงออกมาเป็นโครงสร้าง (drilling pattern, ระยะ, ภาระ, soft-close)
สำหรับ cross-reference หลายผลิตภัณฑ์ และเป็นชั้นที่ map ตรงกับค่าคงที่ใน MONOLITH

ตัวอย่างไฟล์ในอนาคต:
- `system32-boring.md` — pitch 32mm, first-hole, รูยึด → `src/core/designer/policy.ts`
- `minifix-cam-geometry.md` → `src/gate/rules/gateG11_types.ts`
- `hinge-cup-35mm.md` — มาตรฐานถ้วยบานพับ

> เฉพาะค่า `truth_layer: verified` เท่านั้นที่นำไปอ้างอิงในโค้ด MONOLITH ได้
