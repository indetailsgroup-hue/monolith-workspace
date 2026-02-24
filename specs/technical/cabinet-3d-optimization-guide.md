# รายงานการวิจัยฉบับสมบูรณ์: สถาปัตยกรรมเชิงลึกและยุทธวิธีทางวิศวกรรมสำหรับการปรับแต่ง (Optimization) โมเดลตู้ 3D ใน React Three Fiber เพื่อประสิทธิภาพสูงสุด

**Project:** MONOLITH Designer Workspace v2.0
**Document Version:** 1.0
**Date:** 2026-01-10
**Status:** Active
**Document Type:** Research Report & Engineering Guide

---

## บทนำและภาพรวมเชิงสถาปัตยกรรม (Introduction and Architectural Overview)

ในยุคปัจจุบันที่เทคโนโลยี WebGL ได้ก้าวเข้ามามีบทบาทสำคัญในการพลิกโฉมวงการพาณิชย์อิเล็กทรอนิกส์ (E-Commerce) การนำเสนอสินค้าผ่านโมเดลสามมิติที่มีความสมจริงสูงได้กลายเป็นมาตรฐานใหม่ที่ผู้บริโภคคาดหวัง โดยเฉพาะอย่างยิ่งในอุตสาหกรรมเฟอร์นิเจอร์และของตกแต่งบ้าน ซึ่งสินค้าประเภท "ตู้" (Cabinet) หรือชุดครัวบิวท์อิน มีความซับซ้อนทางโครงสร้างและรายละเอียดวัสดุที่สูงกว่าสินค้าทั่วไป

อย่างไรก็ตาม การพัฒนาระบบ 3D Configurator บนเว็บเบราว์เซอร์ด้วยเฟรมเวิร์ก **React Three Fiber (R3F)** ให้สามารถแสดงผลโมเดลที่มีความละเอียดสูงได้อย่างลื่นไหล (Smoothness) และมีขนาดไฟล์ที่เล็กที่สุด (Lightweight) นั้น นับเป็นความท้าทายทางวิศวกรรมที่ซับซ้อน ซึ่งต้องอาศัยความเข้าใจอย่างลึกซึ้งในสถาปัตยกรรมของ **Graphics Pipeline**, **การบริหารจัดการหน่วยความจำ (Memory Management)**, และ **พฤติกรรมของ React Reconciliation**

### วัตถุประสงค์ของรายงาน

รายงานฉบับนี้มีวัตถุประสงค์เพื่อนำเสนอผลการวิจัยและแนวทางปฏิบัติที่เป็นเลิศ (Best Practices) ในการปรับแต่งประสิทธิภาพ (Optimization) สำหรับโมเดลตู้ 3D โดยเฉพาะ โดยครอบคลุมตั้งแต่:

- 🎨 กระบวนการเตรียมสินทรัพย์ดิจิทัล (Asset Pipeline)
- 🗜️ การบีบอัดข้อมูลขั้นสูง (Advanced Compression)
- ⚡ การบริหารจัดการ Runtime ภายใน React Three Fiber
- 🎯 การวัดผลและ Benchmarking

ข้อมูลในรายงานนี้สังเคราะห์จากเอกสารทางเทคนิค งานวิจัย และกรณีศึกษาจากชุมชนนักพัฒนา WebGL ระดับโลก เพื่อให้มั่นใจว่าผลลัพธ์ที่ได้จะไม่เพียงแค่สวยงาม แต่ยังทรงประสิทธิภาพบนอุปกรณ์ที่หลากหลาย ตั้งแต่เวิร์กสเตชันประสิทธิภาพสูงไปจนถึงสมาร์ทโฟนระดับกลาง

---

## 1. พลวัตของประสิทธิภาพในบริบท WebGL และ React Three Fiber

### 1.1 พลวัตของประสิทธิภาพในบริบท WebGL และ React Three Fiber

การทำความเข้าใจ **"ประสิทธิภาพ"** ในบริบทของ WebGL บน React จำเป็นต้องมองผ่านมิติของข้อจำกัดทางทรัพยากรที่สำคัญสามประการ:

1. **แบนด์วิดท์เครือข่าย (Network Bandwidth)** - ขนาดไฟล์ที่ต้องดาวน์โหลด
2. **หน่วยความจำกราฟิก (VRAM)** - หน่วยความจำที่ใช้ขณะ Runtime
3. **งบประมาณเวลาในการประมวลผลต่อเฟรม (Frame Budget)** - เวลาที่มีในการคำนวณแต่ละเฟรม

