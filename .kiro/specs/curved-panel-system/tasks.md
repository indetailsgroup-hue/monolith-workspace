# Implementation Plan — Curved Panel System

> ลำดับตาม dependency: model → generator → gate → visualization → export → e2e
> ทุก phase จบด้วยเทสต์เขียวก่อนไปต่อ (Golden Rule 5: ถ้าพังในโรงงานได้ ต้อง fail ใน CI)

## Phase 1: Profile Model (Req 1, 7)

- [ ] 1. เพิ่ม `PanelProfile` + `SkinConfig` types ใน `Cabinet.ts` (optional fields — backward compatible)
- [ ] 2. สร้าง `src/core/manufacturing/curve/curveProfile.ts` — validation (R ≤ min(w,h)/2, tangency, bounds) + arc segments + Kerf_Zone
- [ ] 2.1* unit tests: validation ทุก kind + reject geometry ขัดแย้ง
- [ ] 2.2* PBT: round-trip serialization (Property 6), tangency (Property 5)
- [ ] 3. `useCabinetStore.updatePanelProfile` + regenerate hook (immer, pattern เดียวกับ updateGrainDirection)
- [ ] 3.1* PBT: backward compat — panel ไม่มี profile ≡ RECT byte-identical (Property 7)

## Phase 2: Kerf Pattern Generator (Req 2)

- [ ] 4. `kerfPatternGenerator.ts` — เรียก `calculateKerfBending` เดิม → KerfPattern deterministic รองรับ Kerf_Tool_Profile (ROUTER/SAW — มติ #1)
- [ ] 4.1* unit: ทุกวัสดุใน catalog; fail-safe block เมื่อไม่มี min bend radius
- [ ] 4.2* PBT: determinism (Property 1), radius monotonicity (Property 3), depth safety (Property 4), tool invariance (Property 9)
- [ ] 4.3 เติมตาราง Min_Bend_Radius ครบทุกวัสดุ×ความหนาใน catalog (MDF/PB/plywood — มติ #2) พร้อม source อ้างอิงต่อค่า

## Phase 2.5: Mating Slot Generator (Req 8 — มติ #4)

- [ ] 4.5 `matingSlotGenerator.ts` — ซี่ฝั่งโค้ง + ร่องฝั่งรับ, pairKey content-addressed (pattern เดียวกับ pairKeyV2)
- [ ] 4.6* PBT: slot pairing ≤ 0.1mm (Property 8); ไม่ทับ Kerf_Zone/รูเจาะ
- [ ] 4.7* multi-pair: ชิ้นโค้ง 1 ชิ้นประกบ 2 แผ่น (บน+ล่าง ตามรูปอ้างอิง)

## Phase 3: Gate G12 (Req 3)

- [ ] 5. `gateG12_curveManufacturability.ts` + types — error codes G12_* ทั้ง 10 ตาม design (รวม slot 3 ตัว)
- [ ] 5.1* unit + multi-pair: ทุก severity, waive semantics ตรง gate เดิม
- [ ] 6. อัปเดต `docs/SAFETY_GATE.md` (Golden Rule 6) + ผูก G12 เข้า gate runner/SafetyPanel

## Phase 4: DrillMap Exclusion (Req 4)

- [ ] 7. filter จุดเจาะใน Kerf_Zone + margin ใน `generateDrillMap.ts` (ทุก connector type)
- [ ] 7.1* PBT: exclusion invariant (Property 2); System 32 ยัง deterministic
- [ ] 7.2* multi-pair: connector ขาดคู่จากการกรอง → G11 ตรวจพบ

## Phase 5: 3D Visualization (Req 5)

- [ ] 8. Cabinet3D: extrude arc profile (tessellation คงที่ + useMemo) — geometry จาก curveProfile เดียวกับ manufacturing
- [ ] 9. `KerfPatternOverlay.tsx` ใน X-Ray + toggle ใน SceneToolbar
- [ ] 10. PanelOverrideModal: section "Curve / Kerf" (GrooveNumberInput pattern, Enter ไม่ปิด modal)

## Phase 6: Export Pipeline (Req 6)

- [ ] 11. OperationGraph: KerfPattern → SLOT ops; ขอบโค้ง → arc path segments (IR ARC_CW/CCW เดิม)
- [ ] 12. DXF: POLYLINE bulge / ARC สำหรับขอบโค้ง + kerf slots — ผ่าน G10.1/10.2/10.3
- [ ] 13. Cut List: Developed_Length + kerfCount; BOM: skin โหมด SKIN_PANEL เป็นชิ้นแยก / โหมด SURFACE_FINISH ลง material stack (มติ #3); slot ops ทั้งฝั่งโค้งและแผ่นรับลง DXF ครบ
- [ ] 14. Nesting: bounding box + ระบุ approximate ใน manifest
- [ ] 14.1* golden fixtures 3 ชุด (rounded R / ARC 90° / S_CURVE): DrillMap + Packet + DXF hash
- [ ] 14.2* PBT: export determinism ครบวงจร

## Phase 7: E2E + ปิดงาน

- [ ] 15. e2e @smoke: สร้างตู้มุมโค้ง → X-Ray เห็น kerf → export DXF สำเร็จไม่มี console error
- [ ] 16. รัน `npm run verify` เต็ม + bypass-scan + อัปเดต PRD §6.1.7 สถานะจาก 🔵 → ✅

## Deferred (P2 — บันทึกไว้ ไม่ทำใน v1)

- True-shape nesting ของชิ้นโค้ง
- Compound curve 3 มิติ / lamination bending (เทคนิคอัดโค้งด้วยแผ่นบางหลายชั้น)
- Auto-suggest รัศมีจาก catalog ชิ้นงานสำเร็จรูป
