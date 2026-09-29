# VS-01 — S55 Vision-to-BOQ Vertical Slice Specification v1.0

> **รหัสเอกสาร:** VS-01  
> **เวอร์ชัน:** 1.0  
> **สถานะ:** DRAFT  
> **วันที่:** 2026-09-04  
> **PRD Alignment:** FR-03 Spatial Evidence Compiler + FR-04 Capture Spine  
> **Roadmap:** RM-030 · RM-031 · RM-032 · RM-033  
> **Related Story:** S55 Phase 3 RFP & Vendor Selection Framework (อ้างอิงเท่านั้น — ไม่ใช่ scope เดียวกัน)  
> **Owner Draft:** MONOLITH Architecture Team  

---

## สารบัญ

1. ภาพรวมและวัตถุประสงค์
2. Scope และ Non-Scope (Hard Boundary)
3. PRD Alignment
4. Input Layer Specification
5. Vision Model Layer
6. System Prompt Contract
7. Evidence Draft JSON Schema
8. Specs Single Source of Truth (11 Drifts Resolved)
9. BOQ Draft JSON Schema
10. Human Review Workflow
11. Validation Rules
12. Export / API Specification
13. Acceptance Criteria
14. Dependency Map — P0 Blockers
15. Changelog

---

## 1. ภาพรวมและวัตถุประสงค์

VS-01 คือ **vertical slice แรก** ที่พิสูจน์ความสามารถ end-to-end ของ Vision-to-BOQ pipeline
ในระบบ MONOLITH Manufacturing OS โดยมีวัตถุประสงค์ดังนี้:

- **พิสูจน์ทางเทคนิค**: ว่า drawing/photo → AI Evidence Draft → BOQ Draft ทำงานได้จริงในสภาพแวดล้อม sandbox ก่อน production
- **กำหนดขอบเขตที่ชัดเจน**: Pipeline นี้ผลิต BOQ draft ที่มนุษย์ต้องตรวจสอบ ไม่ใช่ production truth
- **ยืนยัน Specs Single Source of Truth**: ก่อนที่ AI จะคำนวณใดๆ ต้องมีค่า canonical เพียงชุดเดียวที่ถูกต้องเพื่อหลีกเลี่ยง agent ตอบจากเอกสารต่างฉบับ
- **สร้าง Prompt Contract**: ทุก prompt มี version, structured output schema, confidence rules และ refusal rules ชัดเจน

VS-01 **ไม่** เป็น production release — เป็น pilot ที่ต้องผ่าน Acceptance Criteria ใน §13 ก่อนถึงจะพิจารณา FR-18 หรือ production rollout

---

## 2. Scope และ Non-Scope

### 2.1 In Scope

| หัวข้อ | รายละเอียด |
|--------|-----------|
| Drawing intake | รับ PDF, DXF, PNG/JPG — ดู §4 |
| Photo intake | รับชุดภาพถ่ายห้อง — ดู §4 |
| Quality gate | ตรวจคุณภาพ input ก่อน inference |
| Vision inference | ส่ง input ไปยัง Vision model — ดู §5 |
| Evidence draft generation | สร้าง structured_evidence_draft JSON — ดู §7 |
| BOQ draft generation | สร้าง boq_draft JSON พร้อม confidence/provenance — ดู §9 |
| Human review workflow | Designer/Factory review gate — ดู §10 |
| Output validation | ตรวจ BOQ draft ก่อน APPROVED status — ดู §11 |
| API read/write | Endpoints สำหรับ intake, query, review — ดู §12 |

### 2.2 Explicitly Out of Scope — Hard Boundary

> ⛔ **ห้ามโดยเด็ดขาด** สำหรับ VS-01 ทุกกรณี ไม่มีข้อยกเว้น

| สิ่งที่ห้าม | เหตุผล |
|-----------|--------|
| สร้าง Released Spec อัตโนมัติ | Released Spec ต้องผ่าน Safety Gate (FR-09) โดย human authority |
| สร้าง CNC packet อัตโนมัติ | CNC packet ต้องผ่าน Factory Packet (FR-11) + P0 blocker resolution |
| สร้าง production truth อัตโนมัติ | VS-01 ผลิตเฉพาะ evidence + BOQ draft — ไม่ใช่ truth |
| Override Safety Gate FR-09 | Safety Gate เป็น independent control layer |
| ERP/CRM write | Post-VS-01 phase เท่านั้น |
| สร้าง FR-18 | จนกว่า VS-01 จะผ่าน AC ทุกข้อใน §13 และมี owner + acceptance criteria แยกชัดเจน |
| ปรับแก้ spec files อัตโนมัติ | Spec changes ต้องผ่าน human review + ADR |

