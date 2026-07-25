# MONOLITH Repair Intelligence — ชุดเอกสารการย้ายฐานข้อมูลและการย้อนกลับ (Migration and Rollback Pack) เฟส 0

Document ID: repair-intelligence-phase0-migration-rollback
ฉบับ: ภาษาไทย (ฉบับภาษาอังกฤษที่เทียบเคียงกัน: `docs/governance/repair-intelligence-phase0-migration-rollback.en.md`)
วันที่: 2026-07-25
สาขาปฏิบัติการ (execution branch): `codex/repair-intelligence-phase0-trust`

---

## 1. สถานะ (Status)

Phase 0 exit: PENDING_OWNER_REVIEW
Expert Label Protocol: PROPOSED / NOT RUN
Gate B: NOT PASSED
Immutable infrastructure: NOT CLAIMED
Phase 1A–3 capabilities: DISABLED

บรรทัดสถานะทั้งหมดข้างต้นเป็นสถานะเชิงธรรมาภิบาลแบบตรงตัว (literal) ห้ามตีความสถานะใดในเอกสารนี้ว่าเป็นการอ้างความสำเร็จ สถานะแต่ละรายการจะเปลี่ยนได้ก็ต่อเมื่อเจ้าของ (owner) ตัดสินใจอย่างชัดแจ้งและบันทึกไว้ในเอกสารธรรมาภิบาลฉบับถัดไปเท่านั้น

## 2. คอมมิตต้นทางและปลายทาง — การย้ายชุด 24 คอมมิต (24-Commit Transplant)

สาขาปฏิบัติการ `codex/repair-intelligence-phase0-trust` เริ่มจาก `main` ของผลิตภัณฑ์ฉบับทางการ (canonical) ที่คอมมิต `dd1119af6d0bcba0e38d38516ed1b11125bcf19f` ชุดคอมมิต Trust Kernel ถูกย้ายมาวางบนฐานดังกล่าวด้วย `git cherry-pick` (24 คอมมิต) การย้ายนี้ไม่มีคอมมิต `dist` ที่สร้างอัตโนมัติ โดยคอมมิต `59f61e57` (generated dist) และคอมมิตแก้ 409 ที่ไม่เกี่ยวข้อง `f87c089f` ถูกยกเว้นโดยเจตนา

| บทบาท (Role) | คอมมิต / ช่วง (Commit / Range) | หมายเหตุ |
|---|---|---|
| ฐานผลิตภัณฑ์ (target base) | `dd1119af6d0bcba0e38d38516ed1b11125bcf19f` | `main` ของผลิตภัณฑ์ฉบับทางการ; จุดแตกสาขาของ `codex/repair-intelligence-phase0-trust` |
| ชุด Trust Kernel — คอมมิตแรก | `43301f96042bc48242de59fc02f42c725a0b6a73` | จุดเริ่มต้นของชุด cherry-pick 24 คอมมิต |
| ชุด Trust Kernel — คอมมิตสุดท้าย | `8dfe0cc02e6cbbe8f4cefb3893d80a758fc8d49b` | จุดสิ้นสุดของชุด cherry-pick 24 คอมมิต |
| ยกเว้น: คอมมิต dist ที่สร้างอัตโนมัติ | `59f61e57` | ไม่ถูกย้าย; ผลลัพธ์ dist ถูกสร้างใหม่ใน CI เสมอ ไม่ cherry-pick |
| ยกเว้น: คอมมิตแก้ 409 ที่ไม่เกี่ยวข้อง | `f87c089f` | อยู่นอกขอบเขตเฟส 0; ติดตามแยกต่างหาก |
| หมุดราก governance (governance root pin) | `55557d7f178dcbe00fec15cffb3061df668eaff8` | ฐานอ้างอิงของคลัง governance สำหรับชุดเอกสารนี้ |

วิธีการย้าย: `git cherry-pick 43301f96^..8dfe0cc0` บนสาขาปฏิบัติการ โดยหักสองคอมมิตที่ยกเว้นข้างต้น หากเกิด conflict ระหว่าง cherry-pick ให้หยุดการย้ายทันที และแก้ไขด้วยการปรับปรุงแผนของชุดคอมมิตเท่านั้น ห้ามแก้ conflict แบบเฉพาะหน้า (ad-hoc) บนสาขาปฏิบัติการ

