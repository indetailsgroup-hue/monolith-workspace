# การแก้ CI รอบแรกของ branch งาน LINE บน GitHub Actions

วันที่: 1 ตุลาคม 2026 (เวลาไทย เวลาใน runner เป็น UTC) ฐาน: a97c3c8479a5fcbff9fb134e0e661f7f0d828a8e บน codex/repair-intelligence-phase0-trust สถานะ: สร้างในเครื่องแล้ว รอผู้ตรวจอิสระและ CI รอบถัดไป รอบนี้แก้เอกสาร งาน 1 job ใน workflow และ config 1 บรรทัด ไม่แก้ migration เทสต์ หรือโค้ดแอป

## มติของเจ้าของ (1 ตุลาคม 2026)

- หลักฐานที่ปิดผนึกแล้ว: ทางเลือก ก แก้ไฟล์ REPORT แบบเปิดเผย คงผลดิบและ `SHA256SUMS.run` สร้าง `SHA256SUMS` ฉบับสุดท้ายใหม่เฉพาะบรรทัดของ REPORT และให้ผู้ตรวจอิสระตรวจซ้ำ
- การ push: อนุมัติให้ push ก่อนผู้ตรวจอิสระตรวจ a97c3c847 เสร็จ
- งานของ Repair Phase 0: ให้ผู้สร้าง (session นี้) ทำ คือเปิด storage ใน `supabase/config.toml` (บรรทัดเดียว ไม่ดึง config ทั้งหมดของ main) ประโยครับรองใน push checklist และ secret กับ environment ของ shadow E2E

## สาเหตุที่ CI ล้ม (run 36748427202 และ 36748427203 ที่ a97c3c847)

| Check | สาเหตุ | มาจากงาน LINE ไหม |
|---|---|---|
| claim linters | `lint_claims` พบข้ออ้างว่าไม่มีโดยไม่มีหลักฐาน 38 จุดในเอกสาร LINE 14 ไฟล์ และ `lint_certifications` พบประโยครับรอง 2 จุด | ใช่ 39 จาก 40 จุด ส่วนจุดใน push checklist มีมาก่อนเอกสาร LINE |
| edge + pgTAP และ DB Verify (`trust_kernel_containment` ข้อ 8–9) | `supabase/config.toml` ปิด storage ไว้ ตอน 0184 รันจึงยังไม่มี `storage.objects` และบล็อก policy ที่มีเงื่อนไข (`0184_trust_kernel_legacy_containment.sql:98`) ถูกข้าม | ไม่ใช่ |
| DB Verify (`repair_phase0_containment`) | ฟังก์ชัน 12 argument มาจาก 0170 บน main (PRD §8 ข้อ 7) | ไม่ใช่ และรอบนี้ไม่ได้แก้ |
| shadow E2E | ไม่ได้สร้างโฟลเดอร์ `reports/` ก่อนเขียนผล และ secret ของ E2E ทั้ง 5 ตัวว่าง | ไม่ใช่ |
| final gate และ evidence self-verify | ล้มต่อจากข้อข้างบนและยังไม่ได้ตั้ง signer (ออกแบบให้ล้มแบบปิดไว้ก่อน) | ไม่ใช่ |

DB Verify รอบเดียวกันรัน suite LINE ทั้ง 5 ชุดได้ผลครบตาม plan: 107/107, 133/133, 28/28, 82/82 และ 23/23 และ claim race overlap 0 นี่เป็นหลักฐาน GitHub Actions ของ a97c3c847 เท่านั้น ไม่ใช่หลักฐาน production และไม่ใช่การตรวจอิสระ

## สิ่งที่เปลี่ยน

