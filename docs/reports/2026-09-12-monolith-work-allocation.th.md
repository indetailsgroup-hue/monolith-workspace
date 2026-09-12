# MONOLITH — แบ่งงานระหว่าง SciSpace และ Codex

12 กันยายน 2026 · TH · ข้อเสนอการบริหารงานจากหลักฐานที่ตรวจ

**ข้อเสนอ:** ให้ SciSpace เป็นผู้รับผิดชอบหลักด้านวิจัย ปรับข้อกำหนดให้ตรงกัน คู่มือ SOP และความรู้ซัพพลายเออร์ ให้ Codex ประสานงานพัฒนาระบบ ตรวจโค้ดและการทดสอบ ลงมือแก้งานที่ตกลง และเตรียมรวมผลงาน เจ้าของตัดสินใจขอบเขตธุรกิจและรับมอบผลใช้งาน โดยรักษาและต่อยอดโค้ดที่ SciSpace ทำไว้แล้ว

เอกสารนี้จัดสรรงานเพื่อให้ตรวจทาน ยังไม่ได้ส่งคำสั่งไปยัง SciSpace หยุดงานที่กำลังรัน เปลี่ยนสิทธิ์ repository เปลี่ยนระบบใช้งานจริง หรือเปลี่ยนสถานะการอนุมัติ

## ขอบเขตหลักฐาน

บัญชี SciSpace ที่เข้าสู่ระบบแสดงโฟลเดอร์ Monolith มี **9 บทสนทนา 10 สมุดบันทึก และ 0 ไฟล์ในแท็บ Files ของโฟลเดอร์** ส่วนไฟล์แนบในบทสนทนามีแยกต่างหาก รอบนี้อ่านกิจกรรมหรือสรุปล่าสุดที่แสดงของทั้ง 9 บทสนทนา และสำรวจชื่อสมุดบันทึก ไม่ได้ตรวจประวัติทุกข้อความ เนื้อหาสมุดบันทึกทั้งหมด หรือไฟล์แนบทุกชุด

ตรวจ Git ทั้งสอง root แยกกัน พร้อมอ่าน CONTEXT และข้อแก้ไขขอบเขตวันที่ 21 กรกฎาคม:

| แหล่งข้อมูล | รุ่น / ขอบเขต | งานเดิมที่มีอยู่ |
|---|---|---|
| Parent governance root ที่ `C:/Users/thai3/determined-williams (2)` | `aa1b30e509ece9d8efad3d68e949860aa79bdecf`, `guardrails/claim-linters`; ใช้อ้างอิง roadmap และ intake | tracked changes 11 รายการ; untracked 591 รายการก่อนสร้างรายงานนี้ |
| Nested product root ที่ `determined-williams/` | `9c4bee6759f6d1919a320a2f56088ce683287f58`, `fix/dxf-truth-chain`; เป็น repository ผลิตภัณฑ์แยกต่างหาก | tracked changes 22 รายการ; untracked 61 รายการ; รักษาไว้ |
| GitHub remote | `1c554a3cdf33c43ae4971ce1b984d39572f5d47a`; ภาพสถานะ CI ประมาณ 07:47 น. เวลาไทย | หลักฐานการรวมระบบปัจจุบันตามด้านล่าง แยกจากสองรุ่นในเครื่อง |

รอบจัดสรรงานนี้ไม่ได้รันทดสอบระบบใหม่ การมีโค้ด ผล workflow ผ่าน และการรับมอบใช้งานเป็นคนละสถานะ ข้อค้นพบ CI ปัจจุบันอ้าง GitHub remote ไม่ใช่ checkout เก่าทั้งสองแห่ง

## งานที่พบจริงใน SciSpace

