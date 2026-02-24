# Parametric Cabinet Calculation Algorithms
# หลักการคำนวณและอัลกอริทึมสำหรับตู้เฟอร์นิเจอร์ระบบพารามิเตอร์

**Version:** 1.2
**Last Updated:** 2026-01-12
**Status:** Technical Reference
**Authors:** Manufacturing Engineering Team

---

> **Cross-References:**
> - [Master Hardware Database](../reference/master-hardware-database.md) - Hardware SKUs & specifications
> - [Formula Reference](../reference/formula-reference.md) - Consolidated calculation formulas
> - [Cross-Reference Index](../reference/cross-reference-index.md) - Document navigation
> - [Hardware Drilling Specifications](../manufacturing/hardware-drilling-specifications.md) - Drilling patterns
> - [Door & Drawer Complete Guide](../manufacturing/door-drawer-complete-guide.md) - Door/Drawer engineering
> - [Cut Optimization Algorithms](../manufacturing/cut-optimization-algorithms.md) - Sheet nesting
> - [Kerf Bending Algorithms](../manufacturing/kerf-bending-algorithms.md) - Curved panels

---

## บทนำ (Introduction)

เอกสารนี้เป็นคู่มืออ้างอิงทางวิศวกรรมสำหรับการคำนวณขนาดชิ้นส่วนตู้เฟอร์นิเจอร์ในระบบพารามิเตอร์ ครอบคลุมสูตรคำนวณ อัลกอริทึม และตรรกะการตัดสินใจที่จำเป็นสำหรับการผลิตที่แม่นยำ

This document serves as an engineering reference for calculating cabinet component dimensions in parametric systems, covering formulas, algorithms, and decision logic necessary for precision manufacturing.

### ความสำคัญของการแยกชิ้นส่วน (Importance of Decomposition)

หัวใจสำคัญของการเขียนโปรแกรมพารามิเตอร์คือการ **แยกส่วน (Decomposition)** - วัตถุสามมิติที่เราเห็นว่าเป็น "ไม้แผ่นหนึ่ง" ในความเป็นจริงทางวิศวกรรมประกอบด้วยเลเยอร์ข้อมูลหลายชั้นที่ซ้อนทับกัน:

- **แกนกลาง (Core)**: โครงสร้างรับน้ำหนัก
- **พื้นผิว (Surface)**: ความสวยงามและการปกป้อง
- **ขอบ (Edge)**: การปิดผนึกและความทนทาน

การคำนวณผิดพลาดเพียง 1 มิลลิเมตรสามารถส่งผลกระทบต่อเนื่อง (Ripple Effect) ทำให้ลิ้นชักปิดไม่ได้ หรือบานพับเกยกัน

---

## ส่วนที่ 1: กายวิภาคของวัสดุ (Material Anatomy)

### 1.1 แกนกลาง (Core Materials)

แกนกลางกำหนดความแข็งแรงเชิงโครงสร้างและความหนาหลักของชิ้นงาน

| วัสดุ | คุณสมบัติ | การใช้งาน | ความหนามาตรฐาน |
|-------|-----------|-----------|-----------------|
| **Particle Board (PB)** | ราคาประหยัด ความหนาแน่นสม่ำเสมอ | เฟอร์นิเจอร์น็อคดาวน์ | 16, 18, 25 mm |
| **MDF** | เนื้อเนียนละเอียด เหมาะกับการเซาะร่อง | งานพ่นสี งานแกะสลัก | 9, 12, 16, 18 mm |
| **Plywood** | แข็งแรงสูง ทนความชื้น | ตู้ครัว พื้นที่เปียกชื้น | 9, 12, 15, 18 mm |
| **HMR Green Board** | กันความชื้นพิเศษ | ตู้ครัว ห้องน้ำ | 18, 19 mm |

**นัยสำคัญทางพารามิเตอร์:**

ความหนาของแกนกลาง ($T_{core}$) **ไม่ใช่ค่าคงที่** แต่เป็นตัวแปรที่มีความผันผวน:

```typescript
// ❌ ไม่ควรทำ: Hard-coded value
const thickness = 18 // mm

// ✅ ควรทำ: Reference from database
const thickness = materialDatabase.getActualThickness("PB_18mm")
// อาจได้ค่า 18.5, 17.8, 18.2 mm ขึ้นอยู่กับผู้ผลิต
```

### 1.2 พื้นผิว (Surface Materials)

พื้นผิวปิดทับแกนกลางเพื่อความสวยงามและการปกป้อง การคำนวณขนาด "Core" ที่ถูกต้องจำเป็นต้องลบความหนาของ Surface ออกจากความหนารวม

#### Melamine Faced Chipboard (MFC)

```
T_total ≈ T_core
```

กระดาษเมลามีนเคลือบมาพร้อมกับแผ่นไม้ (~0.1mm) มักไม่แยกออกจากการคำนวณ

#### High Pressure Laminate (HPL)

```
T_total = T_core + T_surfaceFront + T_surfaceBack + T_glue
```

แผ่นลามิเนตแรงดันสูงหนา 0.7-1.0mm ต้องคำนวณแยก:

```typescript
const T_core = 16 // mm
const T_HPL = 0.8 // mm per side
const T_glue = 0.1 // mm per side
const T_total = T_core + (2 × T_HPL) + (2 × T_glue)
// = 16 + 1.6 + 0.2 = 17.8 mm
```

#### Veneer (วีเนียร์ไม้จริง)

ความหนาหลากหลาย 0.5-3.0mm ขึ้นอยู่กับประเภท:
- Sliced Veneer: 0.5-0.6mm
- Rotary Cut Veneer: 1.5-2.0mm
- Saw Cut Veneer: 3.0mm

**ผลกระทบต่อสูตรคำนวณ:**

| ประเภทวัสดุ | ความหนาต่อด้าน | ความหนารวมที่เพิ่ม | ผลกระทบ |
|-------------|----------------|-------------------|---------|
| Melamine (MFC) | ~0.1mm | ~0.2mm | น้อยมาก (มักรวมใน Core) |
| HPL (Standard) | 0.8mm | 1.6mm | สูง (ต้องคำนวณแยก) |
| Architectural Veneer | 0.6mm | 1.2mm | ปานกลาง |
| Acrylic Sheet | 1.0-2.0mm | 2.0-4.0mm | วิกฤต (ต้องปรับระยะรางลิ้นชัก) |

### 1.3 ขอบ (Edge Banding)

การปิดขอบคือการนำวัสดุแถบยาวมาปิดทับด้านข้างของแผ่นไม้ที่ถูกตัด ในระบบการผลิต **การตัดแผ่นไม้เกิดขึ้นก่อนการปิดขอบ** ดังนั้นขนาดที่ตัด (Cut Size) จะต้องเล็กกว่าขนาดจริง (Finish Size) เสมอ

