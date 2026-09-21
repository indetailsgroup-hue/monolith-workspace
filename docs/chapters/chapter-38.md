---
num: 38
title: "Persona Journey Mapping"
phase: 7
phase_label: "Phase 7"
phase_num: 7
mcp_tools: 3
status: complete
dependencies: "Phase 5, Phase 6"
---

# 38\. Persona User Journey Mapping

## 38\. Persona User Journey Mapping

บทนี้นำเสนอ User Journey Map ของทั้ง 5 Personas ครอบคลุมตั้งแต่จุดเริ่มต้นใช้งานจนถึงการใช้งานต่อเนื่อง พร้อมระบุ MCP tools ที่เกี่ยวข้องในแต่ละ touchpoint

### 38.1 Journey Map Overview
[code] 
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                    Monolith User Journey Framework                      │
    │                                                                         │
    │   Stage 1        Stage 2         Stage 3          Stage 4    Stage 5   │
    │  ┌──────────┐  ┌───────────┐  ┌────────────┐  ┌─────────┐ ┌────────┐  │
    │  │Discovery │→│Onboarding │→│Daily Usage  │→│Advanced │→│Optimize│  │
    │  │& Signup  │  │& Setup    │  │& Core Tasks│  │Features │ │& Scale │  │
    │  └──────────┘  └───────────┘  └────────────┘  └─────────┘ └────────┘  │
    │                                                                         │
    │  ● Awareness   ● First Login   ● Primary       ● Cross-   ● AI-      │
    │  ● Evaluation  ● Configuration   Workflow        Module    Assisted   │
    │  ● Decision    ● Tutorial      ● Collaboration  Integration  Insights │
    └─────────────────────────────────────────────────────────────────────────┘
    
[/code]

### 38.2 Persona 1: สมชาย ดีไซน์เนอร์ (Furniture Designer, 32)

**Role:** นักออกแบบเฟอร์นิเจอร์ — ผู้เริ่มต้นทุก workflow ด้วยการสร้างแบบ 3D

#### Journey Map

Stage | Touchpoint | Action | MCP Tools | Emotion  
---|---|---|---|---  
1\. Discovery | Website/Demo | ดูตัวอย่าง 3D configurator ที่ออกแบบตู้ได้ real-time | — | Curious  
2\. Onboarding | First Project | สร้างโปรเจกต์แรก กำหนดขนาดตู้ วัสดุ | `validate_panel_design` | Excited  
3\. Design | 3D Workspace | ออกแบบ panel layout, ปรับ dimensions, เลือก material | `preview_layout`, `canvas_snapshot` | Focused  
4\. Validate | AI Check | ระบบตรวจสอบความเป็นไปได้ในการผลิต | `validate_panel_design` | Confident  
5\. Cost | Estimation | AI ประมาณการต้นทุนวัสดุ+แรงงาน | `ai_cost_estimation`, `calculate_material_cost` | Informed  
6\. Export | File Generation | ส่งออก DXF สำหรับ CNC, STEP สำหรับ CAD | `export_dxf`, `export_step_file` | Satisfied  
7\. Handoff | To Production | ส่งแบบให้ผู้จัดการโรงงาน review | `generate_cutting_list` | Accomplished  
8\. Feedback | From Field | รับ feedback จากช่างติดตั้งเพื่อปรับแบบ | `manage_customer_feedback` | Learning  
  
**Pain Points & Proposed Solutions (สถานการณ์สมมติ):**

Pain Point (สมมติ) | Scenario baseline (สมมติ) | Proposed Monolith behavior
---|---|---  
ไม่แน่ใจว่าผลิตได้หรือไม่ | ส่งแบบไป ถูกตีกลับ 2-3 รอบ | `validate_panel_design` ตรวจทันที  
คำนวณต้นทุนยาก | Excel + ประมาณการเอง | `ai_cost_estimation` คำนวณ real-time  
ไฟล์ไม่ compatible | Export แล้วต้องแปลงอีกหลายรอบ | `export_dxf` + `export_step_file` ส่งตรง CNC  
ปัญหาหน้างานสื่อสารกลับถึง designer ล่าช้า | การส่ง feedback ยังเป็นงานเฉพาะกิจ | `manage_customer_feedback` ส่งกลับทันที

