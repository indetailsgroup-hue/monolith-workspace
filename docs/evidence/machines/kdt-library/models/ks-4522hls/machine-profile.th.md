# โปรไฟล์เครื่องจักร (Machine Profile) — KDT KS-4522HLS

> `profile_id: kdt.saw.ks_4522hls@0.1-research-draft` · as-of: 2026-07-17
> [EN edition](machine-profile.en.md)

**Saw Tech** — Angular saw center

## 1. ข้อมูลระบุรุ่นเครื่อง

| | |
|---|---|
| ผู้ผลิต | KDT (Guangzhou/Guangdong KDT Machinery) |
| รุ่น | **KS-4522HLS** |
| ชื่อเรียกอื่น (aliases) | ไม่มี |
| ตระกูล | Saw Tech |
| สถานะในแค็ตตาล็อก | current-global |
| ภูมิภาค | Global |
| วัตถุประสงค์การใช้งาน | Angular saw center |
| แหล่งที่มา (URLs) | [en.kdtmac.com](https://en.kdtmac.com/products_detail/222.html) |

## 2. เทมเพลตแพลตฟอร์ม (reusable) เทียบกับ เครื่องจริงของผู้เช่า (instance)

เอกสารนี้อธิบาย **เทมเพลตแพลตฟอร์มที่นำกลับมาใช้ซ้ำได้** ซึ่งสร้างจากหลักฐานแค็ตตาล็อกสาธารณะ **ไม่ใช่** เครื่องจริงของผู้เช่ารายใดรายหนึ่ง เครื่องจริงที่ผู้เช่าเป็นเจ้าของ (เช่น Daph) ถือเป็น **machine instance** ต่างหาก ซึ่งฮาร์ดแวร์คอนโทรลเลอร์ เฟิร์มแวร์ ตารางทูล จุดกำเนิดพิกัด เส้นทางส่งไฟล์จริง และงานตัวอย่างที่รู้ว่าดี ยังเป็น **Unknown** จนกว่าจะมีหลักฐานจากหน้าเครื่องจริง

## 3. กลุ่มข้อมูลทางเทคนิค 7 กลุ่ม

| กลุ่มข้อมูล | ค่า | สถานะหลักฐาน | แหล่งที่มา |
|---|---|---|---|
| พื้นที่ทำงาน / ระยะวิ่ง (`envelope`) | Rip/cross cut 4300/2100mm; max package 4300x2100x120mm; min grip 34x45mm; max cut thickness 120mm | ยืนยันจากเอกสาร (Verified in documents) | [stancomplect.com](https://stancomplect.com/en/angular-cnc-panel-sawbeam-saw-ks-4522hls-with-rear-loading-and-twin-pusher-batch-cutting-height-120-mm-size-4300x2100-mm) |
| ความสามารถ (`capabilities`) | Angular saw center; 2 saw carriages (longitudinal + cross); main saw drive 2x30kW (Stancomplect) CONFLICT 2x25kW (KDT Russia/ligasz) CONFLICT 2x28kW (Stancomplect video); scoring 2x2.2kW; main blade 450/75, scoring 200/50; rotary table; twin pusher | ยืนยันจากเอกสาร (Verified in documents) | [stancomplect.com](https://stancomplect.com/en/angular-cnc-panel-sawbeam-saw-ks-4522hls-with-rear-loading-and-twin-pusher-batch-cutting-height-120-mm-size-4300x2100-mm) |
| กำลัง / ความจุ (`capacities`) | Saw carriage travel 120 m/min; idle 180 m/min; pusher 95 m/min (fwd 25); ~3500-4000 m2/12h shift | ยืนยันจากเอกสาร (Verified in documents) | [stancomplect.com](https://stancomplect.com/en/angular-cnc-panel-sawbeam-saw-ks-4522hls-with-rear-loading-and-twin-pusher-batch-cutting-height-120-mm-size-4300x2100-mm) |
| คอนโทรลเลอร์ / HMI (`controller_hmi`) | Industrial computer, Windows 10 (distributor Stancomplect - distributor claim) | ยืนยันจากเอกสาร (Verified in documents) | [stancomplect.com](https://stancomplect.com/en/angular-cnc-panel-sawbeam-saw-ks-4522hls-with-rear-loading-and-twin-pusher-batch-cutting-height-120-mm-size-4300x2100-mm) |
| ฟอร์แมต native / import (`native_import_formats`) | Works with optimizer programs; imports cutting-map files, prints labels (distributor description) | ยืนยันจากเอกสาร (Verified in documents) | [stancomplect.com](https://stancomplect.com/en/angular-cnc-panel-sawbeam-saw-ks-4522hls-with-rear-loading-and-twin-pusher-batch-cutting-height-120-mm-size-4300x2100-mm) |
| ระบบอัตโนมัติ (`automation`) | Rear + 2 side loading; rotary table 90deg; independent pusher; auto waste discharge (optional); hydraulic lift table 4000kg | ยืนยันจากเอกสาร (Verified in documents) | [stancomplect.com](https://stancomplect.com/en/angular-cnc-panel-sawbeam-saw-ks-4522hls-with-rear-loading-and-twin-pusher-batch-cutting-height-120-mm-size-4300x2100-mm) |
| ขนาด / กำลังไฟ / น้ำหนัก (`footprint_power_weight`) | Installed power 83kW; overall 15375 x 11542 x 2030mm; weight 13000kg (Stancomplect); working pressure 0.6-0.8 MPa | ยืนยันจากเอกสาร (Verified in documents) | [stancomplect.com](https://stancomplect.com/en/angular-cnc-panel-sawbeam-saw-ks-4522hls-with-rear-loading-and-twin-pusher-batch-cutting-height-120-mm-size-4300x2100-mm) |

## 4. ข้อขัดแย้งที่บันทึกไว้ (ไม่ตัดสินให้)

**ข้อขัดแย้ง (Conflict):** Main saw motor power varies by source: 2x30kW (Stancomplect EN spec table), 2x25kW (KDT Russia + ligasz.ru + KDT videos), 2x28kW (Stancomplect promo video). KDT-official exhibition page 122 is image-only (no legible table).

## 5. โปรไฟล์คอนโทรลเลอร์ (Controller Profile)

ข้อมูลคอนโทรลเลอร์ระดับเครื่องจริงเป็น **Unknown** เว้นแต่หลักฐานของรุ่นนี้โดยตรงจะระบุไว้ชัดเจน ห้ามอนุมานจากคอนโทรลเลอร์ของตระกูลหรือรุ่นพี่น้อง

| | |
|---|---|
| ผู้ผลิตคอนโทรลเลอร์ | Industrial computer, Windows 10 (distributor Stancomplect - distributor claim) ([stancomplect.com](https://stancomplect.com/en/angular-cnc-panel-sawbeam-saw-ks-4522hls-with-rear-loading-and-twin-pusher-batch-cutting-height-120-mm-size-4300x2100-mm)) |
| รุ่นฮาร์ดแวร์คอนโทรลเลอร์ | ยังไม่ทราบ (Unknown) |
| เวอร์ชันเฟิร์มแวร์/ซอฟต์แวร์ | ยังไม่ทราบ (Unknown) |
| HMI shell / เวอร์ชัน | ยังไม่ทราบ (Unknown) |
| ระบบปฏิบัติการ | ยังไม่ทราบ (Unknown) |

## 6. สัญญาส่งไฟล์ (Delivery Contract)

ทุกช่องด้านล่างเป็น **Unknown** เว้นแต่หลักฐานของรุ่นนี้โดยตรงจะรองรับ ฟอร์แมต โพสต์โปรเซสเซอร์ ข้อมูลบาร์โค้ด ช่องทาง และสัญญาพิกัด/ทูล เป็นระดับเครื่องจริง และจะไม่ถูกอนุมานจากรุ่นอื่น

| | |
|---|---|
| ฟอร์แมต native ที่ถือเป็นทางการ | Works with optimizer programs; imports cutting-map files, prints labels (distributor description) ([stancomplect.com](https://stancomplect.com/en/angular-cnc-panel-sawbeam-saw-ks-4522hls-with-rear-loading-and-twin-pusher-batch-cutting-height-120-mm-size-4300x2100-mm)) |
| ฟอร์แมต import ที่รับได้ | Works with optimizer programs; imports cutting-map files, prints labels (distributor description) ([stancomplect.com](https://stancomplect.com/en/angular-cnc-panel-sawbeam-saw-ks-4522hls-with-rear-loading-and-twin-pusher-batch-cutting-height-120-mm-size-4300x2100-mm)) |
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