---
num: 16
title: "ระบบจัดการคลังวัสดุ (Inventory)"
phase: 0
phase_label: "Foundation"
phase_num: 0
mcp_tools: 0
status: complete
dependencies: "—"
---

# บทที่ 16: ระบบจัดการคลังวัสดุ (Inventory Management)

## บทที่ 16: ระบบจัดการคลังวัสดุ (Inventory Management)

### 16.1 ภาพรวมและวัตถุประสงค์

ระบบจัดการคลังวัสดุเป็นหัวใจสำคัญของการผลิตเฟอร์นิเจอร์โมดูลาร์ เนื่องจากต้องจัดการวัสดุหลากหลายประเภท (แผ่นไม้, edge band, hardware, สี, อุปกรณ์ประกอบ) ให้สอดคล้องกับ production jobs ที่มีลักษณะ small-batch, multi-variety Lü et al. นำเสนอระบบที่ผสาน WMS (Warehouse Management System) เข้ากับ ERP/MES/APS เพื่อให้เกิด deep collaboration ระหว่าง warehouse logistics กับ planning และ execution [1] Vukman et al. ระบุว่า effective warehouse management เป็นหนึ่งใน industry-adapted CSFs สำหรับอุตสาหกรรมไม้ [6]

**วัตถุประสงค์หลัก:**

  * ติดตาม stock แบบ real-time ด้วย barcode/RFID
  * จัดการ warehouse zones และ bin locations
  * ตั้ง reorder alerts อัตโนมัติ
  * รองรับ material reservation สำหรับ production jobs
  * จัดการ stock adjustments และ stock take



### 16.2 สถาปัตยกรรมของ Module

#### 16.2.1 Database Schema
[code] 
    Table: materials
      - id: UUID (PK)
      - sku: VARCHAR(50) UNIQUE
      - name: VARCHAR(200)
      - category: ENUM ('board', 'edge_band', 'hardware', 'paint', 'adhesive',
                         'packaging', 'accessory', 'raw_wood', 'veneer', 'laminate')
      - unit: ENUM ('sheet', 'meter', 'piece', 'kg', 'liter', 'roll', 'box')
      - specifications: JSONB {thickness, width, length, color, grade, brand}
      - min_stock_level: DECIMAL
      - max_stock_level: DECIMAL
      - reorder_point: DECIMAL
      - reorder_quantity: DECIMAL
      - lead_time_days: INTEGER
      - unit_cost: DECIMAL
      - is_active: BOOLEAN
      - created_at: TIMESTAMPTZ
    
    Table: warehouse_locations
      - id: UUID (PK)
      - warehouse_id: UUID (FK → warehouses)
      - zone: ENUM ('receiving', 'raw_material', 'wip', 'finished_goods',
                    'hardware', 'packaging', 'quarantine', 'shipping')
      - aisle: VARCHAR(10)
      - rack: VARCHAR(10)
      - shelf: VARCHAR(10)
      - bin: VARCHAR(10)
      - barcode: VARCHAR(50) UNIQUE
      - capacity: JSONB {max_weight_kg, max_volume_m3}
      - is_available: BOOLEAN
    
    Table: stock_entries
      - id: UUID (PK)
      - material_id: UUID (FK → materials)
      - location_id: UUID (FK → warehouse_locations)
      - batch_number: VARCHAR(50)
      - quantity: DECIMAL
      - reserved_quantity: DECIMAL DEFAULT 0
      - available_quantity: DECIMAL GENERATED (quantity - reserved_quantity)
      - unit_cost: DECIMAL
      - received_date: DATE
      - expiry_date: DATE NULL
      - barcode: VARCHAR(100) UNIQUE
      - rfid_tag: VARCHAR(100) NULL
      - status: ENUM ('available', 'reserved', 'quarantine', 'damaged', 'expired')
      - updated_at: TIMESTAMPTZ
    
    Table: stock_movements
      - id: UUID (PK)
      - material_id: UUID (FK → materials)
      - from_location_id: UUID NULL (FK → warehouse_locations)
      - to_location_id: UUID NULL (FK → warehouse_locations)
      - movement_type: ENUM ('receive', 'issue', 'transfer', 'adjustment',
                              'return', 'scrap', 'stock_take')
      - quantity: DECIMAL
      - reference_type: VARCHAR(50) -- 'purchase_order', 'production_job', 'adjustment'
      - reference_id: UUID NULL
      - reason: TEXT NULL
      - performed_by: UUID (FK → employees)
      - performed_at: TIMESTAMPTZ
    
    Table: material_reservations
      - id: UUID (PK)
      - material_id: UUID (FK → materials)
      - job_id: UUID (FK → production_jobs)
      - order_id: UUID (FK → orders)
      - required_quantity: DECIMAL
      - reserved_quantity: DECIMAL
      - issued_quantity: DECIMAL DEFAULT 0
      - status: ENUM ('pending', 'partially_reserved', 'fully_reserved',
                       'partially_issued', 'fully_issued', 'cancelled')
      - required_by: DATE
      - created_at: TIMESTAMPTZ
    
    Table: stock_take_sessions
      - id: UUID (PK)
      - warehouse_id: UUID (FK → warehouses)
      - type: ENUM ('full', 'cycle_count', 'spot_check')
      - status: ENUM ('planned', 'in_progress', 'completed', 'reviewed')
      - started_at: TIMESTAMPTZ NULL
      - completed_at: TIMESTAMPTZ NULL
      - counts: JSONB [{material_id, location_id, system_qty, counted_qty, variance}]
      - reviewed_by: UUID NULL (FK → employees)
    
