---
num: 12
title: "API Reference — MCP Server & REST Endpoints"
phase: 0
phase_label: "Foundation"
phase_num: 0
mcp_tools: 1
status: complete
dependencies: "—"
---

# 12\. API Reference — MCP Server & REST Endpoints

## 12\. API Reference — MCP Server & REST Endpoints

บทนี้เป็นเอกสารอ้างอิงฉบับสมบูรณ์ของ Monolith MCP Server ครอบคลุม MCP tools ทั้ง 9 ตัว, REST endpoints สำหรับ snapshot/agent loop และ health check พร้อม request/response schemas

### 12.1. Server Configuration

Parameter | ค่าเริ่มต้น | Environment Variable | คำอธิบาย  
---|---|---|---  
Port | `3100` | `MCP_PORT` | พอร์ตที่ server listen  
Base Path | `/mcp` | `MCP_BASE_PATH` | MCP Streamable HTTP endpoint  
Auth | Open (dev) | `MCP_TOKEN` | Bearer token — ต้องตั้งใน production  
Transport | Streamable HTTP | — | ตาม MCP 2025 specification  
Body Limit | 50 MB | — | รองรับ PNG payloads สำหรับ snapshot  
  
**Endpoints หลัก:**
[code] 
    POST /mcp             — MCP Streamable HTTP (tool calls)
    GET  /mcp             — MCP SSE stream
    DELETE /mcp           — ปิด MCP session
    GET  /health          — Health check + metadata
    GET  /llms.txt        — LLM discovery document
    POST /snapshot/:jobId — Push WebGPU canvas snapshot
    GET  /snapshot        — List stored snapshots
    POST /agent/nesting-optimize — Gemini agentic optimization loop
    
[/code]

### 12.2. Authentication

ทุก endpoint (ยกเว้น `/health`) ใช้ Bearer token authentication เมื่อตั้ง `MCP_TOKEN`:
[code] 
    Authorization: Bearer <MCP_TOKEN>
    
[/code]

หากไม่ได้ตั้ง `MCP_TOKEN` จะเปิดแบบ dev mode (ไม่มี auth) — **ห้ามใช้ใน production**

**Error Responses:**

HTTP Status | เงื่อนไข  
---|---  
`401 Unauthorized` | ไม่มี Bearer token ใน header  
`403 Forbidden` | Token ไม่ตรงกับ `MCP_TOKEN`  
  
# Section 18

### 12.3. MCP Tools Reference

#### 12.3.1. `validate_panel_design`

**คำอธิบาย:** ตรวจสอบความถูกต้องของ PanelDesign ก่อนสร้าง cutting list หรือ export — ต้องเรียก tool นี้เป็นตัวแรกเสมอ

**Input Schema:**
[code] 
    {
      "design": {
        "projectName": "string (required, min 1 char)",
        "jobId": "string (optional)",
        "clientName": "string (optional)",
        "panels": [\
          {\
            "id": "string (required)",\
            "label": "string (optional)",\
            "dimension": {\
              "width": "number (positive, mm)",\
              "height": "number (positive, mm)",\
              "thickness": "number (positive, mm)"\
            },\
            "curve": {\
              "radius": "number (positive, mm)",\
              "arcAngleDeg": "number (1–360)",\
              "direction": "convex | concave"\
            },\
            "material": "string (required)",\
            "quantity": "number (integer, positive)",\
            "grain": "lengthwise | widthwise | none",\
            "tags": "string[] (max 32 tags)"\
          }\
        ],
        "hardware": [\
          {\
            "type": "hinge | drawer-slide | shelf-pin | handle | other",\
            "model": "string",\
            "quantity": "number (integer, positive)"\
          }\
        ],
        "sheetStock": [\
          {\
            "material": "string",\
            "width": "number (positive, mm)",\
            "height": "number (positive, mm)",\
            "thickness": "number (positive, mm)",\
            "quantity": "number (integer, positive)"\
          }\
        ],
        "notes": "string (max 2000 chars, optional)"
      }
    }
    
[/code]

**Budget Constraints (ตรวจสอบอัตโนมัติ):**

Constraint | ค่าสูงสุด  
---|---  
panels per job (total qty) | 2,048  
panel definitions (unique) | 512  
max panel dimension | 3,600 mm  
min panel dimension | 10 mm  
tags per panel | 32  
sheet stock variants | 16  
curved arc angle | 360°  
curved max radius | 5,000 mm  
  
**Response (valid):**
[code] 
    {
      "valid": true,
      "jobId": "job-abc123",
      "errors": [],
      "warnings": [],
      "stats": {
        "panelCount": 24,
        "uniqueMaterials": ["natural-rubber-18mm", "mdf-12mm"],
        "estimatedSheets": 3,
        "budgetViolations": []
      }
    }
    
[/code]

**Response (invalid):**
[code] 
    {
      "valid": false,
      "errors": [\
        {\
          "code": "SCHEMA_ERROR",\
          "message": "panels.0.dimension.width: Number must be greater than 0",\
          "severity": "error"\
        }\
      ],
      "warnings": [],
      "stats": null
    }
    
[/code]

# Section 19

#### 12.3.2. `generate_cutting_list`

**คำอธิบาย:** สร้าง cutting list จาก PanelDesign — ส่งออกเป็น JSON structured data พร้อม optional PDF download URL

**Input Schema:**
[code] 
    {
      "design": "PanelDesign (same as validate_panel_design)",
      "format": "json | pdf | excel",
      "includeNesting": "boolean (default: true)"
    }
    
[/code]

**Response:**
[code] 
    {
      "jobId": "job-abc123",
      "projectName": "Kitchen Cabinet Set A",
      "generatedAt": "2026-09-18T07:30:00.000Z",
      "entries": [\
        {\
          "no": 1,\
          "label": "Side Panel L",\
          "width": 600,\
          "height": 720,\
          "thickness": 18,\
          "material": "natural-rubber-18mm",\
          "quantity": 2,\
          "grain": "lengthwise",\
          "notes": ""\
        }\
      ],
      "summary": {
        "totalPieces": 24,
        "totalArea": 8.64,
        "materialBreakdown": {
          "natural-rubber-18mm": 2,
          "mdf-12mm": 1
        }
      },
      "downloadUrl": "http://localhost:3100/exports/job-abc123.pdf?token=..."
    }
    
[/code]

# Section 20

#### 12.3.3. `export_dxf`

**คำอธิบาย:** Export ไฟล์ DXF สำหรับ CNC — ส่งออกเป็น ZIP ที่มีไฟล์ DXF แยกตามแผ่น sheet

**Input Schema:**
[code] 
    {
      "jobId": "string (required — from validate or generate step)"
    }
    