---

## 3. PRD Alignment

### 3.1 Functional Requirements

| FR | ชื่อ | PRD Status | VS-01 ทดสอบ |
|----|------|-----------|-------------|
| FR-03 | Spatial Evidence Compiler | PARTIAL — SpatialLM PoC not found | Evidence draft generation pipeline |
| FR-04 | Capture Spine | PARTIAL — live DB/RLS not proven | Drawing/photo intake + metadata |

### 3.2 Roadmap Epics

| Epic | ชื่อ | Phase | VS-01 Coverage |
|------|------|-------|----------------|
| RM-030 | Spatial Evidence Sandbox | Phase 3 (M4–M6) | PoC environment setup |
| RM-031 | Vision PoC | Phase 3 (M4–M6) | Model selection benchmark |
| RM-032 | Drawing intake pipeline | Phase 3 (M4–M6) | Intake + preprocessing |
| RM-033 | BOQ extraction | Phase 3 (M4–M6) | BOQ draft generation |

### 3.3 ความสัมพันธ์กับ FR อื่น

| FR | ความสัมพันธ์ | หมายเหตุ |
|----|------------|---------|
| FR-09 Safety Gate | Downstream — VS-01 ส่งออกเพียง BOQ draft | ยังไม่ connect VS-01 → FR-09 ในระยะ PoC |
| FR-11 Factory Packet | Downstream ของ FR-09 | ไม่อยู่ใน VS-01 scope |
| FR-16 MCP & AI Copilot | Partially overlapping | VS-01 prompt contract เป็น foundation สำหรับ FR-16 |

---

## 4. Input Layer Specification

### 4.1 Drawing Input

| Parameter | ข้อกำหนด |
|-----------|---------|
| Formats | PDF (vector preferred), DXF (AC1015/R2000 minimum), PNG, JPG |
| Max file size | 50 MB ต่อไฟล์ |
| DXF version | AC1015 (DXF2000) เป็น minimum — ดู Canonical Value §8 |
| Minimum resolution (raster) | 300 DPI สำหรับ PNG/JPG |
| Required metadata | project_id, drawing_type, version, created_by, created_at |
| Drawing types supported | Floor plan, elevation view, section view, detail drawing |

### 4.2 Photo Input

| Parameter | ข้อกำหนด |
|-----------|---------|
| Formats | JPG, PNG, HEIC |
| Minimum resolution | 1920 × 1080 px |
| Coverage required | ≥ 6 photos: ผนัง 4 ด้าน + เพดาน + พื้น |
| EXIF | เก็บ GPS + timestamp ไว้สำหรับ provenance |
| Max file size | 20 MB ต่อภาพ |

### 4.3 Quality Gate — Pre-processing (Auto)

| ตรวจสอบ | เกณฑ์ Reject | เกณฑ์ Flag |
|--------|------------|-----------|
| Blur detection (Laplacian variance) | < 100 → auto-reject | 100–200 → flag |
| Corner crop | ขาดมุมมากกว่า 10% → reject | — |
| Exposure | Underexposed / overexposed ≥ 40% พื้นที่ → reject | 20–40% → flag |
| Handwritten annotation | — | ตรวจพบ → flag ทุกครั้ง |
| Scale reference ambiguity | — | หน่วยไม่ชัดเจน → flag |

```json
// Quality Gate Output Schema (inline)
{
  "quality_check_id": "string",
  "file_id": "string",
  "passed": true,
  "flags": [],
  "rejection_reason": null
}
```

---

## 5. Vision Model Layer

### 5.1 Model Selection Criteria — Benchmark Required

ก่อน production deployment ต้องทำ benchmark บน **ชุดข้อมูล test จริง ≥ 20 drawings + 5 ชุดภาพถ่าย**

| Criterion | Minimum Threshold | Target |
|-----------|------------------|--------|
| Cabinet count accuracy | ≥ 90% | ≥ 95% |
| Dimension extraction error | ≤ 5 mm (mean absolute error) | ≤ 2 mm |
| Material type classification accuracy | ≥ 85% | ≥ 90% |
| Confidence calibration (ECE) | ≤ 0.10 | ≤ 0.05 |
| Processing time per drawing | ≤ 30 s | ≤ 10 s |
| Hallucination rate (dimensions not in drawing) | ≤ 5% | ≤ 1% |

> **ECE** = Expected Calibration Error — วัดว่า confidence score ของ model สอดคล้องกับ accuracy จริงหรือไม่

### 5.2 Candidate Models (ต้องทำ Benchmark ก่อนเลือก)

