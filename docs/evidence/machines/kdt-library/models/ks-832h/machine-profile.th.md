# โปรไฟล์เครื่องจักร (Machine Profile) — KDT KS-832H

> `profile_id: kdt.saw.ks_832h@0.1-research-draft` · as-of: 2026-07-17
> [EN edition](machine-profile.en.md)

**Saw Tech** — Panel saw; twin-pusher structure

## 1. ข้อมูลระบุรุ่นเครื่อง

| | |
|---|---|
| ผู้ผลิต | KDT (Guangzhou/Guangdong KDT Machinery) |
| รุ่น | **KS-832H** |
| ชื่อเรียกอื่น (aliases) | ไม่มี |
| ตระกูล | Saw Tech |
| สถานะในแค็ตตาล็อก | current-global |
| ภูมิภาค | Global |
| วัตถุประสงค์การใช้งาน | Panel saw; twin-pusher structure |
| แหล่งที่มา (URLs) | [en.kdtmac.com](https://en.kdtmac.com/products_list/2.html) |

## 2. เทมเพลตแพลตฟอร์ม (reusable) เทียบกับ เครื่องจริงของผู้เช่า (instance)

เอกสารนี้อธิบาย **เทมเพลตแพลตฟอร์มที่นำกลับมาใช้ซ้ำได้** ซึ่งสร้างจากหลักฐานแค็ตตาล็อกสาธารณะ **ไม่ใช่** เครื่องจริงของผู้เช่ารายใดรายหนึ่ง เครื่องจริงที่ผู้เช่าเป็นเจ้าของ (เช่น Daph) ถือเป็น **machine instance** ต่างหาก ซึ่งฮาร์ดแวร์คอนโทรลเลอร์ เฟิร์มแวร์ ตารางทูล จุดกำเนิดพิกัด เส้นทางส่งไฟล์จริง และงานตัวอย่างที่รู้ว่าดี ยังเป็น **Unknown** จนกว่าจะมีหลักฐานจากหน้าเครื่องจริง

## 3. กลุ่มข้อมูลทางเทคนิค 7 กลุ่ม

| กลุ่มข้อมูล | ค่า | สถานะหลักฐาน | แหล่งที่มา |
|---|---|---|---|
| พื้นที่ทำงาน / ระยะวิ่ง (`envelope`) | Max cut 3100L x 3200W (Lesmak) / 3180x3180 (Prostanki); max cut thickness 90mm (option 120); min grip 34x45mm | ยืนยันจากเอกสาร (Verified in documents) | [lesmak.si](https://lesmak.si/en/product/beam-saw-kdt-ks-832h/) |
| ความสามารถ (`capabilities`) | Main engine power 15kW (KDT Russia) CONFLICT 18.5kW (KDT Lithuania/Slovakia/Lesmak/Leda); pre-cutter/scoring 1.5kW (RU) or 2.2kW (SK); main blade 400/450x75, scoring 200/50; 8-10 pneumatic pliers | ยืนยันจากเอกสาร (Verified in documents) | [lesmak.si](https://lesmak.si/en/product/beam-saw-kdt-ks-832h/) |
| กำลัง / ความจุ (`capacities`) | Cutting speed 1-95 m/min (servo); saw unit moving speed up to 120 m/min; NC lateral press stroke 2200mm | ยืนยันจากเอกสาร (Verified in documents) | [lesmak.si](https://lesmak.si/en/product/beam-saw-kdt-ks-832h/) |
| คอนโทรลเลอร์ / HMI (`controller_hmi`) | PC computer with Windows environment; optimization software; barcode printer (Lesmak distributor) | ยืนยันจากเอกสาร (Verified in documents) | [lesmak.si](https://lesmak.si/en/product/beam-saw-kdt-ks-832h/) |
| ฟอร์แมต native / import (`native_import_formats`) | Optimization software with import (distributor description) | ยืนยันจากเอกสาร (Verified in documents) | [lesmak.si](https://lesmak.si/en/product/beam-saw-kdt-ks-832h/) |
| ระบบอัตโนมัติ (`automation`) | 3x air table with sliding rollers at entrance; servo saw-unit motion via gear/rack | ยืนยันจากเอกสาร (Verified in documents) | [lesmak.si](https://lesmak.si/en/product/beam-saw-kdt-ks-832h/) |
| ขนาด / กำลังไฟ / น้ำหนัก (`footprint_power_weight`) | Installed power 35kW; overall 7480x5495x1890mm (Lesmak/RU) / 7750x5495x2030mm (Slovakia); weight 6000kg | ยืนยันจากเอกสาร (Verified in documents) | [lesmak.si](https://lesmak.si/en/product/beam-saw-kdt-ks-832h/) |

## 4. ข้อขัดแย้งที่บันทึกไว้ (ไม่ตัดสินให้)

**ข้อขัดแย้ง (Conflict):** Main saw power 15kW (KDT Russia) vs 18.5kW (KDT Lithuania, KDT Slovakia, Lesmak, Leda). Overall size 7480x5495x1890 vs 7750x5495x2030. Scoring 1.5kW vs 2.2kW. KDT-official exhibition page 5 is image-only.

## 5. โปรไฟล์คอนโทรลเลอร์ (Controller Profile)

ข้อมูลคอนโทรลเลอร์ระดับเครื่องจริงเป็น **Unknown** เว้นแต่หลักฐานของรุ่นนี้โดยตรงจะระบุไว้ชัดเจน ห้ามอนุมานจากคอนโทรลเลอร์ของตระกูลหรือรุ่นพี่น้อง

| | |
|---|---|
| ผู้ผลิตคอนโทรลเลอร์ | PC computer with Windows environment; optimization software; barcode printer (Lesmak distributor) ([lesmak.si](https://lesmak.si/en/product/beam-saw-kdt-ks-832h/)) |
| รุ่นฮาร์ดแวร์คอนโทรลเลอร์ | ยังไม่ทราบ (Unknown) |
| เวอร์ชันเฟิร์มแวร์/ซอฟต์แวร์ | ยังไม่ทราบ (Unknown) |
| HMI shell / เวอร์ชัน | ยังไม่ทราบ (Unknown) |
| ระบบปฏิบัติการ | ยังไม่ทราบ (Unknown) |

## 6. สัญญาส่งไฟล์ (Delivery Contract)

ทุกช่องด้านล่างเป็น **Unknown** เว้นแต่หลักฐานของรุ่นนี้โดยตรงจะรองรับ ฟอร์แมต โพสต์โปรเซสเซอร์ ข้อมูลบาร์โค้ด ช่องทาง และสัญญาพิกัด/ทูล เป็นระดับเครื่องจริง และจะไม่ถูกอนุมานจากรุ่นอื่น

| | |
|---|---|
| ฟอร์แมต native ที่ถือเป็นทางการ | Optimization software with import (distributor description) ([lesmak.si](https://lesmak.si/en/product/beam-saw-kdt-ks-832h/)) |
| ฟอร์แมต import ที่รับได้ | Optimization software with import (distributor description) ([lesmak.si](https://lesmak.si/en/product/beam-saw-kdt-ks-832h/)) |
| โพสต์โปรเซสเซอร์ | ยังไม่ทราบ (Unknown) |
| ข้อมูลบาร์โค้ด (payload) | ยังไม่ทราบ (Unknown) |
| ช่องทาง/เส้นทางส่งไฟล์ | ยังไม่ทราบ (Unknown) |
| สัญญาพิกัด / ทูล | ยังไม่ทราบ (Unknown) |

### URI เชิงตรรกะที่เสนอสำหรับส่งไฟล์ (ไม่เป็นความลับ)

```
monolith://tenants/{tenant_id}/machines/{machine_instance_id}/delivery/inbound
```

นี่คือตัวระบุ **เชิงตรรกะ** เท่านั้น ไม่ใช่เส้นทางจริง ไม่ใช่ IP ไม่ใช่ hostname และไม่ใช่ network share ตัวระบุผู้เช่าและ instance เป็น placeholder ที่แพลตฟอร์มจะแทนค่าเมื่อรันจริง

## 7. คะแนนความครบถ้วนของหลักฐาน (Coverage score)

**7 / 7** — จำนวนกลุ่มข้อมูลเทคนิคที่มีค่าและมีแหล่งอ้างอิง จากทั้งหมด 7 กลุ่ม · ณ วันที่ 2026-07-17

## 8. รายการหลักฐานที่ต้องเก็บจากหน้าเครื่อง

- [ ] ถ่ายรูป nameplate: รหัสรุ่นเป๊ะ, หมายเลขซีเรียล, ปีที่ผลิต
- [ ] ถ่ายรูปหน้าจอ “About” ของคอนโทรลเลอร์/HMI: ผู้ผลิต, รุ่นฮาร์ดแวร์, เวอร์ชันเฟิร์มแวร์/ซอฟต์แวร์/HMI/OS
- [ ] ส่งออกหรือถ่ายรูปตารางทูลจริง และค่าพิกัด/work offset
- [ ] ยืนยันฟอร์แมต native ทางการและ import ที่รับได้ จากหน้า import ของเครื่องเอง
- [ ] ยืนยันช่องทาง/เส้นทางส่งไฟล์จริงที่ใช้บนเครื่องนี้
- [ ] เก็บงานตัวอย่างที่รู้ว่าดี (known-good job) แบบไม่แก้ไข ที่เครื่องรันถูกต้องอยู่แล้ว
- [ ] บันทึกข้อขัดแย้งที่แก้ได้หน้าเครื่อง พร้อมหลักฐานภาพถ่าย

---
MONOLITH · คลังข้อมูลเครื่องจักร KDT — ฉบับร่างวิจัย ณ 2026-07-17. ค่าจากแค็ตตาล็อกสาธารณะเป็น **Verified in documents** ไม่ใช่การสังเกตจากการทำงานจริง เอกสารนี้ไม่ให้อำนาจการผลิตใด ๆ.