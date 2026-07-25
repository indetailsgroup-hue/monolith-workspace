# MONOLITH Repair Intelligence — ชุดเอกสารควบคุม Phase 0 (ฉบับภาษาไทย)

ฉบับคู่กัน: `docs/governance/repair-intelligence-phase0-control-pack.en.md` (ภาษาอังกฤษ, หัวข้อตรงกันทุกหมายเลข)

## 1. สถานะและขอบเขตของ Phase 0

บล็อกสถานะของเอกสาร (บรรทัดสถานะตามตัวอักษร — คงเป็นภาษาอังกฤษ):

- `Phase 0 exit: PENDING_OWNER_REVIEW`
- `Expert Label Protocol: PROPOSED / NOT RUN`
- `Gate B: NOT PASSED`
- `Immutable infrastructure: NOT CLAIMED`
- `Phase 1A–3 capabilities: DISABLED`

ขอบเขต Phase 0 — สิ่งที่ "อยู่ในขอบเขต":

- ผนวก Trust Kernel ที่มีอยู่เดิมเข้าสู่ canonical product main
- โมเดลขอบเขต tenant → organization → site (migration `0189`)
- สัญญา capability ของ Repair แบบ deny-only ใน `server/src/trust-kernel/repair/phase0Policy.ts` ซึ่งตอบกลับด้วย reason code คงที่ `REPAIR_PHASE_NOT_ENABLED` สำหรับทุกคำขอ capability ของ Repair
- การกักเก็บระบบเดิมแบบ fail-closed (migration `0190`): ถอด storage policy แบบกว้างของ `field_media` ออก; เพิกถอนสิทธิ์เรียกใช้ `rpc_field_submit_photo` และ `rpc_capture_ingest`; เส้นทางดาวน์โหลด signed-URL แบบเดิม และเส้นทาง byte `GET`/`HEAD` `/artifacts/:sha256` ตอบกลับ HTTP `423 (Locked)`; `capture-ocr-extract` ปฏิเสธ `raw_uri` ที่ส่งมาจาก client โดยค่าเริ่มต้น

ขอบเขต Phase 0 — สิ่งที่ "อยู่นอกขอบเขต" (capability ของ Phase 1A–3 ทั้งหมดอยู่ในสถานะ DISABLED):

evidence upload/quarantine/scan, OCR, live AI, human review queue, work order, procurement, payment, professional sign-off, R8–R12 execution, native mobile, BIM authoring

คำขอใด ๆ ต่อ capability ที่อยู่นอกขอบเขตจะถูกปฏิเสธโดย `phase0Policy.ts` ด้วย reason code `REPAIR_PHASE_NOT_ENABLED`

## 2. ความเป็นเจ้าของที่รับผิดชอบได้และ RACI

เจ้าของ (Owners):

- **Security/IAM** — การบังคับใช้ระดับแพลตฟอร์ม (RLS, สิทธิ์ grant, ความหมายของ token)
- **Release Governance** — การตัดสินใจผ่านเกต, การดูแลบรรทัดสถานะ, การอนุมัติปล่อยรุ่น
- **Manufacturing Engineering** — ข้อกำหนดเชิงโดเมนและความถูกต้องของ workflow หน้างาน
- **Platform Engineering** — migrations, routes, edge functions, ระบบ CI
- **Independent QA/Safety** — ตรวจสอบ negative test และตรวจสอบหลักฐาน
- **Repair Intelligence Governance** — ผู้ดูแลโดเมน Repair; เป็นเจ้าของชุดเอกสารควบคุมนี้และนิยามขอบเขต Phase 0

RACI (R = Responsible, A = Accountable, C = Consulted, I = Informed):

| กิจกรรม | Security/IAM | Release Governance | Manufacturing Eng. | Platform Eng. | Independent QA/Safety | Repair Intelligence Governance |
|---|---|---|---|---|---|---|
| โมเดลขอบเขต (migration 0189) | A | I | C | R | C | C |
| สัญญา capability แบบ deny-only (phase0Policy.ts) | C | I | I | R | C | A |
| การกักเก็บระบบเดิม (migration 0190, เส้นทาง 423) | A | I | I | R | C | C |
| ชุด negative test และหลักฐาน | C | I | I | C | R | A |
| การตัดสินใจ Phase 0 exit | C | A | C | I | R | R |
| ชุดเอกสารควบคุมนี้ | C | C | C | I | C | R/A |

