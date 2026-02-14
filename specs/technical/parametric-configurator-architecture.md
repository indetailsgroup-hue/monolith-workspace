# รายงานการวิจัยฉบับสมบูรณ์: สถาปัตยกรรมระบบ 3D Configurator แบบ Parametric สำหรับงานเฟอร์นิเจอร์ใน React Three Fiber

**Project:** MONOLITH Designer Workspace v2.0
**Document Version:** 1.0
**Date:** 2026-01-10
**Status:** Active
**Document Type:** Technical Research Report
**Classification:** Advanced Engineering Guide

---

## บทคัดย่อผู้บริหาร (Executive Summary)

รายงานฉบับนี้มุ่งเน้นการวิเคราะห์เชิงลึกทางวิศวกรรมซอฟต์แวร์และคอมพิวเตอร์กราฟิกสำหรับการพัฒนา**ระบบกำหนดค่าสินค้า (Product Configurator)** ประเภทเฟอร์นิเจอร์และตู้ (Cabinetry) บนแพลตฟอร์มเว็บ โดยใช้เทคโนโลยี **React Three Fiber (R3F)**

การศึกษาครอบคลุมถึงการเปลี่ยนผ่านจากกระบวนการทำงานแบบดั้งเดิมที่พึ่งพา**ไฟล์สินทรัพย์คงที่ (Static Assets)** ไปสู่กระบวนการ**สร้างรูปทรงเรขาคณิตด้วยชุดคำสั่ง (Parametric/Procedural Geometry)** ซึ่งมีความจำเป็นอย่างยิ่งสำหรับการตอบสนองความต้องการของผู้บริโภคยุคใหม่ที่ต้องการการปรับแต่งสินค้าแบบ Real-time

### เนื้อหาสำคัญของรายงานแบ่งออกเป็น 7 ส่วนหลัก:

1. **การวิเคราะห์เปรียบเทียบเชิงสถาปัตยกรรม** - ระหว่าง Static GLTF และ Parametric Construction ในบริบทของประสิทธิภาพ (Performance) และความยืดหยุ่น (Flexibility)

2. **วิศวกรรมการเรนเดอร์ประสิทธิภาพสูง** - การใช้เทคนิค Instancing เพื่อลดภาระการประมวลผล (Draw Calls)

3. **การแก้ปัญหาทางคณิตศาสตร์ที่ซับซ้อน** - เรื่อง Normal Matrix ในกรณีที่มีการปรับขนาดวัตถุแบบไม่สม่ำเสมอ (Non-Uniform Scaling)

4. **ความถูกต้องทางสุนทรียศาสตร์** - การแก้ปัญหาการยืดตัวของพื้นผิว (UV Texture Stretching) ด้วยเทคนิค Triplanar Mapping

5. **การจำลองความโค้งมนของขอบวัตถุ (Bevels)** - ด้วย Shader Programming

6. **State Management Architecture** - การใช้ Zustand เพื่อประสิทธิภาพสูงสุด

7. **Best Practices และ Trade-offs** - การวิเคราะห์ข้อดีข้อเสียของแต่ละเทคนิค

การวิเคราะห์นี้สังเคราะห์ข้อมูลจากเอกสารทางเทคนิค งานวิจัย และกรณีศึกษาจากชุมชนนักพัฒนาระดับโลก เพื่อนำเสนอเป็น**พิมพ์เขียว (Blueprint)** สำหรับการพัฒนาระบบ 3D Configurator ระดับ **Enterprise-grade**

---

## 1. บทนำ: พลวัตใหม่แห่งการแสดงผลเฟอร์นิเจอร์ 3 มิติบนเว็บ

### 1.1 บริบทอุตสาหกรรม

อุตสาหกรรมเฟอร์นิเจอร์และการออกแบบภายในกำลังเผชิญกับการเปลี่ยนแปลงครั้งสำคัญ ที่ซึ่ง **"ขนาดมาตรฐาน"** ไม่สามารถตอบสนองความต้องการที่หลากหลายของที่อยู่อาศัยสมัยใหม่ได้อีกต่อไป

**ระบบ "Parametric Design"** หรือการออกแบบที่ขับเคลื่อนด้วยตัวแปร จึงเข้ามามีบทบาทสำคัญในการอนุญาตให้ผู้ใช้งานสามารถกำหนด:
- ✅ ความกว้าง (Width)
- ✅ ความลึก (Depth)
- ✅ ความสูง (Height)
- ✅ วัสดุ (Materials)

ของเฟอร์นิเจอร์ได้ด้วยตนเองผ่านเว็บเบราว์เซอร์

### 1.2 วิวัฒนาการของเทคโนโลยี 3D บนเว็บ