#### สูตรการลดทอนขอบ (Edge Deduction Formula)

```
L_cut = L_finish - (E_top + E_bottom)
W_cut = W_finish - (E_left + E_right)
```

โดยที่:
- $L_{finish}, W_{finish}$: ความยาวและความกว้างที่ต้องการเมื่อเสร็จสมบูรณ์
- $L_{cut}, W_{cut}$: ความยาวและความกว้างที่เครื่องเลื่อยต้องตัด
- $E_{top}, E_{bottom}, E_{left}, E_{right}$: ความหนาของขอบในแต่ละด้าน (ถ้าไม่มี = 0)

#### ตัวอย่างกรณีศึกษา

**กรณีที่ 1: หน้าบานลิ้นชัก - ปิดขอบ PVC บาง (0.5mm) รอบตัว**

```
ขนาดเสร็จ: 600 × 200 mm
ขอบ PVC: 0.5 mm รอบตัว

W_cut = 600 - (0.5 + 0.5) = 599 mm
H_cut = 200 - (0.5 + 0.5) = 199 mm
```

**กรณีที่ 2: หน้าบานพรีเมียม - ปิดขอบ ABS หนา (2.0mm) รอบตัว**

```
ขนาดเสร็จ: 600 × 200 mm
ขอบ ABS: 2.0 mm รอบตัว

W_cut = 600 - (2.0 + 2.0) = 596 mm
H_cut = 200 - (2.0 + 2.0) = 196 mm
```

#### Pre-milling (การปาดผิว)

เครื่อง Edge Bander อาจมีการปาดผิวไม้เดิม (Pre-milling) 0.5-1.0mm เพื่อให้ขอบเรียบเนียนที่สุด

**⚠️ สิ่งสำคัญ:** Pre-milling เป็น **ขั้นตอนเครื่องจักร** ที่เกิดขึ้นระหว่างกระบวนการปิดขอบ **ไม่ใช่ค่าที่บวกเพิ่มในขนาดตัด**

```
Cut Size = Finish Size - Edge Thickness
```

Pre-milling เป็นเพียงพารามิเตอร์สำหรับอ้างอิง/แสดงผลในระบบ Manufacturing Parameters แต่ **ไม่มีผลต่อการคำนวณ Cut Size**

**สูตรมาตรฐาน (Standard Formula):**
```typescript
// Cut Size calculation - NO pre-milling added
cutWidth = finishWidth - leftEdgeThickness - rightEdgeThickness
cutHeight = finishHeight - topEdgeThickness - bottomEdgeThickness
```

#### ประเภทวัสดุขอบ (Edge Banding Types)

| ประเภท | ความหนา | คุณสมบัติ | การใช้งาน |
|--------|---------|-----------|-----------|
| PVC Thin | 0.5mm | ราคาถูก ยืดหยุ่น | งานทั่วไป |
| PVC Standard | 1.0mm | มาตรฐานอุตสาหกรรม | ตู้ครัว ตู้เสื้อผ้า |
| ABS Standard | 1.5mm | ทนทาน ไม่เป็นมลพิษ | งานคุณภาพสูง |
| ABS Premium | 2.0mm | ลบมุมมนได้ ดูพรีเมียม | หน้าบาน งานโชว์ |
| Solid Wood | 3.0-25mm | ไม้จริง สวยงามสุด | งานบิวท์อินชั้นสูง |

---

## ส่วนที่ 2: อัลกอริทึมโครงสร้างตู้ (Carcass Construction Algorithms)

### 2.1 ตัวแปรพื้นฐาน (Global Variables)

ทุกการคำนวณเริ่มจากตัวแปรภาพรวมของตู้:

```typescript
interface CabinetDimensions {
  W_cab: number  // ความกว้างตู้ (Cabinet Width) - mm
  H_cab: number  // ความสูงตู้ (Cabinet Height) - mm
  D_cab: number  // ความลึกตู้ (Cabinet Depth) - mm
  T_panel: number // ความหนาแผ่น (Panel Thickness) - mm
}
```

**ค่าทั่วไป:**
- Width: 600, 800, 900, 1000, 1200 mm
- Height: 720, 900, 1800, 2400 mm
- Depth: 350 (Wall), 560 (Base), 600 (Pantry) mm
- Thickness: 16, 18, 19 mm

### 2.2 แผ่นข้าง (Side Panels / Gables)

แผ่นข้างเป็นกระดูกสันหลังของตู้ โดยปกติจะมีความลึกเท่ากับความลึกตู้ (ในกรณีตู้เปิดโล่ง) หรือน้อยกว่าความลึกตู้รวมหน้าบาน (ในกรณีตู้มีบาน)

#### สูตรความสูงแผ่นข้าง (Side Panel Height)

**ตู้ลอย (Wall Cabinet):**
```
H_side = H_cab
```

**ตู้เตี้ย (Base Cabinet):**
```
H_side = H_cab - H_legs - H_countertop
```

โดยที่:
- $H_{legs}$: ความสูงขาตู้ (ค่าทั่วไป 100-150mm)
- $H_{countertop}$: ความหนาเคาน์เตอร์ท็อป (ค่าทั่วไป 25-40mm)

#### สูตรความลึกแผ่นข้าง (Side Panel Depth)

```
D_side = D_cab - T_door - G_bumper
```

โดยที่:
- $T_{door}$: ความหนาหน้าบาน (รวม Core + Surface)
- $G_{bumper}$: ระยะเผื่อเม็ดกันกระแทก (Silicone Bumper) = 1-2mm

**ตัวอย่าง:**
```
ตู้ครัวลึก 600 mm
หน้าบาน 20 mm (Core 16 + Surface 2 + Edge 2)
Bumper 1.5 mm
→ D_side = 600 - 20 - 1.5 = 578.5 mm
```

### 2.3 แผ่นพื้นและแผ่นท็อป (Deck & Top Panels)

การคำนวณความกว้างของแผ่นแนวนอนขึ้นอยู่กับวิธีการประกอบ (Construction Method)

#### วิธีที่ 1: แบบประกบข้าง (Between Sides / Dowel Construction)

แผ่นบนและล่างอยู่ **ระหว่าง** แผ่นข้าง - มาตรฐานยุโรป และเฟอร์นิเจอร์น็อคดาวน์

```
W_deck = W_cab - (T_side_left + T_side_right)
```

**ข้อดี:**
- ✅ ใช้สกรูดาวเล็ก (Confirmat) หรือหมุดไม้ (Dowel) ประกอบง่าย
- ✅ น้ำหนักกระจายตัวดี แผ่นข้างรับน้ำหนักโดยตรง
- ✅ เหมาะสำหรับการผลิตโรงงาน (Knock-down Furniture)

