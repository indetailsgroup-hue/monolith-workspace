---
num: 17
title: "ระบบโลจิสติกส์และจัดส่ง"
phase: 0
phase_label: "Foundation"
phase_num: 0
mcp_tools: 0
status: complete
dependencies: "—"
---

# บทที่ 17: ระบบโลจิสติกส์และจัดส่ง (Logistics & Delivery)

## บทที่ 17: ระบบโลจิสติกส์และจัดส่ง (Logistics & Delivery)

### 17.1 ภาพรวมและวัตถุประสงค์

ระบบโลจิสติกส์ครอบคลุมตั้งแต่การจัดทำ loading plan, การวางแผน route optimization, การติดตาม shipment แบบ real-time ไปจนถึง proof of delivery การผสานระบบ logistics เข้ากับ MES/ERP เป็นสิ่งที่งานวิจัยเน้นอย่างชัดเจน โดย Liu et al. มุ่งลดต้นทุน supply chain ผ่าน cloud platform ที่เชื่อม manufacturing centers หลายแห่งเข้าด้วยกัน [4] และ Barni et al. ทดสอบระบบ distributed production ที่ต้องบริหาร logistics ระหว่าง design area กับ manufacturing site ที่แยกจากกัน [2]

**วัตถุประสงค์หลัก:**

  * จัดตาราง delivery scheduling ที่สอดคล้องกับ production completion
  * Route optimization เพื่อลดต้นทุนขนส่ง
  * Shipment tracking แบบ real-time สำหรับทั้ง internal และ customer view
  * Loading plan ที่คำนึงถึงลำดับจุดส่ง
  * Vehicle management สำหรับฟลีทรถ
  * Proof of delivery และ damage documentation



### 17.2 สถาปัตยกรรมของ Module

#### 17.2.1 Database Schema
[code] 
    Table: shipments
      - id: UUID (PK)
      - shipment_number: VARCHAR(20) UNIQUE
      - order_ids: UUID[] -- อาจรวมหลาย orders ในเที่ยวเดียว
      - vehicle_id: UUID (FK → vehicles)
      - driver_id: UUID (FK → employees)
      - route_id: UUID (FK → delivery_routes)
      - status: ENUM ('planning', 'loading', 'in_transit', 'arriving',
                       'delivered', 'partial_delivery', 'returned', 'cancelled')
      - loading_plan: JSONB [{order_id, items, loading_sequence,\
                               weight_kg, volume_m3, special_handling}]
      - estimated_departure: TIMESTAMPTZ
      - actual_departure: TIMESTAMPTZ NULL
      - estimated_arrival: TIMESTAMPTZ
      - actual_arrival: TIMESTAMPTZ NULL
      - total_weight_kg: DECIMAL
      - total_volume_m3: DECIMAL
      - created_at: TIMESTAMPTZ
    
    Table: delivery_routes
      - id: UUID (PK)
      - date: DATE
      - vehicle_id: UUID (FK → vehicles)
      - stops: JSONB [{sequence, order_id, address, lat, lng,\
                        estimated_arrival, actual_arrival, distance_km}]
      - total_distance_km: DECIMAL
      - optimized_at: TIMESTAMPTZ
      - optimization_method: ENUM ('manual', 'algorithm', 'ai')
    
    Table: vehicles
      - id: UUID (PK)
      - plate_number: VARCHAR(20)
      - type: ENUM ('pickup', 'small_truck', 'medium_truck', 'large_truck', 'trailer')
      - capacity_weight_kg: DECIMAL
      - capacity_volume_m3: DECIMAL
      - cargo_dimensions: JSONB {length_m, width_m, height_m}
      - gps_tracker_id: VARCHAR(50) NULL
      - status: ENUM ('available', 'in_use', 'maintenance', 'retired')
      - insurance_expiry: DATE
      - registration_expiry: DATE
      - current_location: POINT NULL
    
    Table: delivery_proofs
      - id: UUID (PK)
      - shipment_id: UUID (FK → shipments)
      - order_id: UUID (FK → orders)
      - delivered_to: VARCHAR(200)
      - signature_url: VARCHAR(500)
      - photos: JSONB [{url, caption, type: 'delivered'|'damage'|'location'}]
      - notes: TEXT
      - condition: ENUM ('good', 'minor_damage', 'major_damage', 'refused')
      - damage_details: TEXT NULL
      - delivered_at: TIMESTAMPTZ
      - gps_location: POINT
    
    Table: shipment_tracking_events
      - id: UUID (PK)
      - shipment_id: UUID (FK → shipments)
      - event_type: ENUM ('departed_warehouse', 'checkpoint', 'stop_arrived',
                           'stop_completed', 'delay_reported', 'delivered', 'returned')
      - description: TEXT
      - location: POINT
      - timestamp: TIMESTAMPTZ
    
