---
num: 4
title: "Technical Architecture"
phase: 0
phase_label: "Foundation"
phase_num: 0
mcp_tools: 2
status: complete
dependencies: "—"
---

# 4\. สถาปัตยกรรมทางเทคนิค

## 4\. สถาปัตยกรรมทางเทคนิค

### 4.1. ภาพรวมสถาปัตยกรรม

ระบบ Monolith Manufacturing OS ใช้สถาปัตยกรรมแบบ microservices ที่ผสานหลายเทคโนโลยีเข้าด้วยกัน:
[code] 
    ┌─────────────────────────────────────────────────────────────────┐
    │                     Application Layer                            │
    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
    │  │   Web UI     │  │  Mobile App  │  │  Admin Panel │          │
    │  │  (WebGPU)    │  │              │  │              │          │
    │  └──────────────┘  └──────────────┘  └──────────────┘          │
    └─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                      Virtual Layer                               │
    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
    │  │  MCP Server  │  │  AI Agents   │  │  Optimization│          │
    │  │  (Port 3100) │  │  Orchestrator│  │  Engine      │          │
    │  └──────────────┘  └──────────────┘  └──────────────┘          │
    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
    │  │  Digital Twin│  │  Budget      │  │  Nesting     │          │
    │  │  Engine      │  │  Validator   │  │  Optimizer   │          │
    │  └──────────────┘  └──────────────┘  └──────────────┘          │
    └─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                     Transport Layer                              │
    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
    │  │   REST API   │  │   WebSocket  │  │   OPC UA     │          │
    │  └──────────────┘  └──────────────┘  └──────────────┘          │
    │  ┌──────────────┐  ┌──────────────┐                            │
    │  │     MQTT     │  │   gRPC       │                            │
    │  └──────────────┘  └──────────────┘                            │
    └─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                      Physical Layer                              │
    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
    │  │  CNC Machines│  │  Cutting     │  │  Assembly    │          │
    │  │              │  │  Equipment   │  │  Stations    │          │
    │  └──────────────┘  └──────────────┘  └──────────────┘          │
    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
    │  │  IoT Sensors │  │  RFID/Barcode│  │  Quality     │          │
    │  │              │  │  Scanners    │  │  Inspection  │          │
    │  └──────────────┘  └──────────────┘  └──────────────┘          │
    └─────────────────────────────────────────────────────────────────┘
    
[/code]

### 4.2. สถาปัตยกรรมแบบ Four-Layer Digital Twin

ตามหลักฐานจากงานวิจัย [2] ระบบ Monolith นำสถาปัตยกรรมแบบสี่ชั้นมาใช้และขยายเพิ่มเติม:

#### 4.2.1. Physical Layer (ชั้นกายภาพ)

**ส่วนประกอบหลัก:**

  * เครื่องจักร CNC สำหรับการตัดและเจาะ
  * เครื่องตัดแผ่นวัสดุอัตโนมัติ
  * สถานีประกอบชิ้นส่วน
  * เซ็นเซอร์ IoT สำหรับติดตามสถานะเครื่องจักร
  * ระบบ RFID/Barcode สำหรับติดตามวัสดุและชิ้นงาน
  * อุปกรณ์ตรวจสอบคุณภาพ



**ข้อมูลที่รวบรวม:**

  * สถานะการทำงานของเครื่องจักร (เปิด/ปิด/ขัดข้อง)
  * อุณหภูมิและความสั่นสะเทือนของเครื่องจักร
  * ความเร็วและความแม่นยำของการตัด
  * ปริมาณวัสดุที่ใช้และของเสีย
  * ตำแหน่งและสถานะของชิ้นงาน
  * ผลการตรวจสอบคุณภาพ



#### 4.2.2. Transport Layer (ชั้นการสื่อสาร)

**โปรโตคอลที่รองรับ:**

  1. **OPC UA (Open Platform Communications Unified Architecture)**



\- มาตรฐานอุตสาหกรรมสำหรับการสื่อสารเครื่องจักร

\- รองรับความปลอดภัยและการเข้ารหัส

\- ใช้สำหรับเครื่องจักร CNC และอุปกรณ์อุตสาหกรรม

  1. **MQTT (Message Queuing Telemetry Transport)**



\- โปรโตคอลน้ำหนักเบาสำหรับ IoT

\- รองรับ publish/subscribe pattern

