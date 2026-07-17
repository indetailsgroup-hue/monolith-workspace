# โปรไฟล์เครื่องจักร (Machine Profile) — KDT KD-612G

> `profile_id: kdt.drilling.kd_612g@0.1-research-draft` · as-of: 2026-07-17
> [EN edition](machine-profile.en.md)

**Drilling Tech** — Drilling machine

## 1. ข้อมูลระบุรุ่นเครื่อง

| | |
|---|---|
| ผู้ผลิต | KDT (Guangzhou/Guangdong KDT Machinery) |
| รุ่น | **KD-612G** |
| ชื่อเรียกอื่น (aliases) | ไม่มี |
| ตระกูล | Drilling Tech |
| สถานะในแค็ตตาล็อก | current-global |
| ภูมิภาค | Global |
| วัตถุประสงค์การใช้งาน | Drilling machine |
| แหล่งที่มา (URLs) | [en.kdtmac.com](https://en.kdtmac.com/products_list/5.html) |

## 2. เทมเพลตแพลตฟอร์ม (reusable) เทียบกับ เครื่องจริงของผู้เช่า (instance)

เอกสารนี้อธิบาย **เทมเพลตแพลตฟอร์มที่นำกลับมาใช้ซ้ำได้** ซึ่งสร้างจากหลักฐานแค็ตตาล็อกสาธารณะ **ไม่ใช่** เครื่องจริงของผู้เช่ารายใดรายหนึ่ง เครื่องจริงที่ผู้เช่าเป็นเจ้าของ (เช่น Daph) ถือเป็น **machine instance** ต่างหาก ซึ่งฮาร์ดแวร์คอนโทรลเลอร์ เฟิร์มแวร์ ตารางทูล จุดกำเนิดพิกัด เส้นทางส่งไฟล์จริง และงานตัวอย่างที่รู้ว่าดี ยังเป็น **Unknown** จนกว่าจะมีหลักฐานจากหน้าเครื่องจริง

## 3. กลุ่มข้อมูลทางเทคนิค 7 กลุ่ม

| กลุ่มข้อมูล | ค่า | สถานะหลักฐาน | แหล่งที่มา |
|---|---|---|---|
| พื้นที่ทำงาน / ระยะวิ่ง (`envelope`) | Panel L 70-3000mm (KDT Iberica) / 70-2800 (KDT UA) / 200-2800 (KDT Europe); W 50-1215mm (35-50 when L<=1000); T 9-60mm | ยืนยันจากเอกสาร (Verified in documents) | [kdtiberica.com](https://kdtiberica.com/en/drills/cnc-drills/cnc-drill-kd-612g/) |
| ความสามารถ (`capabilities`) | Drills: Upper 14V+10H, Lower 9V; upper milling 9kW (C-axis)+5.5kW, lower 2x3.5kW; C-axis rotary on upper-left milling spindle | ยืนยันจากเอกสาร (Verified in documents) | [kdtiberica.com](https://kdtiberica.com/en/drills/cnc-drills/cnc-drill-kd-612g/) |
| กำลัง / ความจุ (`capacities`) | Max speed X/Y/Z 140/90/30 (Iberica) or 140/90/50 (KDT UA/Stancomplect) m/min; clamp speed 140 m/min | ยืนยันจากเอกสาร (Verified in documents) | [kdtiberica.com](https://kdtiberica.com/en/drills/cnc-drills/cnc-drill-kd-612g/) |
| คอนโทรลเลอร์ / HMI (`controller_hmi`) | Industrial computer, Windows-based; GIBLAB optimizer compatible (per distributor Stancomplect - distributor claim, not KDT-confirmed) | ยืนยันจากเอกสาร (Verified in documents) | [stancomplect.com](https://stancomplect.com/en/cnc-drilling-center-kd-612g-with-c-axis-and-tool-changer) |
| ฟอร์แมต native / import (`native_import_formats`) | Unknown | ยังไม่ทราบ (Unknown) | ไม่มี |
| ระบบอัตโนมัติ (`automation`) | Linear ATC 12 positions (10 tools + 2 aggregates); two grippers | ยืนยันจากเอกสาร (Verified in documents) | [kdtiberica.com](https://kdtiberica.com/en/drills/cnc-drills/cnc-drill-kd-612g/) |
| ขนาด / กำลังไฟ / น้ำหนัก (`footprint_power_weight`) | Total installed power 36.27kW; overall 6040x3300x2190mm (Iberica/UA) CONFLICT 7508x2855x2190mm (KDT Europe); weight 3700kg (Iberica) CONFLICT 3300kg (KDT UA); dust Ø200*1+Ø150*1+Ø100*1 | ยืนยันจากเอกสาร (Verified in documents) | [kdtiberica.com](https://kdtiberica.com/en/drills/cnc-drills/cnc-drill-kd-612g/) |

## 4. ข้อขัดแย้งที่บันทึกไว้ (ไม่ตัดสินให้)

**ข้อขัดแย้ง (Conflict):** Overall size 6040x3300x2190 (KDT Iberica/UA) vs 7508x2855x2190 (KDT Europe). Weight 3700kg (Iberica) vs 3300kg (UA). Panel length 70-3000 vs 70-2800 vs 200-2800 across regional sites. Z speed 30 (Iberica) vs 50 (UA/Stancomplect).

## 5. โปรไฟล์คอนโทรลเลอร์ (Controller Profile)

ข้อมูลคอนโทรลเลอร์ระดับเครื่องจริงเป็น **Unknown** เว้นแต่หลักฐานของรุ่นนี้โดยตรงจะระบุไว้ชัดเจน ห้ามอนุมานจากคอนโทรลเลอร์ของตระกูลหรือรุ่นพี่น้อง

| | |
|---|---|
| ผู้ผลิตคอนโทรลเลอร์ | Industrial computer, Windows-based; GIBLAB optimizer compatible (per distributor Stancomplect - distributor claim, not KDT-confirmed) ([stancomplect.com](https://stancomplect.com/en/cnc-drilling-center-kd-612g-with-c-axis-and-tool-changer)) |
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