[/code]

**DXF Layer Conventions:**

Layer | สี | Lineweight | จุดประสงค์  
---|---|---|---  
`PANEL_CUT` | แดง | 0.50 mm | เส้นตัดขอบนอก (outer profile)  
`PANEL_GROOVE` | น้ำเงิน | 0.25 mm | ร่อง dado/rabbet  
`PANEL_LABEL` | ขาว | 0.10 mm | ป้ายชื่อแผ่น  
`PANEL_HOLE` | เขียว | 0.18 mm | จุดเจาะ (drill points)  
  
**Response:**
[code] 
    {
      "jobId": "job-abc123",
      "files": [\
        {\
          "filename": "sheet-1_natural-rubber-18mm.dxf",\
          "material": "natural-rubber-18mm",\
          "sheetIndex": 1,\
          "entityCount": 156,\
          "fileSizeBytes": 24576\
        }\
      ],
      "totalFiles": 3,
      "downloadUrl": "http://localhost:3100/exports/job-abc123.zip?token=...",
      "expiresAt": "2026-09-19T07:30:00.000Z"
    }
    
[/code]

# Section 21

#### 12.3.4. `preview_layout`

**คำอธิบาย:** สร้าง PNG preview ของ cutting list และ nesting layout — ใช้สำหรับ visual inspection ก่อนตัดจริง

**Input Schema:**
[code] 
    {
      "design": "PanelDesign (same schema)"
    }
    
[/code]

**Response:**
[code] 
    {
      "jobId": "job-abc123",
      "images": [\
        {\
          "type": "cutting-list-page",\
          "label": "Cutting List — Page 1",\
          "base64": "<base64 PNG>",\
          "width": 1200,\
          "height": 1600\
        },\
        {\
          "type": "nesting-layout",\
          "label": "Nesting — Sheet 1 (natural-rubber-18mm)",\
          "base64": "<base64 PNG>",\
          "width": 1200,\
          "height": 800\
        }\
      ]
    }
    
[/code]

# Section 22

#### 12.3.5. `calculate_material_cost`

**คำอธิบาย:** คำนวณต้นทุนวัสดุ + hardware + ค่าแรง เป็นสกุลเงินบาท (THB)

**Input Schema:**
[code] 
    {
      "design": "PanelDesign",
      "priceList": {
        "sheetPrices": {
          "natural-rubber-18mm": 450,
          "mdf-12mm": 280
        },
        "hardwarePrices": {
          "hinge": 35,
          "drawer-slide": 120
        },
        "labourRatePerHour": 350,
        "nestingEfficiencyOverride": 0.82
      }
    }
    
[/code]

**Response:**
[code] 
    {
      "jobId": "job-abc123",
      "projectName": "Kitchen Cabinet Set A",
      "currency": "THB",
      "generatedAt": "2026-09-18T07:35:00.000Z",
      "materialLines": [\
        {\
          "material": "natural-rubber-18mm",\
          "sheetsRequired": 2,\
          "pricePerSheet": 450,\
          "subtotal": 900,\
          "wastePercent": 15.2\
        }\
      ],
      "hardwareLines": [\
        {\
          "type": "hinge",\
          "model": "Blum 110°",\
          "quantity": 8,\
          "pricePerUnit": 35,\
          "subtotal": 280\
        }\
      ],
      "labourHours": 4.5,
      "labourCost": 1575,
      "subtotalMaterial": 1180,
      "subtotalHardware": 760,
      "subtotalLabour": 1575,
      "grandTotal": 3515,
      "nestingEfficiency": 0.848,
      "warnings": []
    }
    
[/code]

# Section 23

#### 12.3.6. `optimize_nesting`

**คำอธิบาย:** รัน nesting optimization — จัดวาง panel ลงบน sheet stock ให้ประหยัดวัสดุที่สุด

**Input Schema:**
[code] 
    {
      "design": "PanelDesign",
      "options": {
        "strategy": "guillotine | maxrect | skyline (default: maxrect)",
        "maxIterations": "number (default: 1000)",
        "allowRotation": "boolean (default: true)"
      }
    }
    
[/code]

**Nesting Strategies:**

Strategy | คำอธิบาย | เหมาะกับ  
---|---|---  
`guillotine` | ตัดแบ่งทีละแนว (เหมือนเครื่องตัดกระดาษ) | CNC ที่ต้องตัดตรง  
`maxrect` | Maximal Rectangles — ค้นหาพื้นที่ว่างที่ใหญ่ที่สุด | งานทั่วไป (default)  
`skyline` | Skyline bottom-left — เรียงจากล่างขึ้นบน | Panel ขนาดใกล้เคียงกัน  
  
**Response:**
[code] 
    {
      "jobId": "job-abc123",
      "strategy": "maxrect",
      "sheets": [\
        {\
          "sheetIndex": 1,\
          "material": "natural-rubber-18mm",\
          "sheetWidth": 2440,\
          "sheetHeight": 1220,\
          "panels": [\
            {\
              "panelId": "side-L",\
              "label": "Side Panel L",\
              "x": 0,\
              "y": 0,\
              "width": 600,\
              "height": 720,\
              "rotated": false,\
              "material": "natural-rubber-18mm"\
            }\
          ],\
          "efficiency": 0.87,\
          "usedAreaMm2": 2589680,\
          "wasteAreaMm2": 387120\
        }\
      ],
      "totalSheets": 2,
      "overallEfficiency": 0.848,
      "totalUsedAreaMm2": 5179360,
      "totalWasteAreaMm2": 774240,
      "layoutSvg": "<svg>...</svg>",
      "generatedAt": "2026-09-18T07:40:00.000Z",
      "iterationsUsed": 847
    }
    
[/code]

# Section 24

#### 12.3.7. `canvas_snapshot`

**คำอธิบาย:** ดึง PNG snapshot จาก WebGPU 3D canvas ของ MonolithConfigurator — ใช้ร่วมกับ Gemini multimodal agentic loop

**Input Schema:**
[code] 
    {
      "jobId": "string (required)"
    }
    
[/code]

**Response (success):**
[code] 
    {
      "jobId": "job-abc123",
      "width": 1920,
      "height": 1080,
      "capturedAt": "2026-09-18T07:45:00.000Z",
      "mimeType": "image/png",
      "sizeBytes": 2457600,
      "base64": "<base64 PNG data>"
    }
    
[/code]

**Response (no snapshot available):**
[code] 
    {
      "jobId": "job-abc123",
      "error": "No snapshot found for jobId 'job-abc123'",
      "hint": "Ensure WebGPU canvas is mounted and MonolithConfigurator.captureSnapshot() was called"
    }
    
[/code]