\- ใช้สำหรับเซ็นเซอร์และอุปกรณ์ IoT

  1. **WebSocket**



\- การสื่อสารแบบ real-time สองทาง

\- ใช้สำหรับ web interface และการอัปเดตสดๆ

  1. **REST API**



\- API มาตรฐานสำหรับการเข้าถึงข้อมูลและฟังก์ชัน

\- ใช้ HTTP/HTTPS พร้อม Bearer token authentication

  1. **gRPC**



\- โปรโตคอลประสิทธิภาพสูงสำหรับ microservices

\- ใช้สำหรับการสื่อสารภายในระหว่าง services

**คุณสมบัติความปลอดภัย:**

  * TLS/SSL encryption สำหรับทุกการสื่อสาร
  * Bearer token authentication
  * Role-based access control (RBAC)
  * API rate limiting
  * Audit logging



#### 4.2.3. Virtual Layer (ชั้นเสมือน)

**ส่วนประกอบหลัก:**

  1. **MCP Server (Model Context Protocol Server)**



\- ทำงานบนพอร์ต 3100

\- รองรับ 9 เครื่องมือหลัก

\- ใช้ StreamableHTTP transport

\- มี Express middleware สำหรับ Bearer token auth

  1. **AI Agents Orchestrator**



\- จัดการ AI agents หลายตัว

\- ประสานงานระหว่าง agents

\- ติดตามสถานะและผลลัพธ์

  1. **Digital Twin Engine**



\- จำลองสายการผลิตแบบเรียลไทม์

\- ทำนายผลลัพธ์และปัญหาที่อาจเกิดขึ้น

\- รองรับ what-if scenarios

  1. **Budget Validator**



\- ตรวจสอบงบประมาณวัสดุ

\- รองรับวัสดุกว่า 20 ชนิด

\- ครอบคลุม rubber, wood, composite, synthetic families

  1. **Nesting Optimizer**



\- เพิ่มประสิทธิภาพการจัดวางชิ้นส่วนบนแผ่นวัสดุ

\- ลดของเสีย

\- รองรับหลายรูปแบบและข้อจำกัด

  1. **Optimization Engine**



\- รวมอัลกอริทึมการเพิ่มประสิทธิภาพต่างๆ

\- รองรับ genetic algorithms, simulated annealing, และอื่นๆ

\- ปรับแต่งได้ตามความต้องการ

**ฐานข้อมูล:**

  * MySQL สำหรับข้อมูลหลักและ transactional data
  * Redis สำหรับ caching และ real-time data
  * TimescaleDB สำหรับ time-series data จากเซ็นเซอร์
  * MongoDB สำหรับ document storage (designs, configurations)



#### 4.2.4. Application Layer (ชั้นแอปพลิเคชัน)

**ส่วนประกอบหลัก:**
[code] 
    1. **Web UI (WebGPU-based)**
    
[/code]

\- 3D configurator สำหรับออกแบบเฟอร์นิเจอร์

\- Dashboard สำหรับติดตามการผลิต

\- การแสดงผลแบบเรียลไทม์

\- Responsive design สำหรับทุกอุปกรณ์
[code] 
    1. **Mobile App**
    
[/code]

\- แอปพลิเคชันสำหรับพนักงานในโรงงาน

\- สแกน QR code/barcode

\- รายงานปัญหาและสถานะ

\- การแจ้งเตือนแบบ push
[code] 
    1. **Admin Panel**
    
[/code]

\- จัดการผู้ใช้และสิทธิ์

\- ตั้งค่าระบบ

\- ดูรายงานและการวิเคราะห์

\- จัดการ tenants (สำหรับ multi-tenant SaaS)

### 4.3. MCP Server Architecture

#### 4.3.1. ภาพรวม MCP Server

MCP (Model Context Protocol) Server เป็นหัวใจหลักของระบบ Monolith ที่ทำหน้าที่เป็นตัวกลางระหว่าง AI agents และฟังก์ชันการผลิตต่างๆ

**คุณสมบัติหลัก:**
[code] 
    - ทำงานบนพอร์ต 3100
    - ใช้ StreamableHTTP transport
    - มี Express middleware สำหรับ authentication
    - รองรับ Bearer token authentication
    - มี 9 เครื่องมือหลัก (tools)
    - มี 6 ทักษะเฉพาะทาง (skills)
    
[/code]