| Model | Provider | Role ใน PRD | หมายเหตุ |
|-------|----------|------------|---------|
| GPT-4o Vision | OpenAI | — | สมัครใช้ Tier ≥ 2 สำหรับ rate limit |
| Claude 3.5 Sonnet Vision | Anthropic | — | JSON mode stable |
| SpatialLM | Meta (open-source) | FR-03 — evidence role only, ไม่ใช่ authority | PoC ยังไม่พบใน repo |
| Gemini 2.0 Flash Vision | Google | — | Cost-effective สำหรับ high-volume |

> ⚠️ **SpatialLM Policy (FR-03):** SpatialLM เป็น evidence contributor เท่านั้น ไม่ใช่ authority ไม่สามารถ override human review หรือ canonical spec values

### 5.3 Inference Pipeline

```
Input File
    ↓
[Quality Gate — §4.3]
    ↓ PASS / REJECT
[Preprocessing]
  - DXF → rasterize (1200 DPI)
  - PDF → extract vector layer
  - Photo → normalize exposure, EXIF extract
    ↓
[Vision Model Inference]
  - Model: {selected from benchmark}
  - Prompt: FR-03-DRAW-prompt-v{ver} หรือ FR-04-PHOTO-prompt-v{ver}
    ↓
[Evidence Extractor]
  - Parse structured JSON output
  - Map ค่าเทียบกับ Canonical Values §8
    ↓
[Confidence Scorer]
  - คำนวณ confidence per field
  - Flag ตาม rules §6.6
    ↓
[Evidence Draft Output — §7]
```

### 5.4 Inference Logging (Required)

ทุก inference call ต้องบันทึก:

```json
{
  "inference_id": "uuid",
  "model_id": "gpt-4o-vision",
  "model_version": "2026-08-01",
  "prompt_id": "FR-03-DRAW",
  "prompt_version": "1.0",
  "input_file_id": "uuid",
  "tokens_input": 1200,
  "tokens_output": 450,
  "latency_ms": 3420,
  "overall_confidence": 0.87,
  "timestamp": "2026-09-04T10:30:00Z"
}
```

---

## 6. System Prompt Contract

### 6.1 Prompt Architecture

Prompt ทุกตัวมี versioning แยกต่างหาก:

- **Format ชื่อไฟล์:** `{fr_code}-{section}-prompt-v{major}.{minor}.md`
- **ตัวอย่าง:** `fr03-drawing-analysis-prompt-v1.0.md`
- **เก็บใน:** `docs/prompts/` (ต้องสร้างใหม่ — ยังไม่มีใน repo)
- **Version control:** ทุกการเปลี่ยนแปลง = increment version + changelog entry

### 6.2 Prompt ID Registry

| Prompt ID | ไฟล์ | ใช้สำหรับ |
|-----------|------|---------|
| FR-03-DRAW | `fr03-drawing-analysis-prompt-v1.0.md` | Drawing analysis → evidence draft |
| FR-04-PHOTO | `fr04-photo-analysis-prompt-v1.0.md` | Photo analysis → spatial evidence |
| FR-03-BOQ | `fr03-boq-extraction-prompt-v1.0.md` | Evidence draft → BOQ draft |
| FR-03-CONFLICT | `fr03-conflict-resolution-prompt-v1.0.md` | Resolve conflicting extracted values |

### 6.3 Drawing Analysis Prompt Template (FR-03-DRAW v1.0)

```
ROLE: Cabinet Evidence Analyst for MONOLITH Manufacturing OS
TASK: Analyze the provided cabinet drawing image and extract all spatial evidence.

CANONICAL SPEC VALUES — ใช้ค่าเหล่านี้เท่านั้น (ห้ามอ้างอิงค่าจากเอกสารอื่น):
- Minimum cabinet width: 300 mm
- Maximum cabinet depth: 600 mm
- Hinge cup depth: 12 mm
- Minifix CAM depth: 13.5 mm
- Premill: include per side
- DXF version output: AC1015/DXF2000

OUTPUT FORMAT: JSON ตาม structured_evidence_draft schema v1.0 (ดู §7)

CONFIDENCE RULES:
- แนบ confidence_score (0.0–1.0) ทุก extracted value
- confidence < 0.70 → ตั้ง flag: "NEEDS_REVIEW"
- ค่าขัดแย้งในภาพเดียวกัน → ตั้ง flag: "CONFLICT" และระบุ candidates ทั้งหมด
- ค่าที่ infer (ไม่อ่านจากภาพโดยตรง) → ตั้ง flag: "INFERRED"

PROVENANCE RULES:
- ทุก extracted value ต้องระบุ source element (เช่น "dimension line at position top-left")
- ห้ามสร้างค่าที่ไม่มีใน drawing โดยไม่ตั้ง flag INFERRED

REFUSAL CONDITIONS:
- คุณภาพภาพต่ำเกินไป → return { "error": "quality_error", "reason": "..." }
- ไม่รู้จัก drawing type → return { "error": "type_error", "reason": "..." }
- ขัดแย้งรุนแรงที่แก้ไม่ได้ → return { "error": "conflict_error", "candidates": [...] }

HARD LIMITS:
- ห้ามสร้างค่า CNC-ready (cutting list, drill coordinates)
- ห้ามระบุว่า output นี้พร้อมสำหรับ production
- ห้าม override Canonical Spec Values ด้วยค่าที่อ่านจาก drawing
```

