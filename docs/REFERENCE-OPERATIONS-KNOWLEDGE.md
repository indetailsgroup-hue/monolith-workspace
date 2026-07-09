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

## C18 — ราคากลางตลาดบิลท์อินไทย 2568–69 (ADR-052, seed อยู่ใน market_price_bands 0147)

- โครงสร้างราคาหน้าโรงงานตลาด: วัสดุ ~25% / แรง+สี ~45% / overhead+กำไร ~30%; ยังไม่รวม ขนส่ง-ติดตั้ง-VAT — บวกดำเนินการ ~10%
- Hidden costs ที่ต้องเช็คทุกใบเสนอราคา: ดำเนินการ +10% · VAT 7% · ต่างจังหวัด +20% · เผื่องานเพิ่ม/เปลี่ยนใจ +20%
- กติกาวัสดุ (hard rule ในระบบ): PB/พาร์ติเคิล/MDF ธรรมดา ห้ามครัว-ห้องน้ำ (พัง 1–3 ปี = รื้อทำใหม่) → HMR/ไม้อัด/พลาสวูดเท่านั้น; E1/E0 formaldehyde เป็น spec ผูกพัน
- ราคาแผ่น (1.2×2.4 ม. อ้างอิงตลาด): PB จาก 170 · MDF 335–800 · HMR 415–1,030 (15mm เมลามีนขาว ~590) · ไม้อัดยาง 245–885 ตามหนา · plywood กันน้ำถึง 2,300
- ฟิตติ้ง tier: Blum (แพงสุด ~2× Hettich) > Hafele > Hettich > OEM (พัง 2–5 ปี); ฟิตติ้งพรีเมียม +15–30% ของราคาตู้ แต่ยืดอายุ 5–7 → 15–20 ปี; ชุดตะแกรง Hafele จริง 4,190–32,900/ชุด — ตู้เดียวอัดฟิตติ้งครบทะลุ 30,000 ได้
- เรท M&E หน้างาน (อ้างอิง): จุดปลั๊ก/สวิตช์ 300–1,500 · ย้ายจุด 650–1,250 · LED เส้น 800–1,500/ม. · sensor ตู้ 1,000 · ดูดควัน/เตาฝัง 1,500–3,000 · ประปาซิงค์ 1,500/จุด
- design fee ตลาด: 300–2,000 บาท/ตร.ม. (sliding scale) หรือ 5–15% ของมูลค่างาน หรือเหมา 100k–300k/ยูนิต
- **ไม่เอาเข้าระบบ** (ADR-052 ปัดตก): ราคากลางครุภัณฑ์รัฐ/Factor F 1.2999 — เก็บไว้ตรงนี้เผื่อวันหนึ่งรับงานราชการ

## Market Outlook 2569 (ADR-053)

ดู [MARKET-OUTLOOK-2569.md](MARKET-OUTLOOK-2569.md) — reconcile รายงานตลาด 2 ฉบับ: funnel ปิรามิด (~250k งานเล็ก / 65–80k งานเต็มรูปแบบ), pocket โต = <3 ล้าน + รีโนเวท, supply บ้านใหม่แห้ง 2570–71, ไม้ +3–5%, กลยุทธ์ 4 ทางรอเจ้าของเลือก (turnkey Mass / renovation-first / smart add-on / low-VOC E0) — segment cheat sheet อยู่ใน sale_scripts (0149)

**Turnkey <3M (ADR-055)**: ดู [TURNKEY-PLAYBOOK.md](TURNKEY-PLAYBOOK.md) — MONOLITH backlog เพิ่ม: modular grid SKU 30/45/60/90 ซม. + 3D closed-set configurator (HOPLA/Younique pattern) สำหรับ turnkey mass production

## C18–C20 release train (ADR-056, 9 ก.ค. 2026)

- C19 (platform export/delivery manifest/export QA) + C20 (social launch kit) = **ชั้นโปรดักต์ของ kit ล้วน — ไม่แตะ IIMOS**; claim guardrails ของ C20 ลอก pattern มาใช้กับ DAPH แล้ว (0152)
- C18 workbook integration: สูตร Budget Guardrail (Qty×Base×Core×Finish×(1+Hidden%)) + re-quote gate — **align กับ ADR-052** (band=sanity ไม่ใช่ราคาเรา) ✓
- **ปัดตก material multiplier calculator เข้า IIMOS**: factor ของ kit เป็นค่า default สมมติ — calibration จากงานจริง (0146) แม่นกว่าเสมอ อย่าเอาตัวเลขเดามาทับข้อมูลจริง
- Hygiene: Linden bundle + raw research ถูก quarantine ที่ _non_customer_archive (นอก git repo — ตรวจแล้ว) ✓
