# FR-18 — Vision-to-BOQ Pipeline: Production Gate Specification
# รหัสเอกสาร: FR-18-GATE
# เวอร์ชัน: 1.0 (Gate Specification — ไม่ใช่ Implementation Spec)
# สถานะ: PENDING — รอ VS-01 PROVEN
# วันที่: 2026-09-04
# Owner Draft: MONOLITH Architecture Team (ต้องมี Owner แยกก่อน APPROVED)
# อ้างอิง: VS-01 §13, PRD v5.1 FR-03, FR-04, RM-030–RM-033

---

## สารบัญ

1. วัตถุประสงค์และสถานะของเอกสารนี้
2. Gate Conditions — เงื่อนไขที่ต้องผ่านก่อนสร้าง FR-18 Implementation
3. สิ่งที่ FR-18 จะครอบคลุม (ร่างเบื้องต้น — ยืนยันหลัง VS-01 PROVEN)
4. สิ่งที่ FR-18 จะไม่ครอบคลุม (Hard Boundary ถาวร)
5. ความสัมพันธ์กับ FR ที่มีอยู่
6. Owner Requirements
7. Acceptance Criteria Template สำหรับ FR-18 Implementation
8. Timeline และ Phase Dependency
9. Risk Register — ความเสี่ยงหากเปิด FR-18 ก่อนกำหนด
10. Approval Process สำหรับ Gate Passage
11. Changelog

---

## 1. วัตถุประสงค์และสถานะของเอกสารนี้

### 1.1 สถานะ: GATE SPECIFICATION

> ⛔ **เอกสารนี้ไม่ใช่ Implementation Spec**  
> FR-18 ยังไม่ได้รับการสร้างหรือ approved เป็น Implementation Spec  
> เอกสารนี้กำหนดเงื่อนไขที่ต้องผ่าน (Gate Conditions) ก่อนที่ FR-18 จะเริ่มต้นได้

### 1.2 เหตุผลที่ FR-18 ยังไม่ถูกสร้าง

ตาม VS-01 §2.2 (Hard Boundary):

> "ห้ามสร้าง FR-18 จนกว่า VS-01 จะผ่าน AC ทุกข้อใน §13 และมี owner + acceptance criteria แยกชัดเจน"

การสร้าง FR-18 ก่อน VS-01 PROVEN มีความเสี่ยง:
- อาจ commit ไปยัง permanent capability ที่ยังไม่พิสูจน์ความถูกต้อง
- อาจสร้าง production path ที่ยัง bypass safety controls ที่ยังไม่ครบ
- อาจทำให้ acceptance criteria ของ FR-18 ถูกเขียนจาก assumption แทน proven behavior

### 1.3 วิธีใช้เอกสารนี้

เอกสารนี้ใช้สำหรับ:
- ตรวจสอบว่า VS-01 ผ่าน Gate Conditions ทุกข้อแล้วหรือยัง (§2)
- วางแผน scope ของ FR-18 ล่วงหน้า (§3)
- กำหนด owner และ AC template ที่ต้องใช้ (§6–§7)
- ติดตาม risk หากเปิดก่อนกำหนด (§9)

---

## 2. Gate Conditions — เงื่อนไขที่ต้องผ่านก่อนสร้าง FR-18 Implementation

FR-18 Implementation Spec จะถูกสร้างได้ก็ต่อเมื่อผ่าน **ทั้ง 10 เงื่อนไข** ต่อไปนี้:

| Gate ID | Condition | แหล่งที่มา | สถานะ |
|---------|-----------|-----------|-------|
| AC-VS01-01 | Vision model benchmark เสร็จสมบูรณ์ (≥ 3 models, ≥ 20 drawings จริง) | VS-01 §13 | ⏳ PENDING |
| AC-VS01-02 | Cabinet count accuracy ≥ 90% ใน benchmark set | VS-01 §13 | ⏳ PENDING |
| AC-VS01-03 | Dimension extraction error ≤ 5 mm (Mean Absolute Error) | VS-01 §13 | ⏳ PENDING |
| AC-VS01-04 | Confidence calibration ECE ≤ 0.10 | VS-01 §13 | ⏳ PENDING |
| AC-VS01-05 | Human review workflow validated (≥ 5 real reviews เสร็จสมบูรณ์) | VS-01 §13 | ⏳ PENDING |
| AC-VS01-06 | Hard boundary enforced — 0 incidents ที่ VS-01 สร้าง CNC/Released Spec อัตโนมัติ | VS-01 §13 | ⏳ PENDING |
| AC-VS01-07 | Prompt contract versioned ใน version control พร้อม changelog | VS-01 §13 | ✅ DONE (n:174–177) |
| AC-VS01-08 | Specs single source of truth applied — 11 drifts resolve ใน prompt context ทุกตัว | VS-01 §13 | ✅ DONE (n:174–177) |
| AC-VS01-09 | Evidence draft schema valid — ทุก output ผ่าน JSON schema validation 100% | VS-01 §13 | ⏳ PENDING (schema created n:178) |
| AC-VS01-10 | BOQ draft schema valid — ทุก output ผ่าน JSON schema validation 100% | VS-01 §13 | ⏳ PENDING (schema created n:179) |

