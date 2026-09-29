---
num: 21
title: "ระบบ Business Intelligence และ Dashboard"
phase: 0
phase_label: "Foundation"
phase_num: 0
mcp_tools: 0
status: complete
dependencies: "—"
---

# บทที่ 21: ระบบ Business Intelligence และ Dashboard

## บทที่ 21: ระบบ Business Intelligence และ Dashboard

### 21.1 ภาพรวมและวัตถุประสงค์

ระบบ BI เป็น module ที่รวบรวมข้อมูลจากทุก module เข้าด้วยกัน เพื่อสร้าง actionable insights สำหรับผู้บริหาร แนวคิดนี้สอดคล้องกับที่ Hoa et al. นำเสนอการใช้ cloud computing สำหรับจัดเก็บข้อมูลทั้งหมดของกระบวนการผลิตในโรงงาน ซึ่งเป็นรากฐานของ data-driven decision making [3] Vukman et al. ระบุว่า data analytics เป็นส่วนหนึ่งของ contemporary ERP trends ที่สำคัญ [6]

**วัตถุประสงค์หลัก:**

  * Real-time KPI dashboards สำหรับทุกระดับขององค์กร
  * Production analytics, financial reports, material usage analysis
  * Efficiency metrics ที่เปรียบเทียบ actual vs target
  * Custom report builder สำหรับ ad-hoc analysis
  * Data export สำหรับ external tools



### 21.2 สถาปัตยกรรมของ Module

#### 21.2.1 Database Schema
[code] 
    Table: dashboard_configs
      - id: UUID (PK)
      - name: VARCHAR(100)
      - owner_id: UUID (FK → employees)
      - role_visibility: VARCHAR[] -- roles ที่เห็น dashboard นี้
      - layout: JSONB [{widget_id, position, size, config}]
      - is_default: BOOLEAN
      - created_at: TIMESTAMPTZ
    
    Table: widgets
      - id: UUID (PK)
      - type: ENUM ('kpi_card', 'line_chart', 'bar_chart', 'pie_chart',
                    'table', 'gauge', 'heatmap', 'gantt', 'map', 'funnel')
      - data_source: VARCHAR(100) -- module + metric name
      - query_config: JSONB {filters, groupBy, timeRange, aggregation}
      - refresh_interval_seconds: INTEGER
      - created_at: TIMESTAMPTZ
    
    Table: reports
      - id: UUID (PK)
      - name: VARCHAR(200)
      - type: ENUM ('production', 'financial', 'inventory', 'quality', 'sales',
                    'logistics', 'hr', 'custom')
      - template_id: UUID NULL (FK → report_templates)
      - parameters: JSONB {date_range, departments, filters}
      - generated_data: JSONB NULL
      - format: ENUM ('pdf', 'excel', 'csv', 'dashboard')
      - generated_by: UUID (FK → employees)
      - generated_at: TIMESTAMPTZ
      - scheduled: BOOLEAN DEFAULT FALSE
      - schedule_cron: VARCHAR(50) NULL
    
    Table: report_templates
      - id: UUID (PK)
      - name: VARCHAR(200)
      - category: VARCHAR(50)
      - sections: JSONB [{title, data_sources, chart_type, layout}]
      - is_system: BOOLEAN -- ระบบสร้างให้ vs user สร้างเอง
      - created_at: TIMESTAMPTZ
    
    Table: kpi_targets
      - id: UUID (PK)
      - kpi_name: VARCHAR(100)
      - module: VARCHAR(50)
      - target_value: DECIMAL
      - target_type: ENUM ('min', 'max', 'exact', 'range')
      - period: ENUM ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')
      - effective_from: DATE
      - effective_to: DATE NULL
      - created_by: UUID (FK → employees)
    
    Table: data_exports
      - id: UUID (PK)
      - export_type: ENUM ('scheduled', 'on_demand')
      - data_source: VARCHAR(100)
      - filters: JSONB
      - format: ENUM ('csv', 'excel', 'json', 'parquet')
      - file_url: VARCHAR(500)
      - row_count: INTEGER
      - exported_by: UUID (FK → employees)
      - exported_at: TIMESTAMPTZ
    
[/code]

#### 21.2.2 API Endpoints