**ในอดีต:**
- การนำเสนอภาพ 3D มักกระทำผ่านเฟรมเวิร์ก **Three.js โดยตรง** หรือใช้ **Babylon.js**
- ❌ ความซับซ้อนในการจัดการสถานะ (State Management)
- ❌ ความซับซ้อนในการจัดการวงจรชีวิตของวัตถุ (Object Lifecycle)

**ปัจจุบัน:**
- การมาถึงของ **React Three Fiber (R3F)** ได้เปลี่ยนกระบวนทัศน์
- ✅ นำปรัชญา "Declarative" ของ React มาใช้กับการจัดการ Scene Graph 3D
- ✅ การสร้างระบบที่มีความซับซ้อนสูงอย่าง Configurator เป็นไปได้ง่ายขึ้น
- ✅ บำรุงรักษาได้ดีขึ้น

### 1.3 ความท้าทายทางเทคนิค

ความสะดวกสบายของ R3F มาพร้อมกับความท้าทายทางเทคนิคในการจัดการ:
- ⚠️ ทรัพยากร (Resources)
- ⚠️ การคำนวณที่ซับซ้อน (Complex Computations)
- ⚠️ โมเดลที่มีความละเอียดสูง (High-Detail Models)
- ⚠️ การปรับเปลี่ยนค่าพารามิเตอร์แบบ Real-time

---

## 2. การวิเคราะห์เชิงสถาปัตยกรรม: Parametric Geometry vs. Static GLTF

การตัดสินใจเชิงกลยุทธ์แรกสุดและสำคัญที่สุดในการพัฒนาระบบ Configurator คือการเลือกระหว่าง:
- **โมเดลสำเร็จรูป (Static Assets)**
- **การสร้างโมเดลขึ้นใหม่ด้วยโค้ด (Procedural Generation)**

### 2.1 ข้อจำกัดของ Static GLTF ในระบบ Configurator

รูปแบบไฟล์ **GLTF (GL Transmission Format)** และ **GLB (Binary)** ได้รับการยอมรับว่าเป็น:

> **"JPEG ของวงการ 3D"**

เนื่องจากมีความกะทัดรัดและพร้อมใช้งาน อย่างไรก็ตาม จากการวิเคราะห์ข้อมูลเชิงลึก พบข้อจำกัดร้ายแรงเมื่อนำมาใช้กับงาน Parametric Furniture:

#### ปัญหาที่ 1: Variant Explosion Problem (ปัญหาขนาดไฟล์และแบนด์วิดท์)

**สถานการณ์:**
- ระบบต้องรองรับตู้ที่มีขนาดกว้างตั้งแต่ **30 cm ถึง 120 cm**
- ปรับได้ทุกๆ **1 cm**
- จำนวน Variants = **90 ขนาด**

**ผลกระทบ:**
- ❌ การเตรียมไฟล์ GLTF ล่วงหน้าสำหรับทุกขนาดเป็นสิ่งที่เป็นไปไม่ได้ในทางปฏิบัติ
- ❌ แม้จะมีการบีบอัดที่ดี ไฟล์ GLTF ขนาดใหญ่ (เช่น 100MB) จะสร้างประสบการณ์ผู้ใช้ที่แย่มาก
- ❌ เวลาในการดาวน์โหลดและ Parsing บนอุปกรณ์มือถือ

#### ปัญหาที่ 2: Memory Overhead (การจัดการหน่วยความจำ)

**ปัญหา:**
- การโหลดไฟล์ GLTF ขนาดใหญ่หลายไฟล์เข้ามาใน Scene พร้อมกัน
- กินหน่วยความจำ GPU อย่างหนัก

**การแก้ไข:**
- Lazy Loading ช่วยได้บ้าง
- แต่ไม่สามารถแก้ปัญหาหลักเรื่องความซ้ำซ้อนของข้อมูล Geometry ได้

#### ปัญหาที่ 3: Physical Distortion (ความผิดเพี้ยนทางกายภาพ)

**สถานการณ์:**
- การใช้คำสั่ง `Scale (scale.set(x, y, z))` กับโมเดลตู้ทั้งใบที่ปั้นมาสำเร็จรูป
- จะทำให้สัดส่วนทุกอย่างยืดออกไปพร้อมกัน

**ตัวอย่าง:**
- หากยืดตู้ให้กว้างขึ้น **2 เท่า**
- ความหนาของไม้แผ่นข้าง (Side Panels) ก็จะหนาขึ้น **2 เท่า**ตามไปด้วย
- ❌ ผิดหลักความจริง (ความหนาไม้ควรคงที่ เช่น **18 mm** เสมอ ไม่ว่าตู้จะกว้างเท่าไร)

### 2.2 สถาปัตยกรรม Parametric Construction ใน R3F