## 3. การจัดชั้นข้อมูลและการจัดชั้นอำนาจ

ชั้นข้อมูล:

| ชั้น | ชื่อ | นิยาม | การจัดการใน Phase 0 |
|---|---|---|---|
| P0 | Public projection | ข้อมูลที่ปลอดภัยสำหรับการแสดงผลสาธารณะ/ไม่ต้องยืนยันตัวตน | อนุญาตผ่าน display-only browser role |
| P1 | Internal review | ข้อมูลปฏิบัติการสำหรับสมาชิกที่ยืนยันตัวตนแล้วภายในขอบเขต | ตรวจขอบเขต (tenant → organization → site) |
| P2 | Sealed plaintext (workload-only) | plaintext อ่อนไหวที่อ่านได้เฉพาะ workload ที่กำหนด | เฉพาะ workload; เส้นทางของมนุษย์และเบราว์เซอร์ถูกปฏิเสธ |

ชั้นอำนาจ:

| ชั้น | นิยาม | ข้อจำกัด |
|---|---|---|
| Verified human authority | Bearer token + membership ปัจจุบัน + action context แบบใช้ครั้งเดียว | ต้องครบทั้งสาม; membership ที่ล้าสมัยทำให้อำนาจเป็นโมฆะ |
| Service-role worker | อัตลักษณ์ workload ฝั่ง backend ใช้ downstream เท่านั้น | ไม่ถือเป็นอำนาจของมนุษย์โดยเด็ดขาด; ไม่สามารถริเริ่มการกระทำของมนุษย์ได้ |
| Display-only browser role | บทบาทเบราว์เซอร์/นิรนามสำหรับการแสดงผล | อ่านได้เฉพาะ P0 projection; ห้ามเขียน, ห้ามอ่าน P1/P2 |

## 4. โมเดลภัยคุกคาม (Threat model)

| Threat | Control | Negative test/evidence |
|---|---|---|
| Identity spoofing | Verified human authority ต้องมี bearer token + membership ปัจจุบัน + action context แบบใช้ครั้งเดียว | `supabase/tests/repair_phase0_organization.sql` assertion กรณีเข้าถึงโดยไม่ยืนยันตัวตน/ปลอมอัตลักษณ์ |
| Stale membership | ตรวจ membership ณ เวลาที่ร้องขอ; membership ที่ถูกเพิกถอนทำให้อำนาจถูกปฏิเสธ | `supabase/tests/repair_phase0_organization.sql` assertion การปฏิเสธ stale membership |
| Cross-tenant access | ขอบเขต tenant ในโมเดล scope (migration 0189) + RLS | `supabase/tests/repair_phase0_organization.sql` assertion การปฏิเสธข้าม tenant |
| Cross-organization access | ขอบเขต organization ภายใน tenant (migration 0189) + RLS | `supabase/tests/repair_phase0_organization.sql` assertion การปฏิเสธข้าม organization |
| Cross-site access | ขอบเขต site ภายใน organization (migration 0189) + RLS | `supabase/tests/repair_phase0_organization.sql` assertion การปฏิเสธข้าม site |
| Service-role impersonation | Service-role worker ใช้ downstream เท่านั้น ไม่ถูก map เป็นอำนาจของมนุษย์ | `server/src/trust-kernel/test/repairPhase0Policy.test.ts` กรณีปฏิเสธ service-role |
| Actor-header spoofing | อัตลักษณ์ของ actor มาจาก token ที่ตรวจสอบแล้วเท่านั้น ไม่มาจาก header ที่ client ส่ง | `server/src/trust-kernel/test/repairPhase0Policy.test.ts` กรณีปฏิเสธการปลอม header |
| Raw locator/SSRF via client raw_uri | `capture-ocr-extract` ปฏิเสธ `raw_uri` ที่ client ส่งมาโดยค่าเริ่มต้น | `supabase/functions/capture-ocr-extract/index.test.ts` กรณีปฏิเสธ raw_uri |
| Unsigned hash byte access | เส้นทาง byte `GET`/`HEAD` `/artifacts/:sha256` ตอบกลับ 423 | `server/src/trust-kernel/test/repairLegacyRouteContainment.test.ts` assertion 423 |
| Signed-token replay | เส้นทางดาวน์โหลด signed-URL แบบเดิมตอบกลับ 423; action context แบบใช้ครั้งเดียวจำกัดหน้าต่าง replay | `server/src/trust-kernel/test/repairLegacyRouteContainment.test.ts` assertion 423 ของ signed-URL |
| Broad bucket policy | Migration 0190 ถอด storage policy แบบกว้างของ `field_media` ออก | `supabase/tests/repair_phase0_containment.sql` assertion การปฏิเสธของ storage policy |
| Duplicate authority | Action context แบบใช้ครั้งเดียว; การใช้ action context ซ้ำถูกปฏิเสธ | `server/src/trust-kernel/test/repairPhase0Policy.test.ts` กรณีปฏิเสธ context ซ้ำ |
| R8–R12 bypass | R8–R12 execution อยู่ในชุด DISABLED; `phase0Policy.ts` ปฏิเสธด้วย `REPAIR_PHASE_NOT_ENABLED` | `server/src/trust-kernel/test/repairPhase0Policy.test.ts` กรณีปฏิเสธตาม capability matrix |
| Evidence tampering | การตรวจสอบ ledger ของหลักฐาน Phase 0 และบัญชีรายการ route | `scripts/trust-kernel/verify-repair-phase0-ledger.mjs` ล้มเหลวเมื่อไม่ตรงกัน |
| CI-report omission | ตัวตรวจ ledger บังคับให้รายงานและรายการ route ที่จำเป็นต้องครบถ้วน มิฉะนั้น CI ล้มเหลวแบบ fail-closed | `scripts/trust-kernel/verify-repair-phase0-ledger.mjs` และ `scripts/trust-kernel/verify-route-ledger.mjs` ตรวจความครบถ้วนแบบ fail-closed |
| Break-glass misuse | เส้นทาง break-glass: BLOCKED ใน Phase 0; การเปลี่ยนแปลงฉุกเฉินใด ๆ ต้องผ่านการทบทวนโดยเจ้าของที่ระบุชื่อและถูกบันทึก | ต้องมีบันทึกการทบทวนการเปลี่ยนแปลง; `supabase/tests/repair_phase0_containment.sql` ยืนยันว่าสิทธิ์ที่ถูกเพิกถอนยังคงถูกเพิกถอน |