## 3. การตรวจสถานะก่อนดำเนินการ (Preflight) สำหรับราก Git ทั้งสอง

ก่อนขั้นตอน migration ใด ๆ ต้องตรวจยืนยันว่าราก Git ทั้งสองสะอาดและตรงตามหมุด (pinned) หากพบความคลาดเคลื่อน (drift) ใด ๆ = หยุดและทบทวนฐานอ้างอิงใหม่ ห้ามดำเนินการต่อบนรากที่คลาดเคลื่อน

| ราก (Root) | คำสั่งตรวจ (Check) | ผลลัพธ์ที่คาดหวัง |
|---|---|---|
| Governance root | `git status --short` | ผลลัพธ์ว่างเปล่า (ไม่มีการเปลี่ยนแปลงค้าง) |
| Governance root | `git rev-parse HEAD` | `55557d7f178dcbe00fec15cffb3061df668eaff8` |
| Product root | `git status --short` | ผลลัพธ์ว่างเปล่า (ไม่มีการเปลี่ยนแปลงค้าง) |
| Product root (`main`) | `git rev-parse main` | `dd1119af6d0bcba0e38d38516ed1b11125bcf19f` |
| Product root (execution branch) | `git merge-base main codex/repair-intelligence-phase0-trust` | `dd1119af6d0bcba0e38d38516ed1b11125bcf19f` |

การจัดการความคลาดเคลื่อน: หากการตรวจใดคืนค่าที่ไม่ตรงตามคาด ผู้ปฏิบัติงานต้องหยุด บันทึกค่าที่พบลงในบันทึกการปฏิบัติงาน (run log) ภายใต้ `reports/phase0/` และให้เจ้าของตัดสินใจทบทวนฐานอ้างอิงก่อนลองใหม่ทุกครั้ง การตรวจ preflight ซ้ำ: NOT RUN จนกว่าจะถึงวันปฏิบัติการจริง

## 4. กลยุทธ์การเติมข้อมูล Organization (Backfill) และการทวนสอบ

Migration `0189_repair_phase0_organization_scope.sql` เพิ่ม `organization` เป็นแม่ (parent) ของ `site` และเติมขอบเขตข้อมูล (backfill) ตามลำดับนี้:

1. สร้าง organization เริ่มต้นให้แต่ละ tenant (default-org backfill) เพื่อให้ทุก tenant ที่มีอยู่มี organization หนึ่งรายการก่อนที่จะย้าย site ใด ๆ
2. ย้ายทุก `site` ให้ขึ้นกับ organization เริ่มต้นของ tenant ของตน (`site.organization_id`)
3. เติมสิทธิ์ `membership_organization` จากแถว `membership_site` ที่มีอยู่ เพื่อไม่ให้สมาชิกคนใดสูญเสียการเข้าถึงเมื่อสลับระบบ
4. เติม `verified_action_context.organization_id` จาก site ของแถวนั้น จากนั้นกำหนดคอลัมน์เป็น `NOT NULL`
5. ติดตั้ง trigger `fn_bind_verified_action_context_organization` ซึ่งบังคับให้ verified action context ใหม่ทุกรายการผูกกับ organization ที่ผู้กระทำถือสิทธิ์ทั้งระดับ org และระดับ site
6. แทนที่นโยบาย SELECT แบบ tenant-only ด้วยนโยบาย RLS แบบ site-grant

การทวนสอบด้วยจำนวนแถวและค่าแฮช (ทั้งสามค่าต้องเท่ากับ 0 ก่อนจะประกาศว่า migration ถูกนำไปใช้แล้ว):