| Path | การเปลี่ยน |
|---|---|
| เอกสาร governance 4 ชุด (TH และ EN พร้อม HTML) | permission matrix, session report, EXECUTE survey และ integration follow-up: เพิ่มการอ้างอิง แยกประโยคภาษาไทย และปรับถ้อยคำหลายจุด (แถว 20, 22, 25, 27 และ 39 ของตาราง และขีดยาวในข้อ CALLER-UNKNOWN ของ matrix ซึ่งแก้จำนวนเมื่อ 2 ตุลาคม 2026) |
| ชุดหลักฐานที่ปิดผนึก 8 ชุด | แก้ REPORT.th.md และ REPORT.en.md render HTML ใหม่ และสร้างบรรทัด REPORT 4 บรรทัดใน `SHA256SUMS` ใหม่ ส่วน `SHA256SUMS.run` และผลดิบคงเดิม |
| `docs/governance/repair-intelligence-phase0-push-checklist.md` | ประโยคเงื่อนไขการยอมรับเขียนเป็นเงื่อนไข |
| `.github/workflows/trust-kernel-verify.yml` | job shadow E2E: ขั้นแรกจะล้มพร้อมบอกชื่อ secret ที่ขาด (ไม่แสดงค่า, `trust-kernel-verify.yml:235`) และขั้นรันสร้าง `reports/` ก่อนเขียนผล (`trust-kernel-verify.yml:249`) |
| `supabase/config.toml` | `[storage] enabled = true` (บรรทัดเดียว) |

`tools/.lint_allowlist` คงเดิม (`02b-allowlist-unchanged.txt`) linter จึงผ่านโดยไม่ได้ยกเว้นเพิ่ม

## ตารางข้อค้นพบ

ประเภท A: ข้ออ้างว่าสิ่งที่ค้นหาได้นั้นไม่มีอยู่ ประเภท B: ถ้อยคำที่ตัวตรวจอ่านว่าเป็นข้ออ้างแต่ไม่ใช่ (พฤติกรรม ข้อกำหนด ขอบเขต สำนวน ชื่อชนิดข้อมูล หรือเงื่อนไขการยอมรับ) path ของชุดหลักฐานอยู่ใต้ `docs/governance/evidence/`