### 1.2 กรอบเวลา 16.6 มิลลิวินาทีและ React Overhead

หัวใจสำคัญของความลื่นไหลคือ **อัตราเฟรมเรต (Frame Rate)** ที่เสถียร โดยมาตรฐานทั่วไปอยู่ที่ **60 เฟรมต่อวินาที (FPS)** ซึ่งหมายความว่าระบบมีเวลาเพียง **16.67 มิลลิวินาที** ในการ:

- คำนวณตรรกะของเกม (Game Logic)
- ประมวลผล React Virtual DOM
- ส่งคำสั่งวาด (Draw Calls) ไปยัง CPU
- ประมวลผลพิกเซลบน GPU

หากกระบวนการใดกระบวนการหนึ่งใช้เวลาเกินกว่านี้ จะส่งผลให้เกิด:
- ❌ อาการกระตุก (Jank)
- ❌ เฟรมตก (Frame Drops)
- ❌ ประสบการณ์ผู้ใช้ที่ไม่ดี

**React Three Fiber (R3F)** ทำหน้าที่เป็น **Reconciliation Layer** ระหว่าง React และ Three.js:

✅ **ข้อดี:**
- แทบไม่มี Overhead เพิ่มเติมในขณะ Runtime
- Declarative API ที่ใช้งานง่าย
- การจัดการ Lifecycle อัตโนมัติ

⚠️ **ข้อควรระวัง:**
- การสร้าง Object ใหม่ในทุกเฟรม
- การปล่อยให้ React ทำการ Diffing ต้นไม้ Component ที่ซับซ้อนโดยไม่จำเป็น

สำหรับโมเดลตู้ที่มีชิ้นส่วนจำนวนมาก (บานพับ, น็อต, มือจับ, แผ่นไม้) การจัดการ **ลำดับชั้น (Hierarchy)** ของ Scene Graph อย่างมีประสิทธิภาพจึงเป็นปัจจัยชี้ขาด

### 1.3 Draw Calls: ศัตรูที่มองไม่เห็นของประสิทธิภาพ CPU

ในกระบวนการเรนเดอร์ คอขวดที่พบบ่อยที่สุดไม่ใช่ความสามารถในการวาดรูปสามเหลี่ยมของ GPU (Polycount) แต่เป็น:

> **ความสามารถของ CPU ในการส่งคำสั่งวาด (Draw Calls) ไปยัง GPU**

**ตัวอย่างปัญหา:**

ตู้หนึ่งใบที่ประกอบด้วย:
- ลิ้นชัก 4 ชั้น
- บานเปิด 2 บาน
- อุปกรณ์ฟิตติ้งต่างๆ

หากแยกชิ้นส่วนอิสระออกจากกัน → อาจสร้าง **Draw Calls ได้หลายร้อยครั้งต่อเฟรม**

**ผลกระทบ:**
- ❌ ภาระหนักสำหรับ CPU
- ❌ โดยเฉพาะบนอุปกรณ์มือถือ
- ❌ FPS ลดลงอย่างมาก

**โซลูชัน:**

การลดจำนวน Draw Calls ผ่านเทคนิค:
- ✅ **Instancing** - ใช้สำหรับวัตถุซ้ำๆ
- ✅ **Merging** - รวม Geometry เข้าด้วยกัน
- ✅ **Texture Atlas** - รวม Texture ให้ใช้ Material เดียวกัน

---

## 2. วิศวกรรมท่อส่งข้อมูลสินทรัพย์ (Asset Pipeline Engineering) และการบีบอัดเรขาคณิต

ขั้นตอนแรกและสำคัญที่สุดในการปรับแต่งประสิทธิภาพเริ่มต้นตั้งแต่ **ก่อนที่โค้ดบรรทัดแรกจะถูกเขียนขึ้น** นั่นคือขั้นตอนการเตรียมโมเดล 3D (Asset Preparation)

### 2.1 สถาปัตยกรรมไฟล์ glTF และยุทธศาสตร์การบีบอัด

รูปแบบไฟล์ **glTF (GL Transmission Format)** ได้รับการยอมรับว่าเป็น:

> **"JPEG ของวงการ 3D"**

เนื่องจากโครงสร้างที่ออกแบบมาเพื่อการส่งผ่านข้อมูลบนเว็บที่มีประสิทธิภาพ