| การตรวจ (Check) | SQL (การเปรียบเทียบจำนวน) | ผลลัพธ์ที่ต้องได้ |
|---|---|---|
| Site ที่ไม่มี organization | `SELECT count(*) FROM site WHERE organization_id IS NULL;` | 0 |
| สิทธิ์ site ที่ไม่มีสิทธิ์ org คู่กัน | `SELECT count(*) FROM membership_site ms WHERE NOT EXISTS (SELECT 1 FROM membership_organization mo JOIN site s ON s.organization_id = mo.organization_id WHERE s.id = ms.site_id AND mo.member_id = ms.member_id);` | 0 |
| Verified action context ที่ไม่มี organization | `SELECT count(*) FROM verified_action_context WHERE organization_id IS NULL;` | 0 |

การทวนสอบด้วยแฮช: ก่อนและหลัง backfill ต้องคำนวณ digest เชิงกำหนด (deterministic) ของข้อมูลขอบเขตที่มีอยู่เดิม (ผลรวม `md5` แบบเรียงลำดับเหนือคอลัมน์ธุรกิจของ `membership_site` และ `verified_action_context` โดยไม่รวมคอลัมน์ใหม่ `organization_id`) และค่าทั้งสองต้องเท่ากัน เพื่อพิสูจน์ว่า backfill เพิ่มขอบเขตโดยไม่แก้ไขแถวเดิม การเก็บค่า digest: NOT RUN จนกว่าจะถึงวันปฏิบัติการจริง; ค่าที่เก็บได้จะถูกจัดเก็บภายใต้ `reports/phase0/`

## 5. ลำดับการนำออกใช้ (Rollout Order)

`ledger → trust transplant → organization → deny policy → legacy containment → CI`

1. **Ledger** — สร้างสมุดบันทึกความคืบหน้าและ run log ภายใต้ `reports/phase0/` ก่อนเป็นอันดับแรก เพื่อให้ทุกขั้นตอนถัดไปเขียนหลักฐานลงตำแหน่งที่มีอยู่แล้วและอยู่ภายใต้การควบคุมเวอร์ชัน
2. **Trust transplant** — cherry-pick ชุด Trust Kernel 24 คอมมิตลงสาขาปฏิบัติการตามหัวข้อ 2 และรันการตรวจ preflight ของหัวข้อ 3 ซ้ำหลังการย้าย
3. **Organization** — นำ migration `0189_repair_phase0_organization_scope.sql` ไปใช้และทวนสอบตามหัวข้อ 4 ก่อนเริ่มงานด้านนโยบายใด ๆ
4. **Deny policy** — ยืนยัน policy flag แบบปฏิเสธโดยปริยาย (deny-by-default) สำหรับ capability ของ Phase 1A–3 (capability ยังคงอยู่ในสถานะ DISABLED) เพื่อให้การจำกัดขอบเขต (containment) ลงบนพื้นผิวที่ถูกปฏิเสธอยู่แล้ว
5. **Legacy containment** — migration `0190_repair_phase0_legacy_containment.sql` ลบนโยบาย storage แบบกว้าง `field_media_insert` / `field_media_select` และเพิกถอนสิทธิ์ `rpc_field_submit_photo` และ `rpc_capture_ingest` จาก `public`, `anon`, `authenticated` และ `service_role`
6. **CI** — งาน CI สำหรับผลิตหลักฐานรันเป็นลำดับสุดท้ายและจัดเก็บผลลัพธ์ภายใต้ `reports/phase0/` เพื่อปิดวงจรหลักฐานของทุกขั้นตอนก่อนหน้า

## 6. หน้าต่างความเข้ากันได้ (Compatibility Window) และพฤติกรรมอ่านอย่างเดียวระหว่างการนำออกใช้

ระหว่างหน้าต่างการนำออกใช้ พื้นผิวของ repair-intelligence ที่ได้รับผลกระทบทำงานภายใต้หน้าต่างความเข้ากันได้ที่ประกาศไว้:

- เส้นทางการอ่าน (read path) ยังทำงานต่อเนื่องตลอดหน้าต่างภายใต้สิทธิ์เดิมจนกว่าขั้นตอนที่ 5 (legacy containment) จะมีผล; หลังขั้นตอนที่ 5 การอ่านไหลผ่านนโยบาย RLS แบบ site-grant ที่ติดตั้งในขั้นตอนที่ 3 เท่านั้น
- เส้นทางการเขียน (write path) บนเส้นทางเดิม (`rpc_field_submit_photo`, `rpc_capture_ingest`) ถูกปฏิบัติเสมือนอ่านอย่างเดียว (read-only-equivalent) ตั้งแต่ต้นหน้าต่าง: ผู้ปฏิบัติงานได้รับคำสั่งไม่ให้พึ่งพาเส้นทางเหล่านี้ และการเขียนใด ๆ ที่เกิดขึ้นก่อนการเพิกถอนสิทธิ์จะถูกบันทึกลง ledger เพื่อกระทบยอด (reconciliation)
- องค์ประกอบ schema ทั้งหมดคงอยู่ตลอดหน้าต่างนี้; `0189` เป็นการเพิ่ม (additive) บวกการรัดข้อจำกัด (constraint-tightening) ส่วน `0190` เพิกถอนเฉพาะสิทธิ์และนโยบาย โดยข้อมูลคงอยู่ครบ
- หน้าต่างความเข้ากันได้ปิดเมื่อค่านับตามหัวข้อ 4 เป็น 0 ทั้งหมดและหลักฐานจากขั้นตอน CI ถูกจัดเก็บตามที่กำหนด การปิดหน้าต่าง: PENDING_OWNER_REVIEW

## 7. เงื่อนไขที่กระตุ้นการย้อนกลับ (Rollback Triggers)

การย้อนกลับจะเริ่มขึ้นเมื่อพบเหตุการณ์ใดเหตุการณ์หนึ่งต่อไปนี้:

1. ชุดทดสอบ pgTAP ล้มเหลว — ความล้มเหลวใด ๆ ของ pgTAP ในชุดทดสอบ policy/trigger ของเฟส 0 หลังขั้นตอน rollout ใด ๆ
2. ทำซ้ำการอ่านข้าม org ได้ (cross-org read reproduced) — การสาธิตใด ๆ ที่แสดงว่าสมาชิกของ organization หนึ่งอ่านแถวของอีก organization ผ่านนโยบายใหม่ได้
3. พบช่องทางเลี่ยงการปฏิเสธ (denial bypass) — เส้นทางใด ๆ ที่เข้าถึง `rpc_field_submit_photo`, `rpc_capture_ingest` หรือพื้นผิว object ของนโยบาย storage ที่ถูกลบ หลังขั้นตอนที่ 5
4. หลักฐาน CI ไม่ครบถ้วน — ขั้นตอน CI ไม่สามารถผลิตหรือจัดเก็บหลักฐานที่จำเป็นภายใต้ `reports/phase0/` ได้
5. คำสั่งของเจ้าของ (owner order) — เจ้าของสั่งย้อนกลับด้วยเหตุผลใดก็ได้ โดยไม่มีเกณฑ์ขั้นต่ำของเหตุผล

## 8. ลำดับการย้อนกลับ (Rollback Order) และข้อจำกัดห้ามถอยหลัง

การย้อนกลับดำเนินตามลำดับนี้อย่างเคร่งครัด:

1. **เส้นทางแอปพลิเคชันก่อน (application routes first)** — ปิดเส้นทางระดับแอปพลิเคชันที่ชี้ไปยังพื้นผิวใหม่ เพื่อคืนทราฟฟิกสู่สถานะพักที่ปลอดภัยและรู้จักดี
2. **Policy flags** — คืนค่า deny-policy flag จากขั้นตอน rollout ที่ 4 กลับสู่การตั้งค่าก่อนการนำออกใช้
3. **สิทธิ์/นโยบายฐานข้อมูล (database grants/policies)** — ทบทวนการย้อนกลับสิทธิ์และนโยบายที่เปลี่ยนโดย `0190_repair_phase0_legacy_containment.sql` ภายใต้ข้อจำกัดด้านล่าง
4. **Organization migration** — โครงสร้างของ `0189_repair_phase0_organization_scope.sql` ถูกย้อนกลับเป็นลำดับสุดท้าย และเฉพาะเมื่อขั้นตอน 1–3 เสร็จสมบูรณ์และข้อจำกัดด้านล่างอนุญาตเท่านั้น