Method | Endpoint | Description  
---|---|---  
GET | `/api/v1/bi/dashboards` | รายการ dashboards  
POST | `/api/v1/bi/dashboards` | สร้าง dashboard ใหม่  
PATCH | `/api/v1/bi/dashboards/:id` | แก้ไข layout  
GET | `/api/v1/bi/widgets/:id/data` | ดึงข้อมูล widget  
GET | `/api/v1/bi/kpis` | KPI values ทั้งหมด  
GET | `/api/v1/bi/kpis/:module` | KPIs ของ module เฉพาะ  
POST | `/api/v1/bi/reports/generate` | สร้างรายงาน  
GET | `/api/v1/bi/reports` | รายการรายงาน  
POST | `/api/v1/bi/exports` | export ข้อมูล  
GET | `/api/v1/bi/analytics/production` | production analytics  
GET | `/api/v1/bi/analytics/financial` | financial analytics  
GET | `/api/v1/bi/analytics/material-usage` | material usage analysis  
POST | `/api/v1/bi/reports/schedule` | ตั้ง scheduled report  
  
#### 21.2.3 UI Screens

  1. **Executive Dashboard** — KPI cards สำหรับผู้บริหาร: revenue, production output, defect rate, delivery performance
  2. **Production Analytics** — OEE trends, machine utilization, lead time analysis, bottleneck frequency
  3. **Financial Dashboard** — revenue, cost breakdown, profit margins, cash flow
  4. **Material Usage Dashboard** — consumption trends, waste %, cost per unit, supplier comparison
  5. **Sales Analytics** — pipeline funnel, conversion rates, revenue by customer type
  6. **Custom Report Builder** — drag-and-drop interface สำหรับสร้างรายงาน ad-hoc
  7. **Scheduled Reports** — จัดการรายงานที่ส่งอัตโนมัติ (daily/weekly/monthly)
  8. **Data Explorer** — query builder สำหรับ power users



### 21.3 Workflow Diagrams

#### 21.3.1 Data Pipeline Architecture
[code] 
    ขั้นตอนที่ 1: Source Modules สร้าง events/transactions
      → Production jobs, QC results, inventory movements, orders, deliveries, etc.
    
    ขั้นตอนที่ 2: Event Stream Processing
      → Real-time events → Message Queue (e.g., Kafka/Redis Streams)
      → Stream processor calculates real-time KPIs
    
    ขั้นตอนที่ 3: Data Warehouse (ETL)
      → Nightly/hourly ETL จาก operational DB → analytics DB
      → Dimensional modeling: fact tables + dimension tables
      → Pre-computed aggregates สำหรับ common queries
    
    ขั้นตอนที่ 4: API Layer
      → BI API ดึงจาก analytics DB + real-time cache
      → Caching layer สำหรับ frequently-accessed dashboards
    
    ขั้นตอนที่ 5: Presentation Layer
      → Dashboards render charts/tables จาก API
      → Auto-refresh ตาม configured intervals
      → Alerts เมื่อ KPI เกิน threshold
    
[/code]

### 21.4 TypeScript Interface Definitions
[code] 
    interface Dashboard {
      id: string;
      name: string;
      ownerId: string;
      roleVisibility: string[];
      layout: WidgetPlacement[];
      isDefault: boolean;
    }
    
    interface WidgetPlacement {
      widgetId: string;
      position: { x: number; y: number };
      size: { width: number; height: number };
      config: WidgetConfig;
    }
    
    interface WidgetConfig {
      type: WidgetType;
      dataSource: string;
      queryConfig: QueryConfig;
      refreshIntervalSeconds: number;
      title: string;
      colors?: string[];
    }
    
    type WidgetType =
      | 'kpi_card' | 'line_chart' | 'bar_chart' | 'pie_chart'
      | 'table' | 'gauge' | 'heatmap' | 'gantt' | 'map' | 'funnel';
    
    interface QueryConfig {
      filters: Record<string, unknown>;
      groupBy: string[];
      timeRange: { start: Date; end: Date } | { preset: 'today' | 'week' | 'month' | 'quarter' | 'year' };
      aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
    }
    
    interface KpiValue {
      kpiName: string;
      module: string;
      currentValue: number;
      targetValue: number;
      unit: string;
      trend: 'up' | 'down' | 'flat';
      trendPercentage: number;
      period: string;
      lastUpdated: Date;
    }
    
    interface Report {
      id: string;
      name: string;
      type: ReportType;
      parameters: ReportParameters;
      generatedData: Record<string, unknown> | null;
      format: 'pdf' | 'excel' | 'csv' | 'dashboard';
      generatedBy: string;
      generatedAt: Date;
      scheduled: boolean;
      scheduleCron: string | null;
    }
    
    type ReportType =
      | 'production' | 'financial' | 'inventory' | 'quality'
      | 'sales' | 'logistics' | 'hr' | 'custom';
    
    interface ReportParameters {
      dateRange: { start: Date; end: Date };
      departments: string[];
      filters: Record<string, unknown>;
    }
    
    interface DataExport {
      id: string;
      exportType: 'scheduled' | 'on_demand';
      dataSource: string;
      filters: Record<string, unknown>;
      format: 'csv' | 'excel' | 'json' | 'parquet';
      fileUrl: string;
      rowCount: number;
      exportedBy: string;
      exportedAt: Date;
    }
    
