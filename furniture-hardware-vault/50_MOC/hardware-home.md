---
note_type: system_moc
truth_layer: verified
tags: [moc, home]
---

# 🏠 Hardware Home (จุดเริ่มนำทาง)

Second Brain องค์ความรู้ฮาร์ดแวร์เฟอร์นิเจอร์สำหรับ MONOLITH + Daph

## ระบบฮาร์ดแวร์
- [[blum-hinge-systems-moc|🔩 Blum — Hinge Systems]] (บานพับ)
- [[salice-hafele-systems-moc|🔩 Salice / Häfele — Hinges & Door Systems]] (บานพับ + โช้ค + push + free flap)
- [[hafele-lighting-systems-moc|💡 Häfele — Loox & Loox5 Lighting Systems]] (ระบบแสงสว่างเฟอร์นิเจอร์)
- [[hafele-sliding-door-moc|🚪 Häfele — Slido Sliding Door Systems]] (ระบบบานเลื่อนเฟอร์นิเจอร์)
- [[hafele-kitchen-pullout-moc|🍽️ Häfele & Kesseböhmer — Kitchen Cabinet Fittings & Pullouts]] (ตะแกรงตู้ครัว)
- [[hafele-wardrobe-moc|👔 Häfele — Wardrobe Fittings & Equipment]] (ระบบจัดระเบียบตู้เสื้อผ้า)
- [[hafele-locks-moc|🔑 Häfele — Locking Systems & Security]] (ระบบกุญแจและระบบล็อคตู้)
- [[italiana-ferramenta-moc|🇮🇹 Italiana Ferramenta — Hardware Systems]] (ขาปรับระดับ + ข้อต่อ + ตัวรับชั้น)
- 📦 Blum — Box Systems: [[blum-legrabox]] (LEGRABOX) — _เริ่มแล้ว_
- 🛤️ Blum — Runner Systems: [[blum-runner-systems-moc|Blum — Runner Systems MOC]]
- ⬆️ Blum — Lift Systems: [[blum-aventos-hk-xs]] · [[blum-aventos-hk-s]]
- 🪟 Aluminum Profile System — _ยังไม่เริ่ม_

## สเปกกลาง (Specs)
- [[system-32-standard]] · [[hinge-cup-35mm-system32]] · [[clip-top-110-drilling-gap]] · [[hinge-overlay-formula]] · [[cam-lock-minifix-15mm]]

## แหล่งที่มา (Sources)
- [[blum-catalogue-2024-2025|Blum Catalogue 2024-2025]]
- [[salice-hafele-catalog|Salice / Häfele Catalog]]

## ข้อต่อ/สกรู/ตัวหนอน (Fasteners)
- [[hafele-minifix-fasteners|Häfele Minifix Connectors, Sleeves & Screws]]

## 🤖 Prompt สำหรับ AI สกัดข้อมูล + ช่วยออกแบบ
- `HARDWARE_EXTRACTION_PROMPT.md` (รากของ vault) — schema เก็บทุกระยะ + BOM + ราคา + ตัวแทนคุมต้นทุน

## เชื่อมกับ MONOLITH
ค่าคงที่เชิงวิศวกรรมในโค้ดที่ vault นี้กำกับ:
- System 32 (32mm pitch, first-hole 37mm) → `src/core/designer/policy.ts`
- Minifix / cam connector → `src/gate/rules/gateG11_types.ts`
- Drilling map → `src/core/manufacturing/drillMap/`
- Fitting catalogue → `src/core/fitting/FittingCatalogue.ts`

> กติกา: ค่าจาก vault ใช้ป้อน MONOLITH ได้เฉพาะโน้ตที่ `truth_layer: verified` เท่านั้น