#### 4.3.2. เครื่องมือ 9 ตัวหลัก (9 Core Tools)

**1\. validate_panel_design**
[code] 
      - **หน้าที่**: ตรวจสอบความถูกต้องของการออกแบบแผงเฟอร์นิเจอร์
      - **Input**: PanelDesign object
      - **Output**: ValidationResult
      - **การตรวจสอบ**:
    
[/code]

\- ขนาดและสัดส่วน

\- งบประมาณวัสดุ (ผ่าน checkBudget())

\- ข้อจำกัดทางวิศวกรรม

\- ความเป็นไปได้ในการผลิต

**2\. generate_cutting_list**
[code] 
      - **หน้าที่**: สร้างรายการตัดจากการออกแบบ
      - **Input**: PanelDesign
      - **Output**: CuttingListResult
      - **ฟังก์ชัน**:
    
[/code]

\- คำนวณชิ้นส่วนที่ต้องตัด

\- กำหนดลำดับการตัด

\- ระบุวัสดุและขนาด

\- คำนวณปริมาณวัสดุที่ต้องใช้

**3\. export_dxf**
[code] 
      - **หน้าที่**: ส่งออกไฟล์ DXF สำหรับเครื่อง CNC
      - **Input**: PanelDesign
      - **Output**: DXFExportResult
      - **รูปแบบ**: AutoCAD DXF (Drawing Exchange Format)
      - **ใช้กับ**: เครื่อง CNC, เครื่องตัดเลเซอร์
    
[/code]

**4\. preview_layout**
[code] 
      - **หน้าที่**: แสดงตัวอย่างการจัดวางชิ้นส่วน
      - **Input**: PanelDesign, SheetStock
      - **Output**: SnapshotResult (รูปภาพ)
      - **คุณสมบัติ**:
    
[/code]

\- แสดงการจัดวางบนแผ่นวัสดุ

\- ระบุพื้นที่ที่ใช้และของเสีย

\- รองรับหลายมุมมอง

**5\. optimize_nesting**
[code] 
      - **หน้าที่**: เพิ่มประสิทธิภาพการจัดวางชิ้นส่วน
      - **Input**: Panel\[\], SheetStock\[\]
      - **Output**: NestingResult
      - **อัลกอริทึม**:
    
[/code]

\- Genetic algorithms

\- Simulated annealing

\- Bin packing algorithms
[code] 
      - **เป้าหมาย**: ลดของเสียและจำนวนแผ่นวัสดุ
    
[/code]

**6\. calculate_material_cost**
[code] 
      - **หน้าที่**: คำนวณต้นทุนวัสดุ
      - **Input**: PanelDesign, material prices
      - **Output**: CostResult
      - **การคำนวณ**:
    
[/code]

\- ต้นทุนวัสดุหลัก

\- ต้นทุนวัสดุเสริม (ฮาร์ดแวร์, กาว, ฯลฯ)

\- ต้นทุนของเสีย

\- ต้นทุนรวม

**7\. canvas_snapshot**
[code] 
      - **หน้าที่**: จับภาพหน้าจอ canvas
      - **Input**: canvas element
      - **Output**: SnapshotResult (รูปภาพ)
      - **รูปแบบ**: PNG, JPEG, WebP
      - **ใช้สำหรับ**: บันทึกการออกแบบ, รายงาน, เอกสาร
    
[/code]

**8\. export_step_file**
[code] 
      - **หน้าที่**: ส่งออกไฟล์ STEP สำหรับ CAD
      - **Input**: PanelDesign
      - **Output**: StepExportResult
      - **รูปแบบ**: ISO 10303 STEP (Standard for the Exchange of Product model data)
      - **ใช้กับ**: ซอฟต์แวร์ CAD, การจำลอง, การวิเคราะห์
    
[/code]

**9\. load_skill**
[code] 
      - **หน้าที่**: โหลดและรันทักษะเฉพาะทาง
      - **Input**: skill name, parameters
      - **Output**: ขึ้นอยู่กับทักษะ
      - **ทักษะที่รองรับ**: 6 ทักษะ (ดูในส่วน 4.3.3)
    
[/code]

#### 4.3.3. ทักษะ 6 ทักษะเฉพาะทาง (6 Skills)