### 6.4 Photo Analysis Prompt Template (FR-04-PHOTO v1.0)

```
ROLE: Spatial Evidence Analyst for MONOLITH Manufacturing OS
TASK: Analyze the provided room photograph set and extract spatial evidence.

INPUT: ชุดภาพถ่าย ≥ 6 ภาพ (ผนัง 4 ด้าน + เพดาน + พื้น)

CANONICAL SPEC VALUES — เหมือน FR-03-DRAW

OUTPUT FORMAT: JSON ตาม structured_evidence_draft schema v1.0
- ประเภท source: "photo_set"
- ระบุ photo_id ที่ใช้ extract แต่ละค่า

ESTIMATION RULES:
- ประมาณค่า dimension จากภาพ → flag "INFERRED" ทุกครั้ง
- ระบุ confidence ต่ำกว่า drawing analysis เสมอ (photo accuracy < drawing accuracy)
- ห้ามระบุ dimension โดยไม่มี reference object ในภาพ

REFUSAL CONDITIONS: เหมือน FR-03-DRAW
```

### 6.5 BOQ Extraction Prompt Template (FR-03-BOQ v1.0)

```
ROLE: BOQ Analyst for MONOLITH Manufacturing OS
TASK: แปลง structured_evidence_draft เป็น boq_draft

INPUT: structured_evidence_draft JSON (schema v1.0)

CANONICAL SPEC VALUES — ใช้เหมือนกัน

OUTPUT FORMAT: JSON ตาม boq_draft schema v1.0 (ดู §9)

RULES:
- สร้าง BOQ line item สำหรับทุก cabinet ใน evidence draft
- inherit confidence จาก evidence draft
- ถ้า evidence confidence < 0.70 → BOQ line item ต้อง flag "NEEDS_REVIEW"
- ถ้า evidence มี flag "CONFLICT" → ห้ามสร้าง BOQ line item จนกว่า conflict จะถูก resolve
- ห้ามใส่ค่า material cost หรือ pricing (ไม่อยู่ใน scope VS-01)
- ห้ามสร้าง cutting list หรือ drill map
```

### 6.6 Confidence Rules

| Band | Range | Label | Action |
|------|-------|-------|--------|
| 1 | 0.90–1.00 | HIGH | Pass ไปยัง BOQ generation อัตโนมัติ |
| 2 | 0.70–0.89 | MEDIUM | Flag NEEDS_REVIEW + pass ไปยัง BOQ (reviewer ต้องยืนยัน) |
| 3 | 0.50–0.69 | LOW | Block BOQ generation + require human review ก่อน |
| 4 | 0.00–0.49 | VERY_LOW | Reject + return ไปยัง user พร้อม reason |

### 6.7 Refusal Rules สรุป

| Condition | Response |
|-----------|----------|
| คุณภาพภาพต่ำ | `quality_error` + reason |
| ไม่รู้จัก drawing type | `type_error` + reason |
| Conflict รุนแรง (ไม่ resolve ได้) | `conflict_error` + candidates list |
| Request ให้สร้าง CNC/cutting list | `scope_error` — "VS-01 does not produce CNC output" |
| Request ให้ override canonical values | `spec_error` — "Canonical values are fixed; see §8" |

---