[/code]

#### 16.2.2 API Endpoints

Method | Endpoint | Description  
---|---|---  
GET | `/api/v1/inventory/materials` | รายการวัสดุทั้งหมด  
GET | `/api/v1/inventory/materials/:id/stock` | stock level ของวัสดุ  
POST | `/api/v1/inventory/receive` | รับวัสดุเข้าคลัง  
POST | `/api/v1/inventory/issue` | เบิกวัสดุออก  
POST | `/api/v1/inventory/transfer` | โอนวัสดุระหว่าง locations  
POST | `/api/v1/inventory/adjust` | ปรับ stock (adjustment)  
POST | `/api/v1/inventory/reserve` | จอง material สำหรับ job  
DELETE | `/api/v1/inventory/reserve/:id` | ยกเลิกการจอง  
GET | `/api/v1/inventory/alerts` | reorder alerts  
POST | `/api/v1/inventory/stock-take` | เริ่ม stock take session  
PATCH | `/api/v1/inventory/stock-take/:id` | อัปเดตผลนับ  
GET | `/api/v1/inventory/movements` | ประวัติ stock movements  
GET | `/api/v1/inventory/locations` | รายการ bin locations  
POST | `/api/v1/inventory/scan` | สแกน barcode/RFID  
  
#### 16.2.3 UI Screens

  1. **Inventory Dashboard** — ภาพรวม stock levels, alerts, value by category, aging analysis
  2. **Stock Browser** — ค้นหาวัสดุ แสดง stock across locations, reservation status
  3. **Receiving Screen** — ฟอร์มรับวัสดุพร้อม barcode scanner, QC check link
  4. **Issuing Screen** — เบิกวัสดุตาม job พร้อม scan verification
  5. **Warehouse Map** — visual layout ของ warehouse zones, racks, bins พร้อม occupancy heatmap
  6. **Stock Take App** — mobile app สำหรับ cycle count ด้วย barcode scanner
  7. **Reservation Board** — รายการ reservations ตาม job พร้อม status
  8. **Reorder Alert Panel** — วัสดุที่ต่ำกว่า reorder point พร้อม one-click create PO



### 16.3 Workflow Diagrams