[/code]

#### 17.2.2 API Endpoints

Method | Endpoint | Description  
---|---|---  
GET | `/api/v1/logistics/shipments` | รายการ shipments  
POST | `/api/v1/logistics/shipments` | สร้าง shipment ใหม่  
GET | `/api/v1/logistics/shipments/:id/track` | ติดตาม shipment  
POST | `/api/v1/logistics/routes/optimize` | คำนวณ optimal route  
POST | `/api/v1/logistics/loading-plan` | สร้าง loading plan  
GET | `/api/v1/logistics/vehicles` | รายการรถ + สถานะ  
POST | `/api/v1/logistics/proof-of-delivery` | บันทึก POD  
POST | `/api/v1/logistics/damage-report` | รายงาน damage  
GET | `/api/v1/logistics/schedule` | ตาราง delivery ภาพรวม  
PATCH | `/api/v1/logistics/shipments/:id/status` | อัปเดตสถานะ  
  
#### 17.2.3 UI Screens

  1. **Logistics Dashboard** — ภาพรวม shipments วันนี้, map view ของรถทั้งหมด, alerts
  2. **Route Planning** — แผนที่สำหรับวาง route, drag-and-drop จุดส่ง, auto-optimize
  3. **Loading Plan Builder** — visual representation ของพื้นที่บรรทุก พร้อมจัด items ตามลำดับส่ง
  4. **Shipment Tracking** — live map + timeline ของแต่ละ shipment
  5. **Vehicle Fleet Management** — สถานะรถ, maintenance schedule, ใบอนุญาต/ประกัน
  6. **Proof of Delivery** — gallery ของ POD photos + signatures
  7. **Customer Tracking Page** — หน้าติดตามสำหรับลูกค้า (public link)



### 17.3 Workflow Diagrams

#### 17.3.1 Delivery Scheduling Workflow
[code] 
    ขั้นตอนที่ 1: QC passed → สินค้าย้ายเข้า shipping zone ในคลัง
    ขั้นตอนที่ 2: Logistics Planner รวม orders ที่พร้อมส่งตาม zone/area
    ขั้นตอนที่ 3: เลือก vehicle ที่เหมาะสม (ตาม capacity, สินค้า type)
    ขั้นตอนที่ 4: ระบบคำนวณ optimal route (minimize distance + respect time windows)
    ขั้นตอนที่ 5: สร้าง loading plan (reverse delivery order → load first, deliver last)
    ขั้นตอนที่ 6: แจ้งลูกค้า delivery date/time window ผ่าน CRM (บทที่ 18)
    ขั้นตอนที่ 7: วันส่ง: Warehouse staff load ตาม plan → driver scan verify → ออกเดินทาง
    ขั้นตอนที่ 8: ระบบ track GPS → ส่ง ETA updates ให้ลูกค้า
    ขั้นตอนที่ 9: ถึงจุดส่ง → ลูกค้ารับ/ตรวจ → driver บันทึก POD
    ขั้นตอนที่ 10: หากมี damage → บันทึก damage report + photos → แจ้ง QC + After-Sales
    ขั้นตอนที่ 11: ส่งครบ → handoff ไปยัง Installation (บทที่ 13)
    
[/code]