## 7. Evidence Draft JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://monolith-workspace/docs/specs/schemas/evidence-draft.schema.json",
  "title": "structured_evidence_draft",
  "description": "VS-01 Evidence Draft — output จาก Vision model inference",
  "version": "1.0",
  "type": "object",
  "required": ["evidence_id", "source", "model", "cabinets", "overall_confidence", "review_required"],
  "properties": {
    "evidence_id": {
      "type": "string",
      "format": "uuid",
      "description": "Unique identifier สำหรับ evidence draft นี้"
    },
    "project_id": { "type": "string" },
    "source": {
      "type": "object",
      "required": ["file_id", "file_type"],
      "properties": {
        "file_id": { "type": "string", "format": "uuid" },
        "file_type": { "type": "string", "enum": ["pdf", "dxf", "png", "jpg", "photo_set"] },
        "page": { "type": "integer", "description": "Page number สำหรับ PDF" },
        "photo_ids": { "type": "array", "items": { "type": "string" } }
      }
    },
    "model": {
      "type": "object",
      "required": ["model_id", "model_version", "prompt_id", "prompt_version", "inference_timestamp"],
      "properties": {
        "model_id": { "type": "string" },
        "model_version": { "type": "string" },
        "prompt_id": { "type": "string", "enum": ["FR-03-DRAW", "FR-04-PHOTO"] },
        "prompt_version": { "type": "string", "pattern": "^\\d+\\.\\d+$" },
        "inference_timestamp": { "type": "string", "format": "date-time" },
        "tokens_used": { "type": "integer" },
        "latency_ms": { "type": "integer" }
      }
    },
    "cabinets": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["cabinet_id", "type", "dimensions", "confidence", "flags"],
        "properties": {
          "cabinet_id": { "type": "string" },
          "type": { "type": "string", "enum": ["UPPER", "LOWER", "TALL", "ISLAND", "CUSTOM"] },
          "dimensions": {
            "type": "object",
            "required": ["width_mm", "height_mm", "depth_mm"],
            "properties": {
              "width_mm": { "type": "number", "minimum": 300, "maximum": 4000 },
              "height_mm": { "type": "number", "minimum": 200, "maximum": 3000 },
              "depth_mm": { "type": "number", "minimum": 100, "maximum": 600 },
              "confidence": { "type": "number", "minimum": 0.0, "maximum": 1.0 }
            }
          },
          "material": {
            "type": "object",
            "properties": {
              "type": { "type": "string" },
              "finish": { "type": "string" },
              "color": { "type": "string" },
              "confidence": { "type": "number" }
            }
          },
          "hardware": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "type": { "type": "string", "enum": ["hinge", "drawer_slide", "handle", "minifix", "other"] },
                "quantity": { "type": "integer" },
                "confidence": { "type": "number" }
              }
            }
          },
          "provenance": {
            "type": "object",
            "description": "ที่มาของ extracted value",
            "properties": {
              "source_element": { "type": "string", "description": "เช่น 'dimension line top-left'" },
              "bounding_box": { "type": "array", "items": { "type": "number" }, "minItems": 4, "maxItems": 4 }
            }
          },
          "confidence": { "type": "number", "minimum": 0.0, "maximum": 1.0 },
          "flags": {
            "type": "array",
            "items": { "type": "string", "enum": ["NEEDS_REVIEW", "CONFLICT", "INFERRED"] }
          },
          "conflict_candidates": {
            "type": "array",
            "description": "ใช้เมื่อ flag = CONFLICT",
            "items": {
              "type": "object",
              "properties": {
                "value": {},
                "source": { "type": "string" },
                "confidence": { "type": "number" }
              }
            }
          }
        }
      }
    },
    "room_dimensions": {
      "type": "object",
      "properties": {
        "width_mm": { "type": "number" },
        "length_mm": { "type": "number" },
        "height_mm": { "type": "number" },
        "confidence": { "type": "number" }
      }
    },
    "overall_confidence": {
      "type": "number",
      "minimum": 0.0,
      "maximum": 1.0,
      "description": "Weighted average confidence ของทั้ง draft"
    },
    "review_required": {
      "type": "boolean",
      "description": "true ถ้า overall_confidence < 0.80 หรือมี flag ใดๆ"
    },
    "quality_warnings": {
      "type": "array",
      "items": { "type": "string" }
    },
    "created_at": { "type": "string", "format": "date-time" }
  }
}
```

---

## 8. Specs Single Source of Truth — 11 Drifts Resolved

> ⚠️ **Critical:** AI prompts ทุกตัวใน VS-01 ต้องอ้างอิงตารางนี้เท่านั้น  
> ห้าม infer หรืออ้างอิงค่าจาก spec files แต่ละไฟล์โดยตรง เพราะมีความขัดแย้ง

| # | Parameter | **Canonical Value** | **Source Authority** | ยกเลิกค่าจาก |
|---|-----------|--------------------|--------------------|-------------|
| 1 | Premill | **Include per side** | SPEC-08 v8.2 + code | formula-reference (เก่ากว่า) |
| 2 | DXF version output | **AC1015 / DXF2000** | HOMAG compatibility requirement | R2018 spec (ยังไม่ implement), R12 code (legacy) |
| 3 | Hinge cup depth | **12 mm** | dxf-export-specs | master-db 11.5 mm, door-drawer guide 13 mm |
| 4 | Minifix CAM depth | **13.5 mm** | code — authoritative (resolved S16 Jul 2026) | manufacturing doc 12.5 mm, master-db 12.7 mm |
| 5 | Number of views | **7 views** (includes Top view) | code + api-documentation | spec.md 6 views (เก่ากว่า) |
| 6 | MIN_WIDTH cabinet | **300 mm** | api-documentation | spec.md 200 mm |
| 7 | MAX_DEPTH cabinet | **600 mm** | api-documentation | spec.md 1000 mm |
| 8 | Cabinet types | **UPPER / LOWER / TALL / ISLAND / CUSTOM** | api-documentation | spec.md subset list |
| 9 | Minifix bolt bore | **SLEEVE Ø10 × 17.5 mm** | factory truth (resolved S16 Jul 2026) | S200 direct Ø7.5 mm (legacy) |
| 10 | Spec path (export) | **manufacturing/** | actual codebase | cross-ref index → specs/export/ (ไม่มีอยู่จริง) |
| 11 | PreMill field in API | **+PreMill ใส่ใน packet** | spec.md FR4.2 + SPEC-08 v8.2 | formula-ref (no premill — เก่ากว่า) |

> **การปรับปรุง**: เมื่อมีการแก้ไข spec ให้ update ตารางนี้ก่อนเสมอ แล้วจึง bump prompt version ที่ใช้ค่านั้น

---

## 9. BOQ Draft JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://monolith-workspace/docs/specs/schemas/boq-draft.schema.json",
  "title": "boq_draft",
  "description": "VS-01 BOQ Draft — ผลิตจาก evidence draft + FR-03-BOQ prompt",
  "version": "1.0",
  "type": "object",
  "required": ["boq_id", "evidence_id", "status", "line_items", "overall_confidence", "review_required"],
  "properties": {
    "boq_id": { "type": "string", "format": "uuid" },
    "evidence_id": {
      "type": "string",
      "format": "uuid",
      "description": "FK → structured_evidence_draft.evidence_id"
    },
    "project_id": { "type": "string" },
    "status": {
      "type": "string",
      "enum": ["DRAFT", "HUMAN_REVIEW", "APPROVED", "REJECTED"],
      "description": "APPROVED ได้เฉพาะหลัง human review เท่านั้น"
    },
    "generated_at": { "type": "string", "format": "date-time" },
    "model": {
      "type": "object",
      "properties": {
        "prompt_id": { "type": "string", "enum": ["FR-03-BOQ"] },
        "prompt_version": { "type": "string" },
        "model_id": { "type": "string" }
      }
    },
    "line_items": {
      "type": "array",
      "description": "BOQ line items — ไม่มี pricing/cost ใน VS-01",
      "items": {
        "type": "object",
        "required": ["item_id", "cabinet_id", "description", "quantity", "unit", "dimensions", "confidence", "provenance", "flags"],
        "properties": {
          "item_id": { "type": "string" },
          "cabinet_id": { "type": "string", "description": "FK → evidence_draft.cabinets[].cabinet_id" },
          "description": { "type": "string" },
          "quantity": { "type": "number" },
          "unit": { "type": "string", "enum": ["pcs", "m", "m2", "set"] },
          "material_code": { "type": "string", "description": "Material catalog code — null ถ้ายังไม่ identified" },
          "dimensions": {
            "type": "object",
            "properties": {
              "width_mm": { "type": "number" },
              "height_mm": { "type": "number" },
              "depth_mm": { "type": "number" }
            }
          },
          "confidence": { "type": "number", "minimum": 0.0, "maximum": 1.0 },
          "provenance": {
            "type": "string",
            "description": "อ้างอิงกลับไปยัง drawing element ที่เป็นที่มา"
          },
          "flags": {
            "type": "array",
            "items": { "type": "string", "enum": ["NEEDS_REVIEW", "CONFLICT", "INFERRED"] }
          }
        }
      }
    },
    "overall_confidence": { "type": "number", "minimum": 0.0, "maximum": 1.0 },
    "review_required": { "type": "boolean" },
    "reviewer": {
      "type": "object",
      "description": "เติมหลัง human review",
      "properties": {
        "user_id": { "type": "string" },
        "role": { "type": "string", "enum": ["designer", "factory", "pm"] },
        "reviewed_at": { "type": "string", "format": "date-time" }
      }
    },
    "review_notes": { "type": "string" },
    "approved_at": { "type": "string", "format": "date-time", "description": "Set เมื่อ status = APPROVED" },
    "rejection_reason": { "type": "string", "description": "Set เมื่อ status = REJECTED" }
  }
}
```