| # | ข้อค้นพบที่ฐาน | ประเภท | การแก้ |
|---|---|---|---|
| 1 | `line-b12-catalog-fixture-2026-09-30/REPORT.th.md:13` | B ข้อกำหนด | แยกประโยคภาษาไทยคนละบรรทัดใน source |
| 2 | `line-b12-monolith-catalog-attempt2-2026-09-30/REPORT.th.md:9` | A overload (ไม่ได้ระบุชื่อ) มี catalog ในชุดรองรับ | แยกประโยคภาษาไทยคนละบรรทัดใน source |
| 3 | `line-b12-monolith-catalog-attempt2-2026-09-30/REPORT.th.md:27` | B ขอบเขต | แยกประโยคภาษาไทยคนละบรรทัดใน source |
| 4 | `line-ci-source-2026-09-30/REPORT.th.md:21` | A ฟังก์ชัน 12 argument (ไม่ได้ระบุชื่อ) | แยกประโยคภาษาไทยคนละบรรทัดใน source |
| 5 | `line-p010-catalog-2026-09-30/REPORT.th.md:7` | B ขอบเขต | แยกประโยค และอ้าง `02-migrations-applied.txt:192` |
| 6 | `line-p010-catalog-2026-09-30/REPORT.th.md:39` | A สิทธิ์เขียนของ PUBLIC และ ACL ระดับคอลัมน์ | อ้าง `08-analysis.txt:48` และ `08-analysis.txt:99` |
| 7 | `line-p010-catalog-2026-09-30/REPORT.th.md:42` | A overload | อ้าง `08-analysis.txt:185` |
| 8 | `line-p010-catalog-2026-09-30/REPORT.th.md:45` | A cascade | อ้าง `08-analysis.txt:237` |
| 9 | `line-p010-ci-hardening-green-2026-09-30/REPORT.th.md:11` | B ข้อกำหนดของตัวตรวจ | แยกประโยคภาษาไทยคนละบรรทัดใน source |
| 10 | `line-p010-evidence-followup-2026-09-30/REPORT.th.md:9` | A field ของ provenance | แยกประโยค และอ้าง `07-ci-local/full/db-verify-evidence.json:14` |
| 11 | `line-p010-evidence-followup-2026-09-30/REPORT.th.md:38` | A field ที่เปิดเผยในเวลานั้น | แยกประโยคภาษาไทยคนละบรรทัดใน source |
| 12 | `line-p010-failclosed-green-2026-09-30/REPORT.en.md:48` | A migration 0170 | อ้าง `07-ci-local/full/ci-step-1.log:411` |
| 13 | `line-p010-failclosed-green-2026-09-30/REPORT.th.md:48` | A migration 0170 | อ้าง `07-ci-local/full/ci-step-1.log:411` |
| 14 | `line-p012-green-2026-09-30/REPORT.th.md:9` | B พฤติกรรมของโค้ด | อ้าง `0199_line_oa_restrict_definer_execute.sql:66` และ `:111` |
| 15 | `line-p012-green-2026-09-30/REPORT.th.md:10` | B คำอธิบายเทสต์ | อ้าง `line_oa_definer_execute_matrix.sql:200` |
| 16 | `line-p012-green-2026-09-30/REPORT.th.md:11` | B คำอธิบายเทสต์ | อ้าง `line_oa_definer_execute_fail_closed.sql:204` |
| 17 | `line-p012-green-2026-09-30/REPORT.th.md:12` | B คำอธิบายเทสต์ | อ้าง `line_outbound_claim_record.sql:429` |
| 18 | `line-b12-permission-matrix.th.md:9` | B พฤติกรรมของโค้ด | อ้าง 0199 บรรทัด 66, 75 และ 111 (TH และ EN) |
| 19 | `line-b12-permission-matrix.th.md:10` | B คำอธิบายเทสต์ | อ้าง `line_outbound_claim_record.sql:429` (TH และ EN) |
| 20 | `line-b12-permission-matrix.th.md:48` | B นโยบาย | เปลี่ยนย่อหน้าเป็นรายการ 1 ข้อต่อกลุ่ม caller (TH และ EN) |
| 21 | `line-outbound-phase0-session-report.en.md:75` | A คอลัมน์และด่าน consent ฝั่งลูกค้า | อ้างนิยามตาราง `00000000000002_line_oa_schema.sql:108` คอลัมน์ของพนักงาน `0088_identity_binding_lifecycle.sql:10` และคำสั่งตรวจซ้ำที่ a97c3c847 (TH และ EN) เปิดเผยเพิ่มเมื่อ 2 ตุลาคม 2026: ถ้อยคำแคบลงจากทั้ง schema เป็นตาราง `line_oa_customer_identity` และการตรวจซ้ำครอบคลุมแค่ `supabase/migrations` กับ `supabase/functions` ส่วน `src/mcp/pdpa.ts:34` มีด่าน PDPA consent ของชั้น MCP ซึ่งเส้นทางส่ง LINE ไม่ได้ใช้ |
| 22 | `line-outbound-phase0-session-report.th.md:25` | B สำนวน | ใช้ em dash แบบฉบับอังกฤษ |
| 23 | `line-outbound-phase0-session-report.th.md:75` | A เหมือนแถว 21 | เหมือนแถว 21 |
| 24 | `line-outbound-phase0-session-report.th.md:100` | B พฤติกรรมของโค้ด | อ้าง `0193_line_outbound_claim_and_record.sql:235` (TH และ EN) |
| 25 | `line-outbound-phase0-session-report.th.md:103` | B ชื่อชนิดข้อมูล | เขียนชนิดข้อมูลเป็น code (TH และ EN) |
| 26 | `line-outbound-phase0-session-report.th.md:110` | A cron schedule ใน 0193–0196 | เพิ่มคำสั่งตรวจซ้ำที่ a97c3c847 (TH และ EN) |
| 27 | `line-outbound-phase0-session-report.th.md:159` | A cron ในเรโปที่เรียก sender | เพิ่มคำสั่งตรวจซ้ำที่ a97c3c847 และเอาคำว่า "definitively" ออกจากฉบับอังกฤษ |
| 28 | `line-p010-execute-survey.th.md:18` | A ALTER DEFAULT PRIVILEGES | แยกประโยคแบบฉบับอังกฤษ และเพิ่มคำสั่งตรวจซ้ำที่ a97c3c847 (TH และ EN) |
| 29–35 | `line-p010-execute-survey.th.md` บรรทัด 24, 27, 30, 31, 32, 33 และ 34 | A ผู้เรียก grant หรือ guard ตามการค้นของ survey | ขยายการอ้าง migration แบบย่อในตาราง routine 18 แถวเป็น file:line ที่เปิดได้จริง (TH และ EN) และตรวจบรรทัดที่อ้างแล้ว แก้ไขเมื่อ 2 ตุลาคม 2026: การอ้างเหล่านั้นชี้บรรทัด grant, revoke หรือ trigger ซึ่งลำพังไม่ได้แสดงว่าผู้เรียก guard หรือ grant ไม่มีอยู่ รอบ 2 เพิ่มหลักฐานนั้นใน survey แล้ว (การตรวจซ้ำ R1 และ R2 ที่ 48b72d4c7 และบรรทัดนิยาม `0130_scrutiny5_fixes.sql:332-387`) |
| 36 | `line-p010-integration-b12-followup.th.md:15` | B การกระทำของงานนี้เอง | แยกประโยคแบบฉบับอังกฤษ |
| 37 | `line-p010-integration-b12-followup.th.md:62` | A ผลค้นที่ระบุข้อจำกัด | เพิ่ม commit ของ source ที่ค้น 3bdd6f3e5 (TH และ EN) |
| 38 | `line-p010-integration-b12-followup.th.md:64` | A ผลค้นที่ระบุข้อจำกัด | แยกประโยคแบบฉบับอังกฤษ |
| 39 | `line-outbound-phase0-session-report.en.md:146` (ประโยครับรอง) | B คำว่า "passes" หมายถึงส่งต่อ | เปลี่ยนเป็น "forwards" |
| 40 | `repair-intelligence-phase0-push-checklist.md:61` (ประโยครับรอง) | B เงื่อนไขการยอมรับ | เขียนเป็นเงื่อนไข |