#### 16.3.1 Material Receiving Workflow
[code] 
    ขั้นตอนที่ 1: Supplier ส่งวัสดุ → Warehouse staff สแกน delivery note
    ขั้นตอนที่ 2: ตรวจสอบจำนวนและ specifications เบื้องต้น
    ขั้นตอนที่ 3: เก็บเข้า quarantine zone → แจ้ง QC (บทที่ 15) ตรวจสอบ
    ขั้นตอนที่ 4: QC ผ่าน → ติด barcode/RFID label → จัดเก็บ bin location ที่เหมาะสม
               QC ไม่ผ่าน → mark as rejected → แจ้ง Procurement (บทที่ 23) ติดต่อ supplier
    ขั้นตอนที่ 5: ระบบอัปเดต stock → ตรวจสอบ pending reservations → จัดสรรอัตโนมัติ
    ขั้นตอนที่ 6: สร้าง GRN (Goods Received Note) → link กับ Purchase Order
    
[/code]

#### 16.3.2 Material Issuing Workflow (สำหรับ Production)
[code] 
    ขั้นตอนที่ 1: Production job start → ระบบดึง BOM → ตรวจ reservation status
    ขั้นตอนที่ 2: สร้าง pick list ตาม bin locations (optimized pick path)
    ขั้นตอนที่ 3: Warehouse staff scan แต่ละ item ออก → verify against pick list
    ขั้นตอนที่ 4: ส่งมอบให้ production line → operator scan รับ
    ขั้นตอนที่ 5: ระบบอัปเดต stock, ลด reserved qty, เพิ่ม issued qty
    ขั้นตอนที่ 6: หาก WIP เหลือ → return workflow กลับเข้าคลัง
    
[/code]

### 16.4 TypeScript Interface Definitions
[code] 
    interface Material {
      id: string;
      sku: string;
      name: string;
      category: MaterialCategory;
      unit: MaterialUnit;
      specifications: MaterialSpec;
      minStockLevel: number;
      maxStockLevel: number;
      reorderPoint: number;
      reorderQuantity: number;
      leadTimeDays: number;
      unitCost: number;
      isActive: boolean;
    }
    
    type MaterialCategory =
      | 'board' | 'edge_band' | 'hardware' | 'paint' | 'adhesive'
      | 'packaging' | 'accessory' | 'raw_wood' | 'veneer' | 'laminate';
    
    type MaterialUnit = 'sheet' | 'meter' | 'piece' | 'kg' | 'liter' | 'roll' | 'box';
    
    interface MaterialSpec {
      thickness?: number;
      width?: number;
      length?: number;
      color?: string;
      grade?: string;
      brand?: string;
    }
    
    interface StockEntry {
      id: string;
      materialId: string;
      locationId: string;
      batchNumber: string;
      quantity: number;
      reservedQuantity: number;
      availableQuantity: number;
      unitCost: number;
      receivedDate: Date;
      expiryDate: Date | null;
      barcode: string;
      rfidTag: string | null;
      status: 'available' | 'reserved' | 'quarantine' | 'damaged' | 'expired';
    }
    
    interface WarehouseLocation {
      id: string;
      warehouseId: string;
      zone: WarehouseZone;
      aisle: string;
      rack: string;
      shelf: string;
      bin: string;
      barcode: string;
      capacity: { maxWeightKg: number; maxVolumeM3: number };
      isAvailable: boolean;
    }
    
    type WarehouseZone =
      | 'receiving' | 'raw_material' | 'wip' | 'finished_goods'
      | 'hardware' | 'packaging' | 'quarantine' | 'shipping';
    
    interface StockMovement {
      id: string;
      materialId: string;
      fromLocationId: string | null;
      toLocationId: string | null;
      movementType: MovementType;
      quantity: number;
      referenceType: string;
      referenceId: string | null;
      reason: string | null;
      performedBy: string;
      performedAt: Date;
    }
    
    type MovementType =
      | 'receive' | 'issue' | 'transfer' | 'adjustment'
      | 'return' | 'scrap' | 'stock_take';
    
    interface MaterialReservation {
      id: string;
      materialId: string;
      jobId: string;
      orderId: string;
      requiredQuantity: number;
      reservedQuantity: number;
      issuedQuantity: number;
      status: ReservationStatus;
      requiredBy: Date;
    }
    
    type ReservationStatus =
      | 'pending' | 'partially_reserved' | 'fully_reserved'
      | 'partially_issued' | 'fully_issued' | 'cancelled';
    
    interface ReorderAlert {
      materialId: string;
      materialName: string;
      sku: string;
      currentStock: number;
      reorderPoint: number;
      reorderQuantity: number;
      leadTimeDays: number;
      estimatedStockoutDate: Date;
      suggestedOrderDate: Date;
      preferredSupplierId: string;
    }
    