**ข้อเสีย:**
- ❌ ต้องมีความแม่นยำสูงในการเจาะรู
- ❌ สกรูดาวหัวจะโผล่ที่ผิวแผ่นข้าง (ต้องใช้ปลั๊กอุด)

#### วิธีที่ 2: แบบวางบน (On Top / Dado Construction)

แผ่นบนวางทับ **บนแผ่นข้าง** หรือฝังในร่อง - งานบิวท์อินคุณภาพสูง

```
W_deck = W_cab
```

แต่ความสูงของแผ่นข้างจะถูกลดทอนลง:
```
H_side = H_cab - T_top - T_bottom
```

**ข้อดี:**
- ✅ ไม่เห็นรอยต่อจากด้านหน้า สวยงาม
- ✅ แข็งแรงถ้าใช้ร่องลิ้น (Dado/Groove)
- ✅ เหมาะสำหรับงานบิวท์อิน ไม่ต้องถอดประกอบ

**ข้อเสีย:**
- ❌ ต้องใช้เครื่องเซาะร่อง (Router) เพิ่มขั้นตอนการผลิต
- ❌ น้ำหนักกดทับแผ่นข้างตรงๆ อาจทำให้โก่งถ้าไม้บาง

#### การเลือกวิธีการประกอบ (Construction Method Decision Logic)

```typescript
function selectConstructionMethod(
  cabinetType: string,
  material: string
): ConstructionMethod {

  if (cabinetType === "Base Cabinet" && material === "Plywood") {
    return "Dado" // แข็งแรง เหมาะกับครัว
  }

  if (cabinetType === "Wall Cabinet" && material === "Particle Board") {
    return "Dowel" // น้ำหนักเบา ผลิตง่าย
  }

  return "Dowel" // Default for knock-down furniture
}
```

### 2.4 แผ่นหลัง (Back Panel Systems)

แผ่นหลังไม่ได้มีหน้าที่แค่ปิดตู้ แต่ยังกำหนด:
1. **ความมุมฉาก (Squareness)**: ป้องกันตู้บิดเบี้ยว
2. **ความลึกภายในสุทธิ**: กำหนดขนาดแผ่นชั้นและลิ้นชัก
3. **การยึดแขวน**: ในตู้ลอยต้องรับน้ำหนักทั้งหมด

#### ระบบที่ 1: แบบแปะหลัง (Plant-on / Overlay)

ยิงสกรูหรือตะปูทับหลังโครงตู้

```
W_back = W_cab - (2 × Reveal)
H_back = H_cab - (2 × Reveal)
```

โดยที่ $Reveal$ = 1-2mm (เว้นขอบเพื่อไม่ให้แผ่นหลังยื่นออกมา)

**ข้อดี:** ✅ ติดตั้งง่ายที่สุด ราคาถูก ถอดเปลี่ยนได้ง่าย
**ข้อเสีย:** ❌ เห็นขอบแผ่นหลังจากด้านข้าง ❌ กินพื้นที่ความลึกตู้

#### ระบบที่ 2: แบบเซาะร่อง (Groove / Dado) ⭐ แนะนำ

ฝังแผ่นหลังเข้าไปในร่องของแผ่นข้าง แผ่นบน และแผ่นล่าง

```
W_back = W_internal + (2 × D_groove) - Tolerance
H_back = H_internal + (2 × D_groove) - Tolerance
```

โดยที่:
- $W_{internal}$: ความกว้างภายในตู้ (ระหว่างแผ่นข้างซ้าย-ขวา)
- $D_{groove}$: ความลึกร่อง (ค่าทั่วไป 8-10mm)
- $Tolerance$: ระยะเผื่อหลวม 0.5-1.0mm (เพื่อใส่แผ่นหลังได้ง่าย)

**การเซาะร่อง (Groove Parameters):**
- **ความกว้างร่อง:** $T_{back} + 0.5$ mm (เช่น แผ่นหลัง 6mm → ร่องกว้าง 6.5mm)
- **ระยะห่างจากขอบหลัง (Back Inset / Service Void):** 15-25mm

**ข้อดี:** ✅ สวยงาม ✅ แข็งแรง ✅ ไม่กินพื้นที่ความลึกตู้
**ข้อเสีย:** ❌ ต้องใช้เครื่อง Router ❌ คำนวณขนาดแม่นยำ ❌ ถอดเปลี่ยนยาก

#### ระบบที่ 3: แบบแขวน (Rail Suspension)

ใช้ในตู้ครัวแขวนผนัง แผ่นหลังหนา (16-19mm) และรับน้ำหนักทั้งหมด

```
W_back = W_internal (อยู่ระหว่างแผ่นข้าง)
H_back = H_internal
T_back = 16-19mm (ต้องทนแรงดึงจากตะขอ)
```

**ข้อดี:** ✅ แข็งแรงที่สุด ✅ ปรับระดับง่าย
**ข้อเสีย:** ❌ ราคาแพง ❌ ต้องติดตั้งโดยช่างมืออาชีพ

### 2.5 ผลกระทบของแผ่นหลังต่อความลึกภายใน

แผ่นหลังไม่ได้อยู่ชิดขอบหลังตู้ ทำให้ความลึกภายในจริง (Usable Depth) น้อยกว่าความลึกตู้

**สูตรคำนวณความลึกภายในสุทธิ:**

```
D_internal = D_side - I_back - T_back
```

โดยที่:
- $I_{back}$ (Back Inset / Service Void): ระยะจากขอบหลังตู้ถึงผิวหลังของแผ่นหลัง
  - **ค่าทั่วไป:** 20mm
  - **งานบิวท์อินชั้นสูง:** 25mm
- $T_{back}$: ความหนาแผ่นหลัง
  - **ไม้อัดบาง:** 3-6mm
  - **HMR Board:** 16mm (สำหรับตู้แขวน)

**ตัวอย่าง:**
```
ตู้ลึก 600mm
หน้าบาน 20mm
Bumper 1.5mm
→ D_side = 600 - 20 - 1.5 = 578.5mm

แผ่นหลังหนา 6mm
Service Void 20mm
→ D_internal = 578.5 - 20 - 6 = 552.5mm
```

นี่คือพื้นที่ว่างสำหรับแผ่นชั้นและลิ้นชัก

---

## ส่วนที่ 3: ระยะถอยหลังแผ่นชั้น (Shelf Setback Algorithm) ⭐

### 3.1 นิยามของปัญหา (Problem Definition)

แผ่นชั้น (Adjustable Shelf) ต้องเล็กกว่าความลึกภายในตู้เพื่อ:

1. **ไม่ชนแผ่นหลัง**: ป้องกันแผ่นหลังหลุดจากร่อง
2. **หลบบานพับ**: บานพับยื่นเข้ามาในตู้ 15-20mm
3. **ระบายอากาศ**: เหลือช่องว่างด้านหลังและหน้า

การคำนวณต้องพิจารณาทั้ง **ระยะร่นหน้า (Front Setback)** และ **ระยะร่นหลัง (Rear Setback)**

### 3.2 สูตรหลัก (Master Formula)

```
D_shelf = D_internal_available - S_front - S_rear
```

โดยที่:

#### $D_{internal\_available}$ (ความลึกภายในสุทธิ):

```
D_internal_available = D_side - I_back - T_back
```

#### $S_{front}$ (Front Setback / ระยะร่นหน้า):

| สถานการณ์ | ค่าทั่วไป | เหตุผล |
|-----------|-----------|---------|
| **ตู้มีบานพับทั่วไป** | 20-25mm | หลบบานพับยื่นเข้ามา 15-20mm |
| **ตู้บานกระจก** | 15mm | บานกระจกบางกว่า หลบน้อยลง |
| **ตู้เปิดโล่ง** | 10mm | เว้นแค่เงา (Shadow Line) |

#### $S_{rear}$ (Rear Setback / ระยะร่นหลัง):

| สถานการณ์ | ค่าทั่วไป | เหตุผล |
|-----------|-----------|---------|
| **ตู้ทั่วไป (Particle Board)** | 10mm | เผื่อแผ่นหลังโก่ง + ระบายอากาศ |
| **ตู้กระจก/ไฟ LED** | 20mm | ให้แสงไฟส่องผ่านลงด้านล่างได้ |
| **ตู้เครื่องใช้ไฟฟ้า (Built-in)** | 50-100mm | ระบายความร้อน + สายไฟ |
| **ตู้เสื้อผ้า (ไม่มีแผ่นหลัง)** | 0mm | ไม่มีแผ่นหลัง ใช้ผนังเป็นหลัง |

### 3.3 ทำไมต้องเว้นระยะร่นหลัง?

การกำหนดให้แผ่นชั้นชนแผ่นหลังพอดี ($S_{rear} = 0$) เป็นข้อผิดพลาดร้ายแรง:

1. **ความคลาดเคลื่อนของแผ่นหลัง (Bowing)**: แผ่นหลังไม้อัดบาง (3-4mm) มักโก่งตัวเข้ามาในตู้ หากแผ่นชั้นพอดีเกินไป จะดันแผ่นหลังให้หลุดจากร่อง

2. **การไหลเวียนอากาศ (Airflow)**: ในตู้เสื้อผ้า หากเสื้อผ้าอัดแน่นจนไม่มีช่องว่างด้านหลัง จะเกิดกลิ่นอับ การเว้นระยะ 10mm ช่วยให้อากาศไหลเวียนจากล่างขึ้นบน

3. **ฝุ่นและเศษไม้**: ในร่องเซาะมักมีกาวหรือขี้เลื่อยตกค้าง การเว้นระยะช่วยให้ประกอบงานได้โดยไม่ต้องทำความสะอาดร่องจนเนี๊ยบกริบ

### 3.4 ตัวอย่างการคำนวณแบบละเอียด

#### สถานการณ์: ตู้ล่างครัว (Base Cabinet)

**ข้อมูลตู้:**
```
ความลึกตู้รวมหน้าบาน (D_cab): 600mm
ความหนาหน้าบาน (T_door): 20mm
ระยะ Bumper (G_bumper): 1.5mm
```

**ข้อมูลแผ่นหลัง:**
```
ความหนาแผ่นหลัง (T_back): 6mm (ไม้อัดบาง)
Service Void (I_back): 20mm
ระบบแผ่นหลัง: Groove (ฝังร่อง 8mm)
```

**ขั้นตอนการคำนวณ:**

**1. คำนวณความลึกแผ่นข้าง:**
```
D_side = D_cab - T_door - G_bumper
D_side = 600 - 20 - 1.5 = 578.5mm
```

**2. คำนวณความลึกภายในสุทธิ:**
```
D_internal = D_side - I_back - T_back
D_internal = 578.5 - 20 - 6 = 552.5mm
```

**3. กำหนดระยะร่น (Setbacks):**
```
S_front = 20mm (หลบบานพับ Blum Compact 33)
S_rear = 10mm (เผื่อแผ่นหลังโก่ง + ระบายอากาศ)
```

**4. คำนวณความลึกแผ่นชั้น (Finished Size):**
```
D_shelf_finish = D_internal - S_front - S_rear
D_shelf_finish = 552.5 - 20 - 10 = 522.5mm
```

**5. คำนวณขนาดตัด (Cut Size):**
```
สมมติปิดขอบ PVC 1mm เฉพาะด้านหน้า:
D_shelf_cut = D_shelf_finish - E_front
D_shelf_cut = 522.5 - 1.0 = 521.5mm
```

**6. ความกว้างแผ่นชั้น:**
```
ตู้กว้าง (W_cab): 800mm
แผ่นข้างหนา (T_side): 18mm
Construction: Between Sides (Dowel)

W_shelf_finish = W_cab - (2 × T_side) - (2 × Gap)
W_shelf_finish = 800 - 36 - 1 = 763mm

ปิดขอบซ้าย-ขวา 1mm:
W_shelf_cut = 763 - 2 = 761mm
```

**✅ สรุปขนาดแผ่นชั้นสั่งตัด:**
- **ความกว้าง (W):** 761mm
- **ความลึก (D):** 521.5mm
- **ความหนา (T):** 18mm
- **ปิดขอบ:** หน้า + ซ้าย + ขวา (PVC 1mm)

### 3.5 กรณีพิเศษ (Special Cases)

#### กรณีที่ 1: ตู้ไม่มีแผ่นหลัง (No Back Panel)

ใช้กับตู้บิวท์อินที่ยึดติดผนังโดยตรง

```
D_internal = D_side (ไม่ต้องหัก T_back และ I_back)
D_shelf = D_internal - S_front - S_rear_wall
```

โดยที่ $S_{rear\_wall}$ = 15-20mm (เผื่อความไม่เรียบของผนัง)

#### กรณีที่ 2: แผ่นชั้นยาว > 900mm (Long Span)

แผ่นชั้นยาวจะโก่งตัวตรงกลาง ต้องเพิ่ม:
- **ตัวค้ำตรงกลาง (Center Support)**: เสาไม้ตรงกลางตู้
- **ขอบแข็ง (Edge Stiffener)**: ปิดขอบหน้าหนา 25-30mm