## 5. ตารางจับคู่ control กับ negative test

| Phase 0 control | Negative test / verifier | ความครอบคลุม |
|---|---|---|
| ขอบเขต tenant → organization → site (migration 0189) | `supabase/tests/repair_phase0_organization.sql` | 14 assertions: ข้าม tenant, ข้าม organization, ข้าม site, stale membership, ปลอมอัตลักษณ์ |
| การกักเก็บระบบเดิม (migration 0190) | `supabase/tests/repair_phase0_containment.sql` | 5 assertions: ถอด storage policy, เพิกถอน `rpc_field_submit_photo`, เพิกถอน `rpc_capture_ingest` |
| สัญญา capability แบบ deny-only | `server/src/trust-kernel/test/repairPhase0Policy.test.ts` | ทุก capability ของ Phase 1A–3 ถูกปฏิเสธด้วย `REPAIR_PHASE_NOT_ENABLED`; กรณี service-role, ปลอม header, context ซ้ำ |
| การกักเก็บ route เดิม (423) | `server/src/trust-kernel/test/repairLegacyRouteContainment.test.ts` | ดาวน์โหลด signed-URL และ `GET`/`HEAD` `/artifacts/:sha256` ตอบกลับ 423 |
| การปฏิเสธ raw_uri | `supabase/functions/capture-ocr-extract/index.test.ts` | `raw_uri` ที่ client ส่งมาถูกปฏิเสธโดยค่าเริ่มต้น |
| Ledger หลักฐาน Phase 0 | `scripts/trust-kernel/verify-repair-phase0-ledger.mjs` | ตรวจความครบถ้วนของ ledger และ hash แบบ fail-closed ทุกกรณีที่ตรวจไม่ผ่าน |
| Route ledger | `scripts/trust-kernel/verify-route-ledger.mjs` | บัญชีรายการ route ตรงกับสถานะการกักเก็บที่ประกาศไว้; ล้มเหลวเมื่อมี drift |

## 6. ความเป็นส่วนตัว การเก็บรักษา การลบ legal hold และการปกปิดข้อมูลใน log

