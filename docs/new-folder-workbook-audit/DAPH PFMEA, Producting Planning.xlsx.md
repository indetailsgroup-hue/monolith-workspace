# DAPH PFMEA, Producting Planning.xlsx

- Path: `C:\Users\thai3\determined-williams (2)\determined-williams\New folder\DAPH PFMEA, Producting Planning.xlsx`
- Size: 26,249 bytes
- Last modified: 2020-11-05T05:07:15.142Z
- Sheets: 1

| Sheet | Range | Rows | Cols | Non-empty cells | Formulas | Merges |
|---|---:|---:|---:|---:|---:|---:|
| DAPH PFMEA | A1:T66 | 66 | 20 | 226 | 91 | 33 |

## Sheet: DAPH PFMEA

Range: `A1:T66`; rows=66; cols=20; non-empty=226; formulas=91; merges=33

Header candidates:
- Row 3:  | Process Step | Requirement<br>(ความต้องการ) | Potential Failure Mode<br>(ปัญหาที่คาดว่าจะเกิดขึ้น) | Potential Failure Effects<br>(ผลกระทบต่อปัญหาที่เกิดขึ้น) | SEV<br>(Severity) | Potential Causes of Failure<br>(ความน่าจะเป็นต้นเหตุของปัญหา) | OCC<br>(Occurrence) | Current Process Controls Prevention<br>(การป้องกันก่อนเกิดปัญหา) | Current Process Detection<br>(ป้องกันไม่ให้ปัญหาหลุดลอด) | Detection | RPN | Actions Recommended | Owner | Due Date | Actions Taken | SEV | OCC | DET | RPN
- Row 16:  | 4.การโน๊ตรายละเอียด Material | ระบุแมททีเรียลให้ชัดเจนทั้งหมด | เปลี่ยนแมททีเรียลระหว่างทำงาน หรือทำเสร็จไปแล้ว | DAPH : Scrap 100%<br>Customer :  Scrap 100% |  | ยังไม่สามารถระบุแมททีเรียลได้ชัดเจน |  | ไม่ควรเปลี่ยนแมททีเรียลหลายครั้ง | ระบุแมททีเรียลที่ถูกต้องและชัดเจนตั้งแต่แรก |  | 0 |  |  |  |  |  |  |  | 0
- Row 19:  | 5.การใส่ Material และคิดรายการวัสดุ เพื่อผลิต | ใส่ Material ในแบบ Pytha | ระบุแมททีเรียลผิด | DAPH : Scrap 100%<br>Customer :  Scrap 100% |  | ไม่ได้ดูขนาดไม้ที่ใช้กับขนาดที่ระบุในแมททีเรียลว่าตรงกันหรือไม่ |  | เช็คขนาดไม้ กับรายการที่ระบุในแมททีเรียลทุกครั้ง | จัดกรุ๊ปแยกขนาดไม้กับแมททีเรียลให้ชัดเจน ก่อนใส่แมททีเรียลทุกครั้ง |  | 0 |  |  |  |  |  |  |  | 0