**ปัญหา:**
- ❌ ไฟล์ glTF ดิบ (Raw) มักมีขนาดใหญ่
- ❌ เก็บข้อมูล Vertex Position, Normal, และ UV เป็นทศนิยม 32-bit (Float32)
- ❌ เกินความจำเป็นสำหรับการแสดงผลบนหน้าจอ

**โซลูชัน:**
การใช้ส่วนขยาย (Extensions) เพื่อบีบอัดข้อมูล

### 2.2 Draco Compression: การบีบอัดเชิงลึกสำหรับเรขาคณิต

**Draco** เป็นไลบรารีโอเพนซอร์สจาก Google ที่ใช้อัลกอริทึมขั้นสูงในการบีบอัดข้อมูลเรขาคณิต (Geometry)

**ผลลัพธ์:**
- ✅ ลดขนาดไฟล์ได้ **90-95%** เมื่อเทียบกับไฟล์ต้นฉบับ

**หลักการทำงาน:**
- เทคนิค **"Edgebreaker"** ในการเปลี่ยนโครงสร้าง Topology
- **Quantization** เพื่อลดความละเอียดของตัวเลขทศนิยม

**ข้อควรระวัง:**

⚠️ **ต้นทุนในการถอดรหัส (Decoding Cost):**
- ต้องดาวน์โหลดไฟล์ WASM Decoder
- ใช้ CPU ในการขยายข้อมูล
- อาจเกิดการหน่วงช่วงสั้นๆ (Micro-stutter) ขณะโหลด

### 2.3 Meshopt Compression: ทางเลือกที่เป็นมิตรต่อ GPU

**Meshopt (EXT_meshopt_compression)** เน้นที่:
- ✅ **ความเร็วในการถอดรหัส**
- ✅ **ประสิทธิภาพของ GPU**

**หลักการทำงาน:**
- จัดเรียง Vertex ให้สอดคล้องกับ Vertex Cache ของ GPU
- บีบอัด Index Buffer

**ผลลัพธ์:**
- ✅ ถอดรหัสเร็วกว่า Draco หลายเท่า
- ✅ ลดโอกาสเกิดอาการกระตุกขณะโหลด
- ⚠️ ขนาดไฟล์ใหญ่กว่า Draco เล็กน้อย

**การเลือกใช้:**

| Use Case | Recommendation |
|----------|---------------|
| Desktop (CPU แรง) | Draco |
| Mobile (CPU อ่อน) | Meshopt |
| Real-time Loading | Meshopt |
| File Size Priority | Draco |

### 2.4 การประยุกต์ใช้ gltf-transform เพื่อการปรับแต่งอัตโนมัติ

การใช้เครื่องมือบรรทัดคำสั่ง (CLI) อย่าง **gltf-transform** เป็นวิธีที่มีประสิทธิภาพสูงสุดในการจัดการกระบวนการ Optimization แบบทำซ้ำได้ (Reproducible Workflow)

**Pipeline สำหรับโมเดลตู้:**

```bash
# ขั้นตอนที่ 1: Optimize geometry
gltf-transform optimize cabinet_input.glb cabinet_step1.glb \
  --compress draco \
  --texture-compress ktx2 \
  --texture-size 2048 \
  --simplify false

# ขั้นตอนที่ 2: Advanced compression
gltf-transform draco cabinet_step1.glb cabinet_output.glb \
  --method edgebreaker \
  --quantize-position 14 \
  --quantize-normal 10 \
  --quantize-texcoord 12
```

**ขั้นตอนการปรับแต่ง:**

1. **Prune** - ลบข้อมูลที่ไม่ได้ใช้งาน (Unused Nodes, Materials)
2. **Weld** - เชื่อมจุด Vertex ที่ซ้ำซ้อนเข้าด้วยกัน
3. **Quantize** - ลดความละเอียดของ Vertex Position และ Normal ให้เหลือ 14-16 bit
4. **Compress** - ใช้ Draco หรือ Meshopt ในขั้นตอนสุดท้าย

**⚠️ สำคัญมาก:**

การใช้แฟล็ก `--simplify false` มีความสำคัญสำหรับโมเดลตู้ เนื่องจากอัลกอริทึมลด Polygon อัตโนมัติ (Simplification) อาจทำให้:
- ❌ รูปทรงเรขาคณิตผิดเพี้ยน
- ❌ ขอบมุมตู้ที่คมชัดกลายเป็นโค้งมน
- ❌ รายละเอียดสูญหาย