- การจัดเก็บหลักฐานลูกค้าของ Repair ใน Phase 0: BLOCKED การนำเข้าถูกปฏิเสธโดย control การกักเก็บในหัวข้อ 1 (migration 0190, เส้นทาง 423, การปฏิเสธ `raw_uri`, RPC ที่ถูกเพิกถอน) ดังนั้นภาระการเก็บรักษา ส่งออก และลบข้อมูลโดเมน Repair ใน Phase 0 จึงลดเหลือเพียงการตรวจสอบว่าการกักเก็บยังคงทำงาน
- ห้ามบันทึก raw locator (`raw_uri`, signed URL, storage path) หรือ PII ลงใน log; การตอบกลับแบบปฏิเสธจะบันทึกเฉพาะ reason code (`REPAIR_PHASE_NOT_ENABLED`) และตัวระบุขอบเขตเท่านั้น
- การเก็บรักษา: หลักฐาน Phase 0 (รายงานทดสอบ, ledger ภายใต้ `reports/phase0`) เก็บรักษาตามนโยบายของ Release Governance
- ความรับผิดชอบการลบ: Platform Engineering ดำเนินการลบเชิงกลไก; Security/IAM ตรวจสอบขอบเขต; Release Governance อนุมัติ
- Legal hold: Release Governance เป็นผู้ประกาศ hold; Independent QA/Safety ตรวจสอบว่ามีการปฏิบัติตาม; Repair Intelligence Governance ได้รับแจ้ง
- การปกปิดข้อมูลใน log: Platform Engineering เป็นเจ้าของ redaction filter; Independent QA/Safety สุ่มตรวจตัวอย่างเพื่อหา raw locator และ PII

## 7. ขอบเขตการวัด SLO และ error budget ของ Phase 0

Phase 0 กำหนดไว้เพื่อ "การวัดผลเท่านั้น" ไม่มีการอ้างความพร้อมสำหรับ production และ Phase 0 is NOT production and NOT GA

สัญญาณที่วัด:

| สัญญาณ | นิยาม | ขอบเขต |
|---|---|---|
| Deny-response availability | สัดส่วนคำขอ capability ของ Repair ที่ได้รับการปฏิเสธอย่างถูกต้อง (`REPAIR_PHASE_NOT_ENABLED` หรือ 423) | เป็นการวัดผลภายในเท่านั้น; ข้อผูกพัน SLO ต่อลูกค้า: NOT CLAIMED |
| CI green rate | สัดส่วนการรัน CI ที่ verifier ทั้งหมดในหัวข้อ 5 ผ่าน | วัดผลเท่านั้น; ใช้ประกอบการทบทวน Phase 0 exit |

Error budget ใน Phase 0 มีไว้เพื่อสอบเทียบ SLO ในอนาคต; การละเมิดขอบเขตการวัดจะกระตุ้นการทบทวน ไม่ใช่การดำเนินการปล่อยรุ่น

## 8. ระดับความรุนแรงของเหตุการณ์ การยกระดับ kill switch และการรักษาหลักฐาน

เกณฑ์ความรุนแรง:

| ระดับ | นิยาม | ตัวอย่าง | การยกระดับ |
|---|---|---|---|
| SEV1 | การกักเก็บถูกเจาะ: capability ที่ถูกปิดถูกเรียกใช้สำเร็จ หรือ byte ของหลักฐานถูกส่งออก | ได้ 200 จาก route ที่ควรตอบ 423; RPC ทำงานหลังถูกเพิกถอน | ทันที: Security/IAM + Release Governance + Repair Intelligence Governance |
| SEV2 | Control เสื่อมประสิทธิภาพโดยยังไม่ยืนยันว่าถูกเจาะ | Ledger verifier ล้มเหลวบน main; ตรวจพบ RLS policy drift | ภายในวันทำการเดียวกัน: ทีมเจ้าของ + Independent QA/Safety |
| SEV3 | ข้อบกพร่องของการวัดหรือเครื่องมือ | CI flake ใน negative test; ข้อผิดพลาดการสร้างรายงาน | คัดแยกตามปกติ: Platform Engineering |

