# Turnkey Playbook — คอนโด <3 ล้าน (ADR-055)

> เล่มธุรกิจคู่กับ [MARKET-OUTLOOK-2569](MARKET-OUTLOOK-2569.md) · ระบบรองรับแล้ว: turnkey_offers 3 tier + stamp วันส่งมอบ (0151), add-on upsell (0150), segment cheat sheet (0149), E1 differentiator (0150)
> ตัวเลขทั้งหมด = กรอบตั้งต้นจากรายงานวิจัย 2026-07-09 — ปรับตามหน้างานจริงผ่าน rpc ไม่แก้เอกสารนี้ย้อนหลัง

## 1. ทำไมทางนี้เดินได้ (ย่อ)

- ตลาด <3M หดเชิงมูลค่า (presale −52% ปี 67) แต่**คนที่ผ่านสินเชื่อ 20–30% ที่เหลือ = real demand คุณภาพสูง** · ต่างชาติโอนกลุ่มนี้เป็นเบอร์หนึ่ง
- Gen Y/Z: **Perceived Value ชี้ขาด (R²=.746)** และ **Time-based Risk = ตัวยับยั้งอันดับหนึ่ง** → ราคานิ่ง + วันส่งมอบสัญญา = คำตอบตรงตัว (ระบบ stamp ให้แล้ว)
- ช่องว่างราคา **80,000–200,000** ระหว่าง SB (mass 5,500/ตร.ม.) กับ Richmont's (expat 89k+VAT) — จุดยืน DAPH: **speed + personalization ที่ SB ทำไม่ได้ที่ scale**
- ตลาดเช่า 30,000 ล./ปี: investor ต้องการ furnished — turnkey 80k คืนทุนค่าเช่าส่วนต่างใน ~12–14 เดือน (มุมขายกับ investor)

## 2. เมนู 3 tier (seed ในระบบ — แก้ผ่าน `rpc_field_set_turnkey_offer`)

| | Starter 55k | Standard 100k | Plus 175k |
|---|---|---|---|
| ครัว | 1.8 ม. ลามิเนต | 2.4 ม. + ท็อปหินสังเคราะห์ | + หินธรรมชาติ + soft-close |
| ตู้เสื้อผ้า | 1.5 ม. บานเปิด | 2 ม. บานเลื่อน | 2.5 ม. walk-in ready |
| หัวเตียง/ทีวี/โต๊ะ | พื้นฐาน | + wallpaper + โต๊ะพับ | + หุ้มหนัง + LED + island |
| ส่งมอบ (สัญญา) | 21 วัน | 30 วัน | 45 วัน |
| ประกัน | 5 ปี | 10 ปี | 15 ปี |

- **Hybrid pricing** (งานวิจัย Yang 2025): headline = pre-embed ราคานิ่ง → upsell ด้วย add-on catalog (smart lock/ไฟ sensor/soft-close = ARPU +15–25%)
- เฟอร์ลอยตัว/เครื่องใช้ไฟฟ้า: จัดซื้อ wholesale เข้า BOM ปกติ — อย่าสต๊อกเอง v1

## 3. กรอบเศรษฐศาสตร์ (เช็คกับเครื่อง estimate ทุก package)

- COGS เป้า **55–65%** (แผ่น 22–28% · hardware 8–12% · ผิว 6–10% · หิน 4–7% · แรงโรงงาน 8–12% · ติดตั้ง 6–10% · ขนส่ง 2–4% · ลอยตัว/ไฟฟ้า 15–25%) → **GM 35–45%**
- ตัวอย่างเป้าเดือน: Starter×3 + Standard×4 + Plus×2 = 9 ยูนิต → GP ~366k → หัก OpEx ~210k → **EBITDA ~156k/เดือน**
- KPI ปี 1: 80–120 ยูนิต · ยอด 8–13 ล. · GM 35–42% · CPL <800 · conversion 8–12% · NPS >50
- **วินัย**: ทุก package ผ่าน `rpc_factory_estimate_package` + เทียบ band — calibration จับ bias ทุกเดือน (ไม้ +3–5% ปีนี้)

## 4. ช่องทาง (วัดด้วย lead_source ในระบบ — เทงบตาม conversion จริง)

| ช่องทาง | เป้า lead | กลไก | หมายเหตุ |
|---|---|---|---|
| Developer partnership | 30–40% | MOU 2–3 ราย โซนชานเมือง (บางนา/รังสิต/บางบัวทอง) เสนอ pre-transfer bundle | commission ให้ sales โครงการ 5–8% |
| Agent referral | 20–30% | ค่าแนะนำ 5–7% ของยอด turnkey เมื่อปิด — เน้น resale (ลูกค้าต้องรีโนเวททันที = ต่อเส้น Renovation-first) | **commission ledger ยังไม่เข้าระบบ — มี agent จริงค่อยเปิด ADR** |
| Digital D2C | 30–40% | TikTok before/after "งบจริง–งานจริง" + Facebook/Influencer → LINE OA → qualify ปกติ | Gen Y เชื่อรีวิวตรงไปตรงมา > โฆษณา polish |

Roadmap 90 วัน: เดือน 1 ยืนยันเมนู/COGS ต่อ SKU + show unit · เดือน 2 MOU developer + ลง portal + ผลิต 40 คลิป/60 วัน · เดือน 3 ดู by_source ใน SalesSummary → เทงบตามช่องที่ convert จริง

## 5. เส้นแดง

- อย่าแข่งราคากับ SB — แข่ง **เร็ว (≤30 วัน) + ส่วนตัว + ไว้ใจได้** (หลักฐานทุกขั้นในระบบ)
- วันส่งมอบที่ stamp = **สัญญา** ไม่ใช่ประมาณการ — เลื่อนต้องมีเหตุ + แจ้งลูกค้า (เส้น VO/delay_category)
- ห้าม claim "ปลอดสาร 100%" — พูดได้แค่ E0/E1 มาตรฐานปล่อยสารต่ำ (สคริปต์สุขภาพ 0150)
- เปลี่ยน tier หลังเซ็นสัญญา = ระบบ block เอง → เข้าเส้น VO เท่านั้น
- **ทุกโพสต์การตลาดผ่าน claim guardrails ก่อน** (【claim guardrails การตลาด】ใน sale_scripts — ADR-056): ห้าม hard claim/ปลอดสาร 100%/asset คู่แข่ง · before-after ต้องมี consent PDPA