---

## 3. วิศวกรรมพื้นผิว (Texture Engineering) และการบริหารจัดการ VRAM

### 3.1 ความเข้าใจผิดที่พบบ่อย

> **ขนาดไฟล์รูปภาพ ≠ หน่วยความจำที่ใช้**

**ตัวอย่าง:**
- ไฟล์ JPEG ขนาด 200KB
- ขยายตัวกิน VRAM ถึง **16MB** เมื่อถูกถอดรหัสเป็นบิตแมป RGBA

สำหรับโมเดลตู้ที่เน้นความสมจริงของลายไม้และพื้นผิววัสดุ การบริหารจัดการ Texture จึงเป็นหัวใจสำคัญของการป้องกันแอปพลิเคชันล่ม (Crash) บนอุปกรณ์มือถือ

### 3.2 วิกฤตการณ์ VRAM และทางออกด้วย KTX2

**ปัญหาของ Texture แบบดั้งเดิม (JPEG, PNG):**

1. CPU ต้องถอดรหัส
2. ส่งไปยัง GPU ในรูปแบบที่ไม่ได้บีบอัด
3. กินทรัพยากรทั้งแบนด์วิดท์บัสและ VRAM มหาศาล

**โซลูชัน: KTX2 + Basis Universal**

เทคโนโลยี **KTX2** ร่วมกับมาตรฐาน **Basis Universal** ปฏิวัติวงการด้วย:
- ✅ เก็บข้อมูลแบบ "GPU Compressed Texture"
- ✅ GPU สามารถอ่านได้โดยตรง
- ✅ ไม่ต้องขยายไฟล์

### 3.3 การวิเคราะห์เปรียบเทียบ: JPEG/PNG vs KTX2

**ตารางที่ 1: เปรียบเทียบประสิทธิภาพระหว่างรูปแบบไฟล์ Texture (ขนาด 2048×2048)**

| คุณสมบัติ | JPEG/PNG | KTX2 (ETC1S) | KTX2 (UASTC) |
|-----------|----------|-------------|-------------|
| **ขนาดไฟล์บนดิสก์** | 300KB - 3MB | 150KB - 500KB | 1MB - 2MB |
| **การใช้ VRAM (Runtime)** | ~16 MB | ~2-3 MB | ~2-4 MB |
| **ความเร็วในการโหลด** | ช้า (CPU Decode) | เร็วมาก (GPU Ready) | เร็วมาก (GPU Ready) |
| **คุณภาพของภาพ** | สูง (Lossy/Lossless) | ปานกลาง (Lossy) | สูงมาก (Near Lossless) |
| **กรณีใช้งานสำหรับตู้** | ❌ ไม่แนะนำ | ✅ ลายไม้, สีพื้น, Roughness | ✅ Normal Map, มือจับโลหะ |

### 3.4 ยุทธศาสตร์การเลือกใช้ Codec สำหรับตู้เฟอร์นิเจอร์

**ETC1S (Low Bitrate):**

เหมาะอย่างยิ่งสำหรับ:
- ✅ Base Color Map ของลายไม้
- ✅ Occlusion/Roughness/Metalness (ORM) Map
- ✅ ข้อมูลที่มีความถี่ของรายละเอียดต่ำ
- ✅ ทนทานต่อการสูญเสียข้อมูลเล็กน้อย

**ผลลัพธ์:**
- 📉 ลดขนาดไฟล์และ VRAM ได้อย่างมหาศาล

**UASTC (High Quality):**

จำเป็นต้องใช้สำหรับ:
- ✅ Normal Map
- ✅ รายละเอียดโลหะที่มีความเงางามสูง (มือจับโครเมียม, บานพับ)
- ✅ พื้นผิวที่มีการคำนวณแสงละเอียด

**เหตุผล:**
- ⚠️ ETC1S มักสร้างสัญญาณรบกวน (Artifacts) ที่เห็นได้ชัดเจน
- ✅ UASTC รักษาคุณภาพไว้ได้ใกล้เคียงต้นฉบับ

### 3.5 กระบวนการแปลงไฟล์ด้วย glTF-Transform CLI

**Workflow ที่แนะนำ:**