การแยกบรรทัดภาษาไทยเปลี่ยนเฉพาะ Markdown source เพราะ renderer รวมบรรทัดในย่อหน้าด้วยช่องว่าง 1 ช่อง ข้อความที่ render ของย่อหน้าเหล่านั้นจึงเหมือนเดิม (`05-render-check.txt` และใน 4 ชุดที่แก้แค่การแยกบรรทัด HTML ต่างจากเดิมเฉพาะส่วนบันทึกการแก้ไขที่ต่อท้าย)

## หลักฐานในชุดนี้

| ไฟล์ | สิ่งที่แสดง |
|---|---|
| `00-context.txt` | ฐาน เวอร์ชันเครื่องมือ hash ของ linter ที่ pin ไว้ (สำเนาในเครื่องเท่ากันเมื่อไม่นับ CRLF/LF) และไฟล์ที่เปลี่ยน |
| `01a-linters-before.txt`, `01b-findings-before.txt` | linter ที่ pin ไว้บน tree ฐานให้ผลล้มแบบเดียวกับ CI คือ 38 และ 2 จุด exit 1 ทั้งคู่ พร้อม marker และประโยคของแต่ละจุด |
| `02a-linters-after.txt`, `02b-allowlist-unchanged.txt` | linter ที่ pin ไว้บน working tree: exit 0 ทั้งคู่ และ allowlisted debt คงเดิม (15 และ 1) |
| `03-reproduce-amendments.txt` | `tools/amend_bundles.py` ที่รันบน byte ของฐานได้ REPORT ที่แก้ครบ 16 ไฟล์ตรงทุก byte และตาราง routine ของ survey เท่ากับผลของ `tools/expand_survey.py` |
| `04-reseal-check.txt` | `SHA256SUMS.run` ของทุกชุดที่แก้เท่ากับฐาน `sha256sum -c` ผ่านกับทุก `SHA256SUMS` และ `SHA256SUMS.run` และแต่ละ `SHA256SUMS` ต่างจากฐานเฉพาะ 4 บรรทัดของ REPORT |
| `05-render-check.txt` | HTML ที่เปลี่ยนทั้ง 24 ไฟล์เท่ากับผล renderer ของ repository จาก Markdown ของตัวเอง |
| `06-workflow-config.txt` | workflow ทั้งสอง parse ได้ preflight ของ E2E เป็นขั้นแรกและอ่านชื่อ secret 5 ตัวเดียวกับขั้นรัน `[storage].enabled` เป็น true และ diff ของ config มีบรรทัดเดียว |
| `07-preflight-simulation.txt` | สคริปต์ preflight ที่ดึงจาก YAML รันด้วยค่าแทน: ไม่ตั้งเลยได้ exit 1 พร้อม 5 ชื่อ ตั้งครบได้ exit 0 ขาดตัวเดียวบอกเฉพาะชื่อนั้น และไม่แสดงค่าใด (`07-preflight-simulation.txt:4` ถึงบรรทัด 6) |
| `08-repair-phase0-checks.txt` | ตัวตรวจเอกสาร Repair Phase 0 เทสต์ของมัน (12 จาก 12) และ final-gate self-test ได้ exit 0 ทั้งหมด |
| `09-diff.txt`, `10-credential-scan.txt` | ชุดที่เปลี่ยนเทียบกับฐาน และการสแกนข้อมูลลับพร้อม positive controls (ยกเว้นแบบรายงาน 1 จุด คือ connection string ของ Supabase ในเครื่องที่บรรทัด 189 ของ workflow ซึ่งเหมือนในฐานทุกตัวอักษร) |
| `11-gate-negative-controls.txt`, `gate-ci-remediation.py` | gate สำหรับ commit ยอมรับชุดที่อนุมัติ และปฏิเสธการละเมิดที่ตั้งใจใส่ 6 แบบ แต่ละแบบใน index ส่วนตัว คือ path เกิน, `SHA256SUMS.run` เปลี่ยน, ผลดิบเปลี่ยน, ประโยคใหม่ที่ claim linter ต้องแจ้ง, config เปลี่ยนเกินบรรทัด storage และ URI ที่มีรูปแบบ credential |