**1\. Design Validation Skill**
[code] 
      - ตรวจสอบการออกแบบอย่างครอบคลุม
      - รวมการตรวจสอบงบประมาณ
      - ตรวจสอบความเป็นไปได้ในการผลิต
      - ให้คำแนะนำการปรับปรุง
    
[/code]

**2\. Cutting Optimization Skill**
[code] 
      - เพิ่มประสิทธิภาพการตัดวัสดุ
      - ลดของเสีย
      - คำนวณเวลาการตัด
      - สร้าง G-code สำหรับ CNC
    
[/code]

**3\. Cost Estimation Skill**
[code] 
      - คำนวณต้นทุนโดยละเอียด
      - รวมต้นทุนแรงงาน
      - คำนวณ overhead
      - ให้ราคาขาย
    
[/code]

**4\. Production Planning Skill**
[code] 
      - วางแผนการผลิต
      - จัดตารางเครื่องจักร
      - คำนวณเวลาการผลิต
      - ระบุ bottlenecks
    
[/code]

**5\. Quality Assurance Skill**
[code] 
      - กำหนดมาตรฐานคุณภาพ
      - สร้างแผนการตรวจสอบ
      - วิเคราะห์ข้อบกพร่อง
      - ให้คำแนะนำการปรับปรุง
    
[/code]

**6\. Material Management Skill**
[code] 
      - จัดการสต็อกวัสดุ
      - คำนวณความต้องการวัสดุ
      - เตือนเมื่อวัสดุใกล้หมด
      - เพิ่มประสิทธิภาพการสั่งซื้อ
    
[/code]

#### 4.3.4. Workflow ที่แนะนำ

ตามเอกสาร `public/llms.txt` workflow ที่แนะนำคือ:
[code] 
    1. validate_panel_design
       ↓
    2. generate_cutting_list
       ↓
    3. optimize_nesting
       ↓
    4. preview_layout
       ↓
    5. calculate_material_cost
       ↓
    6. export_dxf / export_step_file
       ↓
    7. canvas_snapshot (สำหรับบันทึก)
    
[/code]

#### 4.3.5. การ Authentication และ Security

**Bearer Token Authentication:**
[code] 
    // ตัวอย่างการใช้งาน
    const response = await fetch('http://localhost:3100/api/validate', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer YOUR_TOKEN_HERE',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(panelDesign)
    });
    
[/code]

**Security Features:**
[code] 
      - Bearer token validation
      - Rate limiting
      - CORS configuration
      - Input validation
      - Error handling
      - Audit logging
    
[/code]

### 4.4. ระบบ Multi-Tenant SaaS

#### 4.4.1. ภาพรวม Multi-Tenancy

ระบบ Monolith ออกแบบเป็น Multi-tenant SaaS ที่รองรับหลายองค์กร (tenants) บนโครงสร้างพื้นฐานเดียวกัน

**รูปแบบ Multi-Tenancy:**
[code] 
      - **Shared Database, Shared Schema**: ใช้ tenant\_id เพื่อแยกข้อมูล
      - **Data Isolation**: แยกข้อมูลของแต่ละ tenant อย่างเข้มงวด
      - **Resource Quotas**: จำกัดทรัพยากรตาม subscription plan
      - **Customization**: อนุญาตให้แต่ละ tenant ปรับแต่งได้
    
[/code]

#### 4.4.2. Tenant Management

**Tenant Data Model:**
[code] 
    interface Tenant {
      id: string;
      name: string;
      domain: string; // subdomain หรือ custom domain
      subscription_plan: 'free' | 'basic' | 'pro' | 'enterprise';
      status: 'active' | 'suspended' | 'cancelled';
      created_at: Date;
      settings: TenantSettings;
      quotas: ResourceQuotas;
    }
    
    interface TenantSettings {
      branding: {
        logo_url: string;
        primary_color: string;
        secondary_color: string;
      };
      features: {
        ai_agents: boolean;
        advanced_optimization: boolean;
        api_access: boolean;
        custom_materials: boolean;
      };
      integrations: {
        erp_system?: string;
        accounting_system?: string;
      };
    }
    
    interface ResourceQuotas {
      max_users: number;
      max_designs: number;
      max_storage_gb: number;
      max_api_calls_per_month: number;
      max_concurrent_optimizations: number;
    }
    
[/code]

#### 4.4.3. Data Isolation Strategy