```bash
# ขั้นตอนที่ 1: แปลง Texture ทั่วไปเป็น ETC1S
gltf-transform etc1s input.glb step1.glb \
  --slots "{baseColorTexture,metallicRoughnessTexture,occlusionTexture}" \
  --quality 255 \
  --verbose

# ขั้นตอนที่ 2: แปลง Normal Map เป็น UASTC
gltf-transform uastc step1.glb step2.glb \
  --slots "{normalTexture}" \
  --level 4 \
  --rdo 4 \
  --zstd 18 \
  --verbose

# ขั้นตอนที่ 3: บีบอัด Geometry ด้วย Draco
gltf-transform draco step2.glb final_output.glb \
  --method edgebreaker
```

**การผสมผสาน ETC1S และ UASTC (Hybrid Compression):**

เป็นเทคนิคขั้นสูงที่ช่วยสร้างสมดุลระหว่าง:
- 🎨 คุณภาพกราฟิก
- ⚡ ประสิทธิภาพของระบบ

**ผลลัพธ์:**
- ✅ ได้อย่างดีเยี่ยมสำหรับงานแสดงสินค้า E-Commerce

---

## 4. ยุทธศาสตร์แสงเงาและวัสดุ (Lighting and Material Strategy)

การคำนวณแสงแบบ Real-time (PBR Lighting) เป็นกระบวนการที่กินทรัพยากร GPU สูงที่สุด:
- 🔆 Shadow Mapping
- ✨ Environment Reflections
- 🌐 Global Illumination

### 4.1 เทคนิค Baked Lighting: คุณภาพสูงสุดในราคาที่ถูกที่สุด

**"Baked Lighting" หรือการอบแสง** เป็นเทคนิคที่ย้ายภาระการคำนวณแสงจาก:
- ❌ Runtime (GPU ของผู้ใช้)
- ✅ Asset Preparation (เครื่องของผู้พัฒนา)

**หลักการ:**
1. คำนวณแสง เงา และการสะท้อนแบบ Ray Tracing จาก Blender
2. บันทึกผลลัพธ์ลงใน Texture
3. ใช้ Texture นี้ใน Runtime (ไม่ต้องคำนวณซ้ำ)

### 4.2 Workflow การอบแสงสำหรับตู้

**วิธีที่ 1: Full Bake (Unlit Workflow)**

**ขั้นตอน:**
1. อบข้อมูลแสง สี และเงาทั้งหมดลงใน Base Color Map เดียว
2. ใช้ `MeshBasicMaterial` ใน R3F (ไม่ต้องคำนวณแสงใดๆ)

**ข้อดี:**
- ✅ ประสิทธิภาพสูงสุด (Performance Budget ต่ำมาก)
- ✅ ภาพสวยงามเหมือน Render จาก Blender

**ข้อจำกัด:**
- ⚠️ แสงเงาติดตายตัว (Static)
- ⚠️ หากมีการเปลี่ยนสภาพแสงหรือขยับชิ้นส่วน เงาจะไม่เปลี่ยนตาม

**วิธีที่ 2: Lightmap / AO Bake (Hybrid Workflow)**

**ขั้นตอน:**
1. อบเฉพาะข้อมูลแสงและเงา (Light/Shadow/Ambient Occlusion) ลงใน Texture ขาวดำ
2. ใช้ `MeshStandardMaterial` โดยใส่ Texture นี้ในช่อง `aoMap` หรือ `lightMap`

**ข้อดี:**
- ✅ สามารถเปลี่ยนสีวัสดุ (Diffuse Color) ได้แบบ Real-time
- ✅ ยังคงมีรายละเอียดเงาที่สวยงาม
- ✅ เหมาะสำหรับ Configurator ที่ให้ผู้ใช้เปลี่ยนสีตู้ได้

**ตัวอย่างโค้ด:**

```tsx
import { useTexture } from '@react-three/drei'

function CabinetPanel() {
  const [baseColor, aoMap] = useTexture([
    '/textures/cabinet-base.ktx2',
    '/textures/cabinet-ao.ktx2'
  ])

  return (
    <mesh>
      <boxGeometry />
      <meshStandardMaterial
        map={baseColor}
        aoMap={aoMap}
        aoMapIntensity={1.5}
      />
    </mesh>
  )
}
```

### 4.3 การสร้าง UV Atlas เพื่อลด Draw Calls

**ปัญหา:**

โมเดลตู้มักมีชิ้นส่วนย่อยจำนวนมาก (เช่น แผ่นไม้ 20 แผ่น)
- หากอบแสงแยกกัน → เกิด Texture จำนวนมาก
- Texture จำนวนมาก → เกิด Texture Swapping
- Texture Swapping → เพิ่ม Draw Calls