**ข้อจำกัดที่มีผลผูกพัน (binding constraint):** ห้ามขั้นตอนย้อนกลับใดเปิดใช้งานซ้ำซึ่ง raw URI ที่ไม่ปลอดภัย, การอ่าน bucket แบบกว้าง (broad bucket read), เส้นทางไบต์ artifact ที่ไม่ได้ลงนาม (unsigned artifact byte route) หรืออำนาจของ actor ฝั่ง client (client actor authority) การย้อนกลับที่จะก่อผลเช่นนั้นเป็นสิ่งต้องห้าม; แนวทางที่ถูกต้องคือการแก้ไขไปข้างหน้า (forward-fix) บนสาขาปฏิบัติการแทน โดยเฉพาะอย่างยิ่ง การสร้างนโยบายกว้าง `field_media_insert` / `field_media_select` ขึ้นใหม่ หรือการมอบสิทธิ์ `rpc_field_submit_photo` / `rpc_capture_ingest` ให้ `public`, `anon`, `authenticated` หรือ `service_role` อีกครั้ง เป็นสิ่งต้องห้ามในทุกเส้นทางการย้อนกลับ

ตารางภัยคุกคาม/ความเสี่ยงของการย้อนกลับ:

| ภัยคุกคามจากการย้อนกลับ (Rollback threat) | มาตรการป้องกัน (Guard) | หลักฐาน (Evidence) |
|---|---|---|
| การย้อนกลับเปิดการอ่าน bucket แบบกว้างซ้ำ (`field_media_select`) | ข้อจำกัดที่มีผลผูกพันข้างต้นห้ามสคริปต์ย้อนกลับสร้างนโยบายกว้างที่ถูกลบขึ้นใหม่ | บันทึกการทบทวนสคริปต์ย้อนกลับภายใต้ `reports/phase0/` |
| การย้อนกลับมอบสิทธิ์ RPC เดิมให้ `public`/`anon`/`authenticated`/`service_role` ซ้ำ | ข้อจำกัดที่มีผลผูกพันข้างต้น; สิทธิ์จะคืนได้เฉพาะแก่ service principal ที่ระบุชื่อผ่าน forward-fix เท่านั้น | ภาพถ่ายสถานะสิทธิ์ (`\dp` / grant snapshot) ก่อนและหลัง จัดเก็บภายใต้ `reports/phase0/` |
| การย้อนกลับ `0189` เสี่ยงตัดความเชื่อมโยงของข้อมูล `verified_action_context.organization_id` | การย้อนกลับ `0189` รันเป็นลำดับสุดท้ายและเฉพาะหลังขั้นตอน 1–3; คอลัมน์ข้อมูลถูกเก็บรักษา ผ่อนเฉพาะ constraint/trigger เท่านั้น | ผลลัพธ์ชุดทดสอบ pgTAP สำหรับการย้อนกลับภายใต้ `reports/phase0/` |
| การย้อนกลับบางส่วนทิ้งสถานะ policy flag กับสิทธิ์ฐานข้อมูลให้ไม่สอดคล้องกัน | ลำดับย้อนกลับที่เคร่งครัด (routes → flags → grants → migration) พร้อมรายการ ledger ต่อขั้นตอน | Rollback ledger ภายใต้ `reports/phase0/` |
| การย้อนกลับภายใต้แรงกดดันด้านเวลาข้ามการทวนสอบ | ต้องมีคำสั่งเจ้าของเพื่อเริ่ม; รันค่านับตามหัวข้อ 4 ซ้ำหลังทุกขั้นตอนย้อนกลับ | Run log การย้อนกลับที่ลงนามแล้วภายใต้ `reports/phase0/` |

## 9. หลักฐานการสำรองและกู้คืนข้อมูล (Backup and Restore Evidence)