- การยกระดับ: ทุกเหตุการณ์จะถูกยกระดับไปยังเจ้าของที่ระบุในหัวข้อ 2 ของ control ที่ได้รับผลกระทบ; SEV1 ต้องแจ้ง Release Governance เพิ่มเติมเพราะกระทบบรรทัดสถานะ
- Kill switch: kill switch ของ Phase 0 คือ deny-by-default ซึ่งบังคับใช้อยู่แล้ว — `phase0Policy.ts` ปฏิเสธ capability ของ Repair ทั้งหมด และการกักเก็บตอบกลับ 423 เส้นทางการเปิดใช้ capability เองก็ถูกปฏิเสธโดย `phase0Policy.ts` ใน Phase 0; การตอบสนองเหตุการณ์จึงมุ่งที่การตรวจสอบพฤติกรรม deny ไม่ใช่การปิด feature
- การรักษาหลักฐาน: รักษาหลักฐาน `reports/phase0`, ผลลัพธ์ ledger และ log ที่เกี่ยวข้องก่อนการแก้ไข; Independent QA/Safety เป็นผู้ถือครอง snapshot ของหลักฐาน

## 9. ความรับผิดชอบด้าน backup/restore และ disaster recovery

| ความรับผิดชอบ | เจ้าของ | หมายเหตุ |
|---|---|---|
| การสำรองฐานข้อมูลและซ้อม restore | Platform Engineering | รวมสถานะ migrations 0189/0190; การ restore ต้องกลับสู่ posture กักเก็บ (deny) |
| การตรวจสอบการกักเก็บหลัง restore | Independent QA/Safety | รัน `supabase/tests/repair_phase0_containment.sql` และ `repair_phase0_organization.sql` ซ้ำหลังทุกการ restore |
| การสำรอง ledger และหลักฐาน (`reports/phase0`) | Release Governance | ตรวจสอบความสมบูรณ์ของ ledger ซ้ำด้วย `scripts/trust-kernel/verify-repair-phase0-ledger.mjs` |
| การดูแล DR runbook | Platform Engineering, ทบทวนโดย Security/IAM | Fail-closed: หากสถานะ restore ไม่แน่ชัด route ยังคงตอบ 423 และสิทธิ์ RPC ยังคงถูกเพิกถอน |
| อำนาจตัดสินใจ DR | Release Governance | ปรึกษา Repair Intelligence Governance สำหรับผลกระทบต่อโดเมน Repair |

การ restore ที่ไม่สามารถแสดง posture การปฏิเสธได้ ให้ถือเป็น SEV1 ตามหัวข้อ 8 จนกว่าการตรวจสอบจะผ่าน

## 10. เกตการปล่อยรุ่นและข้อไม่อ้างสิทธิ์อย่างชัดแจ้ง

บรรทัดสถานะ (เหมือนหัวข้อ 1 ทุกประการ):

- `Phase 0 exit: PENDING_OWNER_REVIEW`
- `Expert Label Protocol: PROPOSED / NOT RUN`
- `Gate B: NOT PASSED`
- `Immutable infrastructure: NOT CLAIMED`
- `Phase 1A–3 capabilities: DISABLED`

กติกาของเกต:

- Phase 0 exit ต้องผ่านการทบทวนโดยเจ้าของที่ระบุชื่อจาก Release Governance พร้อมการลงนามของ Independent QA/Safety และ Repair Intelligence Governance ห้ามขั้นตอนอัตโนมัติใด ๆ — CI job, script, การ merge, ledger verifier หรือ scheduled task — เปลี่ยน `PENDING_OWNER_REVIEW` เป็น approved ระบบอัตโนมัติมีหน้าที่รายงานเท่านั้น มนุษย์เป็นผู้ตัดสิน
- Gate B ยังคงสถานะ `NOT PASSED` จนกว่าการทบทวนของ Gate B เองจะเสร็จสิ้น; เอกสารนี้ไม่อ้างสิ่งใดเกี่ยวกับ Gate B นอกเหนือจากบรรทัดสถานะดังกล่าว
- ข้อไม่อ้างสิทธิ์อย่างชัดแจ้ง: ชุดเอกสารนี้ไม่อ้างความพร้อม production, ไม่อ้าง GA, ไม่อ้าง immutable infrastructure, ไม่อ้างว่า Expert Label Protocol ได้ถูกรันแล้ว และไม่อ้างว่า capability ใดของ Phase 1A–3 ถูกเปิดใช้งาน