**การใช้งานกับ Gemini Agentic Loop:**

  1. Browser-side `MonolithConfigurator` เรียก `captureSnapshot()` → POST `/snapshot/:jobId`
  2. Gemini agent เรียก MCP tool `canvas_snapshot({ jobId })` → รับ base64 PNG
  3. Gemini วิเคราะห์ภาพ → เรียก tools อื่น (เช่น `optimize_nesting`) → loop ซ้ำ



# Section 25

#### 12.3.8. `export_step_file`

**คำอธิบาย:** Export ไฟล์ ISO 10303 STEP AP214 สำหรับ 3D CAD (SolidWorks, Fusion 360, CATIA, Rhino, FreeCAD) — รองรับ curved panels และ 4 ระบบพิกัด

**Input Schema:**
[code] 
    {
      "design": "PanelDesign",
      "tolerance": "number (0.001–1.0 mm, default: 0.01)",
      "includeEdgeTreatments": "boolean (default: true)",
      "coordinateSystem": "monolith | rhino | solidworks | fusion360 (default: monolith)"
    }
    
[/code]

**Coordinate Systems:**

System | หน่วย | ทิศทาง Up | หมายเหตุ  
---|---|---|---  
`monolith` | mm | Z-up | ค่าเริ่มต้น — ตรงกับ DXF export  
`rhino` | mm | Z-up | Rhinoceros 3D compatible  
`solidworks` | mm | Y-up | SolidWorks convention  
`fusion360` | cm | Y-up | Fusion 360 ใช้หน่วย cm  
  
**Response:**
[code] 
    {
      "jobId": "step-abc123",
      "filename": "step-abc123_panels.step",
      "downloadUrl": "http://localhost:3100/exports/step-abc123_panels.step?token=...&expires=...",
      "sizeBytes": 156800,
      "entityCount": 2847,
      "tolerance": 0.01,
      "coordinateSystem": "monolith",
      "includeEdgeTreatments": true,
      "panelDefinitions": 6,
      "totalPanels": 24,
      "curvedPanels": 2,
      "exportedAt": "2026-09-18T07:50:00.000Z",
      "warnings": []
    }
    
[/code]

# Section 26

#### 12.3.9. `read_skill`

**คำอธิบาย:** โหลด domain context guide สำหรับ AI agent — ต้องเรียก `read_skill("panel_geometry")` เป็นอันดับแรกเสมอ

**Input Schema:**
[code] 
    {
      "name": "string — one of the available skill names"
    }
    
[/code]

**Available Skills:**

Skill Name | เนื้อหา  
---|---  
`panel_geometry` | PanelDesign data model, curved panels, dimensions, constraints  
`nesting_algorithm` | วิธีจัดวาง panel ลง sheet, material waste calculation  
`dxf_export` | โครงสร้างไฟล์ DXF, layers, CNC conventions  
`excel_export` | โครงสร้างคอลัมน์ cutting list Excel  
`pdf_export` | Layout หน้า cutting list PDF  
`step_export` | STEP AP214 entity types, coordinate systems, curved panel sweep geometry  
`agentic_loop` | Gemini multimodal agentic loop workflow  
  
**Response (success):**
[code] 
    {
      "content": [\
        {\
          "type": "text",\
          "text": "# Panel Geometry Skill\n\n## PanelDesign Data Model\n..."\
        }\
      ]
    }
    
[/code]

**Response (unknown skill):**
[code] 
    {
      "content": [\
        {\
          "type": "text",\
          "text": "Unknown skill \"xyz\". Available: panel_geometry, nesting_algorithm, dxf_export, excel_export, pdf_export, step_export, agentic_loop"\
        }\
      ],
      "isError": true
    }
    
[/code]

# Section 27

### 12.4. REST Endpoints

#### 12.4.1. `POST /snapshot/:jobId` — Push Canvas Snapshot

ใช้สำหรับ browser-side MonolithConfigurator ส่ง WebGPU canvas PNG เข้า server

**Request:**
[code] 
    POST /snapshot/job-abc123 HTTP/1.1
    Authorization: Bearer <token>
    Content-Type: application/json
    
    {
      "base64": "<base64 PNG data>",
      "width": 1920,
      "height": 1080
    }
    
[/code]

**Response (200):**
[code] 
    {
      "ok": true,
      "jobId": "job-abc123",
      "sizeBytes": 2457600
    }
    
[/code]

**Error (400):**
[code] 
    {
      "error": "Missing required fields: base64, width, height"
    }
    
[/code]

# Section 28

#### 12.4.2. `GET /snapshot` — List Stored Snapshots

แสดงรายการ snapshot ทั้งหมดที่เก็บอยู่ (ไม่รวม base64 data)

**Response (200):**
[code] 
    {
      "snapshots": [\
        {\
          "jobId": "job-abc123",\
          "width": 1920,\
          "height": 1080,\
          "capturedAt": 1726648200000,\
          "mimeType": "image/png"\
        }\
      ],
      "count": 1
    }
    
[/code]

# Section 29

#### 12.4.3. `POST /agent/nesting-optimize` — Gemini Agentic Loop

Endpoint สำหรับ AI-driven nesting optimization — Gemini จะวิเคราะห์ layout แล้ว iterate จนได้ efficiency สูงสุด

**Request:**
[code] 
    POST /agent/nesting-optimize HTTP/1.1
    Authorization: Bearer <token>
    Content-Type: application/json
    
    {
      "jobId": "string (required)",
      "design": "PanelDesign (required)",
      "initialNesting": "NestingResult (optional — auto-generated if omitted)",
      "config": {
        "apiKey": "string (optional — uses GEMINI_API_KEY env if not set)",
        "model": "string (default: gemini-2.0-flash)",
        "maxIterations": "number (default: 5)",
        "targetEfficiency": "number 0–1 (default: 0.90)",
        "temperature": "number 0–2 (default: 0.7)"
      },
      "includeFinalSvg": "boolean (default: false)"
    }
    
[/code]

**Response (200 — success):**
[code] 
    {
      "ok": true,
      "jobId": "job-abc123",
      "overallEfficiency": 0.923,
      "terminationReason": "target_reached | max_iterations | no_improvement | error",
      "durationMs": 12450,
      "iterations": 3,
      "finalNesting": { "...NestingResult..." },
      "finalSvg": "<svg>...</svg>"
    }
    
[/code]

**Error Responses:**

HTTP Status | Error Code | เงื่อนไข  
---|---|---  
`400` | — | ขาด `jobId` หรือ `design`  
`500` | `AGENT_INIT_FAILED` | ไม่มี Gemini API key  
`500` | `AGENT_LOOP_FAILED` | Loop error (เช่น API rate limit)  
`500` | `NESTING_PRERUN_FAILED` | Initial nesting generation ล้มเหลว  
`503` | `NO_OPTIMIZER` | Adapter ไม่รองรับ `optimizeNesting`  
  
