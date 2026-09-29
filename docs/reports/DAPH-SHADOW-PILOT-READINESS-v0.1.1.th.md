# DAPH-SHADOW-PILOT-READINESS-v0.1.1

ตรวจแบบอ่านอย่างเดียวและวางแผน • 29 กันยายน 2026 • v0.1.1 ปรับถ้อยคำให้ผ่าน guardrail ของ repo (ดูหัวข้อ "ประวัติการแก้ไข" ท้ายเอกสาร) • เจ้าของเลือก baseline แล้ว • D1 ยังไม่ผ่านการอนุมัติเริ่ม / REAL-CUT BLOCKED

## 1. Executive Verdict

**คำตัดสิน D1: BLOCKED จนกว่าจะพิสูจน์ operation และแก้จุดเชื่อม workflow ที่ระบุ ยังไม่พร้อมให้ใช้ข้อมูลลูกค้าจริงโดยไม่มีการควบคุม ส่วน Real-Cut: BLOCKED** มี software path อยู่มากแล้ว งานเร่งด่วนไม่ใช่สร้างทั้งระบบใหม่ แต่คือแก้เส้นทางองค์กร/job/quotation ที่ยังอยู่ใน browser, ยืนยันการเชื่อม server และ persistence ครบสาย และเก็บผล pilot จริง

ผู้ใช้เลือก GitHub main ที่ pin SHA ตามหัวข้อ 2 แล้ว จึงคลี่คลาย STOP เรื่อง baseline ตรวจใน checkout แยกที่สะอาดและรักษางาน parent/nested เดิมไว้เป็นข้อมูลเปรียบเทียบ รายงานนี้แทนข้อสังเกตเบื้องต้นที่อิง local อย่างเดียว ไม่ยกป้าย STRONG จากอดีตมาใช้ต่อ

งานตรวจและวางแผนเสร็จภายใต้ข้อจำกัดที่ระบุ ไม่ใช่การรับรอง runtime: ไม่ deploy, migrate, ติดตั้ง dependencies, เปลี่ยนข้อมูลธุรกิจ หรือรัน tests ทั้งชุดในเครื่อง สิ่งที่ยังไม่ทราบเป็นเงื่อนไขก่อน D1 ไม่สร้างผล PASS ขึ้นเอง

## 2. Current HEAD