```typescript
if (W_shelf > 900) {
  S_front = 30 // mm (เพื่อมีพื้นที่ติดขอบแข็ง)
}
```

#### กรณีที่ 3: แผ่นชั้นแก้ว (Glass Shelf)

แผ่นแก้วหนา 8-10mm มีน้ำหนักมาก และไม่สามารถตัดได้ง่าย

```
D_glass = D_internal - S_front - S_rear - Holder_depth
```

โดยที่ $Holder_{depth}$ = 5-10mm (ความลึกตัวหนีบแก้ว)

**⚠️ หมายเหตุ:** แก้วต้องสั่งตัดจากร้านตัดกระจกล่วงหน้า ไม่สามารถปรับขนาดในไซต์งานได้

---

## ส่วนที่ 4: หน้าบานและลิ้นชัก (Door & Drawer Calculations)

### 4.1 สูตรคำนวณหน้าบาน (Door Sizing)

#### บานทับขอบ (Full Overlay) - มาตรฐาน

```
W_door = W_cab - (2 × Gap_side)
H_door = H_cab - Gap_top - Gap_bottom
```

**ค่า Gap มาตรฐาน:**
- $Gap_{side}$: 1.5-2.0mm
- $Gap_{top}$, $Gap_{bottom}$: 2.0mm

**กรณีตู้บานคู่ (Double Door):**
```
W_door_each = (W_cab - Gap_center) / 2 - Gap_side
```

โดยที่ $Gap_{center}$ = 3.0mm (ช่องไฟกลาง)

#### บานทับครึ่ง (Half Overlay)

ใช้กับตู้ที่มีฝาผนังกลาง (Center Panel)

```
W_door = (W_opening / 2) + Overlay_amount - Gap_side
```

โดยที่ $Overlay_{amount}$ = 9-12mm (ขึ้นอยู่กับบานพับ)

#### บานเฝือง (Inset Door)

หน้าบานฝังอยู่ภายในกรอบตู้ - งานช่างชั้นสูง

```
W_door = W_opening - (2 × Reveal)
H_door = H_opening - (2 × Reveal)
```

โดยที่ $Reveal$ = 2.0-3.0mm (ช่องไฟรอบบาน)

**⚠️ ข้อควรระวัง:** ต้องใช้บานพับพิเศษ (Inset Hinge) และตู้ต้องฉากเป๊ะ

### 4.2 การจัดการวัสดุขอบหน้าบาน

หน้าบานมักใช้ขอบหนา (2.0mm ABS) เพื่อดูพรีเมียม ทนทาน และลบมุมมนได้

**สูตรขนาดตัด:**
```
W_door_cut = W_door_finish - (2 × E_thickness)
H_door_cut = H_door_finish - (2 × E_thickness)
```

**ตัวอย่าง:**
```
หน้าบานเสร็จ: 596 × 716mm
ขอบ ABS: 2.0mm รอบตัว
→ ขนาดตัด: 592 × 712mm
```

### 4.3 กล่องลิ้นชัก (Drawer Box Calculations)

#### ความกว้างกล่องลิ้นชัก

ขึ้นอยู่กับ **รางเลื่อน (Drawer Slide)** ที่ใช้

**รางลูกปืนทั่วไป (Ball Bearing Full Extension):**
```
W_drawer = W_internal - (2 × Clearance_runner)
```

โดยที่ $Clearance_{runner}$ = 12.7mm (รางมาตรฐาน 1/2 นิ้ว)

**รางซ่อน (Undermount - Blum Tandem):**
```
W_drawer = W_internal - Adjustment_range
```

โดยที่ $Adjustment_{range}$ = 10-15mm (ขึ้นอยู่กับรุ่น)

#### ความลึกกล่องลิ้นชัก

ต้องสัมพันธ์กับ **ความยาวราง (Nominal Length: NL)**

**ความยาวรางมาตรฐาน:** 250, 300, 350, 400, 450, 500, 550, 600mm

**กฎการเลือก:**
```
D_drawer = NL
NL = D_internal - Safety_margin
```

โดยที่ $Safety_{margin}$ = 50-70mm

**ตัวอย่าง:**
```
ตู้ลึกภายใน: 552.5mm
Safety Margin: 60mm
→ NL_max = 492.5mm
→ เลือกราง NL = 450mm (ใกล้เคียงที่สุดแต่ไม่เกิน)
→ D_drawer = 450mm
```

#### การแบ่งความสูงลิ้นชัก

เมื่อมีลิ้นชัก $N$ ชั้น ในช่องความสูง $H_{opening}$

**สูตร:**
```
H_front = (H_opening - ((N - 1) × Gap_reveal)) / N
```

โดยที่ $Gap_{reveal}$ = 2.0-3.0mm

**ตัวอย่าง:**
```
ช่องลิ้นชักสูง: 600mm
จำนวนลิ้นชัก: 4 ชั้น
Gap: 3mm

H_front = (600 - ((4-1) × 3)) / 4
H_front = (600 - 9) / 4 = 147.75mm
ปัดเป็น: 148mm
```

---

## ส่วนที่ 5: การนำไปใช้งานจริง (Implementation)

### 5.1 โครงสร้างข้อมูล (Data Structure)

```typescript
interface PanelSpec {
  // Identification
  partId: string           // "SH-001"
  partName: string         // "Adjustable Shelf"
  cabinetId: string        // "CAB-001"

  // Dimensions (Finished Size)
  dimensions: {
    width: number          // 763mm
    depth: number          // 522.5mm
    thickness: number      // 18mm
  }

  // Material Stack
  material: {
    core: {
      type: string         // "Particle_Board_18mm"
      supplier: string     // "Vanachai"
      costPerSqm: number   // 450 THB
    }
    surface: {
      faceA: string        // "Melamine_White"
      faceB: string        // "Melamine_White"
      thickness: number    // 0 (included in core)
    }
    edgeBanding: {
      front: { type: string, thickness: number }
      rear: { type: string, thickness: number }
      left: { type: string, thickness: number }
      right: { type: string, thickness: number }
    }
  }

  // Cut Dimensions (for Manufacturing)
  cutDimensions: {
    width: number          // 761mm (after edge deduction)
    depth: number          // 521.5mm (after edge deduction)
    thickness: number      // 18mm (same)
  }

  // Metadata
  quantity: number         // 2 (shelves)
  notes: string            // "Edge 3 sides, no rear edge"
}
```

### 5.2 Validation Rules

```typescript
function validateShelfClearance(
  shelf: PanelSpec,
  cabinet: Cabinet
): ValidationResult {

  const internalDepth = calculateInternalDepth(cabinet)
  const requiredClearance = FRONT_SETBACK + REAR_SETBACK

  if (shelf.dimensions.depth > (internalDepth - requiredClearance)) {
    return {
      valid: false,
      error: "Shelf too deep - will hit back panel",
      maxAllowedDepth: internalDepth - requiredClearance
    }
  }

  return { valid: true }
}

const FRONT_SETBACK = 20  // mm
const REAR_SETBACK = 10   // mm
```