# Section 30

#### 12.4.4. `GET /health` — Health Check

**Response (200):**
[code] 
    {
      "status": "ok",
      "version": "1.0.0",
      "adapter": {
        "mode": "stub | real | custom",
        "resolvedFrom": "default-stub | @monolith/pipeline | custom-adapter"
      },
      "tools": 9,
      "skills": 7,
      "toolList": [\
        "validate_panel_design",\
        "generate_cutting_list",\
        "export_dxf",\
        "preview_layout",\
        "calculate_material_cost",\
        "optimize_nesting",\
        "canvas_snapshot",\
        "export_step_file",\
        "read_skill"\
      ],
      "snapshotEndpoints": {
        "push": "POST /snapshot/:jobId",
        "list": "GET /snapshot"
      },
      "agentEndpoints": {
        "nestingOptimize": "POST /agent/nesting-optimize"
      }
    }
    
[/code]

# จากนั้นเรียก:

### 12.5. Type Definitions Reference

#### 12.5.1. Core Types
[code] 
    // Panel dimension (ทุกค่าเป็น mm)
    interface PanelDimension {
      width: number;
      height: number;
      thickness: number;
    }
    
    // Curved panel parameters
    interface CurvedPanelParams {
      radius: number;        // inner radius (mm)
      arcAngleDeg: number;   // 1–360 degrees
      direction: "convex" | "concave";
    }
    
    // Panel definition
    interface Panel {
      id: string;
      label?: string;
      dimension: PanelDimension;
      curve?: CurvedPanelParams;
      material: string;
      quantity: number;
      grain?: "lengthwise" | "widthwise" | "none";
      tags?: string[];
      materialDisplay?: MaterialDisplay;
    }
    
    // Complete design input
    interface PanelDesign {
      jobId?: string;
      projectName: string;
      clientName?: string;
      panels: Panel[];
      hardware?: HardwareItem[];
      sheetStock?: SheetStock[];
      notes?: string;
      selectedPanelIds?: string[];
    }
    
[/code]

#### 12.5.2. Material & Display Types
[code] 
    interface MaterialDisplay {
      displayName: string;
      colorHex: string;          // e.g. "#C8A882"
      colorHexDark: string;
      textureTag: string;
      roughness: number;         // PBR 0–1
      metallic: number;          // PBR 0–1
      pricePerSheet: number;     // THB
      category: 'rubber' | 'wood' | 'composite' | 'synthetic';
    }
    
[/code]

#### 12.5.3. Preview Mode Enum
[code] 
    enum PreviewMode {
      Schematic   = 'schematic',    // wireframe view
      Material    = 'material',     // PBR material rendering
      Dimension   = 'dimension',    // dimension annotations
      CostHeatmap = 'cost-heatmap', // cost visualization overlay
    }
    
[/code]

#### 12.5.4. STEP Export Types
[code] 
    type StepCoordinateSystem = "monolith" | "rhino" | "solidworks" | "fusion360";
    
    interface StepExportOptions {
      tolerance: number;                    // 0.001–1.0 mm
      includeEdgeTreatments: boolean;
      coordinateSystem: StepCoordinateSystem;
    }
    
    interface StepExportResult {
      jobId: string;
      filename: string;
      downloadUrl: string;
      sizeBytes: number;
      entityCount: number;
      tolerance: number;
      coordinateSystem: StepCoordinateSystem;
      includeEdgeTreatments: boolean;
      panelDefinitions: number;
      totalPanels: number;
      curvedPanels: number;
      exportedAt: string;
      warnings: string[];
    }
    
[/code]

### 12.6. Recommended Agent Workflow

ลำดับที่แนะนำสำหรับ AI agent ที่เรียกใช้ Monolith MCP tools:
[code] 
    ┌─────────────────────────────────────────────────┐
    │  1. read_skill("panel_geometry")                │
    │     → เข้าใจ data model และ constraints          │
    ├─────────────────────────────────────────────────┤
    │  2. validate_panel_design({ design })           │
    │     → ตรวจสอบ schema + budget ก่อนดำเนินการ      │
    ├─────────────────────────────────────────────────┤
    │  3. generate_cutting_list({ design })           │
    │     → สร้าง structured cutting list             │
    ├─────────────────────────────────────────────────┤
    │  4. optimize_nesting({ design })                │
    │     → จัดวาง panel ลง sheet ให้ประหยัดที่สุด      │
    ├─────────────────────────────────────────────────┤
    │  5. calculate_material_cost({ design, prices }) │
    │     → คำนวณต้นทุนรวม (THB)                      │
    ├─────────────────────────────────────────────────┤
    │  6. preview_layout({ design })                  │
    │     → ดู PNG preview ก่อน export                 │
    ├─────────────────────────────────────────────────┤
    │  7a. export_dxf({ jobId })                      │
    │     → CNC-ready 2D DXF files                   │
    │                                                 │
    │  7b. export_step_file({ design, options })      │
    │     → ISO 10303 3D STEP AP214 file              │
    ├─────────────────────────────────────────────────┤
    │  8. canvas_snapshot({ jobId }) [optional]        │
    │     → WebGPU 3D preview สำหรับ Gemini loop       │
    └─────────────────────────────────────────────────┘
    
[/code]

### 12.7. Error Handling Patterns

ทุก MCP tool response จะมีรูปแบบ error ที่สม่ำเสมอ:

**Schema Validation Error:**
[code] 
    {
      "valid": false,
      "errors": [\
        {\
          "code": "SCHEMA_ERROR",\
          "message": "panels.0.dimension.width: Number must be greater than 0",\
          "severity": "error"\
        }\
      ]
    }
    
[/code]

**Budget Violation Error:**
[code] 
    {
      "error": "BUDGET_EXCEEDED",
      "message": "Panel count 3000 exceeds maximum 2048",
      "violations": [\
        {\
          "limit": "maxPanelsPerJob",\
          "actual": 3000,\
          "allowed": 2048,\
          "message": "Panel count 3000 exceeds maximum 2048"\
        }\
      ],
      "hint": "แบ่ง job ออกเป็น batch เล็กลงแล้ว export ทีละ batch"
    }
    
[/code]

**Adapter Not Available:**
[code] 
    {
      "error": "NOT_AVAILABLE",
      "message": "This adapter does not support optimizeNesting",
      "hint": "Wire adapter with @monolith/pipeline for production"
    }
    
[/code]

### 12.8. WebSocket Events — Real-Time Job Status Protocol