### 2.1 เงื่อนไขเพิ่มเติม (นอกเหนือ AC-VS01)

| Condition | คำอธิบาย | สถานะ |
|-----------|---------|-------|
| FR-18 มี Owner แยกชัดเจน | ต้องระบุชื่อ/ทีมที่รับผิดชอบ FR-18 โดยตรง | ⏳ PENDING |
| AB-AUTH-01 แก้ไขแล้วใน production | JWT + RLS ใช้ได้จริง ไม่ใช่ PoC sandbox เท่านั้น | ✅ DONE (n:180–181) |
| FR-18 มี Acceptance Criteria แยกต่างหาก | ไม่นำ AC จาก VS-01 มาใช้ตรงๆ | ⏳ PENDING |

### 2.2 Gate Passage Declaration

เมื่อผ่านทุกเงื่อนไข — ต้องทำ Gate Passage Declaration:

```
FR-18 GATE PASSAGE DECLARATION
Date: ___________
VS-01 PROVEN by: ___________ (Architecture Team sign-off)
AC-VS01-01 through AC-VS01-10: ALL PASS
FR-18 Owner: ___________ (named individual or team)
Authorized to proceed: FR-18 Implementation Spec v1.0
```

---

## 3. สิ่งที่ FR-18 จะครอบคลุม (ร่างเบื้องต้น)

> ⚠️ **ร่างเบื้องต้นเท่านั้น** — จะถูก confirm และอาจเปลี่ยนแปลงหลัง VS-01 PROVEN

FR-18 (Vision-to-BOQ Pipeline) จะเป็น permanent capability ที่ครอบคลุม:

### 3.1 Core Pipeline

| Component | คำอธิบาย |
|-----------|---------|
| Drawing Intake (FR-03-DRAW) | Pipeline รับ PDF/DXF/PNG เป็น production-grade (ไม่ใช่ sandbox) |
| Photo Intake (FR-04-PHOTO) | Pipeline รับชุดภาพเป็น production-grade |
| Evidence Draft Generation | Vision inference → structured_evidence_draft |
| Conflict Resolution | FR-03-CONFLICT เป็น production workflow |
| BOQ Draft Generation | FR-03-BOQ เป็น production workflow |
| Human Review Gate | Designer + Factory review — mandatory, ไม่ bypass ได้ |

### 3.2 Integration Points

| Integration | คำอธิบาย |
|-------------|---------|
| Safety Gate FR-09 | BOQ APPROVED → ส่งต่อ FR-09 Safety Gate ก่อน Released Spec |
| Factory Packet FR-11 | Released Spec → Factory Packet (post-FR-18) |
| Supabase JWT + RLS | Production auth — ไม่ใช่ service role key |
| Spec export path | `manufacturing/` (canonical) |

### 3.3 สิ่งที่ FR-18 จะ Add เหนือ VS-01

| ความสามารถ | VS-01 | FR-18 |
|-----------|-------|-------|
| Environment | Sandbox/PoC | Production |
| Model | Benchmark selection | Locked + versioned |
| Human review | Manual prototype | Integrated workflow |
| Auth | Service role key | JWT + RLS + site-code enforcement |
| Audit trail | Basic log | Full inference log + reviewer history |
| Error handling | Basic | Production-grade with retry + escalation |
| Integration | Standalone | Connected to FR-09 + FR-11 |

---

## 4. สิ่งที่ FR-18 จะไม่ครอบคลุม (Hard Boundary ถาวร)

> ⛔ สิ่งต่อไปนี้ **ห้ามอยู่ใน FR-18 ไม่ว่ากรณีใดก็ตาม**

| สิ่งที่ห้าม | เหตุผล |
|-----------|--------|
| สร้าง Released Spec อัตโนมัติ | ต้องผ่าน Safety Gate FR-09 โดย human authority เท่านั้น |
| สร้าง CNC packet อัตโนมัติ | ต้องผ่าน FR-11 + Safety Gate FR-09 |
| Override Safety Gate FR-09 | Safety Gate เป็น independent control layer |
| ERP/CRM write โดยตรงจาก AI output | ต้องผ่าน Released Spec ก่อน |
| Automatic approval ของ BOQ | Human review เป็น mandatory gate ที่ bypass ไม่ได้ |
| ปรับแก้ canonical spec values อัตโนมัติ | Spec changes ต้องผ่าน human review + ADR |
| Pricing หรือ cost calculation จาก AI | Pricing เป็น post-FR-18 phase |

