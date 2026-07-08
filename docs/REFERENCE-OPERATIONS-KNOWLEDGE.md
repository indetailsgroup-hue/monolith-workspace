# คลังความรู้ปฏิบัติการ (จาก reconcile ADR-050 — QMS จริง DAPH 2020 + kit + vault)

> แหล่ง: `docs/new-folder-workbook-audit/` (SOS/JES/PFMEA/Control Plan 34 เล่ม) · `daph-second-brain/` · kit C1–C17
> สถานะ: reference — ตัวเลขที่บังคับในระบบแล้วดู migration 0143+; ที่เหลือคือความรู้รอใช้

## ตัวเลข/จังหวะจริงของบริษัท (Master Matrix + PFMEA + Control Plan)

| เรื่อง | ค่า | ที่มา / สถานะในระบบ |
|---|---|---|
| กดทับ HPL ก่อนตัด | ≥ 3 ชม. (SC) | Control Plan → **บังคับใน 0143** |
| วางไม้ทับกัน | ≤ 5 แผ่น (SC) | Control Plan → **บังคับใน 0143** |
| เปลี่ยนใบเลื่อย | ทุก ~150–200 แผ่น หรือขอบเริ่มบิ่น | P'Mean → checklist 0143 |
| เป่าทำความสะอาดเครื่อง edging | ทุก 15 นาที | P'Mean → checklist 0143 |
| สั่งซื้อวัสดุ | SEV 10 (สูงสุดทั้งระบบ) | PFMEA Main → gate ยืนยัน 0143 |
| อบรมพนักงานขาย | ทุก 3 เดือน | PFMEA Revise 1 → cron 0144 |
| ระยะเวลาออกแบบ | 2 สัปดาห์/ขั้น (Mood&Tone → 3D → Rendering → Construction DWG) | SOS Office — ค่า default วางแผน/SLA |
| Effort weights ต่อขั้น | Sale 2 · Measure 10 · Production 4 · Designer 5 | Master Matrix — ฐาน estimation |
| ชำระ | ออกแบบจ่ายเต็มล่วงหน้า · ตกแต่ง 4 งวด | PFMEA Sale — ตรง 50/30/15/5 ที่ระบบใช้ |
| พื้น 4 ชั้นก่อนติดตั้ง | ฟิล์ม → พรม → ลูกฟูก → ไม้อัด 18mm | SOS Installation lane 4 |
| โครงอลูมิเนียม | M6 + พุกเหล็ก + ฉาก 90° เทียบเลเซอร์ | JES-006 |
| Wall panel | ใส่แผ่นล่างก่อนเพื่อ Interlock | JES-009 |
| Top | Magbol + เทปสองหน้า | JES-010 |
| อุปกรณ์วัดหน้างาน | เลเซอร์ · ตลับเมตร · ฉาก · masking tape · ใบบันทึก (+GPS ตาม Revise 1) | PFMEA Area Measurement |

## มาตรฐานโครงการ commercial (อ้างอิง Citadines/Ascott KDR — ใช้เมื่อรับงาน serviced apartment)

ฝ้า: lift lobby หลัก 3.0m · lobby ชั้นพัก 2.4m · ห้องนั่งเล่น/นอน 2.6m · อื่นๆ 2.4m — ทางเดิน ≥1.5m — ลิฟต์ ≥13 คน
พื้นที่ยูนิต: Studio 25–35m² · 1BR 45–50 · 2BR 60–75 — ห้องน้ำ: Studio 4.5m² · master 4.5 · common 4.0 · powder 1.5 — shower ≥1.0×0.9m
เคาน์เตอร์ครัวขั้นต่ำ: Studio 1.8m / 1BR 2.4m / 2BR 3.0m (ผิว heavy-duty กันคราบ/รอย) — ตู้รองเท้า/wardrobe ใกล้ทางเข้า

## แผนที่ hardware specs (daph-second-brain → ให้ MONOLITH)

`daph-second-brain/02-Areas/Hardware/40_SPECS/`: hinge-overlay-formula · cam-lock-minifix-15mm · system-32-standard · hinge-cup-35mm-system32 · clip-top-110-drilling-gap + แคตตาล็อก Blum/Häfele/Salice/Kesseböhmer ครบใน 10_SOURCES — **backlog MONOLITH**: ผูกเข้า HardwareSmartDimensions/DrillMap

## เขตแดนยืนยันรอบ 3 (ADR-050)

เข้าไม่ได้ตลอดไป: RIBA/retainage/WIP earned-revenue/draw schedule/markup-bid/sales pipeline · RPN ห้ามใช้ sort (null ทั้งระบบ — มีแต่ SEV) · ชีต Six-Sigma โรงพยาบาลใน Control Plan = template ปน ห้าม ingest

## ADR-051 — Pattern spine จาก competitor deep-dives ×10 (C17)

**3 pattern ที่ recur ทุกเจ้า (ยึดเป็นวินัยระบบ):**
1. **ID-chain traceability** — Package ID + Revision ID ร้อยตั้งแต่ estimate → BOM → cutlist → DXF/G-code/OperationGraph/CNC manifest → Job Cost (IIMOS: MW-xxx + capture spine ครอบอยู่แล้ว)
2. **Revision-as-delta ไม่ overwrite** — base / delta / approved total (IIMOS: VO+EOT ตรง pattern แล้ว); revision ที่กระทบ CAD/CAM ต้อง block factory release จน regenerate artifacts (มีผ่าน tpl_shop_rev "หยุดใช้ rev เดิม")
3. **Evidence/claim boundary** — ทุก claim ต้องมี source confidence; "no live integration unless built+tested"; "claim CNC เฉพาะ machine profile ที่ verify แล้ว"

**MONOLITH backlog (จาก deep dives — ฝั่ง CAD/CAM):**
- Overlay-diff revision QA (On-Screen Takeoff pattern): เทียบ drawing rev เก่า-ใหม่เชิงภาพ → added/removed/changed → ผูก estimate delta
- Manifest checksum ใน ID-chain (Cabinet Vision pattern): cutlist→DXF→G-code→CNC manifest มี checksum + verified_by/date
- AI-draft-until-reviewed gate (PlanSwift): ผล auto ใดๆ = draft จนมีผู้ตรวจ + confidence + adjustment

**ยืนยันเขตแดนรอบ 4 (product-only ตลอดไป):** QuickBooks pattern (invoice/retainage/AR-AP/P&L ขายลูกค้า) · Buildertrend pattern (sales pipeline/draw schedule/WIP/client billing portal) · Dynamics ส่วน inventory/fulfillment/ERP-replacement — sliver ที่ดูดแล้ว: item-master↔BOM mapping = มีใน package_materials + order-confirm gate