[/code]

### 21.5 Integration กับ Modules อื่น

Module BI เป็น consumer ของข้อมูลจากทุก module อื่น:

Source Module | ข้อมูลที่ดึง  
---|---  
Production Planning (บทที่ 19) | OEE, lead times, throughput, schedule adherence  
Quality Control (บทที่ 15) | Defect rates, FPY, rework costs, AI accuracy  
Inventory (บทที่ 16) | Stock levels, turnover, stockout events, valuation  
Logistics (บทที่ 17) | Delivery performance, costs, vehicle utilization  
CRM (บทที่ 18) | Sales pipeline, conversion rates, CSAT, NPS  
Installation (บทที่ 13) | First-time fix rate, installation times, rework  
HR (บทที่ 20) | Attendance, overtime, turnover, skill coverage  
Procurement (บทที่ 23) | Supplier performance, purchase costs, lead times  
After-Sales (บทที่ 22) | Warranty claims, SLA compliance, service costs  
  
### 21.6 Role-Based Access Control (RBAC)

Role | สิทธิ์  
---|---  
Executive / Director | ดู executive dashboard ทุก module, export  
Department Manager | ดู dashboard ของ module ตนเอง + custom reports  
Analyst | สร้าง custom reports, data explorer, export  
Staff | ดู shared dashboards (read-only)  
System Admin | กำหนด KPI targets, manage report templates  
  
### 21.7 Mobile/Responsive Design Considerations

  * **Executive mobile dashboard** : KPI cards สำคัญ 4–6 ตัวที่ดูได้เร็ว
  * **Responsive charts** : ปรับขนาดอัตโนมัติตามหน้าจอ
  * **Push alerts** : แจ้งเมื่อ KPI แดง (เกิน threshold)
  * **Quick export** : ส่ง report ผ่าน email/LINE จาก mobile



### 21.8 KPIs และ Metrics (Meta-KPIs ของระบบ BI เอง)

KPI | คำอธิบาย | เป้าหมาย  
---|---|---  
Dashboard Load Time | เวลาที่ dashboard ใช้ในการ load | ≤ 3 วินาที  
Data Freshness | ความล่าช้าของข้อมูล real-time | ≤ 5 นาที  
Report Generation Time | เวลาสร้าง complex report | ≤ 30 วินาที  
User Adoption Rate | % users ที่ใช้ BI ≥ 1 ครั้ง/สัปดาห์ | ≥ 80%  
Data Accuracy | % ข้อมูลที่ตรงกับ source | 100%  
  
### 21.9 อ้างอิงจากงานวิจัย

Hoa et al. เสนอการใช้ cloud computing เพื่อจัดเก็บข้อมูลการผลิตทั้งหมดของโรงงาน ซึ่งเป็นรากฐานของ centralized data layer ที่ BI module สามารถดึงข้อมูลมาวิเคราะห์ได้ [3] Liu et al. นำเสนอ cloud platform ที่เชื่อมหลาย manufacturing centers ซึ่งต้องมี unified analytics layer เพื่อให้ผู้บริหารเห็นภาพรวมข้ามโรงงาน [4] Vukman et al. ระบุว่า AI/ML และ data analytics เป็น contemporary trends ที่สำคัญสำหรับ ERP ในอนาคต ซึ่ง BI module นี้ตอบโจทย์โดยตรง [6] Lü et al. แสดงให้เห็นว่าข้อมูลจาก scheduling system สามารถนำมาวิเคราะห์เพื่อลดต้นทุนการผลิตได้ — BI module จะทำหน้าที่ aggregate ข้อมูลเหล่านี้ให้เป็น actionable insights [1]
