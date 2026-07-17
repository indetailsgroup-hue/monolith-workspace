# โปรไฟล์เครื่องจักร (Machine Profile) — KDT KN-2409NL

> `profile_id: kdt.nesting.kn_2409nl@0.1-research-draft` · as-of: 2026-07-17
> [EN edition](machine-profile.en.md)

**Nesting Tech** — Flat-bed CNC nesting/machining center; drilling, molding, slotting of panel furniture

## 1. ข้อมูลระบุรุ่นเครื่อง

| | |
|---|---|
| ผู้ผลิต | KDT (Guangzhou/Guangdong KDT Machinery) |
| รุ่น | **KN-2409NL** |
| ชื่อเรียกอื่น (aliases) | KN2409NL, KN-2409 NL, K2409NL |
| ตระกูล | Nesting Tech |
| สถานะในแค็ตตาล็อก | current-global |
| ภูมิภาค | Global + AU/MX/RU/NZ regional |
| วัตถุประสงค์การใช้งาน | Flat-bed CNC nesting/machining center; drilling, molding, slotting of panel furniture |
| แหล่งที่มา (URLs) | [en.kdtmac.com](https://en.kdtmac.com/products_details/28.html) · [ledamachinery.com.au](https://ledamachinery.com.au/product/kdt-kn-2409l-flat-bed-cnc-router/) · [trimaq.mx](https://trimaq.mx/wp-content/uploads/2024/06/Router-CNC-KDT-modelo-KN-2409-NL.pdf) · [www.jacks.co.nz](https://www.jacks.co.nz/product/find/775) |

## 2. เทมเพลตแพลตฟอร์ม (reusable) เทียบกับ เครื่องจริงของผู้เช่า (instance)

เอกสารนี้อธิบาย **เทมเพลตแพลตฟอร์มที่นำกลับมาใช้ซ้ำได้** ซึ่งสร้างจากหลักฐานแค็ตตาล็อกสาธารณะ **ไม่ใช่** เครื่องจริงของผู้เช่ารายใดรายหนึ่ง เครื่องจริงที่ผู้เช่าเป็นเจ้าของ (เช่น Daph) ถือเป็น **machine instance** ต่างหาก ซึ่งฮาร์ดแวร์คอนโทรลเลอร์ เฟิร์มแวร์ ตารางทูล จุดกำเนิดพิกัด เส้นทางส่งไฟล์จริง และงานตัวอย่างที่รู้ว่าดี ยังเป็น **Unknown** จนกว่าจะมีหลักฐานจากหน้าเครื่องจริง

## 3. กลุ่มข้อมูลทางเทคนิค 7 กลุ่ม

| กลุ่มข้อมูล | ค่า | สถานะหลักฐาน | แหล่งที่มา |
|---|---|---|---|
| พื้นที่ทำงาน / ระยะวิ่ง (`envelope`) | Working X/Y/Z 2850x1260x40mm | ยืนยันจากเอกสาร (Verified in documents) | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/28.html) |
| ความสามารถ (`capabilities`) | Main spindle 9kW ISO-30, single spindle | ยืนยันจากเอกสาร (Verified in documents) | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/28.html) |
| กำลัง / ความจุ (`capacities`) | Max moving speed 100/100/30 m/min; vacuum 7 zones, 244 m3/h | ยืนยันจากเอกสาร (Verified in documents) | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/28.html) |
| คอนโทรลเลอร์ / HMI (`controller_hmi`) | KDT-official CIFF: PC Control/KDT self-developed software; CONFLICT distributor Stancomplect: NCstudio (Taiwan) | ยืนยันจากเอกสาร (Verified in documents) | [stancomplect.com](https://stancomplect.com/en/cnc-machining-center-kn-2409nl-ncstudio-kdt-spindle-linear-tool-change) |
| ฟอร์แมต native / import (`native_import_formats`) | Unknown | ยังไม่ทราบ (Unknown) | ไม่มี |
| ระบบอัตโนมัติ (`automation`) | 12-post Linear ATC | ยืนยันจากเอกสาร (Verified in documents) | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/28.html) |
| ขนาด / กำลังไฟ / น้ำหนัก (`footprint_power_weight`) | Total power 20.5kW; overall 3980x2800x2160mm (exhibition) / 3980x2080x2160 (first pass); weight ~2300kg (distributor) | ยืนยันจากเอกสาร (Verified in documents) | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/28.html) |

## 4. ข้อขัดแย้งที่บันทึกไว้ (ไม่ตัดสินให้)

**ข้อขัดแย้ง (Conflict):** Controller: KDT PC/self-developed (official) vs NCstudio Taiwan (distributor). rpm 18000/21000/24000 across distributors. weight 2300/2350/2500kg across distributors.

## 5. โปรไฟล์คอนโทรลเลอร์ (Controller Profile)

ข้อมูลคอนโทรลเลอร์ระดับเครื่องจริงเป็น **Unknown** เว้นแต่หลักฐานของรุ่นนี้โดยตรงจะระบุไว้ชัดเจน ห้ามอนุมานจากคอนโทรลเลอร์ของตระกูลหรือรุ่นพี่น้อง

| | |
|---|---|
| ผู้ผลิตคอนโทรลเลอร์ | KDT-official CIFF: PC Control/KDT self-developed software; CONFLICT distributor Stancomplect: NCstudio (Taiwan) ([stancomplect.com](https://stancomplect.com/en/cnc-machining-center-kn-2409nl-ncstudio-kdt-spindle-linear-tool-change)) |
| รุ่นฮาร์ดแวร์คอนโทรลเลอร์ | ยังไม่ทราบ (Unknown) |
| เวอร์ชันเฟิร์มแวร์/ซอฟต์แวร์ | ยังไม่ทราบ (Unknown) |
| HMI shell / เวอร์ชัน | ยังไม่ทราบ (Unknown) |
| ระบบปฏิบัติการ | ยังไม่ทราบ (Unknown) |

## 6. สัญญาส่งไฟล์ (Delivery Contract)

ทุกช่องด้านล่างเป็น **Unknown** เว้นแต่หลักฐานของรุ่นนี้โดยตรงจะรองรับ ฟอร์แมต โพสต์โปรเซสเซอร์ ข้อมูลบาร์โค้ด ช่องทาง และสัญญาพิกัด/ทูล เป็นระดับเครื่องจริง และจะไม่ถูกอนุมานจากรุ่นอื่น

| | |
|---|---|
| ฟอร์แมต native ที่ถือเป็นทางการ | ยังไม่ทราบ (Unknown) |
| ฟอร์แมต import ที่รับได้ | ยังไม่ทราบ (Unknown) |
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

**6 / 7** — จำนวนกลุ่มข้อมูลเทคนิคที่มีค่าและมีแหล่งอ้างอิง จากทั้งหมด 7 กลุ่ม · ณ วันที่ 2026-07-17

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