**แนวทาง Parametric** คือการเขียนโปรแกรมเพื่อ **"สร้าง"** ชิ้นส่วนเฟอร์นิเจอร์ขึ้นมาทีละชิ้น (**Component-based Assembly**) ตามตรรกะที่กำหนดไว้

**ตัวอย่างการสร้างแผ่นไม้:**

```tsx
function WoodPanel({ width, height, thickness, position }: PanelProps) {
  return (
    <mesh position={position}>
      <boxGeometry args={[width, height, thickness]} />
      <meshStandardMaterial map={woodTexture} />
    </mesh>
  )
}

function Cabinet({ cabinetWidth, cabinetHeight, cabinetDepth }: CabinetProps) {
  const panelThickness = 18 // mm - คงที่เสมอ

  return (
    <group>
      {/* Top Panel */}
      <WoodPanel
        width={cabinetWidth}
        height={cabinetDepth}
        thickness={panelThickness}
        position={[0, cabinetHeight/2, 0]}
      />

      {/* Side Panels */}
      <WoodPanel
        width={panelThickness}
        height={cabinetHeight}
        thickness={cabinetDepth}
        position={[-cabinetWidth/2, 0, 0]}
      />

      {/* ... more panels */}
    </group>
  )
}
```

### 2.3 ตารางเปรียบเทียบ: Static GLTF vs. Parametric Construction

| ปัจจัยการประเมิน | Static GLTF/GLB | Parametric Construction (R3F) | ผู้ชนะ |
|------------------|----------------|------------------------------|-------|
| **ความยืดหยุ่น (Flexibility)** | ต่ำ (Fixed Dimensions) | สูงสุด (Infinite Variations) | Parametric 🏆 |
| **ขนาดไฟล์ (Payload Size)** | ใหญ่ (เก็บข้อมูล Vertices/Indices) | เล็กมาก (เก็บเฉพาะ Logic Code) | Parametric 🏆 |
| **คุณภาพพื้นผิว (Texture Quality)** | ดี (Baked UVs จาก Artist) | ท้าทาย (ต้องแก้ปัญหา UV Stretching) | Static |
| **ความถูกต้องของโครงสร้าง** | ผิดเพี้ยนเมื่อ Scale (ความหนาเปลี่ยน) | ถูกต้องเสมอ (Logic ควบคุมความหนา) | Parametric 🏆 |
| **ประสิทธิภาพ (Performance)** | ดีสำหรับ Static Scene | ดีเยี่ยมหากใช้ Instancing ถูกต้อง | Parametric 🏆 |
| **การบำรุงรักษา (Maintenance)** | ต้องแก้ที่ไฟล์ 3D ภายนอก | แก้ไข Logic ใน Codebase | Parametric 🏆 |

### บทสรุปเชิงวิเคราะห์

> สำหรับระบบ Configurator ที่ต้องการความถูกต้องทางวิศวกรรมและความยืดหยุ่น **การใช้ Parametric Construction เป็นทางเลือกเดียวที่ยั่งยืน**

โดยใช้ R3F ในการประกอบชิ้นส่วนพื้นฐาน (Primitives) เช่น:
- แผ่นไม้หน้าบาน
- แผ่นข้าง
- ชั้นวาง

เข้าด้วยกันเป็นตู้ที่สมบูรณ์

---

## 3. วิศวกรรมระบบ: การจัดการสถานะ (State Management)

ใน R3F การจัดการ **Data Flow** มีความสำคัญอย่างยิ่งต่อประสิทธิภาพ เนื่องจาก **React Reconciler** และ **Three.js Render Loop** ทำงานในจังหวะที่แตกต่างกัน

### 3.1 ปัญหาของการใช้ React State กับ 3D Scene

การใช้ `useState` หรือ `React Context` ในการส่งค่าพารามิเตอร์ที่เปลี่ยนแปลงอย่างรวดเร็ว:
- เช่น การลาก Slider เพื่อเปลี่ยนความกว้างตู้

**ปัญหา:**
- หากการเปลี่ยนค่า State ทำให้เกิดการ Re-render ของ Component Tree ทั้งหมด
- ในทุกเฟรม (60 ครั้งต่อวินาที)
- ประสิทธิภาพจะตกลงอย่างเห็นได้ชัด

### 3.2 สถาปัตยกรรม Zustand เพื่อประสิทธิภาพสูงสุด

จากการวิเคราะห์ Best Practices พบว่า **Zustand** เป็นไลบรารี State Management ที่เหมาะสมที่สุดสำหรับ R3F

**เหตุผล:**

#### 1. Transient Updates

Zustand อนุญาตให้:
- ✅ อ่านและเขียนค่า State ภายนอก React Render Cycle ได้
- ✅ อัปเดตค่าพารามิเตอร์ใน `useFrame` loop ได้โดยตรง
- ✅ โดยไม่ Trigger การ Re-render ที่ไม่จำเป็น