### 17.4 TypeScript Interface Definitions
[code] 
    interface Shipment {
      id: string;
      shipmentNumber: string;
      orderIds: string[];
      vehicleId: string;
      driverId: string;
      routeId: string;
      status: ShipmentStatus;
      loadingPlan: LoadingItem[];
      estimatedDeparture: Date;
      actualDeparture: Date | null;
      estimatedArrival: Date;
      actualArrival: Date | null;
      totalWeightKg: number;
      totalVolumeM3: number;
    }
    
    type ShipmentStatus =
      | 'planning' | 'loading' | 'in_transit' | 'arriving'
      | 'delivered' | 'partial_delivery' | 'returned' | 'cancelled';
    
    interface LoadingItem {
      orderId: string;
      items: string[];
      loadingSequence: number;
      weightKg: number;
      volumeM3: number;
      specialHandling: string[];
    }
    
    interface DeliveryRoute {
      id: string;
      date: Date;
      vehicleId: string;
      stops: RouteStop[];
      totalDistanceKm: number;
      optimizedAt: Date;
      optimizationMethod: 'manual' | 'algorithm' | 'ai';
    }
    
    interface RouteStop {
      sequence: number;
      orderId: string;
      address: string;
      lat: number;
      lng: number;
      estimatedArrival: Date;
      actualArrival: Date | null;
      distanceKm: number;
    }
    
    interface Vehicle {
      id: string;
      plateNumber: string;
      type: VehicleType;
      capacityWeightKg: number;
      capacityVolumeM3: number;
      cargoDimensions: { lengthM: number; widthM: number; heightM: number };
      gpsTrackerId: string | null;
      status: 'available' | 'in_use' | 'maintenance' | 'retired';
      currentLocation: GpsPoint | null;
    }
    
    type VehicleType = 'pickup' | 'small_truck' | 'medium_truck' | 'large_truck' | 'trailer';
    
    interface DeliveryProof {
      id: string;
      shipmentId: string;
      orderId: string;
      deliveredTo: string;
      signatureUrl: string;
      photos: DeliveryPhoto[];
      notes: string;
      condition: 'good' | 'minor_damage' | 'major_damage' | 'refused';
      damageDetails: string | null;
      deliveredAt: Date;
      gpsLocation: GpsPoint;
    }
    
    interface DeliveryPhoto {
      url: string;
      caption: string;
      type: 'delivered' | 'damage' | 'location';
    }
    
[/code]

### 17.5 Integration กับ Modules อื่น

Module | ทิศทาง | รายละเอียด  
---|---|---  
Inventory (บทที่ 16) | Inbound | finished goods ย้ายเข้า shipping zone  
Installation (บทที่ 13) | Outbound | delivery completed → trigger installation job  
CRM (บทที่ 18) | Outbound | tracking info, ETA, delivery confirmation  
Quality Control (บทที่ 15) | Bidirectional | pre-delivery QC; damage → QC feedback  
After-Sales (บทที่ 22) | Outbound | damage documentation → warranty/claim  
Inter-Dept Communication (บทที่ 14) | Outbound | delay alerts, delivery status updates  
  
### 17.6 Role-Based Access Control (RBAC)

Role | สิทธิ์  
---|---  
Logistics Planner | สร้าง/แก้ไข shipments, routes, loading plans  
Driver | ดูงานส่ง, อัปเดตสถานะ, บันทึก POD, damage report  
Warehouse Loader | ดู loading plan, scan verify  
Logistics Manager | ดู fleet analytics, route efficiency, cost reports  
Customer (Portal) | ดู tracking page (read-only)  
  
### 17.7 Mobile/Responsive Design Considerations

  * **Driver app** : navigation, POD capture, damage report, status update
  * **Customer tracking link** : responsive web page ที่แชร์ผ่าน SMS/LINE
  * **Loading verification** : scan ด้วย mobile ณ จุด loading
  * **Offline POD** : บันทึก POD ได้แม้ offline → sync เมื่อออนไลน์



### 17.8 KPIs และ Metrics

KPI | คำอธิบาย | เป้าหมาย  
---|---|---  
On-Time Delivery Rate | % ส่งตรงตามนัด | ≥ 95%  
Delivery Damage Rate | % ของที่เสียหายจากการขนส่ง | ≤ 1%  
Vehicle Utilization Rate | % capacity ที่ใช้จริง | ≥ 80%  
Cost Per Delivery | ต้นทุนเฉลี่ยต่อจุดส่ง | ลดลง 15% จาก baseline  
Route Efficiency | actual distance vs optimal distance | ≤ 110% of optimal  
POD Completion Rate | % deliveries ที่มี POD ครบ | 100%  
  
### 17.9 อ้างอิงจากงานวิจัย

Liu et al. เน้นว่า cloud platform สามารถลดต้นทุน supply chain ของ furniture enterprises ได้โดยการ coordinate production และ logistics ข้ามหลาย manufacturing centers [4] Barni et al. แสดงให้เห็นว่าระบบ distributed production จำเป็นต้องมี logistics infrastructure ที่เชื่อม design area กับ manufacturing site ที่อยู่คนละที่ [2] Lü et al. ผสาน WMS เข้ากับ scheduling system ทำให้ logistics เป็นส่วนหนึ่งของ end-to-end workflow ไม่ใช่แค่กระบวนการแยกส่วน [1]