---

## 5. ความสัมพันธ์กับ FR ที่มีอยู่

| FR | ความสัมพันธ์กับ FR-18 | ทิศทาง |
|----|---------------------|-------|
| FR-03 Spatial Evidence Compiler | FR-18 promote FR-03 เป็น production capability | Upstream |
| FR-04 Capture Spine | FR-18 promote FR-04 เป็น production capability | Upstream |
| FR-09 Safety Gate | FR-18 ส่งต่อ APPROVED BOQ ไปยัง FR-09 | Downstream |
| FR-11 Factory Packet | หลัง FR-09 pass → FR-11 สร้าง packet | Further downstream |
| VS-01 | FR-18 เป็น production version ของ VS-01 pilot | Extension |

### 5.1 Roadmap Alignment

| Epic | Phase | ความสัมพันธ์ |
|------|-------|------------|
| RM-030 Spatial Evidence Sandbox | M4–M6 | VS-01 (completed ใน PoC) |
| RM-031 Vision PoC | M4–M6 | VS-01 model benchmark |
| RM-032 Drawing intake pipeline | M4–M6 | FR-03 drawing intake |
| RM-033 BOQ extraction | M4–M6 | FR-03-BOQ |
| FR-18 Production | Post-M6 | เมื่อ VS-01 PROVEN |

---

## 6. Owner Requirements

FR-18 Implementation Spec ต้องระบุ Owner ที่มีลักษณะดังนี้:

| Requirement | คำอธิบาย |
|-------------|---------|
| Named individual หรือ team | ระบุชื่อจริง ไม่ใช่ generic "Architecture Team" |
| Authority | Owner ต้องมีอำนาจ sign-off ใน acceptance criteria |
| Availability | Owner ต้องพร้อมรับ escalation จาก UNRESOLVABLE conflicts ใน production |
| Accountability | Owner รับผิดชอบ hard boundary enforcement ใน §4 |

### 6.1 Roles ที่ต้องมีใน FR-18 Team (ขั้นต่ำ)

| Role | จำนวน | หน้าที่ |
|------|-------|-------|
| FR-18 Owner | 1 | Sign-off, escalation authority |
| AI/ML Engineer | ≥ 1 | Vision model maintenance + monitoring |
| Quality Reviewer | ≥ 1 | Human review gate operation |
| Security Reviewer | ≥ 1 | JWT + RLS + site-code audit |

---

## 7. Acceptance Criteria Template สำหรับ FR-18 Implementation

> Template นี้จะถูก instantiate เป็น AC จริงหลัง VS-01 PROVEN  
> ค่า target ด้านล่างเป็น baseline จาก VS-01 — อาจ tighten ขึ้นใน FR-18

| AC ID (ร่าง) | Criterion | Target (baseline) | วิธีวัด |
|------------|-----------|-------------------|--------|
| AC-FR18-01 | Drawing intake latency | ≤ 10 seconds P95 | Production monitoring |
| AC-FR18-02 | Cabinet count accuracy | ≥ 90% (vs VS-01 benchmark) | Regression test set |
| AC-FR18-03 | Dimension extraction error | ≤ 5 mm MAE | Regression test set |
| AC-FR18-04 | Confidence calibration ECE | ≤ 0.10 | Monthly calibration audit |
| AC-FR18-05 | Hard boundary — 0 auto-CNC incidents | 0 incidents per month | Incident log |
| AC-FR18-06 | Human review completion rate | ≥ 95% ภายใน 48 hours | Review queue monitoring |
| AC-FR18-07 | Auth — 0 unauthorized access | 0 incidents | Security audit log |
| AC-FR18-08 | JSON schema validation pass rate | 100% | Schema validator |
| AC-FR18-09 | FR-09 integration functional | BOQ APPROVED → FR-09 gate ทำงานถูกต้อง | Integration test |
| AC-FR18-10 | Audit trail complete | ทุก inference มี log ครบ | Log audit |

---

## 8. Timeline และ Phase Dependency

```
[NOW] VS-01 PoC — Sandbox
    ↓ ต้องผ่าน AC-VS01-01–10 ทั้งหมด
[Gate Passage] — VS-01 PROVEN + FR-18 Owner named
    ↓ เริ่ม FR-18 Implementation Spec
[FR-18 Draft] — Owner เขียน Implementation Spec v1.0
    ↓ Architecture Review + Team Sign-off
[FR-18 APPROVED] — Production Implementation
    ↓ AB-AUTH-01 resolved (production JWT + RLS)
[FR-18 Production] — Connected to FR-09 Safety Gate
```