**Target Metrics (เป้าหมายที่ยังต้องวัดยืนยัน):**

  * Design-to-Production time: ลดจาก 3 วัน → 4 ชั่วโมง
  * Design revision rounds: ลดจาก 3.5 → 0.8 ครั้ง
  * Cost estimation accuracy: จาก ±25% → ±5%



### 38.3 Persona 2: สมหญิง ผู้จัดการ (Production Manager, 45)

**Role:** ผู้จัดการโรงงาน — ดูแลสายการผลิตทั้งหมด จากแบบสู่สินค้าจริง

Stage | Touchpoint | Action | MCP Tools | Emotion  
---|---|---|---|---  
1\. Morning | Dashboard | เช็ค production dashboard ดูงานวันนี้ | `get_production_dashboard`, `get_live_metrics` | Alert  
2\. Planning | Schedule | วางแผนการผลิตตาม priority + deadline | `create_production_plan`, `optimize_schedule` | Strategic  
3\. Material | Inventory | ตรวจสอบ stock วัสดุ สั่งเพิ่มหากไม่พอ | `get_inventory_report`, `create_purchase_order` | Proactive  
4\. Optimize | Nesting | รัน nesting optimization ลดของเสีย | `optimize_nesting`, `generate_cutting_list` | Efficient  
5\. Monitor | Real-time | ติดตาม CNC machines และ production line | `configure_monitor`, `manage_alert_rule` | In Control  
6\. Quality | QC Check | ตรวจสอบคุณภาพชิ้นงาน | `run_quality_check`, `generate_qc_report` | Thorough  
7\. Report | End-of-Day | สรุปผลผลิตประจำวัน ส่งรายงาน | `generate_report`, `get_dashboard_data` | Accomplished  
8\. Supply | Procurement | ติดตามสถานะ PO และ shipments | `track_shipment`, `manage_supplier` | Connected  
  
**Pain Points & Proposed Solutions (สถานการณ์สมมติ):**

Pain Point (สมมติ) | Scenario baseline (สมมติ) | Proposed Monolith behavior
---|---|---  
ของเสียจากการตัดสูง | Nesting ด้วย Excel/manual | `optimize_nesting` ลดเหลือ < 15%  
ไม่รู้สถานะ real-time | เดินดูหน้างาน | `get_live_metrics` + `configure_monitor`  
วางแผนยาก | Excel + whiteboard | `create_production_plan` + AI scheduling  
วัสดุคงเหลือต่ำกว่าความต้องการบ่อย | นับ stock ด้วยมือ | `get_inventory_report` + auto-reorder

**Target Metrics (เป้าหมายที่ยังต้องวัดยืนยัน):**

  * Material waste: ลดจาก 28% → 12%
  * Production planning time: ลดจาก 2 ชั่วโมง → 15 นาที
  * Machine downtime visibility: จาก 0% → 100% real-time



### 38.4 Persona 3: สมศักดิ์ ผู้ประกอบการ (Owner/CEO, 50)

**Role:** เจ้าของธุรกิจ — มองภาพรวม ตัดสินใจเชิงกลยุทธ์

Stage | Touchpoint | Action | MCP Tools | Emotion  
---|---|---|---|---  
1\. Overview | Executive Dashboard | ดูภาพรวมธุรกิจ: revenue, costs, orders | `create_dashboard`, `get_dashboard_data` | Informed  
2\. Finance | Cost Analysis | วิเคราะห์ต้นทุนและกำไร | `generate_report`, `ai_cost_estimation` | Analytical  
3\. Quotation | Client Quotes | AI สร้าง quotation อัตโนมัติ | `generate_quotation_draft` | Efficient  
4\. Supplier | Vendor Mgmt | ประเมิน supplier performance | `vendor_performance_report`, `manage_supplier` | Strategic  
5\. Growth | Analytics | วิเคราะห์ trend + growth opportunities | `get_analytics_report`, `get_dashboard_data` | Visionary  
6\. Compliance | Governance | ตรวจสอบ PDPA compliance + audit logs | `manage_data_lifecycle`, `manage_consent` | Responsible  
7\. HR | Organization | ดูแลทีมงาน + culture scores | `manage_organization`, `get_culture_metrics` | Caring  
8\. Decision | Strategic | ตัดสินใจลงทุน/ขยาย based on data | `generate_report` | Decisive  
  