#### 2. Centralized Logic

การแยก Logic ของเฟอร์นิเจอร์ออกจาก View Layer:
- เช่น กฎว่า "ถ้าตู้กว้างเกิน 1 เมตร ต้องเพิ่มขาตู้ตรงกลาง"
- ช่วยให้โค้ดสะอาดและทดสอบง่าย

### 3.3 รูปแบบการใช้งานที่แนะนำ

**ควรแบ่ง State ออกเป็น 2 ส่วน:**

#### 1. Configuration State (Structural)

**ลักษณะ:**
- เช่น ความกว้าง ความสูง วัสดุ
- เปลี่ยนแปลงไม่บ่อย

**การจัดการ:**
- ใช้ Zustand + React Re-render เมื่อค่าเปลี่ยน
- เพื่อสร้าง Geometry ใหม่

**ตัวอย่าง:**

```typescript
interface CabinetStore {
  width: number
  height: number
  depth: number
  material: string

  setWidth: (width: number) => void
  setHeight: (height: number) => void
  setDepth: (depth: number) => void
}

const useCabinetStore = create<CabinetStore>((set) => ({
  width: 600,
  height: 720,
  depth: 350,
  material: 'oak',

  setWidth: (width) => set({ width }),
  setHeight: (height) => set({ height }),
  setDepth: (depth) => set({ depth })
}))
```

#### 2. View State (Transient)

**ลักษณะ:**
- เช่น มุมกล้อง การไฮไลท์ขณะเมาส์ชี้
- เปลี่ยนแปลงบ่อยมาก (ทุกเฟรม)

**การจัดการ:**
- ใช้ Refs และ Direct Manipulation ผ่าน `useFrame`
- เพื่อความลื่นไหล

**ตัวอย่าง:**

```tsx
function InteractiveCabinet() {
  const meshRef = useRef<THREE.Mesh>(null!)
  const [hovered, setHovered] = useState(false)

  useFrame(() => {
    if (hovered && meshRef.current) {
      // Direct manipulation - ไม่ trigger React re-render
      meshRef.current.scale.setScalar(1.05)
    } else {
      meshRef.current.scale.setScalar(1.0)
    }
  })

  return (
    <mesh
      ref={meshRef}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* ... */}
    </mesh>
  )
}
```

---

## 4. เทคนิคขั้นสูง: Instancing และการจัดการ Draw Calls

เมื่อสร้างตู้ด้วยวิธี Parametric เราจะพบว่าตู้หนึ่งใบประกอบด้วยชิ้นส่วนย่อยจำนวนมาก:
- แผ่นไม้
- น็อต
- มือจับ

**สถานการณ์:**
- ตู้ 1 ใบมี 50 ชิ้น
- แสดงผลห้องครัวที่มีตู้ 20 ใบ
- = วัตถุทั้งหมด **1,000 ชิ้น**

**ผลกระทบ:**
- อาจทำให้เกิด Draw Calls จำนวนมากจน WebGL รับไม่ไหว

### 4.1 พลังของ InstancedMesh

**InstancedMesh** ใน Three.js (และ `<instancedMesh>` ใน R3F) คือเทคนิคการเรนเดอร์วัตถุที่มี:
- Geometry เดียวกัน
- Material เดียวกัน

จำนวนมากในการวาดเพียง **ครั้งเดียว (Single Draw Call)**

**หลักการทำงาน:**

แทนที่จะ:
- ❌ ส่งคำสั่งวาดแผ่นไม้ 1,000 ครั้ง

เราทำ:
- ✅ ส่ง Geometry ของกล่องสี่เหลี่ยม (Box) ไปครั้งเดียว
- ✅ พร้อมกับรายการของ Matrix (ตำแหน่ง, การหมุน, ขนาด) ของทั้ง 1,000 ชิ้น
- ✅ ให้ GPU วาดทีเดียว

**การประยุกต์ใช้:**

แผ่นไม้ทุกแผ่นในตู้ (ไม่ว่าจะเป็นแผ่นข้าง แผ่นบน หรือชั้นวาง) โดยเนื้อแท้แล้วคือ:
- ลูกบาศก์ (Box Geometry) ที่ถูกบีบและยืด (Scale) ให้มีขนาดต่างกัน

ดังนั้นเราสามารถใช้ **InstancedMesh เพียงตัวเดียว** ในการวาดโครงสร้างไม้ทั้งหมดของตู้ได้

**ตัวอย่างโค้ด:**