### 8.1 P0 Blockers ที่ต้องแก้ก่อน FR-18 Production

| Blocker | Status | Impact |
|---------|--------|--------|
| AB-AUTH-01 | ✅ FIXED (n:180–181) | JWT + RLS สำหรับ VS-01 routes |
| AB-EXP-01 | ⏳ PENDING | BOQ export path |
| AB-PKT-01/02 | ⏳ PENDING | Factory Packet (post-FR-18) |
| AB-KEY-01 | ⏳ PENDING | Production signing |

---

## 9. Risk Register — ความเสี่ยงหากเปิด FR-18 ก่อนกำหนด

| Risk ID | ความเสี่ยง | ผลกระทบ | ลด Risk ด้วย |
|---------|-----------|---------|------------|
| FR18-RISK-01 | เปิด FR-18 ก่อน VS-01 PROVEN | AI output ที่ยังไม่ผ่าน benchmark เข้า production path | Gate Conditions §2 ต้องผ่านก่อน |
| FR18-RISK-02 | ไม่มี Owner ที่แน่นอน | ไม่มีใครรับผิดชอบ hard boundary enforcement | Owner Requirement §6 |
| FR18-RISK-03 | Human review bypass | BOQ draft เป็น production truth โดยไม่ผ่าน human | Hard Boundary §4 + FR-09 integration |
| FR18-RISK-04 | Auth ยังไม่ครบ (AB-AUTH-01 sandbox เท่านั้น) | AI_REVIEWER role ทำงานใน sandbox แต่ production JWT ยังไม่ verified | AB-AUTH-01 fix (n:180–181) แก้ไขแล้ว ต้องทดสอบ production |
| FR18-RISK-05 | Spec drift หากสร้าง FR-18 ก่อน 11 drifts ถูก propagate ครบ | AI ใช้ค่าผิดใน production | VS-01 §8 SSoT ถูก embed ใน prompts (n:174–177) |
| FR18-RISK-06 | FR-09 integration ไม่ถูก design เข้า FR-18 | APPROVED BOQ ไม่ส่งต่อ Safety Gate | §5 integration plan + FR-18 AC |

---

## 10. Approval Process สำหรับ Gate Passage

### 10.1 ขั้นตอนการ Declare VS-01 PROVEN

1. **Run VS-01 benchmark** — ทดสอบ ≥ 3 models บน ≥ 20 drawings จริง (AC-VS01-01)
2. **Measure accuracy metrics** — cabinet count ≥ 90%, dimension MAE ≤ 5mm (AC-VS01-02, 03)
3. **Calibration audit** — ECE ≤ 0.10 (AC-VS01-04)
4. **Complete ≥ 5 real human reviews** — human review workflow validated (AC-VS01-05)
5. **Verify hard boundary** — 0 CNC/Released Spec auto-generation incidents (AC-VS01-06)
6. **Confirm schema validation** — 100% pass rate (AC-VS01-09, 10)
7. **Architecture Team sign-off** — review results + sign Gate Passage Declaration

### 10.2 ขั้นตอนหลัง Gate Passage

1. **Name FR-18 Owner** — ระบุ individual หรือ team ที่รับผิดชอบ
2. **Draft FR-18 Implementation Spec v1.0** — ใช้ template §7 เป็น AC baseline
3. **Architecture Review** — review กับ team
4. **FR-18 APPROVED** → เริ่ม Implementation

### 10.3 สิ่งที่ห้ามทำก่อน Gate Passage

| ห้าม | เหตุผล |
|-----|--------|
| สร้าง FR-18 Implementation Spec | เอกสารนี้เป็น gate spec เท่านั้น |
| Code FR-18 routes ใน production | VS-01 ยังไม่ proven |
| Commit FR-18 ไปยัง roadmap phase ที่แน่นอน | ขึ้นอยู่กับ VS-01 benchmark results |
| ประกาศ FR-18 timeline ต่อ stakeholders | ก่อน Gate Passage ยังไม่มี timeline จริง |

---

## 11. Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-04 | MONOLITH Architecture Team | Initial gate specification — 10 Gate Conditions, 10+ sections, risk register |

---

*เอกสารนี้เป็น GATE SPECIFICATION — ไม่ใช่ Implementation Spec*  
*FR-18 Implementation Spec จะถูกสร้างหลัง VS-01 PROVEN + Owner named เท่านั้น*  
*อ้างอิง: VS-01 §13, VS-01 §2.2 Hard Boundary*