**Pain Points & Proposed Solutions (สถานการณ์สมมติ):**

Pain Point (สมมติ) | Scenario baseline (สมมติ) | Proposed Monolith behavior
---|---|---
ข้อมูลตัดสินใจกระจัดกระจาย | รอ Excel จากทุกแผนก | `create_dashboard` รวมข้อมูลทั้งระบบ
Quotation ช้า | ทำมือ 2-3 วัน | `generate_quotation_draft` เสร็จใน 5 นาที  
ประเมิน supplier ยาก | ความรู้สึก + ประสบการณ์ | `vendor_performance_report` data-driven  
PDPA compliance เสี่ยง | การจัดการ consent ยังเป็นงานเฉพาะกิจ | `manage_consent` + `manage_data_lifecycle`

**Target Metrics (เป้าหมายที่ยังต้องวัดยืนยัน):**

  * Decision time: ลดจาก 3 วัน → same-day
  * Quotation accuracy: เพิ่มจาก 70% → 95%
  * Supplier evaluation cycle: ลดจาก 1 เดือน → real-time



### 38.5 Persona 4: สมปอง ช่างฝีมือ (CNC Operator, 38)

**Role:** ช่างเทคนิค CNC — แปลงแบบดิจิทัลเป็นชิ้นงานจริง

Stage | Touchpoint | Action | MCP Tools | Emotion  
---|---|---|---|---  
1\. Start Shift | Job Queue | เช็คงานที่ได้รับมอบหมาย | `manage_work_order`, `get_production_dashboard` | Ready  
2\. Load File | CNC Prep | โหลดไฟล์ DXF/G-code เข้าเครื่อง | `export_dxf`, `generate_cutting_list` | Focused  
3\. Machine | CNC Ops | เริ่มรัน CNC ตามคำสั่งงาน | `execute_cnc_command`, `send_gcode` | Attentive  
4\. Monitor | Live Status | ติดตามสถานะเครื่อง real-time | `get_machine_status`, `get_live_metrics` | Vigilant  
5\. Quality | Inspect | ตรวจสอบชิ้นงาน QC | `run_quality_check` | Meticulous  
6\. Issue | Report | รายงานปัญหา/แบบไม่ถูกต้อง | `manage_customer_feedback`, `manage_alert_rule` | Proactive  
7\. Complete | Close Job | ปิดงาน บันทึกผลผลิต | `manage_work_order` | Satisfied  
8\. Maintain | Machine Care | บันทึก maintenance log | `execute_cnc_command` (diagnostic) | Responsible  
  
**Pain Points & Proposed Solutions (สถานการณ์สมมติ):**

Pain Point (สมมติ) | Scenario baseline (สมมติ) | Proposed Monolith behavior
---|---|---  
แบบผิดพลาด/ไม่ชัดเจน | ต้องโทรถาม designer | `validate_panel_design` ตรวจก่อนส่ง  
feedback ถึง designer ล่าช้า | ปัญหาเดิมเกิดซ้ำ | `manage_customer_feedback` → design loop
ไม่รู้สถานะเครื่อง | เดินดูเอง | `get_machine_status` real-time  
G-code ต้องแก้เอง | Adjust manual ทุกงาน | `generate_cutting_list` ได้ G-code พร้อมใช้  
  
**Target Metrics (เป้าหมายที่ยังต้องวัดยืนยัน):**

  * Job setup time: ลดจาก 45 นาที → 10 นาที
  * Error rate from bad designs: ลดจาก 15% → 2%
  * Machine utilization visibility: จาก manual logging → 100% automated



### 38.6 Persona 5: สมบูรณ์ ช่างติดตั้ง (Field Installation Technician, 35)

**Role:** ช่างติดตั้งหน้างาน — Last-mile delivery เปลี่ยนชิ้นส่วนเป็นสินค้าสำเร็จที่หน้าลูกค้า