Monolith MCP Server รองรับ WebSocket connection สำหรับรับ real-time event notifications ของ job lifecycle ทั้งหมด ช่วยให้ client UI อัปเดตสถานะแบบ push-based โดยไม่ต้อง polling

#### 12.8.1. Connection

**Endpoint:**`ws://localhost:3100/ws`

**Authentication:** ส่ง Bearer token ผ่าน `Sec-WebSocket-Protocol` header หรือ query parameter
[code] 
    ws://localhost:3100/ws?token=<MCP_AUTH_TOKEN>
    
[/code]

**Handshake Example (JavaScript):**
[code] 
    const ws = new WebSocket(
      'ws://localhost:3100/ws',
      ['bearer', MCP_AUTH_TOKEN]
    );
    
    ws.onopen = () => {
      console.log('Connected to Monolith WS');
      // Subscribe to specific job
      ws.send(JSON.stringify({
        type: 'subscribe',
        jobId: 'job-abc123'
      }));
    };
    
[/code]

#### 12.8.2. Message Format

ทุก message ที่ server ส่งออกมาเป็น JSON ตาม schema เดียวกัน:
[code] 
    interface WSMessage {
      /** Event type identifier */
      type: WSEventType;
      /** Job identifier */
      jobId: string;
      /** ISO 8601 UTC timestamp */
      timestamp: string;
      /** Event-specific payload */
      payload: Record<string, unknown>;
    }
    
    type WSEventType =
      | 'job:created'
      | 'job:validation:start'
      | 'job:validation:complete'
      | 'job:cutting-list:start'
      | 'job:cutting-list:complete'
      | 'job:nesting:start'
      | 'job:nesting:progress'
      | 'job:nesting:complete'
      | 'job:export:start'
      | 'job:export:complete'
      | 'job:cost:complete'
      | 'job:snapshot:received'
      | 'job:agent:iteration'
      | 'job:agent:complete'
      | 'job:error'
      | 'connection:ack'
      | 'subscription:confirmed';
    
[/code]

#### 12.8.3. Client Commands

Client สามารถส่ง command ไปยัง server ได้ 3 ประเภท:

Command | Description | Payload  
---|---|---  
`subscribe` | สมัครรับ event ของ job | `{ "type": "subscribe", "jobId": "job-xxx" }`  
`unsubscribe` | ยกเลิกการรับ event | `{ "type": "unsubscribe", "jobId": "job-xxx" }`  
`ping` | Keepalive heartbeat | `{ "type": "ping" }`  
  
**Server ตอบกลับ`pong` อัตโนมัติ:**
[code] 
    { "type": "pong", "timestamp": "2026-01-15T10:30:00.000Z" }
    
[/code]

#### 12.8.4. Event Catalog

##### Pipeline Events

**`job:created`** — Job ถูกสร้างขึ้นและเข้า queue
[code] 
    {
      "type": "job:created",
      "jobId": "job-abc123",
      "timestamp": "2026-01-15T10:30:00.000Z",
      "payload": {
        "projectName": "ตู้ครัว L-Shape",
        "panelCount": 24,
        "materials": ["natural-rubber-18mm", "mdf-12mm"]
      }
    }
    
[/code]

**`job:validation:start`** / **`job:validation:complete`**
[code] 
    {
      "type": "job:validation:complete",
      "jobId": "job-abc123",
      "timestamp": "2026-01-15T10:30:01.200Z",
      "payload": {
        "valid": true,
        "errorCount": 0,
        "warningCount": 2,
        "durationMs": 120
      }
    }
    
[/code]

**`job:cutting-list:complete`**
[code] 
    {
      "type": "job:cutting-list:complete",
      "jobId": "job-abc123",
      "timestamp": "2026-01-15T10:30:02.500Z",
      "payload": {
        "totalPieces": 48,
        "totalAreaM2": 12.6,
        "durationMs": 340
      }
    }
    
[/code]

##### Nesting Events

**`job:nesting:progress`** — ส่งทุก iteration (สำหรับ progress bar ใน UI)
[code] 
    {
      "type": "job:nesting:progress",
      "jobId": "job-abc123",
      "timestamp": "2026-01-15T10:30:05.000Z",
      "payload": {
        "strategy": "maxrect",
        "currentIteration": 150,
        "maxIterations": 500,
        "currentEfficiency": 0.872,
        "bestEfficiency": 0.891,
        "sheetsUsed": 6
      }
    }
    
[/code]

**`job:nesting:complete`**
[code] 
    {
      "type": "job:nesting:complete",
      "jobId": "job-abc123",
      "timestamp": "2026-01-15T10:30:08.000Z",
      "payload": {
        "strategy": "maxrect",
        "totalSheets": 5,
        "overallEfficiency": 0.912,
        "totalIterations": 500,
        "wastePercent": 8.8,
        "durationMs": 5500
      }
    }
    
[/code]

##### Export Events

**`job:export:start`** / **`job:export:complete`**
[code] 
    {
      "type": "job:export:complete",
      "jobId": "job-abc123",
      "timestamp": "2026-01-15T10:30:12.000Z",
      "payload": {
        "format": "dxf",
        "fileCount": 5,
        "totalSizeBytes": 245760,
        "downloadUrl": "/downloads/job-abc123/dxf.zip",
        "expiresAt": "2026-01-16T10:30:12.000Z"
      }
    }
    
[/code]

##### Snapshot & Agent Events

**`job:snapshot:received`** — เมื่อ browser push snapshot ผ่าน POST /snapshot/:jobId
[code] 
    {
      "type": "job:snapshot:received",
      "jobId": "job-abc123",
      "timestamp": "2026-01-15T10:30:15.000Z",
      "payload": {
        "width": 1920,
        "height": 1080,
        "sizeBytes": 2457600,
        "mimeType": "image/png"
      }
    }
    
[/code]

**`job:agent:iteration`** — แต่ละรอบของ Gemini agentic loop
[code] 
    {
      "type": "job:agent:iteration",
      "jobId": "job-abc123",
      "timestamp": "2026-01-15T10:30:20.000Z",
      "payload": {
        "iteration": 3,
        "maxIterations": 5,
        "action": "re-nest with skyline strategy",
        "previousEfficiency": 0.872,
        "currentEfficiency": 0.912,
        "improvement": "+4.0%",
        "snapshotAnalyzed": true
      }
    }
    
[/code]

**`job:agent:complete`** — Gemini loop สิ้นสุด
[code] 
    {
      "type": "job:agent:complete",
      "jobId": "job-abc123",
      "timestamp": "2026-01-15T10:30:35.000Z",
      "payload": {
        "totalIterations": 3,
        "finalStrategy": "skyline",
        "finalEfficiency": 0.912,
        "improvementFromBaseline": "+8.2%",
        "durationMs": 20000,
        "actionsPerformed": [\
          "validate_panel_design",\
          "optimize_nesting (guillotine)",\
          "canvas_snapshot",\
          "optimize_nesting (skyline)",\
          "canvas_snapshot",\
          "export_dxf"\
        ]
      }
    }
    