### 5.3 Pseudocode สำหรับ Shelf Calculation

```typescript
function calculateShelfDimensions(
  cabinet: Cabinet,
  backPanelConfig: BackPanelConfig,
  shelfType: ShelfType
): ShelfDimensions {

  // 1. คำนวณความลึกแผ่นข้าง
  const D_side = cabinet.depth - cabinet.doorThickness - BUMPER_GAP

  // 2. คำนวณความลึกภายในสุทธิ
  let D_internal: number
  if (backPanelConfig.type === "None") {
    D_internal = D_side
  } else {
    D_internal = D_side - backPanelConfig.inset - backPanelConfig.thickness
  }

  // 3. กำหนดระยะร่นหน้า
  const S_front = getfrontSetback(cabinet.doorType)

  // 4. กำหนดระยะร่นหลัง
  const S_rear = getRearSetback(shelfType)

  // 5. คำนวณความลึกแผ่นชั้น (Finished Size)
  const D_shelf_finish = D_internal - S_front - S_rear

  // 6. คำนวณความกว้างแผ่นชั้น
  let W_shelf_finish: number
  if (cabinet.constructionMethod === "BetweenSides") {
    W_shelf_finish = cabinet.width - (2 * cabinet.sideThickness) - SHELF_GAP
  } else {
    W_shelf_finish = cabinet.width - SHELF_GAP
  }

  // 7. คำนวณขนาดตัด (Cut Size)
  // Cut Size = Finish Size - Edge Thicknesses (no pre-milling added)
  const edgeThickness = getEdgeThickness(shelfType)
  const D_shelf_cut = D_shelf_finish - edgeThickness.front - edgeThickness.rear
  const W_shelf_cut = W_shelf_finish - edgeThickness.left - edgeThickness.right

  return {
    finishedDimensions: {
      width: W_shelf_finish,
      depth: D_shelf_finish,
      thickness: cabinet.panelThickness
    },
    cutDimensions: {
      width: W_shelf_cut,
      depth: D_shelf_cut,
      thickness: cabinet.panelThickness
    },
    edgeBanding: {
      front: edgeThickness.front > 0,
      rear: edgeThickness.rear > 0,
      left: edgeThickness.left > 0,
      right: edgeThickness.right > 0
    }
  }
}

// Helper Functions
function getAdj(doorType: string): number {
  const setbacks = {
    "Hinged": 20,
    "Glass": 15,
    "Open": 10
  }
  return setbacks[doorType] || 20
}

function getRearSetback(shelfType: string): number {
  const setbacks = {
    "Standard": 10,
    "LED_Lighting": 20,
    "Appliance": 50
  }
  return setbacks[shelfType] || 10
}

// Constants
const BUMPER_GAP = 1.5  // mm
const SHELF_GAP = 1.0   // mm
```

---

## ภาคผนวก A: Manufacturing Constants

| Constant | Value | Unit | Description |
|----------|-------|------|-------------|
| `BUMPER_GAP` | 1.5 | mm | ระยะเผื่อเม็ดกันกระแทก |
| `SHELF_GAP` | 1.0 | mm | ระยะห่างแผ่นชั้นจากแผ่นข้าง |
| `FRONT_SETBACK` | 20 | mm | ระยะร่นหน้าแผ่นชั้น (Standard) |
| `REAR_SETBACK` | 10 | mm | ระยะร่นหลังแผ่นชั้น (Standard) |
| `BACK_INSET` | 20 | mm | ระยะ Service Void ด้านหลัง |
| `DOOR_GAP_SIDE` | 2.0 | mm | ช่องไฟข้างหน้าบาน |
| `DOOR_GAP_VERTICAL` | 2.0 | mm | ช่องไฟบน-ล่างหน้าบาน |
| `DRAWER_GAP` | 3.0 | mm | ช่องไฟระหว่างลิ้นชัก |
| `RUNNER_CLEARANCE` | 12.7 | mm | ระยะหักออกสำหรับรางลิ้นชัก |

---

## ภาคผนวก B: Troubleshooting Guide

### ปัญหา: แผ่นชั้นใส่ไม่เข้า (Shelf won't fit)

**สาเหตุที่เป็นไปได้:**
1. ✗ ลืมหัก Edge Thickness → แผ่นชั้นกว้างเกินไป
2. ✗ คำนวณ Internal Width ผิด → ใช้ $W_{cab}$ แทน $W_{internal}$
3. ✗ Service Void ไม่พอ → แผ่นหลังยื่นเข้ามามากเกินไป

**วิธีแก้:**
```typescript
const expectedCutWidth = finishedWidth - (edgeLeft + edgeRight)
if (actualCutWidth !== expectedCutWidth) {
  console.error("Edge deduction error!")
}
```

### ปัญหา: แผ่นชั้นชนแผ่นหลัง (Shelf hits back panel)

**สาเหตุ:**
- ✗ $S_{rear}$ น้อยเกินไป หรือเป็น 0
- ✗ แผ่นหลังโก่งเข้ามาด้านใน (Bowing)

**วิธีแก้:**
```typescript
const S_rear = 10 // mm minimum
const D_shelf = D_internal - S_front - S_rear
```

### ปัญหา: หน้าบานปิดไม่สนิท (Door won't close)

**สาเหตุ:**
- ✗ แผ่นชั้นยื่นออกมาด้านหน้าเกินไป
- ✗ $S_{front}$ น้อยกว่าความยื่นของบานพับ

**วิธีแก้:**
```typescript
const hingeProtrusion = getHingeProtrusion(hingeType) // 20mm
const S_front = hingeProtrusion + 3 // เผื่อเพิ่ม 3mm
```

---

## ส่วนที่ 6: การคำนวณต้นทุนและการเพิ่มประสิทธิภาพ (Cost Calculation & Optimization)

### 6.1 สูตรคำนวณต้นทุนวัสดุ (Material Cost Calculation)

การคำนวณต้นทุนต้องแยกตามเลเยอร์วัสดุ เพราะแต่ละส่วนมีหน่วยวัดและราคาต่างกัน

#### สูตรต้นทุนต่อชิ้น (Cost per Panel)