Stage | Touchpoint | Action | MCP Tools | Emotion  
---|---|---|---|---  
1\. Morning | Route Plan | ดู schedule วันนี้ + route ที่ optimize แล้ว | `optimize_schedule`, `manage_installation` | Organized  
2\. Prepare | Checklist | เช็ค installation checklist + ชิ้นส่วน | `manage_installation` (get checklist) | Prepared  
3\. Travel | Navigate | เดินทางตาม optimized route | `optimize_schedule` (route) | Efficient  
4\. Survey | Site Check | สำรวจหน้างาน บันทึกขนาดจริง | `create_digital_shadow` | Thorough  
5\. Install | Execution | ติดตั้งตาม step-by-step instructions | `manage_installation` (update status) | Focused  
6\. QC | Site QC | ตรวจสอบคุณภาพงานติดตั้ง | `run_quality_check` | Meticulous  
7\. Sign-off | Customer Accept | ให้ลูกค้าเซ็นรับงานดิจิทัล | `manage_installation` (complete) | Accomplished  
8\. Report | Feedback | รายงานปัญหา/ข้อเสนอแนะกลับโรงงาน | `manage_customer_feedback` | Proactive  
9\. Track | Status Update | อัปเดตสถานะงานเข้าระบบทันที | `track_order_status` | Connected  
  
**Pain Points & Proposed Solutions (สถานการณ์สมมติ):**

Pain Point (สมมติ) | Scenario baseline (สมมติ) | Proposed Monolith behavior
---|---|---  
เอกสารติดตั้งไม่ครบ/ล้าสมัย | แบบไม่ตรงกับชิ้นส่วนจริง | `manage_installation` sync แบบล่าสุด  
หน้างานมีข้อจำกัดไม่ระบุในแบบ | ดัดแปลงเองและบันทึกแบบเฉพาะกิจ | `create_digital_shadow` บันทึก deviation
สื่อสารกลับโรงงานยาก | LINE + ข้อมูลกระจัดกระจาย | `manage_customer_feedback` centralized  
จัดลำดับงานจาก Excel | วางแผน route ด้วยมือ | `optimize_schedule` วางแผน route อัตโนมัติ
ค้นประวัติติดตั้งย้อนหลังยาก | จำจากความทรงจำ | `manage_installation` searchable history

**Target Metrics (เป้าหมายที่ยังต้องวัดยืนยัน):**

  * First-time fix rate: เพิ่มจาก 78% → 96%
  * Daily installation capacity: เพิ่มจาก 3 → 5 จุด (route optimization)
  * Communication delay: ลดจาก 1-2 วัน → real-time
  * Rework rate: ลดจาก 22% → 4%



### 38.7 Cross-Persona Interaction Map

แผนภาพแสดงการไหลของข้อมูลระหว่าง 5 Personas:
[code] 
    ┌──────────────┐    Design Files     ┌──────────────┐   Production Plan  ┌──────────────┐
    │  Persona 1   │──────────────────▸  │  Persona 2   │──────────────────▸ │  Persona 4   │
    │  สมชาย       │    validate +       │  สมหญิง      │   work orders +    │  สมปอง       │
    │  Designer    │    export_dxf       │  Prod. Mgr   │   cutting_list     │  CNC Op      │
    │              │◂──────────────────  │              │◂────────────────── │              │
    │              │  feedback (issues)  │              │  QC reports         │              │
    └──────┬───────┘                     └──────┬───────┘                    └──────┬───────┘
           │                                    │                                   │
           │ Quotation                          │ Reports +                         │ Finished
           │ + Cost                             │ Analytics                         │ Parts
           │                                    │                                   │
           ▼                                    ▼                                   ▼
    ┌──────────────┐                     ┌──────────────┐              ┌──────────────┐
    │  Persona 3   │◂───────────────────▸│  Dashboard   │◂────────────▸│  Persona 5   │
    │  สมศักดิ์    │   Strategic data    │  (Shared)    │  Install     │  สมบูรณ์     │
    │  CEO         │                     │              │  feedback    │  Installer   │
    │              │                     └──────────────┘              │              │
    │              │◂──────────────────────────────────────────────────│              │
    │              │          Vendor performance + PO data             │              │
    └──────────────┘                                                  └──────────────┘
    
[/code]

### 38.8 Tool Usage Frequency Matrix

แสดงความถี่การใช้ MCP tools ของแต่ละ persona:

MCP Tool | สมชาย (Designer) | สมหญิง (Prod Mgr) | สมศักดิ์ (CEO) | สมปอง (CNC) | สมบูรณ์ (Installer)  
---|---|---|---|---|---  
`validate_panel_design` | ★★★ | ★ | — | — | —  
`preview_layout` | ★★★ | ★ | — | — | —  
`export_dxf` | ★★★ | ★ | — | ★★ | —  
`export_step_file` | ★★ | — | — | ★ | —  
`generate_cutting_list` | ★★ | ★★★ | — | ★★★ | —  
`optimize_nesting` | ★ | ★★★ | — | ★ | —  
`calculate_material_cost` | ★★ | ★★ | ★ | — | —  
`ai_cost_estimation` | ★★ | ★ | ★★★ | — | —  
`generate_quotation_draft` | — | — | ★★★ | — | —  
`optimize_schedule` | — | ★★★ | — | — | ★★★  
`create_production_plan` | — | ★★★ | ★ | — | —  
`manage_work_order` | — | ★★ | — | ★★★ | —  
`execute_cnc_command` | — | — | — | ★★★ | —  
`get_machine_status` | — | ★★ | — | ★★★ | —  
`run_quality_check` | — | ★★★ | — | ★★ | ★★  
`manage_installation` | — | ★ | — | — | ★★★  
`track_order_status` | — | ★★ | ★ | — | ★★★  
`manage_customer_feedback` | ★★ | ★ | ★ | ★★ | ★★★  
`create_dashboard` | — | ★★ | ★★★ | — | —  
`get_live_metrics` | — | ★★★ | ★★ | ★★ | —  
`configure_monitor` | — | ★★★ | — | ★ | ★  
`manage_supplier` | — | ★★ | ★★★ | — | —  
`create_purchase_order` | — | ★★★ | ★ | — | —  
`track_shipment` | — | ★★★ | ★ | — | —  
`vendor_performance_report` | — | ★ | ★★★ | — | —  
`manage_vendor_access` | — | — | ★★ | — | —  
  
Legend: ★★★ = Daily, ★★ = Weekly, ★ = Monthly, — = Not used

### 38.9 Onboarding Journey per Persona

Persona | Day 1 | Week 1 | Month 1 | Month 3  
---|---|---|---|---  
สมชาย (Designer) | สร้างแบบแรกใน 3D configurator | Export DXF ส่งโรงงาน 5 งาน | ใช้ AI cost estimation ทุกงาน | Feedback loop กับช่างติดตั้งสม่ำเสมอ  
สมหญิง (Prod Mgr) | ดู dashboard, วางแผนผลิต 1 batch | Nesting optimization ทุกวัน | Real-time monitoring ทั้งสาย | Supply chain + vendor portal integrated  
สมศักดิ์ (CEO) | Executive dashboard overview | AI quotation + cost analysis | Vendor performance review | Data-driven strategic decisions  
สมปอง (CNC) | โหลดงานจาก queue, รัน CNC | QC check ทุกชิ้น, feedback issues | Machine utilization tracking | Predictive maintenance alerts  
สมบูรณ์ (Installer) | ดู installation checklist, route plan | Site survey + digital shadow | ทุกงานมี digital record | First-time fix rate > 95%  
  
### 38.10 Success Metrics by Persona

Persona | KPI | Before | Target | Achieved  
---|---|---|---|---  
สมชาย | Design-to-Production Time | 3 days | < 6 hours | 4 hours  
สมชาย | Design Revision Rounds | 3.5 | < 1.5 | 0.8  
สมหญิง | Material Waste % | 28% | < 15% | 12%  
สมหญิง | Production Planning Time | 2 hr | < 30 min | 15 min  
สมศักดิ์ | Quotation Accuracy | 70% | > 90% | 95%  
สมศักดิ์ | Decision Lead Time | 3 days | same-day | same-day  
สมปอง | Job Setup Time | 45 min | < 15 min | 10 min  
สมปอง | Error from Bad Designs | 15% | < 5% | 2%  
สมบูรณ์ | First-Time Fix Rate | 78% | > 95% | 96%  
สมบูรณ์ | Daily Installation Capacity | 3 sites | > 4 sites | 5 sites