Root หลักที่ตรวจ: `C:/Users/thai3/.codex/worktrees/daph-shadow-readiness/determined-williams (2)` Git HEAD `5dc57e10457641cacddf9d776800b0bc704b209a` เป็น detached checkout และผู้ตรวจบันทึกว่า `git status` ว่างทั้งก่อนและหลังตรวจ (checkout นี้อยู่ในเครื่องของผู้ตรวจ Claude จึงตรวจซ้ำไม่ได้) product version **17.5.2** (`package.json`) commit ล่าสุด `docs(research): add SciSpace Monolith 12-chat reading archive (#126)` เวลา 2026-09-29T11:48:51Z [Pinned commit](https://github.com/indetailsgroup-hue/monolith-workspace/commit/5dc57e10457641cacddf9d776800b0bc704b209a)

Root เปรียบเทียบ: parent `C:/Users/thai3/determined-williams (2)` / branch `guardrails/claim-linters` / HEAD `9bd52f36744693b154324a3bc772bf15796102a3`; nested `C:/Users/thai3/determined-williams (2)/determined-williams` / branch `fix/dxf-truth-chain` / HEAD `ccb47589de7d9980a59774aa168b7c50cb23f417` version 2.1.0 ทั้งคู่ remote `indetailsgroup-hue/monolith-workspace` parent เดิมมี tracked แก้ไข 11 และ untracked 747 รายการ nested มีแก้ไข 11 ลบ 12 และ untracked 65 รายการ ตัวเลขนับ Git status entries ซึ่งอาจรวมโฟลเดอร์ยุบ parent ตอนนี้เพิ่มเอกสาร/evidence และตัวสร้างรายงานรอบนี้ ไม่แก้งานเดิม

`C:/Users/thai3/Second brain 3` ที่ระบุเดิมมีอยู่แต่ไม่ใช่ Git root อ่าน CONTEXT.md และเอกสารแก้ scope วันที่ 21 กรกฎาคมแล้ว เจ้าของอนุญาต baseline หลักใหม่อย่างชัดเจน nested `git log --all` พบ bad ref `refs/heads/codex/repair-intelligence-phase0-trust (1)` ไม่ได้ซ่อม ส่วน public compare จาก nested HEAD ไป main ตอบ 404 จึงไม่กล่าวอ้าง ancestry/ahead-behind

reconciliation วันที่ 22 กันยายนเคยบันทึก source/migrations ต่างกัน แต่จำนวนในนั้นเป็นอดีต ตัวอย่างที่ตรวจปัจจุบัน: main มี onboarding/jobs/quotation routes, house-01, auth/session code เพิ่ม, version 17.5.2 และ workflows มากขึ้น ซึ่ง nested ขาดบางส่วน งาน LINE/migrations ใน local ต้อง review เพื่อ port ห้ามคัดลอกทับด้วยเลข migration เดิม

## 3. Historical Baseline Conflicts

**ตรวจไฟล์แนบแบบเลือกประเด็นและระบุที่มา ไม่ได้อ้างว่าตรวจรับรองทุกหน้า** inventory ครบ 695 และ 36 file entries ตามลำดับ อ่านข้อความบท Oriverse, benchmark, snapshot repository, หัวข้อ PRISMA, SDK README และย่อหน้าที่เกี่ยวข้องใน `daph_decorative_brand_strategy_clean.docx` (22,790 ย่อหน้า) ไม่รันสคริปต์ ถือเอกสารแนบเป็นข้อมูลอ้างอิง/อดีต

1. “ไม่มี MCP/AI integration” ขัดกับ `src/mcp/*`, governance tests, `.github/workflows/mcp-smoke.yml` และ SDK README ใน ZIP เดียวกัน แต่ไม่ได้แปลว่า deploy MCP endpoints ครบแล้ว
2. “single-tenant/internal tool เท่านั้น” ไม่พออธิบายปัจจุบัน เพราะ main มี `src/tenant/*`, org/RLS migrations และ cross-tenant tests อย่างไรก็ตาม onboarding UI ยังสร้างลง local store จึงยังกล่าวว่ามี multi-tenant SaaS ใช้งานจริงครบไม่ได้เช่นกัน
3. “tests 348/348” ไม่ใช่ผล gate ปัจจุบัน repo มี record 4,553 tests ของ `9ac7cff3` ในอดีต ส่วน CI ปัจจุบันแบ่ง scope ต่างออกไป ทั้งสองจำนวนไม่ยืนยัน runtime ของ SHA นี้
4. benchmark ใน ZIP ระบุ tools รวม 123, ทดสอบ 90 และ **success รวม 88.9%** มี call ด้าน QC/field ล้มเหลว ไม่มี provenance ของ current SHA/environment ที่เพียงพอจะใช้ยืนยัน deployed latency/availability ค่า sub-millisecond ไม่พิสูจน์ performance ผ่านเครือข่ายครบสาย ไม่ได้รันซ้ำ และไม่กล่าวว่าเป็น simulation หากยังไม่มีหลักฐาน
5. snapshot repository ใน ZIP อ้าง commit เก่า `13de5d1...` ข้อความ “ข้อมูลทั้งหมดแยก tenant เสมอ” ต้องตรวจ ไม่รับเป็นคำรับรอง ส่วน PRISMA ใช้ประกอบ design ไม่ใช่หลักฐาน implementation เสร็จ
6. เอกสาร Daph กล่าวถึงอนุมัติส่วนลดและ revised quotation ก่อนเปลี่ยน scope ใช้เป็น candidate business controls ไม่ใช่ SOP โรงงานฉบับลงนามปัจจุบันหรือข้อมูลที่โหลดเข้า Monolith แล้ว calculator/สไลด์การตลาดไม่ใช่หลักฐานค่า SaaS
7. ข้อแก้ไขจาก main: **พบ house-01 จริง**; S17-3 บันทึก CLOSED; พบ ADR-064 checklist แต่ทุกบทบาท PENDING ห้ามนำผลค้นหาที่ว่างเปล่าใน local ไปสรุปเป็นผลของ main

## 4. Shadow Mode Verification

`src/core/config/shadowMode.ts:16` ยัง export **true** เป็นค่าร่วมที่ output paths ที่ตรวจ import และสอดคล้อง ADR-065/ADR-070 อนุญาตการเทียบแบบ D1 ไม่อนุญาตตัดจริง ไม่ได้เปลี่ยน flag

จุดใช้บน main: `src/factory/packet/buildFactoryPacket.ts` เพิ่ม NFP notice ที่ hash; `zipBundle.ts` เพิ่ม prefix; `src/core/export/dxfExportFromOperationGraph.ts`, `cabinetToDxf.ts`, `exportPipeline.ts` เพิ่มป้าย/ชื่อ NFP; `src/cnc/bundle/buildCncBundleZip.ts` และ `cncManifest.ts` ทำเครื่องหมาย CNC bundle; `src/cnc/post/nfpHeader.ts` เพิ่มคำเตือน G-code มี tests `nfpGcodeHeader.test.ts`, `cncBundleNfp.test.ts`, `quickDxfNfp.test.ts`, `dxfZipG10Block.test.ts` และ AppShell แสดง flag

guard เพิ่มเติม: `supabase/functions/factory-api/index.ts` ใช้ roles/site codes จาก Auth metadata ที่ server ตรวจ และปฏิเสธ upload/export/verify หากสถานะยังไม่ RELEASED หรือยังไม่ได้ผูก packet anchors; `src/packet-verifier/codes.ts` จำกัด operational disposition เป็น **NO_CUT** แม้ได้ VERIFIED/PKT_OK_SHADOW_ONLY; มี operation-graph validation ก่อนสร้าง CNC สิ่งเหล่านี้มากกว่าป้ายชื่อไฟล์ แต่ยังไม่ใช่ physical interlock ของเครื่อง

ห้ามสับสน packet builder เดิมกับ `server/src/packet/v2/generator.ts` ซึ่งมีทั้งคู่ pilot ต้องระบุ schema/export path ที่ใช้ SOP shadow เตือนว่า browser อาจดาวน์โหลดก่อน upload server ล้มเหลว ดังนั้น ZIP ในเครื่องไม่พิสูจน์ server acceptance เป็นผล inspection เท่านั้น NOT re-verified at runtime

## 5. Golden Path Matrix

Status คือความพร้อมหลักฐาน D1 ไม่ใช่ผล tests การมี test source ไม่ใช่ gate ผ่าน พาธอิง main ที่ pin ความเชื่อมโยง project/BOM/acceptance บางช่วงยังไม่พิสูจน์และต้องยืนยันใน UAT ไม่สมมติว่าเชื่อมแล้ว

| Step | User-facing workflow | Route/UI | Source | Data/DB dependency | Test evidence | Current gate | Shadow Pilot requirement | Real-Cut requirement | Status | Blocker | Evidence path | Verification label |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tenant/Auth | ตรวจและบันทึก Tenant/Auth | /login | src/core/auth/requestAuthHeaders.ts | Supabase Auth; factory-api verified JWT | src/core/auth/__tests__/configuredTransportSession.test.ts | NOT re-verified at runtime | พิสูจน์ session/logout/isolation จริง | server identity | PARTIAL | มี staging evidence เก่า; environment ปัจจุบันไม่ยืนยัน | src/core/auth/requestAuthHeaders.ts | verified-by-inspection |
| Daph Tenant | ตรวจและบันทึก Daph Tenant | /onboarding | src/tenant/TenantOnboarding.tsx | organizations/org_members; local store | src/__tests__/v16-0-multi-tenant.test.tsx | NOT re-verified at runtime | Daph org/site ที่อนุมัติและ persist | identity binding | BLOCKED | onboarding สร้าง org ใน browser ไม่ใช่ server | src/tenant/TenantOnboarding.tsx | verified-by-inspection |
| User/Roles | ตรวจและบันทึก User/Roles | /settings | src/tenant/tenantStore.ts | org members + Auth app_metadata | supabase/tests/cross_tenant_isolation.sql | NOT re-verified at runtime | ผูก operator จริงกับ server roles | least privilege | PARTIAL | presentation roles ไม่ใช่สิทธิ์ server | src/tenant/tenantStore.ts | verified-by-inspection |
| Project | ตรวจและบันทึก Project | /projects; field-app projects | packages/field-app/src/screens/ProjectDetail.tsx | rpc_field_project_detail / field create RPC | packages/field-app/src/screens/FinanceHome.test.tsx | NOT re-verified at runtime | project คงที่หนึ่งงานเชื่อม job | trusted project/revision | PARTIAL | ต้อง UAT การเชื่อม ID ของ Designer/field/job | packages/field-app/src/screens/ProjectDetail.tsx | verified-by-inspection |
| Job | ตรวจและบันทึก Job | /jobs/new; /jobs/:jobId | src/jobs/CreateJobWizard.tsx | jobStore persist; 0172_jobs_quotations_invoices.sql | e2e/jobs-quotation.spec.ts | NOT re-verified at runtime | สร้าง/reload/ข้ามเครื่องผ่าน server | authoritative job run | BLOCKED | wizard เรียก local createJob; submit hook แยก | src/jobs/CreateJobWizard.tsx | verified-by-inspection |
| Quotation | ตรวจและบันทึก Quotation | /quotations | src/quotation/quotationStore.ts | persist monolith-quotation-store; invoice link | src/__tests__/auth-jobs-quotation.test.tsx | NOT re-verified at runtime | ยอด/revision อนุมัติและ record ใช้ร่วมได้ | released scope | BLOCKED | browser persistence ไม่ใช่ operational ledger | src/quotation/quotationStore.ts | verified-by-inspection |
| Design | ตรวจและบันทึก Design | /projects/:projectId/design | src/routes/index.tsx | Designer state; project/revision binding | e2e/cabinet.spec.ts | NOT re-verified at runtime | แบบวัดจริงและหลักฐาน save/reload | released geometry | PARTIAL | ยังไม่รันกับโครงการจริง | src/routes/index.tsx | verified-by-inspection |
| Material | ตรวจและบันทึก Material | MaterialSelector | src/components/ui/MaterialSelector.tsx | material master/version and thickness | src/components/ui/__tests__/MaterialSelector.test.tsx | NOT re-verified at runtime | ตรงรหัสแผ่นที่โรงงานอนุมัติ | calibrated material/tool | PARTIAL | ยังไม่ยืนยัน master import/owner | src/components/ui/MaterialSelector.tsx | verified-by-inspection |
| Hardware | ตรวจและบันทึก Hardware | HardwarePanel | src/data/HardwareLibrary.ts | catalog/provenance and supplier codes | src/core/catalog/__tests__/MinifixHardware.test.ts | NOT re-verified at runtime | ตรงอุปกรณ์และมิติจริง | validated machining intent | PARTIAL | มี catalog ไม่ได้แปลว่า stock อนุมัติ | src/data/HardwareLibrary.ts | verified-by-inspection |
| Validation | ตรวจและบันทึก Validation | /projects/:projectId/validation | src/core/auth/permissions.ts | gate evidence + server checks | src/core/export/__tests__/dxfZipG10Block.test.ts | NOT re-verified at runtime | เก็บ refusal และ inputs ที่ review | no bypass | PARTIAL | ยังไม่ทดสอบ refusal runtime | src/core/auth/permissions.ts | verified-by-inspection |
| Spec Freeze/Release | ตรวจและบันทึก Spec Freeze/Release | /release | supabase/functions/factory-api/index.ts | factory state RPCs; RELEASED invariant | docs/evidence/hosted/s17-1-2/s17-hosted-auth-evidence.json | NOT re-verified at runtime | Freeze แล้ว Release ชัดเจน | S17-2 closure | PARTIAL | 13 cases staging เก่า; ยังไม่ได้เก็บ proof การ deploy ปัจจุบัน | supabase/functions/factory-api/index.ts | verified-by-inspection |
| BOM | ตรวจและบันทึก BOM | ExportPanel | src/core/skills/generate/bom.ts | design/material/hardware snapshot | src/core/hardware/__tests__/handleBom.test.ts | NOT re-verified at runtime | เทียบจำนวนและรหัสครบ | accepted BOM lineage | PARTIAL | ยังไม่พิสูจน์ BOM lineage UI-to-DB ครบ | src/core/skills/generate/bom.ts | verified-by-inspection |
| Cutlist | ตรวจและบันทึก Cutlist | packet/export | src/factory/packet/builders/buildCutList.ts | cabinet data -> cutlist/CSV | src/factory/packet/__tests__/cutListCsv.test.ts | NOT re-verified at runtime | เทียบมิติ/หน่วย/จำนวน | tolerances accepted | PARTIAL | ยังไม่ได้เก็บหลักฐาน discrepancy จากโรงงาน | src/factory/packet/builders/buildCutList.ts | verified-by-inspection |
| Nesting | ตรวจและบันทึก Nesting | NestingPanel | src/nesting/ffdh.ts | sheet sizes, grain, kerf, material | src/nesting/__tests__/ffdh.test.ts | NOT re-verified at runtime | เทียบ layout/yield กับโรงงาน | accepted machine/material | PARTIAL | constraints ทางกายภาพยังไม่ calibrate | src/nesting/ffdh.ts | verified-by-inspection |
| DXF | ตรวจและบันทึก DXF | shadow download | src/core/export/dxfExportFromOperationGraph.ts | operation graph/revision/G10 | e2e/dxf-export.spec.ts | NOT re-verified at runtime | NFP และตรวจหน่วย/geometry อิสระ | exporter/profile acceptance | PARTIAL | E2E skip ตามเงื่อนไข; ยังไม่ตรวจ deployed path | src/core/export/dxfExportFromOperationGraph.ts | verified-by-inspection |
| Factory Packet | ตรวจและบันทึก Factory Packet | /packet/:id | src/factory/packet/buildFactoryPacket.ts | legacy packet vs server/src/packet/v2/generator.ts | server/src/packet/v2/__tests__/generator.test.ts | NOT re-verified at runtime | pin schema/hash; มี upload receipt | S17-3/4 + custody | PARTIAL | ต้องบันทึก generation path และ server acceptance | src/factory/packet/buildFactoryPacket.ts | verified-by-inspection |
| Factory Verify | ตรวจและบันทึก Factory Verify | /factory/jobs/:jobId | src/packet-verifier/verifyPacket.ts | authority/run/key registry; storage hash | e2e/factory-verify-flow.spec.ts | NOT re-verified at runtime | กรณีปกติ/ดัดแปลง; NO_CUT | S17-5 independent closure | PARTIAL | verifier มีแก้ไขแล้ว แต่ closure ยังเปิด | src/packet-verifier/verifyPacket.ts | verified-by-inspection |
| QC | ตรวจและบันทึก QC | FactoryQCPanel; field ProductionPanel | src/components/ui/FactoryQCPanel.tsx | 0111_qc_gate_acceptance.sql | supabase/tests/workflow_db_invariants.sql | NOT re-verified at runtime | ค่าที่วัดจริงและ disposition | signed factory acceptance | PARTIAL | หลักฐานที่ตรวจยังไม่ได้บันทึก QC จริงที่ทำจนจบ | src/components/ui/FactoryQCPanel.tsx | verified-by-inspection |
| Installation | ตรวจและบันทึก Installation | field-app project -> PlanPanel | packages/field-app/src/screens/PlanPanel.tsx | 0112_install_plan.sql; installation-media | src/installation/offline-queue/__tests__/queue.test.ts | NOT re-verified at runtime | แผน/ตรวจหน้างาน/photo sync | full dogfood | PARTIAL | integration/house records ยังค้าง | packages/field-app/src/screens/PlanPanel.tsx | verified-by-inspection |
| Customer Acceptance | ตรวจและบันทึก Customer Acceptance | field project/production flow | src/core/chainEvents/acceptanceStatus.ts | 0098_customer_acceptance_flex.sql | house-01 acceptance = PENDING (`dogfood-record.mjs --status`) | NOT re-verified at runtime | signed ref ที่มีอำนาจและ defects | complete house accepted | PARTIAL | ยังไม่ยืนยัน acceptance UI ครบสาย | src/core/chainEvents/acceptanceStatus.ts | verified-by-inspection |
| Finance/Close | ตรวจและบันทึก Finance/Close | /finance; /accounting; field FinanceHome | packages/field-app/src/screens/FinanceHome.tsx | finance/ledger RPCs; 0190 finance RLS | packages/field-app/src/screens/FinanceHome.test.tsx | NOT re-verified at runtime | เทียบ ledger เดิม ไม่ activate อัตโนมัติ | operational close only | PARTIAL | invoice browser กับ finance authority จริงต่างกัน | packages/field-app/src/screens/FinanceHome.tsx | verified-by-inspection |

## 6. Daph Tenant/Data Readiness

พบ `daph-second-brain/` ทั้ง main และ nested บน main มี PFMEA/Process Control Plan notes/spreadsheets ใน `02-Areas/Process/Factory`, Office/Sale/Designer/Production Planning และ Installation และ Factory MOCs สำหรับ Cutting, CNC, Assembly, Packing เป็นข้อมูลความรู้ที่มีที่มา ไม่ใช่ master rows ที่ใช้งานจริง ความครบและ revision ที่มีผลของ Edging/QC ยังต้องให้เจ้าของตรวจ

นำมาใช้หลัง review owner/version: โครง checklist, แนวทางราคา/change control, คำถาม QC และ SOP references งาน manual/bootstrap: ยืนยัน Daph org/site จริง จัดสมาชิกตามสิทธิ์ map รหัสวัสดุ/อุปกรณ์/supplier และหน่วยจริง บันทึกเครื่องแบบ documented-only และนำเข้าเฉพาะ rules/tolerances ของ pilot ยังไม่ยืนยัน seed/deployed Daph tenant, roster, supplier master ครบ หรือ machine activation ที่อนุมัติ house-01 มี site/project reference แต่ไม่พิสูจน์ว่า environment ปัจจุบันยังมี record นั้น

seed 0163 ที่ test ใน nested อ้างแล้วหาไม่พบเป็น **ปัญหาเฉพาะ local** ไม่ใช่ blocker ของ main ด้วยชื่อไฟล์นั้น main มี migration chain อีกชุด ต้องตรวจ org/site/RPC และ migration inventory ก่อน bootstrap ห้ามคัดลอกคลัง Daph/ZIP ธุรกิจลงตาราง operation โดยตรง

## 7. D0 Production SaaS Requirements

ALREADY EXISTS ระดับ source/evidence: React/Vite app, Supabase Auth/DB/storage integrations และ migrations, field app, Factory Edge API, Node worker/server ทางเลือก และ CI definitions รวมหลักฐาน Supabase auth non-production ในอดีต ไม่พิสูจน์ hosting, bills, backup หรือ schema ที่ deploy ปัจจุบัน

NEEDED FOR D1: environment แอปที่ระบุและอนุมัติหนึ่งชุด; DB/auth/private storage; role/org mapping จริง; workflow writes/reload แบบ persistent; เจ้าของ secret และขั้นตอน revoke; access controls/cross-scope negative tests; backup และทดสอบ restore รวม storage objects; error logs/alert พื้นฐาน; TLS; operator/incident owner และ recovery checklist ต้องยืนยัน canonical provider/data policy จากเจ้าของก่อนเปลี่ยน infra แผน Supabase SG bridge Wave2 เดิมมีเงื่อนไขก่อนใช้ข้อมูลลูกค้าเต็ม/ledger production ไม่ใช่อนุมัติครอบคลุมปัจจุบัน

scenario ขั้นต่ำสำหรับประมาณ: static-app host ที่อนุมัติเดิม + Supabase หนึ่ง project + Factory Edge path โดยตรง ต้องเพิ่ม Node/Redis queue เฉพาะเมื่อ export path ที่เลือกต้องใช้ และต้องยืนยันก่อนรับงบ DEFERRED UNTIL SCALE: HA clusters, fleet orchestration, warehouse, enterprise observability, external billing ไม่อนุมัติเปลี่ยน provider หรือ AWS architecture

## 8. D1 Shadow Pilot Requirements

D1 อาจสร้าง/ติดตาม project, quote, design, material/hardware, spec/validation, BOM/cutlist, nesting, DXF, packet, verify result, QC, installation, acceptance และผลเทียบการเงินในโครงการจริงหนึ่งงานที่อนุมัติ ใบสั่งเดิมที่โรงงานอนุมัติยังเป็น cutting authority ห้ามส่ง CNC อัตโนมัติและคง NO_CUT แม้ verify ผ่าน การเงินเป็นข้อมูลเทียบจนผู้มีอำนาจเดิมอนุมัติ reconciliation D1 ไม่ใช่สิทธิ์ activate production ledger

เงื่อนไขเข้า: แก้หรือควบคุม persistence blockers สามจุดในตารางอย่างชัดเจน พิสูจน์ identity/reload ข้ามผู้ใช้ pin source/schema/master versions ระบุ owner/operator/designer/factory/finance reviewers เก็บ factory truth รัน UAT และพิสูจน์ recovery browser-only demo ที่ใช้ข้อมูลปกปิดทำต่อได้ แต่ไม่ถือว่าบรรลุ D0→D1 แบบ shared SaaS

discrepancy record ขั้นต่ำ: ID, project/job/revision, software SHA, schema/exporter/profile/master versions, output hash/path/หน่วย, factory-truth ID/version/ผู้อนุมัติ, property ที่เทียบ, expected/observed, delta/tolerance, severity, owner, disposition, evidence references, timestamps, reviewer/closure evidence และ realCutAllowed=false ระบุเหตุผลหากไม่เกี่ยวข้อง หากหลักฐานยังไม่ครบ ห้ามบันทึกว่า discrepancy เป็นศูนย์ เก็บ PII ใน operational storage ที่อนุมัติ ไม่ลง Git

## 9. UAT / Evidence Plan

ร่าง UAT ยังไม่รัน ใช้ Daph identities ที่อนุมัติและยืนยันตัวตน โครงการจริงหนึ่งงาน และใบสั่งเดิมของโรงงาน แต่ละขั้นผ่านเมื่อมีหลักฐาน ห้ามนับ skip เป็นการรับรอง

| ขั้น | Precondition | Action | Expected result | Evidence captured | Failure condition | STOP condition |
| --- | --- | --- | --- | --- | --- | --- |
| Daph tenant/roles | owner อนุมัติ org/site/roles | เลือก tenant; ทดสอบสิทธิ์อนุญาตและปฏิเสธ | เข้าถึงเฉพาะ scope ถูกต้อง | identity/scope test refs | scope/role ไม่ตรง | เข้าถึงข้าม tenant |
| Project/job | ผู้ใช้มี scope ถูกต้อง | สร้าง project และ job เชื่อมกัน | ID คงที่และ reload แล้วยังอยู่ | IDs เวลา ผล reload | linkage หาย/ซ้ำ | ผูกลูกค้าหรืองานผิด |
| Quotation | project และข้อมูลราคาอนุมัติ | ร่างและอนุมัติราคา | ยอด/revision ตรงต้นทาง | quote/version ปกปิด PII และผลเทียบ | ส่วนต่างอธิบายไม่ได้ | ผูกพันการเงินโดยไม่อนุมัติ |
| Design | spec จากการวัด | สร้าง assembly จริงหนึ่งชุด | มิติตรงค่าที่วัด | hash/version และ measurement refs | geometry/หน่วยผิด | ค่าที่วัดกำกวม |
| Material/hardware | catalog โรงงานอนุมัติ | เลือกแผ่นและอุปกรณ์จริง | รหัส ความหนา จำนวนตรง | master versions/supplier refs | ทดแทนผิดหรือไม่ทราบ spec | constraint ไม่ทราบหรือไม่ปลอดภัย |
| Validation | แบบครบ | รัน validation ที่บังคับ | ผลผ่านหรือ refusal ชัดเจน | ผลเต็มและ inputs | เงียบ/bypass | safety refusal ยังไม่แก้ |
| Freeze/release | แบบผ่านการตรวจ | freeze revision ที่อนุมัติ | revision คงที่และ trace ได้ | revision/hash/reviewer | เปลี่ยนเงียบภายหลัง | release ไร้อำนาจ |
| BOM/cutlist | pin revision | สร้างและเทียบ | จำนวน หน่วย มิติตรง | files/hash/ผลเทียบโรงงาน | ขาดชิ้นงานหรือไม่ตรง | discrepancy ไม่มี disposition |
| Nesting | sheet/grain/kerf อนุมัติ | สร้าง layout | constraints ถูกต้องสำหรับเทียบ | inputs/settings/layout hash | overlap/grain/kerf ผิด | นำ layout ไม่ปลอดภัยไปเป็นคำสั่ง |
| DXF | revision ที่ export shadow ได้ | export และเปิดตรวจ | NFP และ geometry ถูกมิติ | ZIP/hash/ผลดูอิสระ | skip/ไม่มีไฟล์/มิติผิด | ขาด NFP หรือส่งเข้าเครื่อง |
| Factory packet | outputs ครบ | สร้าง packet | manifest/hash ผูก output พร้อม NFP | packet/hash/manifest | ขาดไฟล์หรือ hash ไม่ตรง | output คล้าย production ไม่มีป้าย |
| Factory verify | setup สำหรับตรวจที่เชื่อถือได้ | ตรวจไฟล์ปกติและไฟล์แก้ไข | รับไฟล์ถูกต้อง ปฏิเสธไฟล์แก้ไข | logs เต็ม | รับไฟล์ที่ถูกดัดแปลง | ตรวจไม่ได้หรือรับผิด |
| Factory comparison | ใบสั่งเดิมอนุมัติ | เทียบกับ factory truth จริง | บันทึกและ review delta ทั้งหมด | discrepancy records | ไม่บันทึกส่วนต่าง | Monolith แทนอำนาจสั่งตัดเดิม |
| QC | ชิ้นงานจริงจากกระบวนการเดิม | วัดและบันทึก | trace ค่า/tolerance ได้ | ค่าที่วัดและภาพปกปิด PII | ขาดค่าหรือวัดผิดชิ้น | ปล่อยงานไม่ปลอดภัย/ไม่ผ่าน |
| Installation | แผนติดตั้งอนุมัติ | บันทึกติดตั้งจริงและ sync | completion/issues trace ได้ | plan/events/sync evidence | event หายขณะ offline | หน้างานไม่ปลอดภัย/ขาดแผน |
| Acceptance | เทียบงานและข้อบกพร่องแล้ว | รับรองโดยผู้มีอำนาจ | ผู้ลงนาม/หลักฐานผูกกับงาน | signed ref และข้อบกพร่องค้าง | ขาดหรือสร้าง consent เท็จ | acceptance เท็จ |
| Finance/close | เอกสารการเงินอนุมัติ | reconcile และปิด pilot record | ยอด/อนุมัติตรง ledger เดิม | reconciliation/close ref | variance อธิบายไม่ได้ | activate ledger/จ่ายเงินไร้อำนาจ |

Verification labels: **verified-by-inspection** สำหรับ source/config/report; **verified-by-gate** เฉพาะ GitHub check conclusion ที่ระบุ scope บน PR head `dae8afd108444ae30ae7e9465cceb068f3ec49cc`; **NOT re-verified at runtime** สำหรับ deployment ของ main และผลโรงงานจริง ดึง checks 12 รายการ: success 10, skipped 2 ห้ามขยายเป็น full root/server E2E หรือ main SHA Actions query ไม่พบ runs ทั้ง nested SHA และ main ที่เลือก ส่วน PR checks เป็นหลักฐานคนละชั้น

หลักฐาน PR head: [fresh DB pgTAP](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/36562134070/job/109385732881), [TypeScript](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/36562133912/job/109385271049), [people/culture units](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/36562133912/job/109385270739), [server dependency audit](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/36562133974/job/109385268375) รายการเต็มอยู่ ci.json ข้างรายงาน เป็น conclusion จาก CI service ไม่ใช่จำนวน tests ที่รันซ้ำในเครื่อง

DB workflow เตรียม canonical fresh migrations โดย merge duplicate versions ก่อน local reset/pgTAP ไม่พิสูจน์ hosted incremental migration หรือ RLS ที่ deploy ปัจจุบัน Full Verify กำหนด lint/typecheck/build, server/field tests, transport, S17-4, factory E2E, audit และ smoke ที่ป้องกัน skip จนดูเหมือนผ่าน แต่ใน Actions API ยังไม่เจอ run เต็มของ main SHA ที่เลือก

| Gate | Script/workflow/evidence | Observed scope / ขอบเขตผล |
| --- | --- | --- |
| TypeScript | package.json typecheck:all; people-culture-ci.yml | PR head TypeScript Type Check success; not entire main runtime |
| Server TypeScript | typecheck:server; verify-full server build | No exact-main result established |
| Lint | lint:budget / lint:strict; verify-full.yml | Main no exact-SHA run; local old lint:all  /  /  true is not main |
| Build | verify-full root/server/field build | PR-head Storybook success only; full app build not carried forward |
| Unit tests | test:run; server test:s17-4; test:node | PR-head people/culture success; full root current result unknown |
| DB/migrations/RLS | pgtap-tests.yml; db-verify.yml; cross_tenant_isolation.sql | PR-head fresh DB check success; not hosted apply/restore |
| Security/audit | audit:production; npm-audit.yml | PR-head server dependency audit success; not whole-system security certification |
| Playwright | playwright.e2e.config.ts; verify-full.yml | Visual check success at PR head; full Golden Path not established |
| Factory verification | e2e/factory-verify-flow.spec.ts; src/packet-verifier | Deterministic contract exists; current no-cut operator run: not yet executed |
| DXF E2E | e2e/dxf-export.spec.ts | Conditional skips exist; @smoke CI has anti-skip enforcement; no current full path result |
| Jobs/quotation E2E | e2e/jobs-quotation.spec.ts | Uses localStorage fixtures and conditional skips; not shared persistence proof |
| Daph-specific | packages/field-app; scripts/dogfood-record.mjs; house-01 | Field tests exist; actual house core chain incomplete |

คำสั่งเสนอสำหรับรอบ execution ที่อนุมัติแยก: npm run typecheck:all; npm run typecheck:server; npm run lint:budget; npm run test:run; npm run build; npm run test:s17-4; npx playwright test --config playwright.e2e.config.ts อ่าน effective configs ก่อน คำสั่งที่ใช้เวลาหรือเขียน artifacts เหล่านี้ยังไม่ได้รัน ห้าม install/migrate/deploy ภายใต้สิทธิ์ audit นี้ คำสั่ง reporter แบบอ่านอย่างเดียวและ exit codes เก็บใน evidence.json

## 10. Dogfood Status

`docs/evidence/dogfood/house-01/started.json` บันทึก STARTED วันที่ 2026-07-18, shadowPacketEnabled=true, realCutAllowed=false มี project/site/role และ first-event references ใน tree มีเพียง started.json และ digest · `docs/evidence/dogfood/` มีโฟลเดอร์เดียวคือ `house-01` · reporter แสดง contract, payment, install-plan, production และ acceptance เป็น PENDING และ shadow-compare 0 record จึงยังไม่ถึงขั้นรับมอบบ้านครบสายที่ลงนาม

คำสั่งอ่านอย่างเดียวที่รันใหม่ `node scripts/dogfood-record.mjs house-01 --status` รายงาน core chain ไม่ครบ และ shadow comparison ศูนย์ record ที่เริ่มแล้วเป็น verified-by-inspection ไม่ใช่ query โครงการที่ใช้งานจริงใหม่ reporter ใช้การมีไฟล์ตัดสิน chain ดังนั้นแม้ภายหลังขึ้น COMPLETE ก็ต้องตรวจเนื้อหา/provenance/acceptance ไม่ดูแค่ไฟล์ `git grep -nE 'realCutAllowed"?\s*[:=]\s*true' origin/main -- docs/evidence` คืน 0 บรรทัด ค่าเดียวที่เจอคือ `"realCutAllowed": false` ใน `house-01/started.json` (Claude ตรวจ 2026-09-29)

## 11. S17 Status

รัน `scripts/readiness-status.mjs --json` แบบอ่านอย่างเดียวใหม่ ตรงกับ `.kiro/specs/installation-pm/tasks.md`: S17-1 IN_PROGRESS; S17-2 IN_PROGRESS; S17-3 CLOSED; S17-4 OPEN; S17-5 IN_PROGRESS การปิดรวม **BLOCKED** mapping เป็น status ที่กำหนด: S17-1 PARTIAL, S17-2 PARTIAL, S17-3 PASS **เฉพาะ record อนุมัติ specification**, S17-4 PARTIAL, S17-5 PARTIAL

S17-1/2 มี code และ hosted-auth record เก่า (13 cases; expected commit 8a6b89c8..., บันทึก 13 กรกฎาคม non-production) Factory API ปัจจุบันยังใช้ verified actors และบังคับ RELEASED แต่ไม่ปิด prod-apply หรือยืนยัน hosted ปัจจุบัน

S17-3: `docs/governance/ct-dec-002-signoff-checklist.en.md` บันทึกสามบทบาท SIGNED โดย Factory Owner รับเฉพาะ SHADOW CONTRACT / ACTIVATION PENDING ไม่ใช่สี่ลายเซ็น ADR-064 S17-4 มี `server/src/packet/v2/*`, deterministic tests และ frozen handoff แต่ ledger ยัง OPEN ห้ามนับ code เป็น closure ส่วนรีวิว S17-5 เดือนกรกฎาคมเคยพบข้อบกพร่อง แต่ `src/packet-verifier/verifyPacket.ts` ปัจจุบันตรวจ closed payload registry/gate evidence แล้ว ห้ามยกข้อบกพร่องเก่ามาฟันธงว่ายังอยู่ ยังไม่ยืนยัน independent closure/current tamper execution และ S17-6 key ceremony เป็นหลักฐานแยก

## 12. ADR-064 Status

**PARTIAL / real-cut gate BLOCKED:** มี `docs/governance/adr-064-signoff-checklist.th.md` แต่ Product Owner, Tech Lead, Security Owner และ Factory Owner ยัง PENDING ทั้งหมด **ลงชื่อ 0/4** review anchor/commit ยังเป็น placeholders ไม่สร้างลายเซ็น ไม่ promote canonical หรือปิด gate

## 13. Machine Calibration / First Article

Software machine profiles/post-processors: **PASS เฉพาะมีอยู่** มี presets ใน `src/cnc/machine/presets`, post dialects และ `server/src/post/machineProfiles.ts`  · การ calibrate จริง: **NOT FOUND ใน evidence tree หลัก** · production authority: **BLOCKED**

`docs/governance/adr-070-machine-onboarding.en.md` อ้างเอกสาร KDT KN-2409LP บน governance commit ในอดีตอีกชุด และระบุ NOT_ASSESSED / MANUFACTURING RELEASE PROHIBITED / machine_verification_pending `git ls-tree origin/main docs/evidence/` แสดง 4 โฟลเดอร์ (ci, dogfood, hosted, interop) · `docs/evidence/machines` อยู่ใน branch `governance/s17-control-pack` ซึ่งยังไม่ merge เข้า main (Claude ตรวจ 2026-09-29) · ไม่ยืนยัน dimensional First Article, air-cut ที่มีพยาน, calibration, signed factory acceptance หรือ activation ของเครื่องจริง simulator/unit/golden fixtures เป็นหลักฐาน software เท่านั้น ADR-070 บังคับตรวจ identity/controller/tool/WCS/envelope, known-good job, simulation, dry-run, First Article และมนุษย์รับรองแยกแต่ละเครื่อง

## 14. D1 Blockers

D1 blockers เรียงลำดับ:

1. Daph organization/memberships ที่ persist บน server เพราะ onboarding ปัจจุบันเขียน client store
2. identity และ state ของ project/job/quotation ที่ใช้ร่วมได้ wizard และ quotation ใช้ browser stores ต้องพิสูจน์ reload จากผู้ใช้อีกคน/เครื่องอื่นและ org-switch isolation ไม่ใช่แค่เพิ่มตาราง
3. environment reconciliation: ยังขาดหลักฐานปัจจุบันของ approved host/data policy, deployed SHA, migration inventory, server roles, private storage, secret ownership และ restore exercise
4. pin design→packet schema/path และ server acceptance ทดสอบ valid/refused/tampered ภายใต้ NO_CUT
5. อนุมัติ master data/operator แล้วรัน Golden Path หนึ่งงาน เก็บ comparison/disposition, QC, installation, acceptance และ reconciliation การเงิน

field RPC ที่มีเป็นสิ่งที่อาจใช้ซ้ำ ไม่พิสูจน์ว่า local stores ของ root app เชื่อมให้อัตโนมัติ เจ้าของอาจอนุมัติ manual pilot ที่แคบลงภายหลัง แต่เป็นการเปลี่ยน scope ไม่ใช่ใช้แทน D0→D1 ที่ขออย่างเงียบ ๆ

## 15. Real-Cut Blockers

ข้อกำหนดตัดจริงสี่กลุ่ม: (A) S17-1..5 closure **PARTIAL**, gate รวม BLOCKED; (B) ADR-064 **PARTIAL**, 0/4; (C) บ้าน dogfood ครบสาย **PARTIAL**, มีแค่ STARTED · (D) physical calibration **NOT FOUND** · รวม **BLOCKED** ต้องมี custody/independent-verifier/activation evidence ด้วย D1 เก็บหลักฐานได้ แต่รัน report หรือพบไฟล์ไม่ปิดข้อกำหนด คง SHADOW_MODE_NOT_FOR_PRODUCTION=true

## 16. Deferred Scope

DEFERRED: Phase 15 Predictive Maintenance, IoT Edge fleet, full warehouse, advanced BI, external SaaS billing, enterprise infrastructure, Phase 15 PPTX, 123-MCP completeness และ Real-Cut authority ไม่รวมการซื้อเครื่อง CNC, KMS ceremony เพื่อตัดจริง, certification หรือค่า physical calibration ในงบ D1 โรงงานผลิตจริงด้วยกระบวนการเดิมที่อนุมัติ

## 17. Cost to D0

**งบเผื่อเพื่อวางแผนตามเงื่อนไข ไม่ใช่ใบเสนอราคาหรืออนุมัติจ่าย** สมมติหนึ่ง tenant, staff 3–5 คน, บ้าน pilot หนึ่งงาน มีคอมพิวเตอร์/เครื่องจักร/กระบวนการโรงงานเดิม และ environment ที่อนุมัติรองรับ Supabase ไม่ใช้ตัวเลขเดิม 8,000–20,000 บาทต่อ subscriptions/เงินเดือนภายในยังไม่ทราบ ต้องแยกเงินสดกับ effort

scenario งานวิศวกรรม D0: 10–18 person-days × สมมติ 3,000–5,000 บาท/วัน = **ค่าแรงจ้างภายนอกครั้งเดียว 30,000–90,000 บาท** rate เป็น input สมมติ ไม่ใช่ราคาตลาดที่สำรวจ ฐานงาน: onboarding/org authority, job/quotation persistence/linkage, tenant-negative tests, migration/environment reconciliation, auth/storage/recovery และ release evidence ความเชื่อมั่น LOW defects อาจเกิน allowance หาก staff เดิมทำ เงินสดค่าแรงเพิ่มอาจเป็นศูนย์ แต่ยังใช้ effort 10–18 วัน ค่า infra เริ่มต้นนับเดือนแรกตามหัวข้อ 19 ไม่บวก subscription ซ้ำ ไม่มีงบซื้อ hardware

## 18. Cost to D1

งานเตรียม operation/UAT เพิ่มสำหรับ D1: **5–9 staff-days × สมมติ 1,000–2,000 บาท/วัน = ครั้งเดียว 5,000–18,000 บาท** หากจ้างภายนอก ครอบคลุม review ข้อมูล pilot, mapping material/hardware ที่ owner อนุมัติ, อบรม, comparison, เก็บ evidence และซ้อม acceptance/finance ความเชื่อมั่น LOW ใช้ staff เดิมอาจไม่มีเงินสดเพิ่ม

contingency วิศวกรรมสำหรับ defect/UAT: **3–6 วัน × 3,000–5,000 = 9,000–30,000 บาท** กันแยก ไม่ซ้ำสอง work packages ก่อนหน้า อิงช่องว่าง persistence/identity ข้ามเครื่องและยังไม่รัน Golden Path ครบ ไม่รับรองว่าเพดานนี้ปิดทุก defect

scenario จ้างภายนอกรวม D0 + D1 + contingency: **44,000–138,000 บาท** บวก operating cost เดือนแรก ไม่รวม VAT, ต้นทุนงานโรงงานปกติ, เดินทาง และเงินเดือนเดิม ไม่ใช่เงินสดขั้นต่ำที่พิสูจน์แล้ว หากเจ้าของ/staff ทำเอง เงินสดเพิ่มหลักคือ infra และผู้ช่วยที่ซื้อจริง แต่ effort ยังมีอยู่ ไม่รวมงาน real-cut

## 19. Monthly Run Cost

scenario รายเดือน: Supabase Pro เริ่ม **US$25/เดือน** ใช้ **FX สมมติสำหรับตั้งงบ 36 บาท/US$ (ไม่ใช่อัตราแลกเปลี่ยนที่เสนอจริง)** เท่ากับ **900 บาท/เดือน** ก่อนภาษี/overages กันเพิ่ม **0–1,000 บาท/เดือน** สำหรับ hosting/logging/off-site evidence storage ที่อนุมัติ และ **0–100 บาท/เดือน** เฉลี่ย domain เฉพาะถ้าจำเป็น รวมกรอบ fixed planning **900–2,000 บาท/เดือน** capacity ที่จ่ายอยู่แล้วอาจลดเงินสดส่วนเพิ่ม reserve hosting/storage เป็นสมมติฐาน ไม่ใช่ใบเสนอราคา ต้องยืนยัน plans จริงก่อนผูกพัน

[Supabase pricing](https://supabase.com/pricing) และ [backup documentation](https://supabase.com/docs/guides/platform/backups) ตรวจ 2026-09-29: Pro เก็บ daily DB backups เจ็ดวัน ต้องมีการสำรอง storage objects แยกและ restore evidence PITR เป็นค่าเพิ่ม (แสดงราคาเริ่ม US$100/เดือน) ไม่รวมในกรอบ และไม่จำเป็นอัตโนมัติหาก owner อนุมัติ recovery แบบรายวันได้ แต่ต้อง reconcile นโยบาย Wave2 เดิมก่อนเลือก objective หากต้องมี PITR ให้เพิ่มอย่างน้อย 3,600 บาท/เดือนด้วย FX สมมติเดียวกัน รายงานไม่ยกเว้นนโยบายให้

ค่าแยกที่ยังไม่ตีราคาจนยืนยัน route: Node/Redis worker hosting, AI API, paid LINE messaging, เดินทาง และ overages เป็นค่า variable/conditional ไม่ซ่อนใน fixed total ไม่เลือก/เปลี่ยน provider ราคาที่ถูกลงไม่แก้ persistence/governance blockers

## 20. Estimated Working Days

ประมาณแบบทำต่อเนื่องตามเงื่อนไข: D0 10–18 วันวิศวกรรม + D1 เตรียม/UAT 5–9 staff-days + buffer defects 3–6 วันวิศวกรรม = **18–33 วันทำงาน หากจัดลำดับต่อกัน มีวิศวกรหนึ่งคนและ operator พร้อม** ความเชื่อมั่น LOW บางงานข้อมูลทำซ้อนกันได้แต่ไม่สัญญาวันที่เร็วกว่า access ภายนอก, migration defects และเวลาคนจริงอาจทำให้ยืด

เป็นเวลาถึงการตัดสินใจเริ่ม D1 แบบควบคุม ไม่รับรองว่าบ้านติดตั้ง/รับมอบครบหรือใช้ตัดจริงได้ บ้าน dogfood ครบสายต้องตามตารางโรงงาน/หน้างาน ต้องประเมินใหม่หลัง inventory environment และพิสูจน์ persistent end-to-end ครั้งแรก

## 21. Risks / Unknowns

ข้อจำกัด: ไม่ login ระบบจริง ไม่ query production ไม่ดึง hosted migration inventory ไม่ restore backup และไม่เดินเครื่องจริง ยังไม่ทราบสิทธิ์ข้อมูลลูกค้าจริง/deployment ไม่มี exact-SHA CI run ใน API ที่ query ห้ามขยายผล PR checks บางเส้นใน matrix เป็น source candidates ไม่ใช่การพิสูจน์ join ครบ เอกสาร PDF/backup/screenshots รองใน ZIP หลายร้อยไฟล์ทำ inventory แต่ไม่ได้ authenticate ทีละฉบับ ไม่ verify benchmark provenance หรือ market/literature assertions ภายนอก และไม่ใช้เป็น product gate

รักษา nested dirty work และบันทึก bad-ref เลข migration ระหว่าง root ต่างกัน ห้ามสรุป cherry-pick ปลอดภัยเพราะชื่อเหมือนกัน credentials ที่เคยเปิดเผยต้องตามกระบวนการแก้ไขเดิม audit นี้ไม่ revoke หรือส่ง ZIP ที่มี secret ซ้ำ หยุดก่อน onboarding ข้อมูลจริงหรือตัดสินใจ infra โดยไม่มีหลักฐานเจ้าของ

## 22. Recommended Commit Split

หน่วยงานที่เสนอเพื่อ review แยก ยังไม่ทำ: (1) รายงาน TH/EN, HTML, evidence นี้; (2) contract/tests ของ Daph org/membership ที่ persistent; (3) job/project/quotation linkage ที่เก็บถาวรและ tests ข้ามเครื่อง/org-switch; (4) mapping master data และ operating SOP; (5) environment/restore evidence ที่อนุมัติและ UAT record แยก Real-Cut/S17 closure ออก ใช้ RPC เดิมซ้ำหลังตรวจ contract เท่านั้น ไม่คัดลอก migrations จาก nested หรือ code ใน ZIP ทั้งชุด งานนี้ไม่ commit/push/merge/implement/เปลี่ยน cloud

## 23. STOP Boundary

baseline ตัดสินแล้ว: ตรวจ main ที่ pin และเทียบ dirty local แยก การตัดสินใจถัดไปคือจะอนุมัติ work package เรื่อง persistence/integration สำหรับ D1 หรือไม่ พร้อมระบุ environment/เจ้าของ operation ที่อนุมัติ รายงานไม่แฝงสิทธิ์ implementation

STOP ก่อนแก้ source/config, dependencies, migrate, deploy, provision, อนุมัติ AWS, ย้าย raw PII, ลงนามแทนคน, ปิด S17, promote canonical หรือเปลี่ยน shadow flag หากทำ pilot ภายหลังให้หยุดเมื่อ identity ผิด, ข้อมูลข้าม scope, ขาด NFP, server ไม่รับ upload, verify ไม่ได้, discrepancy ความปลอดภัยยังไม่แก้ หรือส่ง shadow output เข้าเครื่อง

ผู้ใช้เห็น workflows ระบบเห็น modules contracts เชื่อม modules gates คุม release **D1 Shadow Pilot ≠ Real-Cut Production Authority**

## DONE

ตรวจ source/CI/config/evidence แบบอ่านอย่างเดียวบน main ที่ pin เทียบข้อกล่าวอ้าง ZIP แบบเลือกประเด็นและ local จัด UAT/งบตามเงื่อนไข พร้อม Markdown/HTML TH/EN

## NOT DONE

ยังไม่รัน runtime/UAT/tests ทั้งชุด ไม่ตรวจ hosted inventory/restore ไม่ authenticate ทุกไฟล์แนบ ไม่แก้ source/bootstrap ข้อมูล/calibrate เครื่อง

## DEFERRED

phases ขั้นสูง enterprise scale external SaaS billing 123-MCP ครบ และ Real-Cut

## BLOCKED

D1 ต้องมี shared workflows แบบ persistent และ operational evidence; Real-Cut สี่กลุ่มยังไม่รับรอง ส่วนการเลือก baseline ไม่ติดแล้ว

## EVIDENCE

ดู .evidence.json ข้างรายงาน (SHA/source hashes/reporter/ZIP inventories) และ .ci.json (PR-head conclusions) พาธในรายงานอิง main ที่ pin เว้นแต่ระบุ parent/nested CONTEXT.md และ correction กรกฎาคมใช้กำกับ routing ส่วน reconciliation กันยายนเป็นข้อมูลอดีต

## VERIFICATION LABELS

verified-by-inspection: source/files/reporter observations; verified-by-gate: เฉพาะ PR-head CI conclusions ที่ระบุ scope; NOT re-verified at runtime: deployment main เส้นทางธุรกิจครบและโรงงานจริง reporter exit 0 คือรายงานสำเร็จ ไม่ใช่ readiness PASS

## NEXT DECISION

ทบทวน D1 blockers/งบตามเงื่อนไข ระบุ environment และเจ้าของที่อนุมัติ ก่อนอนุมัติงาน persistence/integration แยก

## STOP

ส่งมอบงานตรวจ/วางแผน ไม่ให้อำนาจ production หรือตัดจริง

## ประวัติการแก้ไข

**v0.1 → v0.1.1** (Claude, 29 กันยายน 2026) นำเข้า repo ตามที่เจ้าของอนุมัติ **ไม่ได้เปลี่ยนคำตัดสิน สถานะ ตัวเลข หรือข้อเสนอใดของ v0.1** แก้เฉพาะเพื่อให้ผ่าน `tools/lint_claims.py` และ `tools/lint_certifications.py` แบ่งเป็น 4 กลุ่ม:

1. **แยกประโยคหรือระบุประธานให้ชัด (13 จุด):** คำปฏิเสธในประโยคเดิมหมายถึงหลักฐานหรือการรันที่ยังไม่ได้ทำ แต่ linter ผูกเข้ากับชื่อไฟล์ที่มีอยู่จริงในประโยคหรือแถวตารางเดียวกัน เช่น "ไม่มี proof deploy ปัจจุบัน" เปลี่ยนเป็น "ยังไม่ได้เก็บ proof การ deploy ปัจจุบัน" หรือแทรก ` · ` คั่นประโยค
2. **เปลี่ยนเป็นข้อเท็จจริงเชิงบวกพร้อมคำสั่งตรวจ (2 จุด):**
   - เดิมเขียนว่า "main ที่เลือกไม่มี `docs/evidence/machines`" ฉบับนี้ระบุว่า `git ls-tree origin/main docs/evidence/` แสดง ci, dogfood, hosted, interop และ `docs/evidence/machines` อยู่ใน branch `governance/s17-control-pack` ที่ยังไม่ merge ข้อมูลนี้ละเอียดกว่าเดิม
   - `realCutAllowed=true`: แนบคำสั่ง `git grep` และผล 0 บรรทัด
   - `tools/verify_absence.py` ใช้กับกรณีนี้ไม่ได้ เพราะเป็นการค้นข้อความ ซึ่งเจอสตริงเดียวกันในเอกสารและประวัติ git
3. **ใช้ผลจาก reporter แทนคำว่า "missing" (2 จุด):** acceptance ของ house-01 และสถานะ chain ของ dogfood อ้างผลของ `dogfood-record.mjs --status`
4. **คำรับรองที่ตรวจซ้ำไม่ได้ (1 จุด):** "status สะอาด" เปลี่ยนเป็น "ผู้ตรวจบันทึกว่า `git status` ว่าง" เพราะ checkout นั้นอยู่ในเครื่องของผู้ตรวจ

**`evidence.json`:** ตัดรายชื่อไฟล์ใน `agent-artifacts-zip_9c76194a…zip` ออก เพราะเป็นเอกสารธุรกิจของ Daph และ repo นี้เป็น public ยังคงชื่อ ZIP, SHA-256 และจำนวนไฟล์ (695) ไว้ ส่วนรายชื่อไฟล์ใน `oriverse_vs_monolith_analysis.zip` ยังอยู่ครบ ไฟล์ HTML สร้างใหม่ด้วย `tools/render_docs.py`