**Database Level:**
[code] 
    -- ทุกตารางมี tenant_id
    CREATE TABLE designs (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL,
      name VARCHAR(255),
      data JSONB,
      created_at TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );
    
    -- Index สำหรับ performance
    CREATE INDEX idx_designs_tenant ON designs(tenant_id);
    
    -- Row Level Security (RLS) ใน PostgreSQL
    ALTER TABLE designs ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY tenant_isolation ON designs
      USING (tenant_id = current_setting('app.current_tenant')::UUID);
    
[/code]

**Application Level:**
[code] 
    // Middleware สำหรับตั้งค่า tenant context
    app.use(async (req, res, next) => {
      const tenantId = extractTenantId(req); // จาก subdomain, header, หรือ token
      req.tenantId = tenantId;
    
      // ตั้งค่า database session
      await db.query('SET app.current_tenant = $1', [tenantId]);
    
      next();
    });
    
    // ทุก query ต้องมี tenant_id
    const designs = await db.query(
      'SELECT * FROM designs WHERE tenant_id = $1',
      [req.tenantId]
    );
    
[/code]

#### 4.4.4. Subscription Plans

**Free Plan:**
[code] 
      - 1 user
      - 10 designs
      - 1 GB storage
      - Basic features
      - Community support
    
[/code]

**Basic Plan ($49/month):**
[code] 
      - 5 users
      - 100 designs
      - 10 GB storage
      - All basic features
      - Email support
      - API access (1,000 calls/month)
    
[/code]

**Pro Plan ($199/month):**
[code] 
      - 20 users
      - Unlimited designs
      - 100 GB storage
      - All features including AI agents
      - Priority support
      - API access (10,000 calls/month)
      - Advanced optimization
      - Custom materials
    
[/code]

**Enterprise Plan (Custom pricing):**
[code] 
      - Unlimited users
      - Unlimited designs
      - Unlimited storage
      - All features
      - Dedicated support
      - Unlimited API access
      - On-premise deployment option
      - Custom integrations
      - SLA guarantee
    
[/code]

#### 4.4.5. Billing และ Subscription Management

**Integration with Stripe:**
[code] 
    import Stripe from 'stripe';
    
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    
    // สร้าง subscription
    async function createSubscription(tenantId: string, planId: string) {
      const tenant = await getTenant(tenantId);
    
      const subscription = await stripe.subscriptions.create({
        customer: tenant.stripe_customer_id,
        items: [{ price: planId }],
        metadata: { tenant_id: tenantId }
      });
    
      await updateTenantSubscription(tenantId, subscription);
    
      return subscription;
    }
    
    // Webhook สำหรับ handle events
    app.post('/webhooks/stripe', async (req, res) => {
      const event = stripe.webhooks.constructEvent(
        req.body,
        req.headers['stripe-signature'],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    
      switch (event.type) {
        case 'customer.subscription.updated':
          await handleSubscriptionUpdate(event.data.object);
          break;
        case 'customer.subscription.deleted':
          await handleSubscriptionCancellation(event.data.object);
          break;
        case 'invoice.payment_failed':
          await handlePaymentFailure(event.data.object);
          break;
      }
    
      res.json({ received: true });
    });
    
[/code]

### 4.5. WebGPU 3D Configurator

#### 4.5.1. ภาพรวม WebGPU

WebGPU เป็น API กราฟิกรุ่นใหม่ที่ให้ประสิทธิภาพสูงกว่า WebGL และเข้าถึง GPU ได้โดยตรง ระบบ Monolith ใช้ WebGPU สำหรับ 3D configurator ที่ให้ผู้ใช้ออกแบบเฟอร์นิเจอร์แบบ interactive

**ข้อดีของ WebGPU:**
[code] 
      - ประสิทธิภาพสูงกว่า WebGL 2-3 เท่า
      - รองรับ compute shaders
      - ใช้ memory ได้มีประสิทธิภาพกว่า
      - รองรับ modern GPU features
      - API ที่ทันสมัยและใช้งานง่ายกว่า
    
[/code]

#### 4.5.2. สถาปัตยกรรม 3D Configurator

**ส่วนประกอบหลัก:**
[code] 
      1. **Rendering Engine**
    
[/code]

\- ใช้ WebGPU สำหรับ rendering

\- รองรับ PBR (Physically Based Rendering)

\- Real-time shadows และ reflections

\- Anti-aliasing และ post-processing
[code] 
      1. **Scene Management**
    
[/code]

\- จัดการ 3D objects และ materials

\- Hierarchical scene graph

\- Frustum culling และ LOD (Level of Detail)

\- Instancing สำหรับ performance
[code] 
      1. **Interaction System**
    
[/code]

\- Mouse/touch controls

\- Object selection และ manipulation

\- Snap-to-grid และ alignment helpers

\- Measurement tools
[code] 
      1. **Material System**
    
[/code]

\- PBR materials (metallic-roughness workflow)

\- Texture mapping (albedo, normal, roughness, metallic, AO)

\- Material library

\- Custom material editor

#### 4.5.3. การใช้งาน WebGPU

**Initialization:**
[code] 
    // ตรวจสอบการรองรับ WebGPU
    if (!navigator.gpu) {
      throw new Error('WebGPU not supported');
    }
    
    // ขอ adapter และ device
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();
    
    // สร้าง canvas context
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const context = canvas.getContext('webgpu');
    
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format,
      alphaMode: 'premultiplied'
    });
    
