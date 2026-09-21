---
num: 30
title: "Digital Shadow, Customer Portal, Analytics Tools"
phase: 3
phase_label: "Phase 3"
phase_num: 3
mcp_tools: 5
status: complete
dependencies: "Phase 2"
---

# บทที่ 30: Phase 3 Tools — Digital Shadow, Customer Portal, Analytics

## บทที่ 30: Phase 3 Tools — Digital Shadow, Customer Portal, Analytics

### 30.1 ภาพรวม

Phase 3 ตาม Migration Plan ครอบคลุม 9 tools ใน 3 modules ระดับ advanced:

Module | Tools | Maps to | Plan  
---|---|---|---  
Digital Shadow | create_digital_shadow, query_shadow_state, compare_shadow_physical | src/digital-shadow/ | ENTERPRISE  
Customer Portal | create_customer_order, track_order_status, manage_customer_feedback | src/customer-portal/ | PROFESSIONAL  
Analytics | query_production_kpi, generate_analytics_report, monitor_oee_metrics | src/analytics/ | PROFESSIONAL–ENTERPRISE  
  
### 30.2 Digital Shadow Module (`src/tools/digital-shadow.ts`)

Digital Shadow = Digital Twin state snapshots ที่ AI agents สามารถสร้าง, query, และเปรียบเทียบกับสถานะทางกายภาพจริง

#### 30.2.1 `create_digital_shadow`

สร้างหรืออัปเดต digital shadow snapshot:
[code] 
    // Input
    {
      entityType: "machine" | "job" | "panel" | "factory_floor";
      entityId: string;
      state: Record<string, unknown>;  // สถานะปัจจุบัน
    }
    
    // Output
    {
      shadowId: "shadow-{entityType}-{entityId}";
      version: number;       // auto-increment per entity
      capturedAt: string;    // ISO 8601
    }
    
[/code]

#### 30.2.2 `query_shadow_state`

Query สถานะล่าสุดของ digital shadow:
[code] 
    // found = true → คืน state + version + capturedAt
    // found = false → entity ไม่มี shadow snapshot
    
[/code]

#### 30.2.3 `compare_shadow_physical`

ตรวจจับ **drift** ระหว่าง digital shadow กับ physical state:
[code] 
    // Drift Types
    - "value_mismatch": ค่าไม่ตรง (shadow ≠ physical)
    - "missing_in_physical": field อยู่ใน shadow แต่ไม่มีใน physical
    - "missing_in_shadow": field อยู่ใน physical แต่ไม่มีใน shadow
    
    // Output
    {
      inSync: boolean;              // true = ไม่มี drift
      drifts: ShadowDrift[];        // รายการ field ที่ต่าง
      totalFields: number;          // จำนวน fields ที่เปรียบเทียบ
      matchedFields: number;        // จำนวน fields ที่ตรง
      shadowVersion: number;
      comparedAt: string;
    }
    
[/code]

### 30.3 Customer Portal Module (`src/tools/customer-portal.ts`)

Maps to: `monolith-workspace src/customer-portal/` \+ `src/quotation/`

#### 30.3.1 `create_customer_order`

สร้างคำสั่งซื้อจาก quotation:
[code] 
    {
      customerId: string;
      quotationId: string;
      items: Array<{ panelId: string; quantity: number; unitPrice: number }>;
      currency?: "THB" | "USD" | "EUR";  // default: THB
      estimatedDeliveryDays?: number;     // default: 14
    }
    
[/code]

**Output:** orderId (ORD-xxx), totalAmount, status = "pending_confirmation", milestones

#### 30.3.2 `track_order_status`

Track และอัปเดตสถานะคำสั่งซื้อ:

**Order Status Lifecycle:**
[code] 
    pending_confirmation → confirmed → in_production → quality_check → ready_to_ship → shipped → delivered
                                                                                                 ↗
    cancelled ←─────────────────────────────────────────────────────────────────────────────────────
    
[/code]

ทุกการเปลี่ยนสถานะเพิ่ม milestone ใน order history

#### 30.3.3 `manage_customer_feedback`

จัดการ feedback, complaints, และ inquiry:
[code] 
    // Operations
    - "create": สร้าง feedback ใหม่ (type: complaint/inquiry/suggestion/praise)
    - "update": อัปเดตสถานะ (open → in_progress → resolved → closed)
    - "list": แสดงรายการ (filter by customerId)
    
    // Priority: low | medium | high | urgent
    
[/code]

### 30.4 Analytics Module (`src/tools/analytics.ts`)

Maps to: `monolith-workspace src/analytics/` \+ `src/org-health/`

#### 30.4.1 `query_production_kpi`

Query KPI ตาม category:

Category | Metrics  
---|---  
`production` | panels_produced, cycle_time_avg, throughput_per_hour, on_time_delivery  
`quality` | first_pass_yield, defect_rate, rework_rate, customer_returns  
`cost` | cost_per_panel (THB), material_waste_cost, overtime_cost, total_production_cost  
`efficiency` | machine_utilization, labor_efficiency, material_yield, energy_per_panel  
  
#### 30.4.2 `generate_analytics_report`

สร้าง comprehensive analytics report:
[code] 
    // Input
    {
      fromDate: string;
      toDate: string;
      categories?: string[];  // default: ทุก category
      format?: "summary" | "detailed";
    }
    
    // Output
    {
      reportType: "production_analytics";
      sections: Array<{ category: string; kpis: KpiResult[] }>;
      executiveSummary: {
        totalMetrics: number;
        categoriesAnalyzed: number;
        metricsImproving: number;
        overallHealthScore: number;  // 0-100%
      };
      recommendations: string[];    // AI-generated suggestions
    }
    
[/code]

#### 30.4.3 `monitor_oee_metrics`

Overall Equipment Effectiveness monitoring:
[code] 
    {
      machineId: string;
      availability: number;    // 0-100%
      performance: number;     // 0-100%
      quality: number;         // 0-100%
      oee: number;            // availability × performance × quality / 10000
      worldClassBenchmark: 85; // OEE world-class standard
    }
    
[/code]

**OEE Formula:**`OEE = (Availability × Performance × Quality) / 10000`