**โซลูชัน: Texture Atlas**

**ขั้นตอน:**

1. **UV Unwrapping:** กางแผนที่ UV ของชิ้นส่วนตู้ทั้งหมดให้อยู่ใน UV Space เดียวกัน (0-1) โดยไม่ซ้อนทับกัน

2. **Packing:** จัดเรียง UV Island ให้แน่นที่สุด
   - 💡 แนะนำ: ใช้ Add-on เช่น UVPackmaster ใน Blender

3. **Baking:** ทำการอบแสงของชิ้นส่วนทั้งหมดลงในรูปภาพเดียว (2048×2048 หรือ 4096×4096)

**ผลลัพธ์:**
- ✅ โมเดลตู้ทั้งใบใช้วัสดุ (Material) เพียงชิ้นเดียว
- ✅ **1 Draw Call เท่านั้น** สำหรับการวาดตู้ทั้งใบ (ไม่รวมฮาร์ดแวร์โลหะ)
- ✅ นี่คือจุดสูงสุดของการ Optimization ด้านการเรนเดอร์

### 4.4 การจัดการวัสดุ PBR และ Environment Map

สำหรับชิ้นส่วนที่ไม่สามารถอบแสงได้ เช่น **มือจับโลหะโครเมียมที่มีความมันวาวสูง** จำเป็นต้องใช้การสะท้อนแสงแบบ Real-time

**หลีกเลี่ยง:**
- ❌ การใช้ `PointLight` หรือ `SpotLight` จำนวนมาก
- ❌ แต่ละดวงจะเพิ่มรอบการคำนวณ Shader และ Shadow Map

**แนะนำ:**
- ✅ ใช้ `<Environment>` จาก `@react-three/drei`
- ✅ ควบคู่กับ `MeshStandardMaterial`

**เทคนิค:**
- ใช้ไฟล์ `.hdr` หรือ `.exr` ความละเอียดต่ำ (256×256 หรือ 512×512)
- เบลอเพื่อใช้เป็นแสงส่องสว่าง (Lighting)
- ใช้ความละเอียดสูงเฉพาะส่วนที่เป็นภาพสะท้อน (Reflection) บนผิวโลหะ

**ตัวอย่างโค้ด:**

```tsx
import { Environment } from '@react-three/drei'

function Scene() {
  return (
    <>
      <Environment
        files="/hdri/studio.hdr"
        background={false}
        blur={0.8}
      />
      <CabinetModel />
    </>
  )
}
```

---

## 5. การปรับแต่ง Runtime ใน React Three Fiber

เมื่อได้ Asset ที่ผ่านการปรับแต่งอย่างดีแล้ว ขั้นตอนสุดท้ายคือการจัดการวงจรชีวิตและการเรนเดอร์ในแอปพลิเคชัน R3F ให้มีประสิทธิภาพสูงสุด

### 5.1 ยุทธศาสตร์ On-Demand Rendering

**ปัญหา:**

โดยปกติ Three.js จะรัน Game Loop ที่ 60 FPS ตลอดเวลา ซึ่ง:
- ⚠️ เหมาะสมสำหรับเกมแอคชั่น
- ❌ สิ้นเปลืองสำหรับ Configurator ตู้
- ❌ ผู้ใช้มักจะใช้เวลาส่วนใหญ่ในการ "มองดู" โมเดลที่อยู่นิ่งๆ

**ผลกระทบ:**
- การเรนเดอร์ซ้ำๆ 60 ครั้งต่อวินาทีโดยไม่มีอะไรเปลี่ยนแปลง
- สิ้นเปลืองแบตเตอรี่
- ทำให้เครื่องร้อนโดยใช่เหตุ

**โซลูชัน: frameloop="demand"**

```tsx
<Canvas frameloop="demand">
  <Suspense fallback={null}>
    <CabinetModel />
    <Environment preset="city" />
  </Suspense>
  <OrbitControls makeDefault />
</Canvas>
```

**การทำงาน:**

R3F จะเรนเดอร์เฟรมใหม่ก็ต่อเมื่อ:
- ✅ มีการเปลี่ยนแปลง Props ใน Component
- ✅ มีการเปลี่ยนแปลง State ภายใน
- ✅ มีการขยับกล้อง (Camera Controls)

**ข้อควรระวัง:**