[/code]

##### Error Event

**`job:error`** — เกิดข้อผิดพลาดระหว่าง pipeline stage ใดก็ได้
[code] 
    {
      "type": "job:error",
      "jobId": "job-abc123",
      "timestamp": "2026-01-15T10:30:40.000Z",
      "payload": {
        "stage": "nesting",
        "code": "NESTING_TIMEOUT",
        "message": "Nesting optimization exceeded 30s timeout",
        "recoverable": true,
        "hint": "ลดจำนวน panel หรือเปลี่ยน strategy เป็น guillotine"
      }
    }
    
[/code]

#### 12.8.5. Connection Lifecycle
[code] 
    Client                          Server
      |                               |
      |--- WebSocket Upgrade -------->|
      |<-- connection:ack ------------|
      |                               |
      |--- subscribe (job-001) ------>|
      |<-- subscription:confirmed ----|
      |                               |
      |<-- job:validation:start ------|
      |<-- job:validation:complete ---|
      |<-- job:cutting-list:start ----|
      |<-- job:cutting-list:complete -|
      |<-- job:nesting:start ---------|
      |<-- job:nesting:progress ------|  (repeated)
      |<-- job:nesting:complete ------|
      |<-- job:export:complete -------|
      |                               |
      |--- ping --------------------->|
      |<-- pong ----------------------|
      |                               |
      |--- unsubscribe (job-001) ---->|
      |--- close -------------------->|
    
[/code]

#### 12.8.6. Reconnection Strategy

แนะนำให้ client implement exponential backoff:
[code] 
    class MonolithWSClient {
      private ws: WebSocket | null = null;
      private reconnectAttempt = 0;
      private maxReconnectDelay = 30_000; // 30 seconds
      private subscriptions = new Set<string>();
    
      connect(url: string, token: string): void {
        this.ws = new WebSocket(url, ['bearer', token]);
    
        this.ws.onopen = () => {
          this.reconnectAttempt = 0;
          // Re-subscribe to all active jobs
          for (const jobId of this.subscriptions) {
            this.ws?.send(JSON.stringify({
              type: 'subscribe', jobId
            }));
          }
        };
    
        this.ws.onclose = () => {
          const delay = Math.min(
            1000 * Math.pow(2, this.reconnectAttempt),
            this.maxReconnectDelay
          );
          this.reconnectAttempt++;
          setTimeout(() => this.connect(url, token), delay);
        };
    
        this.ws.onmessage = (event) => {
          const msg: WSMessage = JSON.parse(event.data);
          this.handleEvent(msg);
        };
      }
    
      subscribe(jobId: string): void {
        this.subscriptions.add(jobId);
        this.ws?.send(JSON.stringify({
          type: 'subscribe', jobId
        }));
      }
    
      private handleEvent(msg: WSMessage): void {
        switch (msg.type) {
          case 'job:nesting:progress':
            // Update progress bar
            break;
          case 'job:error':
            // Show error toast
            break;
          // ... handle other events
        }
      }
    }
    
[/code]

#### 12.8.7. Rate Limiting & Quotas

Parameter | Value  
---|---  
Max concurrent connections per client | 5  
Max subscriptions per connection | 20  
Heartbeat interval (server ping) | 30 seconds  
Idle timeout (no activity) | 5 minutes  
Max message size (client to server) | 4 KB  
`nesting:progress` throttle | 1 event / 200ms  
  
### 12.9 GraphQL API

Monolith MCP Server รองรับ **GraphQL endpoint** สำหรับ query panel/job data แบบ flexible — ช่วยให้ frontend ดึงเฉพาะ field ที่ต้องการ ลด over-fetching และรองรับ nested relationship queries ในคำขอเดียว

#### 12.9.1 Endpoint Configuration

Parameter | Value  
---|---  
**Endpoint** | `POST /graphql`  
**Playground** | `GET /graphql` (GraphiQL UI)  
**Authentication** | Bearer token via `Authorization` header  
**Schema file** | `schema.graphql` ใน SDK package  
**Transport** | HTTP POST (queries/mutations), WebSocket (subscriptions via `graphql-ws` protocol)  
  
#### 12.9.2 Schema Overview

GraphQL schema ประกอบด้วย 3 root types:

**Queries (อ่านข้อมูล)**

  * `job(id)` — ดึง job เดียวพร้อม nested panels, validation, cutting list, nesting results
  * `jobs(first, after, filter, sort)` — paginated job list พร้อม cursor-based pagination
  * `panels(first, after, filter, sort, jobId)` — ค้นหา panels ข้ามทุก jobs
  * `jobPanels(jobId, filter, sort)` — panels เฉพาะ job พร้อม filter
  * `dashboard(from, to)` — สถิติรวมสำหรับ dashboard (total jobs, panels, area, nesting stats)
  * `materialSummary(materials)` — สรุปการใช้วัสดุ
  * `nestingStats(strategy, from, to)` — ประสิทธิภาพ nesting แยกตาม strategy
  * `health` — server health check



**Mutations (เปลี่ยนแปลงข้อมูล)**

  * `createJob(input)` — สร้าง job ใหม่พร้อม panel design
  * `updateJob(id, input)` — แก้ไข metadata (ชื่อโปรเจกต์, ชื่อลูกค้า, หมายเหตุ)
  * `addPanels(input)` / `removePanels(input)` — เพิ่ม/ลบ panels
  * `deleteJob(id)` — ลบ job
  * `validateJob(jobId)` — ตรวจสอบ panel design
  * `generateCuttingList(jobId)` — สร้าง cutting list
  * `optimizeNesting(jobId, options)` — รัน nesting optimization
  * `startAgentNesting(jobId, options, maxAgentIterations)` — เริ่ม Gemini agentic loop
  * `exportJob(jobId, format, sheets)` — export เป็น DXF/STEP
  * `pushSnapshot(jobId, base64, width, height)` — push canvas snapshot



**Subscriptions (real-time via WebSocket)**

  * `jobEvents(jobId)` — รับ events ทั้งหมดของ job
  * `nestingProgress(jobId)` — ติดตามความคืบหน้า nesting
  * `agentUpdates(jobId)` — ติดตาม agent iterations



#### 12.9.3 ตัวอย่างการใช้งาน