---

## 10. Human Review Workflow

### 10.1 Triggers ที่ต้องมี Human Review

| Condition | ทำอะไร |
|-----------|--------|
| overall_confidence < 0.80 | Block auto-advance + ส่งไป HUMAN_REVIEW |
| Line item ใดมี flag NEEDS_REVIEW | Flag item นั้น + ต้องให้ reviewer ยืนยัน |
| Line item ใดมี flag CONFLICT | Block item นั้น + ต้อง resolve ก่อน approve |
| Line item ใดมี flag INFERRED | Flag item นั้น + ต้องให้ reviewer acknowledge |
| Dimension นอก valid range (§8) | Auto-flag + require review |

### 10.2 Review Interface Requirements

Reviewer เห็น:
- **ภาพ drawing/photo** พร้อม highlight ตำแหน่งที่ extract ค่านั้น
- **Extracted value** + confidence score + flag
- **Canonical value** (จากตาราง §8) เพื่อเปรียบเทียบ
- **Conflict candidates** (ถ้ามี)

Actions ที่ reviewer ทำได้:
| Action | ผล |
|--------|-----|
| APPROVE item | Item status = reviewed, ไม่มี annotation |
| EDIT + APPROVE item | แก้ค่า + บันทึก edit_reason + reviewer_id |
| REJECT item | Item ถูก remove + ต้องใส่ rejection_reason |
| REJECT BOQ ทั้งหมด | boq_draft.status = REJECTED + ต้องใส่ reason |