หากมีการใช้ Animation เช่น:
- การเลื่อนเปิดลิ้นชัก (Translation)
- ประตูตู้ (Rotation)

ระบบ On-demand อาจทำให้ Animation หยุดชะงัก จำเป็นต้อง:
- ใช้ฟังก์ชัน `invalidate` เพื่อกระตุ้น Loop ด้วยตนเอง
- หรือสลับ `frameloop` เป็น `"always"` ชั่วคราว

**ตัวอย่าง:**

```tsx
import { useThree } from '@react-three/fiber'

function AnimatedDoor() {
  const invalidate = useThree(s => s.invalidate)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (isOpen) {
      // กระตุ้นการเรนเดอร์ใหม่ขณะ animation
      const interval = setInterval(invalidate, 16) // 60 FPS
      return () => clearInterval(interval)
    }
  }, [isOpen, invalidate])

  return (
    <mesh rotation-y={isOpen ? Math.PI / 2 : 0}>
      {/* Door geometry */}
    </mesh>
  )
}
```

### 5.2 Instancing สำหรับฮาร์ดแวร์ซ้ำซ้อน

**ปัญหา:**

ตู้หนึ่งใบมักประกอบด้วยฮาร์ดแวร์ชิ้นเล็กๆ จำนวนมากที่หน้าตาเหมือนกัน:
- น็อตยึด 50 ตัว
- ปุ่มรับชั้น 20 ตัว
- ขาตู้ 4 ขา

หากใช้ `<mesh>` ปกติ → Overhead จาก Draw Calls จำนวนมาก

**โซลูชัน: Instancing**

เทคนิค Instancing ช่วยให้ GPU สามารถ:
- วาดวัตถุรูปทรงเดียวกันและใช้วัสดุเดียวกัน
- ได้หลายพันชิ้นในการส่งคำสั่งเพียงครั้งเดียว

**ตัวอย่างโค้ด:**

```tsx
import { Instances, Instance } from '@react-three/drei'

function CabinetHardware({ screwPositions }) {
  return (
    <Instances range={screwPositions.length}>
      <cylinderGeometry args={[0.5, 0.5, 1, 32]} />
      <meshStandardMaterial color="silver" roughness={0.2} metalness={1} />

      {screwPositions.map((pos, i) => (
        <Instance key={i} position={pos} />
      ))}
    </Instances>
  )
}
```

**ผลลัพธ์:**

จากการทดสอบ Benchmark พบว่าการใช้ Instancing กับวัตถุจำนวน 100-1,000 ชิ้น:
- ✅ ลด CPU Usage ได้อย่างมีนัยสำคัญ
- ✅ ลด Draw Calls จากหลักพันเหลือเพียง **1 ครั้ง**

### 5.3 การจัดการ State และการโหลด (Loading UX)

การโหลดโมเดลขนาดใหญ่ (แม้จะบีบอัดแล้ว) อาจใช้เวลา 1-3 วินาที การจัดการประสบการณ์ผู้ใช้ (UX) ในช่วงนี้มีความสำคัญมาก

**Best Practices:**

**1. Suspense & Preloading:**

```tsx
import { Suspense } from 'react'
import { useGLTF } from '@react-three/drei'

// Preload ทันทีที่แอปเริ่มทำงาน
useGLTF.preload('/models/cabinet.glb')

function App() {
  return (
    <Canvas>
      <Suspense fallback={<LoadingSpinner />}>
        <CabinetModel />
      </Suspense>
    </Canvas>
  )
}
```

**2. useProgress: แสดงเปอร์เซ็นต์การโหลด**

```tsx
import { useProgress, Html } from '@react-three/drei'

function LoadingSpinner() {
  const { progress } = useProgress()

  return (
    <Html center>
      <div className="loader">
        <div className="spinner" />
        <p>{progress.toFixed(0)}% loaded</p>
      </div>
    </Html>
  )
}
```

**3. Smooth Transition: Fade-in Effect**

```tsx
import { useSpring, animated } from '@react-spring/three'

function CabinetModel() {
  const { scene } = useGLTF('/models/cabinet.glb')
  const [opacity, setOpacity] = useState(0)

  const spring = useSpring({
    opacity: 1,
    from: { opacity: 0 },
    config: { duration: 500 }
  })

  return (
    <animated.primitive
      object={scene}
      material-opacity={spring.opacity}
      material-transparent
    />
  )
}
```

---