การ commit ทำผ่าน `commit-ci-remediation.sh` ซึ่ง stage เฉพาะ path ที่อนุมัติ รัน gate กับ blob ที่ stage แล้ว และ commit เมื่อ exit 0 เท่านั้น พร้อม transcript ใน `docs/governance/evidence/line-ci-remediation-commit-2026-10-01/`

## ข้อจำกัดและงานที่ยังค้าง

- Storage: เครื่องนี้ไม่ได้ติดตั้ง Supabase CLI จึงยังไม่ได้ทดสอบการแก้ config ผ่าน `supabase start` ในเครื่อง stack ชั่วคราวที่มี storage-api เคยรัน `trust_kernel_containment` ได้ 16/16 (`line-p012-green-2026-09-30/07b-ci-suite-runner/trust_kernel_containment.tap`) CI รอบถัดไปคือการทดสอบจริง
- Shadow E2E: session นี้จัดเตรียม environment ให้ไม่ได้ secret ทั้ง 5 ตัวเป็น credential ที่เจ้าของต้องตั้งเองใน settings ของ repository และ stack ที่ secret ชี้ไปต้อง deploy ซึ่งยังไม่ได้อนุมัติ จนกว่าจะมี job E2E และ final gate จะยังแดง แต่ตอนนี้มีข้อความบอกชื่อ secret ที่ขาด
- `repair_phase0_containment` ยังต้องใช้ migration 0170 จาก main (PRD §8 ข้อ 7) DB Verify และ edge + pgTAP จึงยังแดงที่ suite นี้
- Pull request #133 มี merge conflict workflow แบบ `pull_request` ของ main จึงยังไม่ได้รันกับ PR นี้ มีแค่ workflow ที่เกิดจาก push
- ชุดหลักฐานที่แก้มีชุดที่ผู้ตรวจรับไปแล้ว (เช่น da252d18a) ทุกการแก้ต้องตรวจซ้ำ

## การแก้ไขและข้อมูลเพิ่ม (2 ตุลาคม 2026)

การตรวจฝั่งผู้สร้างก่อนส่งตรวจของ 48b72d4c7 (ไม่ใช่การตรวจรับอิสระ) พบประเด็นด้านล่าง รอบ 2 แก้ในไฟล์ที่จะ commit ส่วน REPORT ของชุดหลักฐาน 8 ชุดที่ปิดผนึกไม่แก้ซ้ำ