**Query: ดึง Job พร้อม Panels และ Nesting Results**
[code] 
    query GetJobDetail($jobId: ID!) {
      job(id: $jobId) {
        id
        projectName
        status
        totalPanelCount
        totalAreaM2
        materials
    
        panels {
          id
          label
          dimension { width height thickness }
          curve { radius arcAngleDeg direction }
          material
          quantity
          areaM2
        }
    
        validation {
          valid
          errorCount
          warningCount
          errors { panelId code message }
        }
    
        nestingResults {
          strategy
          totalSheets
          overallEfficiency
          wastePercent
          sheets {
            sheetIndex
            efficiency
            placements { panelId x y rotated width height }
          }
        }
      }
    }
    
[/code]

**Variables:**
[code] 
    {
      "jobId": "job-abc123"
    }
    
[/code]

**Query: ค้นหา Jobs ด้วย Filter และ Pagination**
[code] 
    query SearchJobs($filter: JobFilter, $sort: JobSort) {
      jobs(first: 20, filter: $filter, sort: $sort) {
        edges {
          cursor
          node {
            id
            projectName
            clientName
            status
            totalPanelCount
            materials
            createdAt
          }
        }
        pageInfo {
          hasNextPage
          endCursor
          totalCount
        }
      }
    }
    
[/code]

**Variables:**
[code] 
    {
      "filter": {
        "status": ["NESTING", "COMPLETED"],
        "materials": ["MDF-18"],
        "createdAfter": "2026-01-01T00:00:00Z",
        "search": "kitchen"
      },
      "sort": {
        "field": "CREATED_AT",
        "order": "DESC"
      }
    }
    
[/code]

**Query: ค้นหา Panels ข้าม Jobs**
[code] 
    query FindCurvedPanels {
      panels(
        first: 50,
        filter: { hasCurve: true, material: ["MDF-18", "PB-25"] }
        sort: { field: WIDTH, order: DESC }
      ) {
        edges {
          node {
            id
            material
            dimension { width height thickness }
            curve { radius arcAngleDeg direction }
            quantity
            totalAreaM2
          }
        }
        pageInfo { totalCount hasNextPage }
      }
    }
    
[/code]

**Query: Dashboard Statistics**
[code] 
    query DashboardOverview {
      dashboard(from: "2026-01-01T00:00:00Z") {
        totalJobs
        activeJobs
        completedJobs
        totalPanels
        totalAreaM2
        materialBreakdown {
          material
          panelCount
          totalAreaM2
        }
        nestingStats {
          avgEfficiency
          bestEfficiency
          totalSheetsUsed
          totalWasteM2
        }
      }
    }
    
[/code]

**Mutation: สร้าง Job และรัน Nesting ทันที**
[code] 
    mutation CreateAndOptimize($input: CreateJobInput!, $nestOpts: NestingOptionsInput) {
      createJob(input: $input) {
        id
        status
      }
    }
    
    mutation RunNesting($jobId: ID!) {
      optimizeNesting(jobId: $jobId, options: { strategy: MAXRECT, maxIterations: 10, allowRotation: true }) {
        totalSheets
        overallEfficiency
        wastePercent
        strategy
        sheets {
          sheetIndex
          efficiency
          placements { panelId x y rotated }
        }
      }
    }
    
[/code]

**Subscription: ติดตาม Nesting Progress**
[code] 
    subscription WatchNesting($jobId: ID!) {
      nestingProgress(jobId: $jobId) {
        strategy
        currentIteration
        maxIterations
        currentEfficiency
        bestEfficiency
        sheetsUsed
      }
    }
    
[/code]

#### 12.9.4 Filtering และ Sorting

**JobFilter fields:**

Field | Type | Description  
---|---|---  
`status` | `[JobStatus!]` | กรองตาม status (เช่น `[NESTING, COMPLETED]`)  
`projectName` | `String` | ค้นหาชื่อโปรเจกต์ (partial match)  
`clientName` | `String` | ค้นหาชื่อลูกค้า  
`materials` | `[String!]` | กรอง jobs ที่ใช้วัสดุที่ระบุ  
`createdAfter` | `DateTime` | สร้างหลังวันที่กำหนด  
`createdBefore` | `DateTime` | สร้างก่อนวันที่กำหนด  
`minPanelCount` | `Int` | จำนวน panels ขั้นต่ำ  
`maxPanelCount` | `Int` | จำนวน panels สูงสุด  
`search` | `String` | Full-text search ในชื่อโปรเจกต์, ลูกค้า, หมายเหตุ  
  
**PanelFilter fields:**

Field | Type | Description  
---|---|---  
`material` | `[String!]` | กรองตามวัสดุ  
`minWidth` / `maxWidth` | `Float` | ช่วงความกว้าง (mm)  
`minHeight` / `maxHeight` | `Float` | ช่วงความสูง (mm)  
`hasCurve` | `Boolean` | เฉพาะ panels โค้ง  
`grain` | `[GrainDirection!]` | ทิศทาง grain  
`tags` | `[String!]` | กรองตาม tags  
  
#### 12.9.5 Pagination

ใช้ **Relay-style cursor-based pagination** สำหรับ performance ที่ดีกับ dataset ขนาดใหญ่:
[code] 
    # Page 1
    query { jobs(first: 20) { edges { cursor node { id } } pageInfo { endCursor hasNextPage } } }
    
    # Page 2
    query { jobs(first: 20, after: "cursor-from-page-1") { edges { cursor node { id } } pageInfo { endCursor hasNextPage } } }
    
[/code]

**PageInfo fields:**

Field | Type | Description  
---|---|---  
`hasNextPage` | `Boolean` | มีหน้าถัดไปหรือไม่  
`hasPreviousPage` | `Boolean` | มีหน้าก่อนหน้าหรือไม่  
`startCursor` | `String` | cursor ของ item แรก  
`endCursor` | `String` | cursor ของ item สุดท้าย  
`totalCount` | `Int` | จำนวน items ทั้งหมด  
  
#### 12.9.6 Error Handling

GraphQL errors ใช้ standard `errors` array ใน response:
[code] 
    {
      "data": null,
      "errors": [\
        {\
          "message": "Job not found",\
          "locations": [{ "line": 2, "column": 3 }],\
          "path": ["job"],\
          "extensions": {\
            "code": "JOB_NOT_FOUND",\
            "jobId": "job-nonexistent"\
          }\
        }\
      ]
    }
    
[/code]

**Error codes:**

Code | Description  
---|---  
`JOB_NOT_FOUND` | ไม่พบ job ที่ระบุ  
`PANEL_NOT_FOUND` | ไม่พบ panel ที่ระบุ  
`VALIDATION_FAILED` | Panel design ไม่ผ่านการตรวจสอบ  
`NESTING_FAILED` | Nesting optimization ล้มเหลว  
`EXPORT_FAILED` | การ export ล้มเหลว  
`AGENT_TIMEOUT` | Gemini agent loop หมดเวลา  
`AUTH_REQUIRED` | ต้องการ authentication  
`RATE_LIMITED` | เกินอัตราการเรียก API  
  