- **สิ่งที่สำรอง:** logical dump เต็มรูปแบบของ schema ที่ได้รับผลกระทบ (ตารางขอบเขต `organization`, `site`, `membership_site`, `membership_organization`, `verified_action_context`; แคตตาล็อกนโยบาย storage; แคตตาล็อกสิทธิ์ RPC) ถ่ายทันทีก่อนขั้นตอน rollout ที่ 3 และอีกครั้งก่อนขั้นตอนที่ 5
- **สถานที่ซ้อมการกู้คืน:** ซ้อมการกู้คืนบนฐานข้อมูล staging แบบใช้แล้วทิ้ง (disposable) ที่จัดเตรียมจาก dump ก่อนขั้นตอนที่ 3; การซ้อมจะรันค่านับทวนสอบตามหัวข้อ 4 ซ้ำกับสำเนาที่กู้คืนแล้ว
- **อ้างอิงไฟล์หลักฐาน (ภายใต้ `reports/phase0/`):**
  - `reports/phase0/backup-pre-0189-manifest.txt` — dump manifest and checksums: NOT RUN
  - `reports/phase0/backup-pre-0190-manifest.txt` — dump manifest and checksums: NOT RUN
  - `reports/phase0/restore-rehearsal-log.txt` — staging restore rehearsal log: NOT RUN
  - `reports/phase0/verification-counts.txt` — Section 4 count outputs: NOT RUN

สถานะของไฟล์หลักฐานแต่ละรายการข้างต้นจะเปลี่ยนจาก NOT RUN ก็ต่อเมื่อ artifact ถูกผลิตและจัดเก็บแล้วเท่านั้น; การปรับสถานะทำในฉบับปรับปรุงถัดไปของชุดเอกสารนี้

## 10. อำนาจตัดสินใจระหว่างการแก้ไขไปข้างหน้า (Forward-Fix) กับการย้อนกลับ (Rollback)

- **เจ้าของเป็นผู้ตัดสินใจ (owner decides)** ว่าเงื่อนไขกระตุ้นจากหัวข้อ 7 จะถูกตอบด้วย forward-fix หรือ rollback ไม่มีบทบาทอื่นใดถืออำนาจตัดสินใจนี้
- **Security/IAM เป็นผู้เสนอแนะ (recommends):** ผู้ทบทวนฝ่าย Security/IAM จัดทำข้อเสนอแนะเป็นลายลักษณ์อักษร (forward-fix หรือ rollback พร้อมแนบผลตรวจข้อจำกัดตามหัวข้อ 8) เสนอต่อเจ้าของ
- **ไม่มีการย้อนกลับอัตโนมัติ (no automated rollback):** ห้ามงาน CI, สคริปต์, trigger หรือ agent ใดเริ่มการย้อนกลับโดยอัตโนมัติ ระบบอัตโนมัติทำได้เพียงหยุดความคืบหน้าไปข้างหน้าและแจ้งเตือนเจ้าของ
- เมื่อข้อจำกัดที่มีผลผูกพันตามหัวข้อ 8 ห้ามเส้นทางการย้อนกลับใด พื้นที่การตัดสินใจจะเหลือเพียง forward-fix และการตัดสินใจของเจ้าของจำกัดอยู่ที่กำหนดเวลาและขอบเขตของ forward-fix นั้น

## 11. การทดสอบการกู้คืนและช่องอนุมัติของเจ้าของ (Recovery Test and Owner Approval)

Recovery test: NOT RUN
Recovery test evidence file: `reports/phase0/recovery-test-log.txt` — status: NOT RUN
Owner approval: PENDING_OWNER_REVIEW
Owner approval record: `reports/phase0/owner-approval-record.md` — status: PENDING_OWNER_REVIEW
Security/IAM recommendation: PENDING (บันทึกข้อเสนอแนะจะถูกจัดเก็บภายใต้ `reports/phase0/` ก่อนการทบทวนของเจ้าของ)

ห้ามปล่อยช่องใดในหัวข้อนี้ให้ว่าง; ทุกช่องต้องมีสถานะชัดแจ้ง และเปลี่ยนได้เฉพาะโดยการกระทำของเจ้าของหรือผู้ทบทวนที่ถูกบันทึกไว้เท่านั้น

---

สิ้นสุดฉบับภาษาไทย ฉบับภาษาอังกฤษที่เทียบเคียงกัน: `docs/governance/repair-intelligence-phase0-migration-rollback.en.md`