```tsx
import { useRef, useEffect } from 'react'
import * as THREE from 'three'

function CabinetPanels({ panels }: { panels: PanelData[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null!)

  useEffect(() => {
    const mesh = meshRef.current
    const dummy = new THREE.Object3D()

    panels.forEach((panel, index) => {
      // ตั้งค่าตำแหน่งและขนาดสำหรับแต่ละ instance
      dummy.position.set(panel.x, panel.y, panel.z)
      dummy.scale.set(panel.width, panel.height, panel.thickness)
      dummy.updateMatrix()

      // บันทึก matrix ลงใน instance
      mesh.setMatrixAt(index, dummy.matrix)
    })

    mesh.instanceMatrix.needsUpdate = true
  }, [panels])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, panels.length]}>
      <boxGeometry />
      <meshStandardMaterial map={woodTexture} />
    </instancedMesh>
  )
}
```

### 4.2 ความท้าทาย: Non-Uniform Scaling และปัญหา Normal Matrix

นี่คือ**อุปสรรคทางเทคนิคที่ใหญ่ที่สุด**ในการใช้ InstancedMesh กับงานตู้ Parametric

#### ปัญหา

เมื่อเราใช้ InstancedMesh และทำการ Scale แต่ละ Instance **ไม่เท่ากัน** (Non-uniform scaling):
- เช่น ยืดแกน Y ให้ยาวแต่แกน X คงที่

**ผลกระทบ:**
- ค่า **Normal Vectors** (เวกเตอร์ที่ชี้ทิศทางตั้งฉากออกจากพื้นผิวเพื่อคำนวณแสง)
- จะถูกยืดตามไปด้วย
- ทำให้การคำนวณแสงผิดเพี้ยน
- แสงดูบิดเบี้ยวหรือมืดผิดปกติ

#### ทฤษฎีคณิตศาสตร์

ในทางคณิตศาสตร์ **Normal Vector** ($\vec{N}$) จะต้องถูกแปลงด้วย:

$$
\vec{N'} = (M^{-1})^T \vec{N}
$$

โดยที่:
- $M$ = Model Matrix
- $(M^{-1})$ = Inverse of Model Matrix
- $(M^{-1})^T$ = Inverse Transpose

เพื่อให้ยังคงตั้งฉากกับพื้นผิวหลังจากวัตถุถูกยืด

**ปัญหา:**
- Shader มาตรฐานของ InstancedMesh ในบางกรณี
- อาจไม่ได้คำนวณส่วนนี้ให้อย่างสมบูรณ์สำหรับแต่ละ Instance แยกกัน
- หรือมีการปรับแต่งที่ทำให้ผลลัพธ์คลาดเคลื่อนเมื่อ Scale แตกต่างกันมาก

### 4.3 การแก้ไขปัญหาด้วย Custom Shader

เพื่อแก้ปัญหานี้ เราจำเป็นต้อง**แก้ไข Vertex Shader** เพื่อคำนวณ Normal ใหม่ให้ถูกต้องสำหรับแต่ละ Instance

#### ขั้นตอนการแก้ไข:

**1. Extract Scale:** ดึงค่า Scale ของแต่ละ Instance ออกจาก Instance Matrix

**2. Re-normalize:** หารค่า Normal ด้วยกำลังสองของ Scale เพื่อยกเลิกผลของการยืด (Inverse Scaling)

**3. Transform:** หรือสร้าง Normal Matrix ใหม่เฉพาะสำหรับ Instance นั้น

#### แนวคิด Vertex Shader Snippet (GLSL):

```glsl
// ดึงค่า Scale จาก Matrix (ความยาวของ Basis Vectors)
vec3 scale = vec3(
  length(instanceMatrix[0].xyz),
  length(instanceMatrix[1].xyz),
  length(instanceMatrix[2].xyz)
);

// แก้ไข Normal โดยการหารด้วย Scale กำลังสอง
// (เป็นวิธีทางลัดของการหา Inverse Transpose สำหรับ Diagonal Matrix)
vec3 refinedNormal = normal / (scale * scale);

// Transform Normal ด้วย Instance Matrix ที่แก้ไขแล้ว
vNormal = normalize(mat3(instanceMatrix) * refinedNormal);
```

#### การใช้งานใน R3F:

```tsx
import { shaderMaterial } from '@react-three/drei'
import { extend } from '@react-three/fiber'

const CorrectedInstanceMaterial = shaderMaterial(
  { map: null },
  // Vertex Shader
  `
    varying vec3 vNormal;
    varying vec2 vUv;

    void main() {
      // Extract scale from instance matrix
      vec3 scale = vec3(
        length(instanceMatrix[0].xyz),
        length(instanceMatrix[1].xyz),
        length(instanceMatrix[2].xyz)
      );

      // Correct normal for non-uniform scaling
      vec3 refinedNormal = normal / (scale * scale);
      vNormal = normalize(mat3(instanceMatrix) * refinedNormal);

      vUv = uv;

      vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  // Fragment Shader
  `
    uniform sampler2D map;
    varying vec3 vNormal;
    varying vec2 vUv;

    void main() {
      vec3 light = normalize(vec3(1.0, 1.0, 1.0));
      float dProd = max(0.0, dot(vNormal, light));

      vec4 texColor = texture2D(map, vUv);
      gl_FragColor = vec4(texColor.rgb * dProd, 1.0);
    }
  `
)

extend({ CorrectedInstanceMaterial })
```

**การใช้วิธีนี้ร่วมกับ:**
- `InstancedUniformsMesh` (จากไลบรารี Troika หรือ Drei)
- จะช่วยให้เราสามารถกำหนดสีหรือคุณสมบัติวัสดุที่แตกต่างกันให้กับแต่ละชิ้นส่วนได้ด้วย

---

## 5. การแก้ปัญหาความสมจริง: UV Texture Stretching และ Triplanar Mapping

ในระบบ Parametric เมื่อเราปรับความกว้างตู้จาก **60 cm เป็น 120 cm** โดยการ Scale แผ่นไม้:
- ค่า **UV Coordinates** (พิกัดที่ใช้แปะภาพ Texture)
- จะถูกยืดออกตามไปด้วย
- ทำให้ลายไม้ดูยืดและไม่สมจริง (**Stretched Texture**)

### 5.1 ข้อจำกัดของการแก้ UV บน CPU

**วิธีดั้งเดิม:**
- แก้ไข `geometry.attributes.uv` ใหม่ทุกครั้งที่เปลี่ยนขนาด

**ปัญหา:**
- ❌ ใช้ไม่ได้กับ InstancedMesh
- ❌ เพราะทุก Instance แชร์ Geometry ก้อนเดียวกัน
- ❌ ถ้าแก้ UV ของก้อนหลัก ทุกชิ้นจะเปลี่ยนตามหมด
- ❌ ซึ่งผิด เพราะแต่ละชิ้นยืดไม่เท่ากัน

### 5.2 Triplanar Mapping: ทางออกระดับอุตสาหกรรม

**Triplanar Mapping** เป็นเทคนิคการเขียน Shader เพื่อ**แปะ Texture โดยไม่อิงกับ UV** ของโมเดล แต่อิงกับ **ตำแหน่งในโลก 3D (World Position)** ของพื้นผิวนั้นๆ

#### หลักการทำงาน (Mechanism)

Shader จะทำการ **"ฉาย"** ภาพ Texture เข้าไปที่วัตถุจาก **3 ทิศทางหลัก** (แกน X, Y, Z) เหมือนมีเครื่องฉายภาพ 3 ตัว:

**1. Top/Bottom Projection (Planar XZ):**
- สำหรับพื้นผิวที่หันขึ้น/ลง (เช่น ท็อปโต๊ะ)
- ใช้พิกัด XZ ของ World Position เป็น UV

**2. Side Projection (Planar YZ):**
- สำหรับพื้นผิวด้านข้าง
- ใช้พิกัด YZ

**3. Front/Back Projection (Planar XY):**
- สำหรับพื้นผิวหน้า/หลัง
- ใช้พิกัด XY

จากนั้น Shader จะ**ผสม (Blend)** ภาพจากทั้ง 3 ทิศทางเข้าด้วยกันโดยดูจากค่า Normal ของพื้นผิว ณ จุดนั้นๆ:
- เช่น ถ้า Normal ชี้ไปทางแกน Y 100%
- ก็จะใช้ภาพจาก Top Projection 100%

#### ประโยชน์ที่ได้รับ

**1. Texture Uniformity:**
- ✅ ไม่ว่าวัตถุจะถูกยืด (Scale) ไปมากแค่ไหน
- ✅ ลายไม้จะมีความละเอียดเท่าเดิมเสมอ
- ✅ เพราะอ้างอิงจากตำแหน่งใน World Space

**2. Seamless:**
- ✅ ลายไม้จะดูต่อเนื่องกัน
- ✅ เสมือนถูกตัดมาจากท่อนไม้เดียวกัน
- ✅ แม้จะเป็นคนละ Object

**3. Instancing Friendly:**
- ✅ ใช้งานร่วมกับ InstancedMesh ได้สมบูรณ์แบบ
- ✅ เพราะใน Fragment Shader เราทราบตำแหน่ง World Position ของแต่ละ Pixel อยู่แล้ว

#### การ Implement Triplanar Mapping (GLSL)

```glsl
// Fragment Shader - Triplanar Mapping
uniform sampler2D woodTexture;
uniform float textureScale;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  // Normalize normal และหาน้ำหนักสำหรับแต่ละแกน
  vec3 blendWeights = abs(normalize(vWorldNormal));
  blendWeights = blendWeights / (blendWeights.x + blendWeights.y + blendWeights.z);

  // Sample texture จาก 3 ทิศทาง
  vec4 xProjection = texture2D(woodTexture, vWorldPosition.yz * textureScale);
  vec4 yProjection = texture2D(woodTexture, vWorldPosition.xz * textureScale);
  vec4 zProjection = texture2D(woodTexture, vWorldPosition.xy * textureScale);

  // ผสมตามน้ำหนัก
  vec4 texColor = xProjection * blendWeights.x +
                  yProjection * blendWeights.y +
                  zProjection * blendWeights.z;

  gl_FragColor = texColor;
}
```

### 5.3 การจัดการ Normal Maps ใน Triplanar

การใช้ **Normal Map** กับ Triplanar มีความซับซ้อนกว่า Color Map เพราะต้อง**หมุนเวกเตอร์ของ Normal Map** ให้ตรงกับทิศทางการฉายด้วย

**ปัญหา:**
- การละเลยจุดนี้จะทำให้แสงเงาบนพื้นผิวลายไม้ดูผิดทิศทาง

**โซลูชัน:**
- ต้องมีการคำนวณ **Tangent Space** ใหม่ใน Shader
- หรือใช้ฟังก์ชัน `perturbNormalArb` ของ Three.js ในการช่วยคำนวณ

---

## 6. สุนทรียศาสตร์ขั้นสูง: การลบคม (Bevels)

เฟอร์นิเจอร์ในโลกความจริงไม่มี**ขอบที่คมกริบ 90 องศา** (Perfectly Sharp Edges)

การใช้ `BoxGeometry` ปกติจะทำให้งานดู:
- ❌ "ปลอม"
- ❌ ไม่มีแสงสะท้อนที่ขอบ (Specular Highlight)

### 6.1 ปัญหา Polycount ของ RoundedBoxGeometry

R3F มี `<RoundedBox>` ที่สร้างจาก Geometry จริง

**ปัญหา:**
- การเพิ่มความมนต้องใช้ Polygon จำนวนมาก
- เช่น จาก **12 Polygons** เป็น **200+ Polygons** ต่อชิ้น

**ผลกระทบ:**
- เมื่อคูณด้วยจำนวนชิ้นส่วนในตู้และจำนวนตู้ในห้อง
- จะทำให้ประสิทธิภาพตกลงอย่างมาก

### 6.2 ทางออก: SDF Shader Bevels (The "Cheap" Bevel)

เทคนิคขั้นสูงที่แนะนำคือการใช้ **Shader เพื่อจำลองความโค้งมน (Fake Bevels)** โดยไม่ต้องเพิ่ม Geometry จริง

#### หลักการ

ใน **Pixel Shader** เราสามารถใช้คณิตศาสตร์ **Signed Distance Fields (SDF)** เพื่อ:
- คำนวณว่า Pixel นี้อยู่ใกล้ขอบแค่ไหน
- ทำการดัดแปลงค่า Normal ให้โค้งมนเสมือนมี Bevel

#### ข้อดี

- ✅ ได้ความสวยงามของขอบมน
- ✅ โดยยังคงใช้ Low-poly BoxGeometry (12 Polygons) เหมือนเดิม
- ✅ เป็นวิธีที่ประหยัดทรัพยากรที่สุดสำหรับการทำ Instancing จำนวนมหาศาล

#### การ Implement (แนวคิด)

```glsl
// Fragment Shader - Fake Bevel
uniform float bevelSize;