ทุก action บันทึก: `reviewer_id`, `action`, `timestamp`, `comment`

### 10.3 Escalation Path

```
Reviewer (Designer Agent context)
    ↓ ไม่สามารถ resolve conflict
Factory Agent review
    ↓ ยังไม่สามารถ resolve
PM Agent — escalate to human PM
    ↓ ยังไม่ได้
Reject BOQ + return to customer intake phase
```

### 10.4 สิ่งที่ Reviewer ทำไม่ได้

- ไม่สามารถ approve BOQ ที่มี CONFLICT flag ที่ยังไม่ resolve
- ไม่สามารถสั่งให้ระบบสร้าง CNC packet จาก BOQ draft
- ไม่สามารถ override canonical values (§8) — ถ้าต้องการเปลี่ยนค่า ต้องผ่าน ADR process

---

## 11. Validation Rules

### 11.1 Pre-BOQ Validation (Evidence Draft)

| Rule | ตรวจสอบ | Error |
|------|---------|-------|
| V-ED-01 | Dimension ทุกตัวอยู่ใน valid range (§8) | INVALID_DIMENSION |
| V-ED-02 | dimension = 0 ทุกตัวต้องมี annotation | ZERO_DIMENSION |
| V-ED-03 | cabinet_id ไม่ซ้ำกันใน draft | DUPLICATE_CABINET_ID |
| V-ED-04 | Cabinet count สมเหตุสมผลกับ room dimensions (count × avg_width ≤ room_perimeter × 0.8) | CABINET_OVERFLOW |
| V-ED-05 | model + prompt_version ระบุครบ | MISSING_PROVENANCE |
| V-ED-06 | CONFLICT flag ต้องมี conflict_candidates ≥ 2 | INVALID_CONFLICT |

### 11.2 Post-Review Validation (BOQ Draft → APPROVED)

| Rule | ตรวจสอบ | Error |
|------|---------|-------|
| V-BOQ-01 | CONFLICT flag ทุกตัวต้อง resolve แล้ว | UNRESOLVED_CONFLICT |
| V-BOQ-02 | INFERRED flag ทุกตัวต้องได้รับ reviewer acknowledgement | UNACKNOWLEDGED_INFERRED |
| V-BOQ-03 | BOQ total panel area ≤ room wall area × 1.2 (sanity check) | AREA_OVERFLOW |
| V-BOQ-04 | material_code valid ตาม material catalog (ถ้า set) | INVALID_MATERIAL_CODE |
| V-BOQ-05 | reviewer_id set และ reviewed_at อยู่หลัง generated_at | MISSING_REVIEW |
| V-BOQ-06 | pricing/cost fields อยู่นอก scope VS-01 และต้องถูกปฏิเสธ | SCOPE_VIOLATION |

### 11.3 สิ่งที่ Validation ทำไม่ได้

- ไม่สามารถรับประกัน dimensional accuracy (ขึ้นอยู่กับความถูกต้องของ source drawing)
- ไม่สามารถ validate ว่า BOQ พร้อมสำหรับ production (นั้นคือหน้าที่ Safety Gate FR-09)
- ไม่สามารถ promote BOQ draft เป็น Released Spec

---

## 12. Export / API Specification

### 12.1 Endpoints