## 6. บทสรุปและรายการตรวจสอบเพื่อการส่งมอบงาน

การสร้าง 3D Cabinet Configurator ที่มีประสิทธิภาพสูงสุดใน React Three Fiber ไม่ได้เกิดจากเทคนิคใดเทคนิคหนึ่งเพียงอย่างเดียว แต่เกิดจากการ **บูรณาการ (Integration)** ของหลายศาสตร์เข้าด้วยกัน:

- 🎨 ศิลปะการปั้นโมเดล
- 🔧 วิศวกรรมการบีบอัดข้อมูล
- 💻 วิทยาการคอมพิวเตอร์ในการจัดการ Render Loop

### 6.1 รายการตรวจสอบการปรับแต่ง (Optimization Checklist)

**ตารางที่ 2: รายการตรวจสอบการปรับแต่ง**

| หมวดหมู่ | รายการตรวจสอบ | เป้าหมาย/เกณฑ์ | สถานะ |
|----------|---------------|----------------|-------|
| **Geometry** | ใช้ Draco หรือ Meshopt Compression | ลดขนาดไฟล์ > 70% | ⏳ |
| **Geometry** | ปิดใช้งาน Simplification ในส่วนที่ต้องการความคมชัด | รักษาขอบมุมตู้ให้สวยงาม | ⏳ |
| **Textures** | แปลง Texture ทั้งหมดเป็น KTX2 | VRAM Usage ลดลง 4-8 เท่า | ⏳ |
| **Textures** | ใช้ UASTC สำหรับ Normal Map / ETC1S สำหรับอื่นๆ | สมดุลคุณภาพและขนาดไฟล์ | ⏳ |
| **Materials** | ใช้ Baked Texture Atlas สำหรับตัวตู้ | ลด Draw Calls เหลือ 1 ต่อวัสดุ | ⏳ |
| **Rendering** | ใช้ Instancing สำหรับน็อต/มือจับ | ลด Draw Calls ของ Hardware | ⏳ |
| **Rendering** | เปิดใช้ frameloop="demand" | GPU Usage 0% เมื่อ Idle | ⏳ |
| **UX** | มีระบบ Preloading และ Smooth Fade-in | ประสบการณ์ลื่นไหล ไร้รอยต่อ | ⏳ |

### 6.2 Performance Benchmarks

**เป้าหมายประสิทธิภาพ:**

| Metric | Target | Acceptable | Poor |
|--------|--------|-----------|------|
| **FPS (Desktop)** | 60 | 45+ | <45 |
| **FPS (Mobile)** | 30 | 24+ | <24 |
| **Initial Load Time** | <2s | <3s | >3s |
| **Bundle Size** | <2MB | <5MB | >5MB |
| **Draw Calls** | <10 | <20 | >20 |
| **VRAM Usage** | <100MB | <200MB | >200MB |

### 6.3 Tools & Resources

**Development Tools:**
- [gltf-transform](https://gltf-transform.donmccurdy.com/) - CLI สำหรับ optimization
- [glTF Viewer](https://gltf-viewer.donmccurdy.com/) - ทดสอบโมเดล
- [Spector.js](https://spectorjs.babylonjs.com/) - WebGL Debugger

**3D Software:**
- [Blender](https://www.blender.org/) - 3D modeling & baking
- [UVPackmaster](https://uvpackmaster.com/) - UV Atlas optimization
- [Substance Painter](https://www.adobe.com/products/substance3d-painter.html) - Texture authoring

**React Three Fiber Ecosystem:**
- [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber) - Core library
- [@react-three/drei](https://github.com/pmndrs/drei) - Helper components
- [@react-three/postprocessing](https://github.com/pmndrs/react-postprocessing) - Effects

---

## 7. อ้างอิง (References)

1. WebGL Best Practices (Mozilla Developer Network)
2. React Three Fiber Official Documentation
3. glTF 2.0 Specification (Khronos Group)
4. Draco 3D Compression Library (Google)
5. Basis Universal Texture Compression
6. Three.js Performance Tips
7. GPU Gems Series (NVIDIA)
8. Real-Time Rendering, 4th Edition
9. PBR Guide (Substance by Adobe)
10. Web Performance Working Group (W3C)

---

**Document Control:**
- **Version:** 1.0
- **Last Updated:** 2026-01-10
- **Next Review:** 2026-04-10
- **Owner:** MONOLITH Technical Team
- **Status:** ✅ Active
- **Classification:** Technical Research Report