varying vec3 vPosition;
varying vec3 vNormal;

void main() {
  // คำนวณระยะห่างจากขอบ (Edge Distance)
  vec3 absPos = abs(vPosition);
  float edgeDist = 1.0 - max(max(absPos.x, absPos.y), absPos.z);

  // ถ้าใกล้ขอบ ให้ดัดแปลง Normal
  if (edgeDist < bevelSize) {
    float t = edgeDist / bevelSize;
    vec3 edgeNormal = normalize(sign(vPosition));
    vNormal = mix(edgeNormal, vNormal, smoothstep(0.0, 1.0, t));
  }

  // คำนวณแสงตามปกติ
  vec3 light = normalize(vec3(1.0, 1.0, 1.0));
  float dProd = max(0.0, dot(vNormal, light));

  gl_FragColor = vec4(vec3(dProd), 1.0);
}
```

---

## 7. บทสรุปและข้อเสนอแนะเชิงปฏิบัติ

การสร้างระบบ **Parametric Cabinet 3D** ใน React Three Fiber ให้ประสบความสำเร็จระดับ **Production Grade** ต้องอาศัยการบูรณาการเทคนิคขั้นสูงหลายด้าน:

### 7.1 สรุปเทคนิคหลัก

**1. Geometry Strategy:**
- ✅ หลีกเลี่ยง Static GLTF
- ✅ ใช้ Parametric Construction ด้วยโค้ดเพื่อความยืดหยุ่นสูงสุด

**2. Rendering Architecture:**
- ✅ ใช้ InstancedMesh เป็นแกนหลักในการวาดชิ้นส่วนตู้
- ✅ เพื่อลด Draw Calls ให้ต่ำที่สุด

**3. Shader Engineering:**
- ✅ ใช้ Custom Vertex Shader เพื่อแก้ปัญหา Normal Matrix เมื่อทำ Non-uniform scaling
- ✅ ใช้ Triplanar Mapping ใน Fragment Shader เพื่อแก้ปัญหา Texture ยืด
- ✅ พิจารณาใช้ SDF-based Bevels เพื่อความสมจริงโดยไม่สูญเสีย Performance

**4. State Management:**
- ✅ ใช้ Zustand แยกโครงสร้างข้อมูล (Structure) ออกจากการแสดงผล (View)
- ✅ เพื่อลดการ Re-render

### 7.2 การปฏิบัติตามแนวทาง

การปฏิบัติตามแนวทางนี้จะช่วยให้นักพัฒนาสามารถส่งมอบประสบการณ์ 3D Configurator ที่:
- ✅ ลื่นไหล (60 FPS)
- ✅ สวยงามสมจริง
- ✅ รองรับการปรับแต่งที่ไร้ขีดจำกัด
- ✅ ตอบโจทย์ธุรกิจเฟอร์นิเจอร์ยุคใหม่ได้อย่างสมบูรณ์

---

## ภาคผนวก: ตัวอย่างโครงสร้างข้อมูลและการคำนวณ

### ตารางที่ 1: การวิเคราะห์ผลกระทบของเทคนิคต่างๆ ต่อระบบ

| เทคนิค | ปัญหาที่แก้ไข | ผลข้างเคียง/ข้อควรระวัง | ความยากในการ Implement |
|--------|--------------|------------------------|------------------------|
| **InstancedMesh** | ลด Draw Calls มหาศาล | Normal เพี้ยนเมื่อ Scale, จัดการ Culling ยาก | ปานกลาง ⭐⭐ |
| **Triplanar Mapping** | Texture ยืดเมื่อปรับขนาด | ใช้การคำนวณใน Fragment Shader เพิ่มขึ้น (Texture Fetch ×3) | สูง ⭐⭐⭐ |
| **Zustand (Transient)** | ลด React Re-renders | โค้ดมีความซับซ้อนขึ้น แยก Logic/View | ปานกลาง ⭐⭐ |
| **SDF Bevels** | Polycount สูงใน RoundedBox | เขียน Shader ยาก, ข้อจำกัดมุมมองระยะใกล้ | สูงมาก ⭐⭐⭐⭐ |
| **Custom Normal Matrix** | แสงผิดเพี้ยนบน Instances | ต้องเข้าใจคณิตศาสตร์ Linear Algebra | สูง ⭐⭐⭐ |

### ตารางที่ 2: Performance Benchmarks

| Metric | Static GLTF | Parametric (ไม่ Optimize) | Parametric + Instancing | Target |
|--------|-------------|-------------------------|------------------------|--------|
| **Draw Calls** | 100-500 | 50-100 | 5-10 | <20 |
| **FPS (Desktop)** | 45-60 | 30-45 | 60 | 60 |
| **FPS (Mobile)** | 20-30 | 15-25 | 30-45 | 30+ |
| **Bundle Size** | 50-200MB | <1MB | <1MB | <5MB |
| **VRAM Usage** | 500MB-1GB | 100-300MB | 50-150MB | <200MB |

---

## อ้างอิง (References)

1. React Three Fiber Documentation - https://docs.pmnd.rs/react-three-fiber
2. Three.js Fundamentals - https://threejs.org/manual/
3. WebGL Best Practices (Khronos Group)
4. "Real-Time Rendering, 4th Edition" - Tomas Akenine-Möller et al.
5. GPU Gems Series (NVIDIA) - Advanced Shader Techniques
6. Zustand State Management Documentation
7. Signed Distance Fields for Graphics - Research Papers
8. Triplanar Mapping Techniques - Game Development Articles
9. Instancing in WebGL - Performance Studies
10. Normal Matrix Mathematics - Linear Algebra Resources

---

**Document Control:**
- **Version:** 1.0
- **Last Updated:** 2026-01-10
- **Next Review:** 2026-04-10
- **Owner:** MONOLITH Technical Team
- **Status:** ✅ Active
- **Classification:** Advanced Engineering Research
- **Prerequisites:** Strong understanding of 3D graphics, WebGL, GLSL, Linear Algebra