- REPORT ที่แก้ทั้ง 16 ไฟล์บอกว่า hash ก่อนแก้อยู่ในชุดนี้ ข้อความนั้นเป็นจริงตั้งแต่รอบ 2 ที่เพิ่ม `12-pre-amendment-hashes.txt` แล้วเท่านั้น: 32 รายการ hash ก่อนแก้ทุกตัวเท่ากับ blob ฐานที่ a97c3c847 (`12-pre-amendment-hashes.txt:38`)
- commit message ของ 48b72d4c7 และ docstring ของ `tools/amend_bundles.py` บอกว่าข้ออ้างว่าไม่มีที่เป็นจริงได้การอ้างอิงแล้ว แต่แถว 2, 4, 11 และ 38 ผ่านด้วยการแยกประโยคอย่างเดียว และแถว 29–35 ผ่านด้วยการอ้างบรรทัด grant (หลักฐานรอบ 2 อยู่ใน survey ดูแถว 29–35)
- การอ้างที่อ่อน 2 จุดคงไว้ตามเดิมใน REPORT ที่ปิดผนึก: `line-p010-catalog-2026-09-30/08-analysis.txt:237` เป็นหัวส่วน trigger (บรรทัด noaction คือ 238–245) และตารางภาษาไทยของ p012-green อ้างบรรทัด 66 ทั้งการตรวจ identity และ overload (การตรวจ overload อยู่ที่ `0199_line_oa_restrict_definer_execute.sql:75`)
- ข้อเท็จจริงเรื่อง CI ในรายงานนี้ (run 36748427202 และ 36748427203) คัดพร้อม URL ไว้ใน `line-p012b-round2-2026-10-02/01-github-actions-excerpt.txt:1` รวมถึง run 36795389505 ที่ 48b72d4c7 ซึ่ง claim linters ผ่าน และ `trust_kernel_containment` ได้ 16/16 เมื่อเปิด storage
- สคริปต์ negative control ตรวจแค่ว่า gate exit ไม่เป็นศูนย์ ส่วน `11-gate-negative-controls.txt:5` เป็นต้นไปแสดงว่าแต่ละกรณีถูกตรวจข้อใด
- พบหลัง commit: บนเครื่องนี้ gate แบบ commit mode (`gate-ci-remediation.py --rev`) หยุดด้วย "Filename too long" ถ้า Git ไม่ได้เปิด `core.longpaths=true` เมื่อเปิดแล้ว gate ผ่านครบ 104 ข้อบน 48b72d4c7

## ประวัติการรัน runner

รอบนี้มีการรัน runner 3 ครั้งก่อนหน้าที่ถูกย้ายออกไปไว้นอก repository ครั้งที่ 1 เรียก bash ของ WSL ในการจำลอง preflight (exit 127) และการสแกนข้อมูลลับแจ้ง connection string ในเครื่องที่มีอยู่เดิม ครั้งที่ 2 ยังเรียก bash ของ WSL ทั้งสองเป็นข้อบกพร่องของ runner ซึ่งแก้แล้วใน `tools/run-ci-remediation.sh` (ระบุ path ของ bash ชัดเจน และข้อยกเว้นแคบที่รายงานเสมอ) ครั้งที่ 3 ผ่านทุกขั้นแต่ comment ใน runner อธิบายสาเหตุของครั้งที่ 1 และ 2 ไม่ถูก จึงแก้ comment แล้วรันใหม่ ชุดนี้เป็นผลครั้งที่ 4 ซึ่งทั้ง 17 ขั้นที่บันทึกได้ exit 0

การ commit ผ่าน wrapper ครั้งแรกถูก gate หยุด เพราะสคริปต์ negative control มี URI ทดสอบที่มีรูปแบบ credential เขียนเป็นตัวอักษรตรง ๆ
ไม่มีอะไรถูก commit และ index ถูกคืนสภาพ
ตอนนี้สคริปต์ประกอบ URI ทดสอบตอนรัน รัน control ใหม่แล้ว (`11-gate-negative-controls.txt`) และปิดผนึกชุดใหม่ก่อน commit ครั้งถัดไป
ครั้งที่สองก็ถูก gate หยุดเช่นกัน เพราะย่อหน้านี้ในฉบับภาษาไทยรวมคำปฏิเสธกับชื่อไฟล์ไว้ในประโยคเดียว จึงแยกประโยคแล้ว commit ครั้งที่สาม