[/code]

**Rendering Pipeline:**
[code] 
    // สร้าง render pipeline
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({ code: vertexShaderCode }),
        entryPoint: 'main',
        buffers: [vertexBufferLayout]
      },
      fragment: {
        module: device.createShaderModule({ code: fragmentShaderCode }),
        entryPoint: 'main',
        targets: [{ format }]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back'
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less'
      }
    });
    
    // Render loop
    function render() {
      const commandEncoder = device.createCommandEncoder();
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{\
          view: context.getCurrentTexture().createView(),\
          loadOp: 'clear',\
          storeOp: 'store',\
          clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 }\
        }],
        depthStencilAttachment: {
          view: depthTexture.createView(),
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
          depthClearValue: 1.0
        }
      });
    
      renderPass.setPipeline(pipeline);
      renderPass.setVertexBuffer(0, vertexBuffer);
      renderPass.setIndexBuffer(indexBuffer, 'uint16');
      renderPass.setBindGroup(0, uniformBindGroup);
      renderPass.drawIndexed(indexCount);
      renderPass.end();
    
      device.queue.submit([commandEncoder.finish()]);
    
      requestAnimationFrame(render);
    }
    
[/code]

#### 4.5.4. คุณสมบัติของ Configurator

**1\. Real-time Design Editing**
[code] 
      - เพิ่ม/ลบ/แก้ไขชิ้นส่วน
      - ปรับขนาดและตำแหน่ง
      - เปลี่ยนวัสดุและสี
      - ดูผลลัพธ์ทันที
    
[/code]

**2\. Material Visualization**
[code] 
      - แสดงวัสดุจริงด้วย PBR
      - รองรับ wood grain, metal, fabric, glass
      - แสดง texture และ finish ต่างๆ
      - เปรียบเทียบวัสดุหลายแบบ
    
[/code]

**3\. Measurement และ Dimensions**
[code] 
      - แสดงขนาดแบบเรียลไทม์
      - วัดระยะระหว่างชิ้นส่วน
      - ตรวจสอบความพอดี
      - แสดง tolerances
    
[/code]

**4\. Camera Controls**
[code] 
      - Orbit, pan, zoom
      - Preset views (front, side, top, isometric)
      - Walk-through mode
      - VR/AR support (future)
    
[/code]

**5\. Export และ Sharing**
[code] 
      - บันทึกการออกแบบ
      - ส่งออกรูปภาพ (PNG, JPEG)
      - ส่งออก 3D models (GLTF, OBJ)
      - แชร์ลิงก์สำหรับดูออนไลน์
    
[/code]

#### 4.5.5. Performance Optimization

**Techniques:**
[code] 
      1. **Instancing**: วาด objects เหมือนกันหลายตัวในครั้งเดียว
      2. **LOD (Level of Detail)**: ใช้ model ละเอียดน้อยลงเมื่ออยู่ไกล
      3. **Frustum Culling**: ไม่วาด objects ที่อยู่นอกมุมมอง
      4. **Occlusion Culling**: ไม่วาด objects ที่ถูกบังโดย objects อื่น
      5. **Texture Compression**: ใช้ compressed texture formats (BC, ASTC)
      6. **Async Loading**: โหลด assets แบบ asynchronous
      7. **Web Workers**: ประมวลผลหนักใน background threads
    
[/code]