| Method | Endpoint | ทำอะไร |
|--------|----------|--------|
| POST | `/api/v1/vs01/intake` | Upload drawing หรือ photo set — returns `evidence_id` |
| GET | `/api/v1/vs01/evidence-draft/{evidence_id}` | ดู evidence draft |
| GET | `/api/v1/vs01/boq-draft/{boq_id}` | ดู BOQ draft |
| POST | `/api/v1/vs01/boq-draft/{evidence_id}/generate` | Trigger BOQ generation จาก approved evidence |
| POST | `/api/v1/vs01/review/{boq_id}` | Submit human review decision |
| GET | `/api/v1/vs01/inference-log/{inference_id}` | ดู inference log |

### 12.2 Authentication

- ใช้ Supabase JWT + RLS (หลัง AB-AUTH-01 ได้รับการแก้ไข)
- ใน PoC phase: service role key เฉพาะ sandbox environment เท่านั้น
- ห้ามใช้ localStorage role ใน VS-01 API calls (ดู P0 blocker AB-AUTH-01)

### 12.3 สิ่งที่ VS-01 API ไม่ export

| ไม่ export | เหตุผล |
|-----------|--------|
| CNC packet | ต้องผ่าน FR-11 + Safety Gate FR-09 |
| Released Spec | ต้องผ่าน Safety Gate FR-09 |
| ERP/CRM write | Post-VS-01 phase |
| Material pricing | ไม่อยู่ใน scope |

---

## 13. Acceptance Criteria

VS-01 ถือว่า **PROVEN** เมื่อผ่านทุกข้อต่อไปนี้:

| ID | Criterion | วิธีวัด | Target |
|----|-----------|--------|--------|
| AC-VS01-01 | Vision model benchmark เสร็จสมบูรณ์ | ≥ 3 models ทดสอบบน ≥ 20 drawings จริง | DONE |
| AC-VS01-02 | Cabinet count accuracy | % correct ใน benchmark set | ≥ 90% |
| AC-VS01-03 | Dimension extraction error | Mean absolute error | ≤ 5 mm |
| AC-VS01-04 | Confidence calibration | Expected Calibration Error (ECE) | ≤ 0.10 |
| AC-VS01-05 | Human review workflow validated | จำนวน real reviews ที่เสร็จสมบูรณ์ | ≥ 5 reviews |
| AC-VS01-06 | Hard boundary enforced | จำนวน incidents ที่ VS-01 สร้าง CNC/Released Spec อัตโนมัติ | 0 incidents |
| AC-VS01-07 | Prompt contract versioned | ทุก prompt อยู่ใน version control พร้อม changelog | DONE |
| AC-VS01-08 | Specs single source of truth applied | 11 drifts resolve ใน prompt context ทุกตัว | DONE |
| AC-VS01-09 | Evidence draft schema valid | ทุก output ผ่าน JSON schema validation | 100% |
| AC-VS01-10 | BOQ draft schema valid | ทุก output ผ่าน JSON schema validation | 100% |

เมื่อผ่าน VS-01 PROVEN แล้ว ถึงจะพิจารณา:
- สร้าง **FR-18** (Vision-to-BOQ Pipeline เป็น permanent capability) พร้อม owner และ acceptance criteria แยกต่างหาก
- Integrate กับ Safety Gate FR-09
- Production rollout

---

## 14. Dependency Map — P0 Blockers

| P0 Blocker | ไฟล์ที่เกี่ยวข้อง | Impact ต่อ VS-01 |
|-----------|----------------|----------------|
| AB-AUTH-01 | `src/core/auth/roles.ts:67` | **ต้องแก้ก่อน production** — PoC ทำได้โดยใช้ service role key ใน sandbox |
| AB-EXP-01 | `src/components/layout/AppShell.tsx:174` | ไม่ block VS-01 โดยตรง (BOQ draft ≠ CNC export) |
| AB-PKT-01/02 | factory packet files | ไม่ block VS-01 (ไม่มี packet creation ใน scope) |
| AB-KEY-01 | `production.receipt.pubkeys.v1.json:1` | ไม่ block VS-01 PoC (ไม่มี production signing ใน scope) |

> **Sandbox safety**: VS-01 PoC ทำงานได้โดยไม่ต้องรอ P0 resolution แต่ **ห้าม deploy VS-01 ใน production** จนกว่า AB-AUTH-01 จะได้รับการแก้ไข

---

## 15. Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-04 | MONOLITH Architecture Team | Initial draft — VS-01 scope definition, all 15 sections |

---

*เอกสารนี้เป็น DRAFT — ต้องผ่าน architecture review และ team sign-off ก่อน status = APPROVED*

*VS-01 spec อ้างอิง: PRD v5.1 Thai (FR-03, FR-04), Roadmap v1 Thai (RM-030–RM-033), SPECS-RECONCILIATION-NOTES.md (11 drifts)*