```typescript
function calculatePanelCost(panel: PanelSpec): PanelCost {
  // 1. คำนวณพื้นที่ตัด (ตารางเมตร)
  const areaM2 = (panel.cutDimensions.width / 1000) *
                 (panel.cutDimensions.depth / 1000)

  // 2. ต้นทุน Core (ราคาต่อ m²)
  const coreCost = areaM2 * panel.material.core.costPerSqm

  // 3. ต้นทุน Surface (ถ้ามีการติด HPL/Veneer แยก)
  let surfaceCost = 0
  if (panel.material.surface.type !== "None" &&
      panel.material.surface.type !== "Melamine") {
    // HPL หรือ Veneer ติดทั้ง 2 ด้าน
    surfaceCost = areaM2 * panel.material.surface.costPerSqm * 2
  }

  // 4. ต้นทุนขอบ (ราคาต่อเมตร)
  const perimeter = 2 * (panel.cutDimensions.width + panel.cutDimensions.depth)
  const edgeCost = calculateEdgeCost(panel.material.edgeBanding, perimeter)

  // 5. ต้นทุนแรงงาน (Operation Cost)
  const laborCost = calculateLaborCost(panel.operations)

  return {
    material: {
      core: coreCost,
      surface: surfaceCost,
      edge: edgeCost
    },
    labor: laborCost,
    total: coreCost + surfaceCost + edgeCost + laborCost
  }
}
```

#### การคำนวณต้นทุนขอบ (Edge Cost Calculation)

```typescript
function calculateEdgeCost(
  edgeBanding: EdgeBandingSpec,
  perimeter: number
): number {
  let totalEdgeLength = 0

  // นับเฉพาะด้านที่มีการปิดขอบ
  if (edgeBanding.front.type !== "None") {
    totalEdgeLength += perimeter / 2 // สมมติว่าหน้าคือด้านกว้าง
  }
  if (edgeBanding.rear.type !== "None") {
    totalEdgeLength += perimeter / 2
  }
  if (edgeBanding.left.type !== "None") {
    totalEdgeLength += perimeter / 2
  }
  if (edgeBanding.right.type !== "None") {
    totalEdgeLength += perimeter / 2
  }

  const edgeCostPerMeter = getEdgeCostPerMeter(edgeBanding.front.type)
  return (totalEdgeLength / 1000) * edgeCostPerMeter
}

function getEdgeCostPerMeter(edgeType: string): number {
  const priceMap: Record<string, number> = {
    "PVC_0.5mm": 8,      // THB per meter
    "PVC_1.0mm": 12,
    "ABS_2.0mm": 25,
    "Acrylic_3mm": 80
  }
  return priceMap[edgeType] || 0
}
```

#### ตัวอย่างการคำนวณต้นทุน

**แผ่นชั้น 800 × 520 × 18mm**
```
ขนาดตัด: 761 × 521.5mm
พื้นที่: 0.397 m²

ต้นทุน Core (PB 18mm @ 450 THB/m²):
  = 0.397 × 450 = 178.65 THB

ต้นทุนขอบ (PVC 1mm @ 12 THB/m):
  ปิด 3 ด้าน: (761 + 521.5 + 521.5) / 1000 = 1.804 m
  = 1.804 × 12 = 21.65 THB

ต้นทุนแรงงาน (เลื่อย + ปิดขอบ):
  = 15 + 20 = 35 THB

รวมทั้งหมด: 178.65 + 21.65 + 35 = 235.30 THB
```

### 6.2 Cut Optimization (การจัดเรียงชิ้นงานบนแผ่นไม้)

แผ่นไม้ขายเป็นแผ่นใหญ่ขนาดมาตรฐาน (เช่น 2440 × 1220mm) ต้องหาวิธีจัดชิ้นงานเล็กลงไปบนแผ่นใหญ่ให้เสียพื้นที่น้อยที่สุด

#### อัลกอริทึม: Guillotine Cut

```typescript
interface Sheet {
  width: number    // 2440mm
  height: number   // 1220mm
  material: string
}

interface CutPiece {
  width: number
  height: number
  quantity: number
  partId: string
}

function optimizeCutLayout(
  pieces: CutPiece[],
  sheet: Sheet
): CutLayout {
  // 1. เรียงชิ้นงานจากใหญ่ไปเล็ก (Largest First)
  const sortedPieces = pieces.sort((a, b) =>
    (b.width * b.height) - (a.width * a.height)
  )

  // 2. ใช้ Guillotine Algorithm
  const layout = guillotineCut(sortedPieces, sheet)

  // 3. คำนวณ Waste (เศษเหลือ)
  const usedArea = layout.pieces.reduce((sum, p) =>
    sum + (p.width * p.height * p.quantity), 0
  )
  const sheetArea = sheet.width * sheet.height
  const wastePercentage = ((sheetArea - usedArea) / sheetArea) * 100

  return {
    pieces: layout.pieces,
    wastePercentage: wastePercentage,
    numberOfSheets: layout.numberOfSheets
  }
}

// Simplified Guillotine Cut Algorithm
function guillotineCut(pieces: CutPiece[], sheet: Sheet): CutLayout {
  // คำนวณจำนวนแผ่นที่ต้องใช้
  const totalArea = pieces.reduce((sum, p) =>
    sum + (p.width * p.height * p.quantity), 0
  )
  const sheetArea = sheet.width * sheet.height

  // สมมติประสิทธิภาพ 85% (15% เป็น waste ปกติ)
  const numberOfSheets = Math.ceil(totalArea / (sheetArea * 0.85))

  return {
    pieces: pieces, // พร้อมตำแหน่ง (x, y) ของแต่ละชิ้น
    numberOfSheets: numberOfSheets
  }
}
```

**หมายเหตุ:** ในการผลิตจริง มักใช้ซอฟต์แวร์เฉพาะทาง เช่น:
- **Cut Rite** (Homag)
- **OptiCut** (SCM)
- **Cabinet Vision** (Hexagon)

### 6.3 การแสดงผล 3D: Edge Banding Visualization

การเรนเดอร์ภาพตู้พารามิเตอร์บนเว็บ (React Three Fiber) มีความท้าทายเรื่องการแสดงขอบ (Edge Banding) ที่มีสีต่างจากหน้าบาน

#### ปัญหา

โมเดล 3D ทั่วไป (BoxGeometry) มีพื้นผิวเดียว การจะแสดงขอบที่มีสีต่างจากหน้าบานทำได้ยาก

#### วิธีแก้ปัญหาที่ 1: Multi-Material Mesh

กำหนด `materialIndex` ให้กับแต่ละหน้า (Face) ของกล่องสี่เหลี่ยม