[/code]

### 16.5 Integration กับ Modules อื่น

Module | ทิศทาง | รายละเอียด  
---|---|---  
Production Planning (บทที่ 19) | Bidirectional | BOM → reservation requests; stock availability → scheduling constraints  
Procurement (บทที่ 23) | Bidirectional | reorder alerts → PO; GRN → stock update  
Quality Control (บทที่ 15) | Bidirectional | incoming QC → stock release; scrap → stock adjustment  
Logistics (บทที่ 17) | Outbound | finished goods → shipping allocation  
BI Dashboard (บทที่ 21) | Outbound | stock value, turnover, aging data  
Inter-Dept Communication (บทที่ 14) | Outbound | stock-out alerts, reservation conflicts  
  
### 16.6 Role-Based Access Control (RBAC)

Role | สิทธิ์  
---|---  
Warehouse Staff | receive, issue, transfer, scan, stock take  
Warehouse Supervisor | approve adjustments, manage locations, generate reports  
Warehouse Manager | configure reorder rules, override reservations, full analytics  
Production Planner | ดู stock availability, สร้าง/ยกเลิก reservations  
Procurement Officer | ดู reorder alerts, stock levels (read-only)  
  
### 16.7 Mobile/Responsive Design Considerations

  * **Barcode/RFID scanner integration** : ใช้กล้อง mobile หรือ Bluetooth scanner
  * **Pick list navigation** : แสดง optimized route บน warehouse map
  * **Cycle count app** : ใช้ mobile สำหรับ stock take ทีละ zone
  * **Voice-guided picking** : อ่านชื่อ/bin location ด้วยเสียงสำหรับ hands-free operation



### 16.8 KPIs และ Metrics

KPI | คำอธิบาย | เป้าหมาย  
---|---|---  
Inventory Accuracy | % ความถูกต้องของ stock หลัง stock take | ≥ 99%  
Stock Turnover Ratio | จำนวนรอบหมุนเวียน stock ต่อปี | ตาม category benchmark  
Stockout Rate | % ครั้งที่ stock หมดก่อนเติม | ≤ 2%  
Reservation Fulfillment Rate | % reservations ที่จัดสรรได้ครบ | ≥ 95%  
Receiving Processing Time | เวลาตั้งแต่รับของถึง put-away เสร็จ | ≤ 4 ชั่วโมง  
Dead Stock Ratio | % วัสดุที่ไม่เคลื่อนไหว > 90 วัน | ≤ 5%  
Picking Accuracy | % picks ที่ถูกต้อง | ≥ 99.5%  
  
### 16.9 อ้างอิงจากงานวิจัย

การผสาน WMS เข้ากับ ERP/MES/APS เป็นหนึ่งในองค์ประกอบหลักที่ Lü et al. นำเสนอ โดยระบบ warehouse logistics ทำงานร่วมกับ planning layer และ shop-floor execution layer เพื่อจัดการวัสดุสำหรับ orders แบบ small-batch, multi-variety ได้อย่างมีประสิทธิภาพ [1] Vukman et al. ยืนยันว่า effective warehouse management และ supply chain tracking เป็น industry-adapted CSFs เฉพาะสำหรับอุตสาหกรรมไม้ที่ต้องจัดการวัสดุหลากหลายประเภทและขนาด [6] Hoa et al. เสริมด้วยการนำเสนอ IoT สำหรับการจัดการวัสดุ (materials management) ในโรงงานไม้ ซึ่งช่วยติดตาม stock แบบ real-time ผ่านเซ็นเซอร์ [3]