#### 12.9.7 Rate Limiting

Tier | Limit | Window  
---|---|---  
Queries | 100 requests | 1 นาที  
Mutations | 30 requests | 1 นาที  
Subscriptions | 10 connections | concurrent  
Query complexity | max 500 | ต่อ request  
  
**Complexity calculation:** แต่ละ field = 1 point, list field = 1 + (first × child complexity), nested object = parent complexity × child complexity

#### 12.9.8 เปรียบเทียบ REST vs GraphQL

คุณสมบัติ | REST | GraphQL  
---|---|---  
**Data fetching** | Fixed response shape | เลือก fields ที่ต้องการ  
**Multiple resources** | หลาย requests | Single request  
**Over-fetching** | มี (ได้ข้อมูลเกิน) | ไม่มี  
**Real-time** | WebSocket (raw events) | Subscriptions (typed)  
**Caching** | HTTP caching (ETag, Cache-Control) | Client-side normalized cache  
**File upload** | Multipart form | ใช้ REST endpoint ร่วม  
**Best for** | Simple CRUD, webhooks | Complex queries, dashboards  
  
**แนะนำ:** ใช้ GraphQL สำหรับ frontend dashboards และ complex panel queries / ใช้ REST สำหรับ snapshot upload, MCP tool calls, และ simple health checks

# Monolith Manufacturing OS — บทที่ 13–25: Business Operations Modules

## สารบัญ (Table of Contents)

  * [บทสรุปผู้บริหาร (Executive Summary)](#บทสรุปผู้บริหาร-executive-summary)
  * [บทที่ 13: ระบบจัดการช่างติดตั้ง (Installation Module)](#บทที่-13-ระบบจัดการช่างติดตั้ง-installation-module)
  * [บทที่ 14: การสื่อสารระหว่างแผนก (Inter-Department Communication)](#บทที่-14-การสื่อสารระหว่างแผนก-inter-department-communication)
  * [บทที่ 15: ระบบควบคุมคุณภาพ (Quality Control)](#บทที่-15-ระบบควบคุมคุณภาพ-quality-control)
  * [บทที่ 16: ระบบจัดการคลังวัสดุ (Inventory Management)](#บทที่-16-ระบบจัดการคลังวัสดุ-inventory-management)
  * [บทที่ 17: ระบบโลจิสติกส์และจัดส่ง (Logistics & Delivery)](#บทที่-17-ระบบโลจิสติกส์และจัดส่ง-logistics--delivery)
  * [บทที่ 18: ระบบจัดการลูกค้า (CRM)](#บทที่-18-ระบบจัดการลูกค้า-crm)
  * [บทที่ 19: ระบบวางแผนการผลิต (Production Planning)](#บทที่-19-ระบบวางแผนการผลิต-production-planning)
  * [บทที่ 20: ระบบจัดการทีมและบุคลากร (HR & Team Management)](#บทที่-20-ระบบจัดการทีมและบุคลากร-hr--team-management)
  * [บทที่ 21: ระบบ Business Intelligence และ Dashboard](#บทที่-21-ระบบ-business-intelligence-และ-dashboard)
  * [บทที่ 22: ระบบ After-Sales และการรับประกัน (After-Sales & Warranty)](#บทที่-22-ระบบ-after-sales-และการรับประกัน-after-sales--warranty)
  * [บทที่ 23: ระบบจัดซื้อจัดจ้าง (Procurement)](#บทที่-23-ระบบจัดซื้อจัดจ้าง-procurement)
  * [บทที่ 24: ระบบความปลอดภัยและมาตรฐาน (Safety & Compliance)](#บทที่-24-ระบบความปลอดภัยและมาตรฐาน-safety--compliance)
  * [บทที่ 25: ระบบฝึกอบรม (Training & Onboarding)](#บทที่-25-ระบบฝึกอบรม-training--onboarding)



# บทสรุปผู้บริหาร (Executive Summary)

## บทสรุปผู้บริหาร (Executive Summary)

เอกสารฉบับนี้เป็นส่วนขยายของ Monolith Manufacturing OS ครอบคลุม 13 modules ใหม่ (บทที่ 13–25) ที่ออกแบบมาเพื่อเติมเต็ม business operations ทั้งหมดที่ยังขาดหายไปจากเอกสารต้นฉบับ การออกแบบทั้งหมดตั้งอยู่บนฐานของการทบทวนวรรณกรรมอย่างเป็นระบบ (Systematic Literature Review — SLR) ที่ปฏิบัติตามมาตรฐาน PRISMA โดยสังเคราะห์งานวิจัย 6 ชิ้นจาก 4 ฐานข้อมูล ครอบคลุมงานวิจัยด้าน intelligent scheduling สำหรับเฟอร์นิเจอร์แผ่นแบบ custom, digital fabrication infrastructure, โมเดลการจัดการดิจิทัลสำหรับโรงงานไม้, cloud platform แบบ multi-center, แพลตฟอร์ม intelligent manufacturing ที่ผสาน ERP/MES และ critical success factors ของ ERP ในอุตสาหกรรมไม้ [7]

ผลการวิเคราะห์จาก SLR ชี้ให้เห็นว่างานวิจัยปัจจุบันมุ่งเน้นไปที่ production planning และ shop-floor execution เป็นหลัก แต่ยังขาดการศึกษาใน modules ปลายน้ำอย่าง installation management, after-sales service, HR, training และ safety compliance อย่างมีนัยสำคัญ [7] เอกสารฉบับนี้จึงออกแบบ modules เหล่านั้นโดยใช้หลักการจากงานวิจัยที่มีอยู่ — ได้แก่ การผสาน ERP/MES/APS/WMS [1], การใช้ IoT และ AI สำหรับ quality control [3], cloud-based architecture สำหรับ distributed manufacturing [4] และ critical success factors ด้าน mobile access, training และ data security [6] — แล้วขยายออกไปเพื่อครอบคลุมกระบวนการทั้งสาย end-to-end ของอุตสาหกรรมเฟอร์นิเจอร์โมดูลาร์

แต่ละบทประกอบด้วยภาพรวมและวัตถุประสงค์, สถาปัตยกรรมเชิงเทคนิค (database schema, API endpoints, UI screens), workflow diagrams, TypeScript interface definitions, แผนการ integrate กับ modules อื่น, role-based access control, mobile/responsive design considerations, KPIs และ metrics พร้อมอ้างอิงงานวิจัยจาก SLR ตลอดทั้งเอกสาร