```tsx
import { useMemo } from 'react'
import { BoxGeometry, MeshStandardMaterial } from 'three'

function PanelWithEdge({
  width,
  depth,
  thickness,
  coreMaterial,
  edgeMaterial
}) {
  const geometry = useMemo(() => {
    const geo = new BoxGeometry(width, thickness, depth)

    // กำหนด materialIndex สำหรับแต่ละหน้า
    // Face 0-1: ด้านหน้า/หลัง (Core)
    // Face 2-3: ด้านบน/ล่าง (Core)
    // Face 4-5: ด้านซ้าย/ขวา (Edge)

    const groups = geo.groups
    groups[0].materialIndex = 0 // Front - Core
    groups[1].materialIndex = 0 // Back - Core
    groups[2].materialIndex = 0 // Top - Core
    groups[3].materialIndex = 0 // Bottom - Core
    groups[4].materialIndex = 1 // Left - Edge
    groups[5].materialIndex = 1 // Right - Edge

    return geo
  }, [width, depth, thickness])

  const materials = useMemo(() => [
    new MeshStandardMaterial({
      map: coreMaterial.texture,
      color: coreMaterial.color
    }),
    new MeshStandardMaterial({
      map: edgeMaterial.texture,
      color: edgeMaterial.color
    })
  ], [coreMaterial, edgeMaterial])

  return <mesh geometry={geometry} material={materials} />
}
```

#### วิธีแก้ปัญหาที่ 2: Shader Technique (ประหยัด Performance)

ใช้ Fragment Shader วาดเส้นขอบจำลองบนพื้นผิวเดิม เพื่อลดจำนวน Polygon

```glsl
// Fragment Shader - Edge Banding Simulation
uniform sampler2D coreTexture;
uniform sampler2D edgeTexture;
uniform float edgeThickness; // 1.0mm = 0.001 in shader units

varying vec2 vUv;
varying vec3 vPosition;

void main() {
  vec3 panelSize = vec3(0.8, 0.018, 0.52); // Width, Thickness, Depth in meters

  // คำนวณระยะจากขอบแผ่นไม้
  float distFromLeftEdge = vPosition.x - (-panelSize.x / 2.0);
  float distFromRightEdge = (panelSize.x / 2.0) - vPosition.x;
  float distFromFrontEdge = (panelSize.z / 2.0) - vPosition.z;
  float distFromBackEdge = vPosition.z - (-panelSize.z / 2.0);

  float minDist = min(
    min(distFromLeftEdge, distFromRightEdge),
    min(distFromFrontEdge, distFromBackEdge)
  );

  // ถ้าอยู่ในเขต Edge Banding (ภายใน edgeThickness)
  if (minDist < edgeThickness) {
    // ใช้ texture ของขอบ
    gl_FragColor = texture2D(edgeTexture, vUv);
  } else {
    // ใช้ texture ของ Core
    gl_FragColor = texture2D(coreTexture, vUv);
  }
}
```

**ข้อดีของ Shader Technique:**
- ✅ ประหยัด Polygon (1 Box แทน Multiple Meshes)
- ✅ ประหยัด Draw Calls
- ✅ ปรับความหนาขอบแบบ Real-time ได้

**ข้อเสีย:**
- ❌ ซับซ้อนกว่าการใช้ Multi-Material
- ❌ ต้องเขียน Custom Shader

---

## สรุป (Conclusion)

เอกสารนี้นำเสนอสูตรคำนวณและอัลกอริทึมสำหรับการออกแบบตู้เฟอร์นิเจอร์ระบบพารามิเตอร์ โดยเฉพาะอย่างยิ่ง **ระยะถอยหลังแผ่นชั้น (Shelf Setback)** ซึ่งเป็นตัวแปรสำคัญที่มีผลต่อการประกอบและความทนทานของตู้

### จุดสำคัญ (Key Takeaways):

1. **ระยะถอยหลังไม่ใช่ค่าคงที่** แต่เป็นตัวแปรที่ขึ้นอยู่กับ:
   - ประเภทตู้ (Base / Wall / Open)
   - ระบบแผ่นหลัง (Groove / Overlay / None)
   - ฟังก์ชันการใช้งาน (LED / Appliance / Standard)

2. **สูตรหลัก:**
   ```
   D_shelf = D_internal - S_front - S_rear
   D_internal = D_side - I_back - T_back
   ```

3. **ค่าแนะนำ:**
   - $S_{front}$ = 20mm (หลบบานพับ)
   - $S_{rear}$ = 10mm (เผื่อแผ่นหลังโก่ง + ระบายอากาศ)
   - $I_{back}$ = 20mm (Service Void)

4. **การ Validate:** ต้องตรวจสอบทุกครั้งก่อนส่งออก CNC:
   - Edge deduction ถูกต้อง
   - Clearance เพียงพอ
   - ไม่เกินขนาดเครื่องจักร

การนำสูตรเหล่านี้ไปใช้จะช่วยลดความผิดพลาดในการผลิต เพิ่มความแม่นยำ และยกระดับคุณภาพเฟอร์นิเจอร์ให้ทัดเทียมมาตรฐานสากล

---

## 3D Rendering Technical Notes

### Edge Band Z-Fighting Prevention

เมื่อแสดงผล Edge Band บน 3D Panel จะเกิดปัญหา **Z-fighting** (การกระพริบสลับระหว่าง texture) เนื่องจาก Edge Band mesh อยู่ในระดับ depth เดียวกับ Panel surface

#### สาเหตุ
- Edge Band strip position: `panel.finishWidth/2 - et/2`
- Edge Band outer face: `panel.finishWidth/2 - et/2 + et/2 = panel.finishWidth/2`
- Panel surface: `panel.finishWidth/2`
- ทั้งสองอยู่ที่ Z-depth เดียวกัน → GPU สลับแสดงผลแบบสุ่ม

#### วิธีแก้ไข
ใช้ `polygonOffset` บน Edge Band material เพื่อเลื่อน depth ใน GPU buffer:

```typescript
// src/components/canvas/Cabinet3D.tsx
<meshStandardMaterial
  map={edgeBandTexture}
  color={strip.color}
  roughness={0.3}
  metalness={0.02}
  polygonOffset={true}
  polygonOffsetFactor={-1}
  polygonOffsetUnits={-1}
/>
```

#### ค่า polygonOffset
| Parameter | Value | Effect |
|-----------|-------|--------|
| `polygonOffset` | `true` | เปิดใช้งาน polygon offset |
| `polygonOffsetFactor` | `-1` | เลื่อน depth ตาม slope |
| `polygonOffsetUnits` | `-1` | เลื่อน depth คงที่ |

ค่า negative (-1) ทำให้ Edge Band แสดงผล "ด้านหน้า" Panel surface ใน depth buffer

---

**เอกสารอ้างอิง (References):**
- European Kitchen Cabinet Standards (32mm System)
- Blum Hinge Installation Guide
- Woodworking Industry Standards (WI)
- CNC Manufacturing Best Practices
- Thai Furniture Manufacturing Association Guidelines