Preview:
| C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  | Process: DAPH Production Planning |  |  |  |  |  |  | Prepared by: DAPH Production planning Team |  |
|  | Process Owner: DAPH Production Planning |  |  |  |  |  |  | Revision Date: Oct 2020   Rev 00 |  |
|  | Process Step | Requirement<br>(ความต้องการ) | Potential Failure Mode<br>(ปัญหาที่คาดว่าจะเกิดขึ้น) | Potential Failure Effects<br>(ผลกระทบต่อปัญหาที่เกิดขึ้น) | SEV<br>(Severity) | Potential Causes of Failure<br>(ความน่าจะเป็นต้นเหตุของปัญหา) | OCC<br>(Occurrence) | Current Process Controls Prevention<br>(การป้องกันก่อนเกิดปัญหา) | Current Process Detection<br>(ป้องกันไม่ให้ปัญหาหลุดลอด) |
|  | 1.การขึ้น Model Construction | ศึกษาแบบ 3D จากดีไซเนอร์ |  | DAPH : Scrap 100%<br>Customer :  Scrap 100% |  |  |  | ควรเช็คระยะในแบบก่อนการทำแบบ | สอบถามผู้เกี่ยวข้องทุกครั้งก่อนเริ่มงานหากแบบไม่ชัดเจน |
|  |  | เช็คระยะพื้นที่อย่างละเอียดจากไฟล์ 3D กับข้อมูลส่วนกลางของลูกค้า |  |  |  |  |  |  |  |
|  |  | ขึ้นผนังใน Pytha | ขึ้นระยะผิดจากแบบวัดพื้นที่ ที่ได้มา |  |  | ตัวเลขในแบบวัดพื้นที่ไม่ชัดเจน |  |  |  |
|  |  | ใส่ระยะประตู และหน้าต่าง | ระยะพื้นที่ประตูหน้าต่างมาไม่ครบ รายละเอียดไม่ชัดเจน |  |  | ระยะของพื้นที่ขาดหายไป ด้านในด้านหนึ่ง ทำให้พื้นที่ทั้ง 4 ด้านไม่ลงตัว |  |  |  |
|  |  | ใส่ระยะปลั๊กไฟ | ระยะปลั๊กที่ได้มาไม่ชัดเจน ไม่ครบถ้วน |  |  | วัดระยะปลั๊กมาไม่ครบตามพื้นที่หน้างาน |  | เช็คจำนวนปลั๊กหน้างานว่ามีระยะครบทุกจุดหรือไม่ |  |
|  |  |  |  |  |  |  |  |  |  |
|  | 2. การขึ้นโครงอลูมิเนียม |  | วางเสาระยะผิดจากในแบบ | DAPH : Scrap 100%<br>Customer :  Scrap 100% |  | ดูระยะไม่ครบทุกจุด |  | เช็คระยะทุกจุดก่อนเริ่มทำ | ดูแบบทั้ง 3D และแบบวัดพื้นที่หน้างาน |
|  |  | ขึ้นโครงผนังใน Pytha | ใส่ระยะคานไม่ตรงตามแบบไม้ |  |  | ไม่ได้ดูระยะแบบไม้ |  | ดูแบบการวางไม้ก่อนเริ่มทำ |  |
|  | 3.การ Import ผนัง ตู้ ฟิลเลอร์  | ขึ้นแบบโครงตู้ | ดึงตู้มาใช้ไม่เช็คระยะความหนาไม้ | DAPH : Scrap 100%<br>Customer :  Scrap 100% |  | ไม่เช็ครายละเอียดก่อนเริ่มงาน |  | เช็ครายละเอียดจากที่อินทีเรียส่งมาทุกครั้ง | สอบถามทุกครั้งที่ไม่เข้าใจ |

Formula sample:
- L11: `F11*H11*K11` => 0
- T11: `PRODUCT(Q11:S11)` => 0
- L14: `F11*H14*K14` => 0
- L15: `F15*H15*K15` => 0
- T15: `PRODUCT(Q15:S15)` => 0
- L16: `F16*H16*K16` => 0
- T16: `PRODUCT(Q16:S16)` => 0
- L17: `F17*H17*K17` => 0
- T17: `PRODUCT(Q17:S17)` => 0
- L19: `F19*H19*K19` => 0
- T19: `PRODUCT(Q19:S19)` => 0
- L21: `F21*H21*K21` => 0
- L22: `F21*H22*K22` => 0
- T22: `PRODUCT(Q22:S22)` => 0
- L23: `F21*H23*K23` => 0
- L24: `F24*H24*K24` => 0
- T24: `PRODUCT(Q24:S24)` => 0
- L25: `F25*H25*K25` => 0
- T25: `PRODUCT(Q25:S25)` => 0
- L26: `F26*H26*K26` => 0

Merged ranges sample: `J31:J32`, `J34:J35`, `I39:I40`, `J39:J40`, `F28:F30`, `F21:F23`, `E21:E23`, `B7:G7`, `B8:G8`, `I11:I14`, `B17:B19`, `E17:E19`, `I7:P7`, `I8:P8`, `F11:F14`, `J11:J15`, `J17:J19`, `J21:J23`, `B37:B40`, `E11:E15`