| บทสนทนาที่ตรวจ | งานล่าสุดที่แสดง | แนวทางส่งต่อที่เสนอ |
|---|---|---|
| [MONOLITH Manufacturing OS](https://scispace.com/chat/8fe0bb23-1325-4cf5-98c5-5e05b740286f) | Sprint 15: migration/types/store ของ Team Pulse Check และงานผู้ดูแล Sentiment Timeline; รายงาน commit `8387a825` | เก็บ implementation เดิม SciSpace ส่งความต้องการผู้ใช้ Codex ตรวจและต่อ UI/การทดสอบตามสัญญาข้อมูลเดิม |
| [Security Audit Session Roadmap](https://scispace.com/chat/240be26b-287a-4ada-8ab0-f181ffe8e788) | แก้ root tests และเพิ่ม exclusions; ยังมีงานปรับรายงานความปลอดภัย | Codex รับความครอบคลุมการทดสอบและหลักฐานความปลอดภัย SciSpace ปรับคำอธิบายจากผลที่ยืนยันแล้ว |
| [Integrated Operational Framework](https://scispace.com/chat/80c1d8ef-3d73-41ac-ad74-c890b6e278cd) | แก้ฐานข้อมูล Round 23 และส่งต่องาน Round 24 พร้อมเอกสาร SOP | SciSpace ดูแลความสอดคล้อง SOP ส่วน Codex เทียบรายการแก้ระบบเก่ากับ commit ปัจจุบันก่อนลงมือ |
| [Elastic Monolith Review](https://scispace.com/chat/c8c7d395-868d-488f-835e-caafa146e675) | ชุด reconciliation ใหม่ 36 ไฟล์และ dashboard; CON-013 ยัง blocked; บางงาน PFMEA และสถานะโครงการแสดงว่าปิดแล้ว | SciSpace เทียบชุดใหม่กับ intake Codex ตรวจแหล่งอ้างอิงและผลต่อระบบ รักษาการตัดสินใจจริงของเจ้าของพร้อมหลักฐาน |
| [Barausse Manual Guide](https://scispace.com/chat/abcf131c-4325-49f4-af02-38af4d5555d6) | เอกสารตรวจ domain ของ SC-17/18 และดัชนีกลาง; รายงานว่ายังรอเผยแพร่ | SciSpace ส่งชุดงานและที่มา Codex ตรวจ remote ก่อนนำเข้า |
| [Modular Monolithic Furniture](https://scispace.com/chat/e677e193-a431-48b9-96e6-96c81c07d9ae) | BOM ตารางเปรียบเทียบ RFQ และ checklist ของ Blum; รายงาน local commit `573cf73` รอ push | SciSpace ตรวจข้อมูลสินค้าและสมมติฐานราคา Codex ตรวจการเผยแพร่และความเข้ากันของเอกสาร สถานะพร้อม push ยังไม่ใช่รับมอบบน remote |
| [Here are the thread names 1 Fix Missing](https://scispace.com/chat/770b95f7-6594-426b-81a3-fb1bba44d646) | งานชื่อ secrets/hook และคำขอโทเคน LINE Notify | Codex เทียบ workflow ปัจจุบัน เปลี่ยนรายการ LINE Notify ที่ล้าสมัย ข้อมูลลับให้จัดการผ่านการตั้งค่าบัญชี |
| [ระบบ accounting ในระบบ Monolith การจัดการบัญชีแบบรวมศูนย์](https://scispace.com/chat/0ea95798-2ce9-467d-a450-6e7c8b5962b1) | ขณะตรวจยังติดตาม CI อยู่ | รับ handoff งานระบบที่กำลังทำ ไม่แบ่งงานตามชื่อ accounting เพียงอย่างเดียว |
| [Supplier Portal (พอร์ทัลซัพพลายเออร์ หรือ Vendor Portal) ของ Monolith ทั้งระบบ](https://scispace.com/chat/883b1d71-3e68-4f56-9ee6-be3b5612814f) | แก้นโยบายฐานข้อมูล TPC ที่ `1c554a3c` และกำลังติดตาม CI | รักษางานแก้และรับ handoff ชื่อบทสนทนานี้ไม่ใช่หลักฐานว่า supplier portal เสร็จ |

## ชุดงานที่ควรเริ่ม

ลำดับความสำคัญบอกลำดับทำงาน ไม่ใช่คำรับรองวันเสร็จ ผู้รับผิดชอบด้านล่างเป็นข้อเสนอผู้ทำงานหลัก ไม่ใช่การแต่งตั้งบุคคลผู้อนุมัติ

| รหัส / ลำดับ | ผู้รับผิดชอบหลัก | สิ่งส่งมอบ | หลักฐานว่าจบ |
|---|---|---|---|
| O-01 / ทันที | เจ้าของบัญชี โดย Codex ช่วยตรวจ | เพิกถอนหรือเปลี่ยนข้อมูลรับรอง GitHub ที่ปรากฏในประวัติคำสั่ง SciSpace และเชื่อมบัญชีที่จำเป็นใหม่ผ่านการตั้งค่าที่ปลอดภัย | เจ้าของบันทึกว่าจัดการแล้วโดยไม่เผยค่าลับ ตรวจสิทธิ์ที่จำเป็น รอบนี้ไม่ได้ทดสอบว่าโทเคนเดิมยังใช้ได้หรือไม่ |
| C-01 / P1 | Codex | จับคู่ชุดทดสอบกับ runtime/config และเงื่อนไขเรียก CI แก้ exclusions หรือ runner ที่จำเป็น | ทุกกลุ่มที่ได้รับผลมีช่องทางรันจริง จำนวน tests ที่คาดไว้มากกว่าศูนย์ และเก็บผลที่รุ่นเดียวกัน รักษาตัวตรวจชุดทดสอบว่างของ edge ที่มีอยู่ |
| C-02 / P1 | Codex | เตรียม PR #106 เทียบ main ปัจจุบัน รักษางาน SciSpace และตรวจการเปลี่ยนกติกา lint/allowlist | มี candidate รวมให้ตรวจ ผลทดสอบที่เกี่ยวข้องใหม่ และไม่มีงานสูญหาย แยกการรวมโค้ดจากการเปิดใช้งานจริง |
| C-03 / P1 | Codex; SciSpace ให้ความต้องการแจ้งเตือน | แก้ workflow รายงานบัญชีและออกแบบช่องทางแจ้งเตือนที่ยังรองรับ | สร้างรายงานได้แยกจากการส่งแจ้งเตือน ทดสอบความล้มเหลวของช่องทางที่เลือก การส่งข้อความจริงต้องมีผู้รับและการอนุญาตส่ง |
| C-04 / P2 | Codex | วินิจฉัย component error ที่ Chromatic รายงาน | อธิบายสาเหตุของ component และตรวจผลแก้ ไม่รับ baseline เพียงเพื่อซ่อน error |
| C-05 / งานผลิตภัณฑ์ถัดไปที่ตกลง | Codex; SciSpace ให้ข้อกำหนด | UI และ tests ของ TPC โดยใช้ store/schema เดิม หากยังอยู่ในขอบเขตส่งมอบที่เลือก | ครอบคลุมสิทธิ์ตามแผน การตอบแบบประเมิน DRAFT→ACTIVE→CLOSED ความล้มเหลว/ย้อนสถานะ และการแยก tenant พร้อมหลักฐาน UI และการรับมอบผู้ใช้ |
| S-01 / P1 ทำคู่ขนาน | SciSpace; Codex ตรวจหลักฐาน | ดัชนีแหล่งข้อมูลและทะเบียนการตัดสินใจ/สถานะกลางที่แก้ตามชุดใหม่ | ทุก SC-01–18 มี source/version และผลพิจารณา แก้ CON-013 ที่ล้าสมัยด้วย roadmap ที่มีแล้ว เทียบรายการปิดกับการตัดสินใจจริงและขอบเขต |
| S-02 / P1 ทำคู่ขนาน | SciSpace; เจ้าของ architecture/product ตัดสินใจ | ตารางความหมาย AIE/GAP พจนานุกรม namespace และข้อเสนอชื่อ VS-01 | เก็บความสามารถที่ต่างกันครบ แยก SOP S17 จาก manufacturing S17-1…5 ไม่สร้าง GAP-16 อัตโนมัติหรือยกเลิกข้อกำหนดเงียบ ๆ มีมติระบุรุ่นก่อนงานที่พึ่งพา |
| S-03 / ก่อนลงมือ pilot | SciSpace; Codex พัฒนา/ทดสอบ | SOP โครงการทดลอง ข้อกำหนด agent/API และตารางการดำเนินการ field/PFMEA | ระบุข้อมูลเข้า/ออก บทบาท retry escalation หลักฐานและตัวอย่างรับมอบ แยก classify/notify/halt/resume ราย domain Codex ตามจุดใช้ค่าและทดสอบขอบเขต 7/8/9 |
| S-04 / เมื่อ pilot ใช้ | SciSpace; เจ้าของ domain ตรวจ; Codex นำเข้า | ทะเบียนแหล่งข้อมูล Barausse/Blum, BOM และ checklist ติดตั้ง | ตรวจรหัสผู้ผลิต รุ่นเอกสาร หน่วย สิทธิ์ใช้และ compatibility ผู้รับผิดชอบยืนยันขนาด/จำนวน/ต้นทุนจริง ติดตามการนำเข้าบน remote |
| S-05 / งานธุรกิจหรือระยะหลัง | SciSpace; เจ้าของจัดลำดับ | หลักฐาน BOI/ธุรกิจ งานวิจัย การอบรม และข้อกำหนด AI/ความรู้ระยะถัดไป | ใช้แหล่งปฐมภูมิปัจจุบันและระบุสมมติฐาน Codex ให้ข้อเท็จจริงระบบที่พิสูจน์แล้ว การผูกพันภายนอกหรือปิดโครงการต้องมีมติจากผู้รับผิดชอบ |

## เหตุผลที่รายการงานระบบเปลี่ยน

ที่ main รุ่นอ้างอิง [Full Verify](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34662443159), [FPR](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34662443157) และ [DB Verify](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34662443140) ผ่านแล้ว [pgTAP](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34662443146) ยังรัน ส่วน [Billing](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34662442748) ล้มเหลวและไม่มี job แสดง นี่คือภาพสถานะตามเวลาตรวจ ไม่ใช่ข้อสรุปว่าผ่านทั้งหมด

- **ต้องยืนยันว่าทดสอบครอบคลุม:** [ecf48605](https://github.com/indetailsgroup-hue/monolith-workspace/commit/ecf48605a3981e50419d3a59e941e9982de6ba25) เพิ่ม exclusions กว้างที่ `tests/**`, `supabase/**`, `entitlement-db/**` แต่ [workflow test ที่ตรวจ](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c554a3cdf33c43ae4971ce1b984d39572f5d47a/tests/workflow/ts/captureMediaWorker.unit.test.ts) ใช้ Vitest และ workflow [edge](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c554a3cdf33c43ae4971ce1b984d39572f5d47a/.github/workflows/edge-fn-verify.yml) กับ [entitlement](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c554a3cdf33c43ae4971ce1b984d39572f5d47a/.github/workflows/entitlement-db-verify.yml) เรียก Vitest โดยไม่ระบุ config อื่น ความไม่สอดคล้องใน source นี้รองรับงาน C-01 แต่ยังไม่ใช่ผลทดลองรันใหม่ทุกชุด
- **ไม่แจกงานแก้ซ้ำ:** upstream แก้การอ้าง `user_profiles` ของ EST และ TPC แล้ว ต้องเทียบ 33 root failures เดิมกับ fixes และ coverage ปัจจุบันก่อนแจกซ้ำ [PR #106](https://github.com/indetailsgroup-hue/monolith-workspace/pull/106) ยัง Draft/Open ที่ `43ed3720` และตามหลัง main พบ PR เปิด 1 รายการ และ issue เปิด 0 รายการในภาพสถานะนี้ จำนวน issue ไม่ใช่จำนวนงานค้างทั้งหมด
- **รายงานบัญชีต้องใช้ช่องทางปัจจุบัน:** [workflow](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c554a3cdf33c43ae4971ce1b984d39572f5d47a/.github/workflows/billing-report.yml) อ้าง secrets ในเงื่อนไขและ LINE Notify ยังไม่ได้ยืนยัน annotation ต้นเหตุที่เริ่ม workflow ไม่ได้ LINE ยุติ Notify ตั้งแต่ **31 มีนาคม 2025** จึงไม่ควรมีงานขอโทเคน Notify ใหม่ ดู [ประกาศ LINE](https://developers.line.biz/en/news/2025/04/01/line-notify/)
- **หลักฐานเฉพาะขอบเขตอื่น:** [Chromatic run](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34662132678/job/103466643573) รายงาน 1 component error ที่ `8387a825` และ tree `src/culture-metrics` ที่ตรวจบน main มี TPC types/store แต่ไม่มี UI/story/test เฉพาะ TPC ข้อนี้จำกัดเฉพาะขอบเขตที่ตรวจ ไม่ใช่การอ้างว่าหาไม่พบทั้ง repository
- **ข้อมูลรับรองปรากฏในประวัติ:** พบข้อมูลรับรอง GitHub ในคำสั่งที่หน้าเว็บแสดง ยังไม่ทราบความใช้ได้หรือการนำไปใช้ผิดวัตถุประสงค์ ควรเพิกถอน/เปลี่ยนโดยไม่คัดลอกค่าลงรายงานหรือแชต ตาม [คำแนะนำ GitHub](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

## ข้อตกลงการทำงานร่วมกัน

1. ใช้ backlog กลาง มีรหัสงาน ผู้ทำ ผู้ตรวจ รุ่นแหล่งข้อมูล ไฟล์ที่เกี่ยวข้อง งานที่พึ่งพา สถานะและหลักฐานรับมอบ ชื่อบทสนทนา SciSpace ไม่ใช่รหัสงาน
2. ให้งานระบบที่ SciSpace กำลังทำจบหรือถึงจุด handoff ก่อนอีกฝั่งแก้ไฟล์เดียวกัน บันทึกรุ่นสุดท้ายและงานที่ยังไม่เสร็จ รอบตรวจนี้ไม่ได้หยุดงานเหล่านั้น
3. SciSpace ส่งโค้ดหรือต้นแบบได้ใน branch แยกตามงาน Codex ตรวจ ทดสอบ และเตรียมรวมผ่าน PR เสนอให้มีผู้ประสานการรวมงานเพียงรายเดียว ไม่แก้ main พร้อมกันและไม่จองเลข migration ซ้ำ
4. ทุก handoff ระบุรุ่นไฟล์/แหล่งข้อมูล สิ่งที่เปลี่ยน ข้อที่ยังไม่รู้ มติที่ได้รับอนุญาตแล้ว การทดสอบที่คาดหวังและผู้รับช่วง ห้ามใส่ค่าลับ
5. ใช้สถานะชัดเจน: เสนอ / กำลังทำ / ส่งตรวจ / ตรวจยืนยัน / รับมอบ การสร้างเอกสาร local commit อัปโหลดสำเร็จ หรือ tests บางชุดผ่าน เพียงอย่างเดียวยังไม่ยืนยันว่าทั้งโครงการจบ
6. เอกสารโครงการมี TH/EN Markdown และ HTML ที่ตรงกันและเปิดเดี่ยวได้ SciSpace รับผิดชอบคุณภาพเนื้อหา Codex ตรวจลิงก์หลักฐานและข้ออ้างด้านระบบก่อนเผยแพร่

เจ้าของเลือก pilot และแนวทาง field app รับมอบแผนความหมาย AIE/GAP ยืนยันกฎ PFMEA ราย domain งบประมาณและการรับมอบการผลิตจริง ทั้งสองฝ่ายเตรียมทางเลือกและหลักฐานที่ตรวจได้ก่อนขอมติ ระหว่างรอมติให้ทำ R0 ส่วนที่ไม่พึ่งพาต่อได้ ส่วนการขยาย AI อยู่ R5 เว้นแต่มี dependency ของ pilot ที่รับไว้แล้วเปลี่ยนลำดับ

## ครอบคลุม roadmap เดิมอย่างไร

S-01 ครอบคลุม SC-01/04/08 และ CON-011/013; S-02 ครอบคลุม SC-03/05/06/07/15 และ CON-001–010; S-03 ครอบคลุม SC-02/03/09/10/11/12/13/14 และ CON-012; S-04 ครอบคลุม SC-17/18 พร้อมงาน Blum ที่เพิ่งตรวจ; S-05 ครอบคลุม SC-16 และงานวิจัย/อบรม/AI ระยะหลัง ส่วน C-01–05 ลงมือและตรวจยืนยันงานส่งมอบที่เกี่ยวข้อง การจับคู่นี้ไม่ใช่คำมั่นว่าจะสร้างทุกข้อเสนอในประวัติ

อ่านร่วมกับ [roadmap การส่งมอบ](../roadmap/2026-09-11-monolith-delivery-roadmap.th.md), [ข้อแก้ไข intake](2026-09-11-scispace-reconciliation-intake.th.md) และ ข้อแก้ไขขอบเขต repository (`docs/reports/2026-07-21-ima-schelling-monolith-repository-scope-correction.th.md`; เป็นแหล่งเอกสารใน governance root ของเครื่องนี้)

ชุด SciSpace ใหม่ 36 ไฟล์ยังไม่ถือเป็นชุดเดียวกับ intake 6 ไฟล์เดิมและไม่ได้ใช้ hash ของชุดเก่าแทน รายงานการอนุมัติ PFMEA และปิดโครงการต้องเทียบกับมติจริง ไม่อนุมานว่ามีหรือไม่มีการอนุมัติจากสรุปบทสนทนาเพียงอย่างเดียว

[English edition](2026-09-12-monolith-work-allocation.en.md)
