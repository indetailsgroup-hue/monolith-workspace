# MONOLITH — สถานะงาน ณ 10 กันยายน 2026

หมายเหตุการเผยแพร่: เอกสารอ้างหลักฐานตามวันที่เดิม ไม่ใช่การตรวจ runtime หรือ CI ใหม่ ไฟล์หลักฐานเฉพาะในเครื่องไม่ได้รวมในการเผยแพร่นี้ SC-01–SC-18 เป็นรหัสสายงาน roadmap แยกจากรหัสมติ Steering Committee


## ข้อสรุป

มีผลิตภัณฑ์และงาน implementation จำนวนมากแล้ว และ [v17.5.2 เผยแพร่จริงเมื่อ 7 กันยายน](https://github.com/indetailsgroup-hue/monolith-workspace/releases/tag/v17.5.2) แต่ **main ล่าสุดยังไม่ผ่าน CI ทั้งชุด และยังห้ามใช้ Designer packet ตัดชิ้นงานจริง** งานที่เหลือมีทั้งการปิด quality gates, เชื่อม integration, ทำ feature ส่วนที่ขาด และรวบรวมหลักฐาน production/โรงงาน

ไม่ให้เปอร์เซ็นต์รวม เพราะ checklist ซ้อน parent/subtask, บางชุดล้าสมัย และไม่มี denominator ของ scope ที่ ratify ล่าสุด งาน “มีโค้ด”, “รวม main”, “release”, “deploy” และ “ใช้จริงผ่าน” เป็นคนละสถานะ

## ขอบเขตและ revision

- วันที่ตรวจ: 2026-09-10 เขตเวลา Asia/Bangkok
- GitHub main ยึด [52e0eeb12527d4bb3866ee726b4f30d4d74dca57](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/package.json); version 17.5.2; recursive tree ไม่ truncated: 4,137 blob files และ 322 SQL migration source files (ไม่ใช่จำนวน canonical migrations ที่ apply production)
- Parent governance root: [local governance workspace], branch guardrails/claim-linters, HEAD aa1b30e509ece9d8efad3d68e949860aa79bdecf; สถานะก่อนสร้างรายงาน 11 modified / 574 untracked status entries
- Nested product root: determined-williams/, branch fix/dxf-truth-chain, HEAD 9c4bee6759f6d1919a320a2f56088ce683287f58 (11 ส.ค.); 10 modified / 12 deleted / 61 untracked entries; package ในเครื่องยัง 2.1.0
- อ่าน CONTEXT.md และ scope correction 21 ก.ค. แล้ว ไม่อนุมานความไม่มี runtime จาก parent apps/packages
- นี่เป็นการตรวจสถานะระดับ workstream + inventory checklist ทั้ง 13 ไฟล์ที่ค้นพบ ไม่ใช่ security audit ทุกบรรทัดหรือ UAT ทุก requirement ไม่ได้รัน test บน snapshot เก่าแล้วอ้างเป็นผล main ใหม่
- หลักฐานในเครื่องหลาย branch/worktree ยังไม่ได้เทียบ ancestry กับ remote main จึงไม่เรียกงานเหล่านั้นว่า merged หรือ deployed

## เรื่องเร่งด่วน

1. **B1 — Main quality gate ยังแดง (VERIFIED FACT):** lint 2,237 warnings เกินเพดาน 2,235; 0 errors. Full Verify หยุดที่ lint ทำให้ root suite ไม่ได้รันใน job นั้น แม้ TypeScript และ build ใน lane แยกผ่าน ต้องลด warnings และรัน required jobs ให้ครบก่อน release ถัดไป
2. **B0 หากนำ packet ไปตัดจริง — ยัง NO_CUT (VERIFIED FACT):** [src/core/config/shadowMode.ts](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/core/config/shadowMode.ts) เปิด true; [docs/governance/adr-064-signoff-checklist.th.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/docs/governance/adr-064-signoff-checklist.th.md) ยังมี placeholder/hash/signatures PENDING ทั้งสี่บทบาท; release ซอฟต์แวร์ไม่ใช่อนุมัติตัดจริง
3. **B1 — Org Health Score ยังมีค่าจำลอง (VERIFIED FACT):** PERFORMANCE คงที่ 75.0 ใน SQL และ source metadata placeholder_v18.5; ห้ามใช้เป็นผลวัดผลงานจริงโดยไม่มีคำอธิบาย
4. **B1 — สถานะเอกสารคลาดเคลื่อน (CONTRADICTED):** progress ยังเรียก v17.5.2 release candidate ทั้งที่ release เผยแพร่แล้ว; Field Purchase/Curved/Accounting มี source ใหม่กว่าช่องติ๊ก; claim “ทุก gate ผ่าน” ในรายงาน 6–7 ก.ย. ไม่ใช่สถานะ main วันนี้
5. **B2 — Billing report workflow failure (VERIFIED FACT / cause UNKNOWN):** run ล้มแต่ API ไม่คืน jobs ต้องตรวจ workflow validation/check annotations ต่อ ไม่เดาสาเหตุ

## สถานะงานทั้งหมดตาม workstream

สถานะ “มี implementation” หมายถึงมี source/wiring ที่ระบุ ไม่ได้ยืนยันว่า feature ทั้งหมดผ่าน production acceptance. ข้อสรุป missing integration เป็น UNKNOWN หรือ INFERENCE ตามขอบเขตที่ระบุ

| งาน | สถานะ | หลักฐานและสิ่งที่เหลือ |
|---|---|---|
| Designer / Cabinet / 3D | มี implementation | Parametric cabinet, panels, materials, 3D tools; การรับรองใช้งานโรงงานยังแยกต่างหาก [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/App.tsx) |
| Connector / Drawer / Hinge | มี implementation | มี drawer calculators, drill map, HingeCatalog และ UI; pending เก่าที่บอกยังไม่ทำขัดกับ source [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/core/manufacturing/drawer/generateDrawerPanels.ts) |
| Curved panels / Kerf / DXF | ทำแล้วบางส่วนและมี regression ใหม่ | มี curveProfile, kerfPatternGenerator, matingSlotGenerator และ smoke Stage 11–12; checklist 2/33 ล้าสมัย ไม่ใช่ 6% เสร็จ [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/core/manufacturing/curve/kerfPatternGenerator.ts) |
| CNC / Factory Packet / Verifier | มี implementation; ห้ามตัดจริง | S17-4 generator CI ผ่าน แต่ shadowMode=true และลายเซ็น ADR-064 ยัง PENDING [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/core/config/shadowMode.ts) |
| Workflow / Approvals / Copilot | มี implementation; checklist ปิด | 137 checked / 0 unchecked เป็นสถานะเอกสาร ไม่ใช่รับรองทุก production flow [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/monolith-workflow-copilot/tasks.md) |
| LINE OA Commerce | มี implementation; checklist ปิด | 81 checked / 0 unchecked พร้อม RPC, Edge Functions และ tests; ไม่ได้ยิง LINE จริงรอบนี้ [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/line-oa-commerce/tasks.md) |
| Capture / OCR / MCP | บางส่วน; integration ต้องยืนยัน | มี core และ Edge Functions; งาน PDPA/on-prem/บริการภายนอกยังต้องเทียบ checklist กับ live evidence [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/capture-spine/tasks.md) |
| Installation / Field PWA | มี implementation และ CI | Field App build/test และ pages workflow ผ่าน; checklist ยังมี 37 ข้อไม่ติ๊ก ต้องแยกงานที่ทำทีหลังกับงานภาคสนามจริง [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/packages/field-app/package.json) |
| Field Purchase | มี implementation; checklist เก่าขัดแย้ง | มี receiving/payment/budget/notification migrations และ Edge Function; รายงาน 7 ก.ย. อ้าง deploy แล้ว แม้ checklist 0/16 [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/supabase/functions/field-purchase-line/index.ts) |
| Accounting / Ledger / WHT / eTax | มีหลายส่วน; ไม่รับรองครบ ERP | มี ledger/multibook/tax, /accounting, /etax และ e2e; bank API/OCR/PDM/บัญชีจริงครบวงจรยังไม่มีหลักฐานใหม่ในรอบนี้ [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/monolith-accounting/tasks.md) |
| Tenancy / Roles / Plan / Billing | มี implementation; coverage ทั้งระบบยังไม่พิสูจน์ | 11 business routes ใช้ active tenant/member/role/plan boundary; quota ทุก mutation และ commercial pricing ต้องตรวจเพิ่ม [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/routes/businessModuleRegistry.ts) |
| People / Culture foundation | มี implementation และ release record | PeopleDirectory, skills/state, survey/feedback store และ UI/tests; ไม่อ้างว่าทุก roadmap feature ครบ [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/culture/cultureStore.ts) |
| Process Templates / Bottleneck | มี implementation และ release record | มี store, template list, heatmap, tests/stories; release v17.0.0 มีจริง [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/jobs/processTemplateStore.ts) |
| Training / Super Employee | มี implementation | มี store/UI/tests/stories และ route; roadmap plan tier เก่าต่างจาก runtime [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/training/trainingStore.ts) |
| AI Cost Estimation | มี cost tracking implementation | มี usage/cost/ROI/budget และ dashboard; ไม่ใช่หลักฐานว่า AI ประเมินงานก่อสร้างเองครบแล้ว [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/ai-cost/aiCostEstimationStore.ts) |
| AI Production Scheduler | workflow มี; AI engine ไม่ยืนยัน | store จัดการ machines/runs/items/constraints/approval; ยังไม่พบ model invocation ใน store ที่ตรวจ [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/ai-scheduler/aiSchedulerStore.ts) |
| Culture Metrics / eNPS | มี implementation; version track เดินต่อ | มี dashboard/store/tests/stories และ route; v17.5.3+ เป็น forward version records ไม่ใช่ release แยกที่ยืนยันแล้ว [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/culture-metrics/cultureMetricsStore.ts) |
| OrgChart / Role Network | มี implementation และ route | มี canvas/store/schema/tests; v18.x เป็น forward track ตาม progress [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/routes/BusinessModuleRoutes.tsx) |
| QC Anomaly Detection | มี implementation และ route | มี threshold/measurement/SQL detection/UI/tests; การ calibrate กับข้อมูลโรงงานจริงยังไม่ยืนยัน [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/supabase/migrations/20270210_qc_anomaly_detection.sql) |
| AI Quotation Draft | workflow มี; AI generation ไม่ยืนยัน | มี draft/line items/submit/approve/reject; store ที่ตรวจเป็น DB CRUD ไม่มี model invocation [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/ai-quotation/aiQuotationDraftStore.ts) |
| Leadership Actions | มี implementation และ route | มี board/store/tests/stories และ role boundary OWNER/ADMIN [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/leadership-actions/LeadershipActionBoard.tsx) |
| Org Health Score | ยังไม่ครบ | มี UI/store/SQL แต่ PERFORMANCE=75.0 placeholder; ไม่พบ route ใน canonical registry/index ที่ตรวจ [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/supabase/migrations/20270227_org_health_score.sql) |
| Digital Shadow / HOMAG | มี implementation และ CI | build/unit/integration lane ผ่าน (Redis + local OPC UA simulator); ไม่ใช่ machine commissioning [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/packages/digital-shadow-service/package.json) |
| Daph Second Brain | checklist ปิด | active checklist 61/0; archived 0/16 ต้องไม่นับเป็น backlog ใหม่; export ในเครื่องมี changes ค้าง [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/daph-obsidian-second-brain/tasks.md) |
| Design Hub / Marketplace / UGC | แผน; ยังไม่ยืนยัน implementation | checklist 0/56 และค้น tree พบ design/requirements/tasks; ไม่ใช่การพิสูจน์เชิงลบทุกสัญลักษณ์ [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/design-hub-platform-phase2/tasks.md) |
| Capacity AI / Benchmarks / Team Builder / SOP AI | แผน; ยังไม่พบหลักฐาน implementation | อยู่ใน roadmap 2S2P1C; ไม่พบ module/migration เฉพาะจาก inventory รอบนี้ [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/docs/MONOLITH_2S2P1C_FEATURE_SPEC_ROADMAP.md) |
| SpatialLM / Change Readiness / AI Comfort / Labels | ยังสรุปว่าเสร็จไม่ได้ | roadmap/pending มีรายการ แต่ยังไม่ยืนยัน production caller; spatialHash ไม่ใช่ SpatialLM [source](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/docs/MONOLITH_2S2P1C_FEATURE_SPEC_ROADMAP.md) |

## CI ณ revision ที่ตรวจ

| Workflow / job | GitHub conclusion |
|---|---|
| [Full Verify](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34459950518) | failure: root lint; root typecheck/test/build skipped; dependent E2E jobs skipped |
| [Lint](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34459950559) | warning budget failure; ESLint errors job and app/server TypeScript job success |
| [Standalone E2E Smoke](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34459950557) | success |
| [pgTAP](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34459950490) | success |
| [npm audit](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34459950487) | success |
| [billing-report.yml](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34459949364) | failure; no jobs returned; cause UNKNOWN |
| Full Verify: factory server, field app, digital shadow, tools, S17-4, LineOS, node controls, manifests, strict bypass scan, hermetic build, dependency audit | success at examined SHA |


อ่านสถานะผ่านจาก GitHub Actions ของ SHA เดียวกัน ไม่ได้ rerun CI หรืออ้างจำนวน tests เก่าของวันที่ 6–7 ก.ย. เป็นผลวันนี้ ตัวอย่างสำคัญ: standalone smoke success กับ dependent smoke skipped ใน Full Verify เกิดพร้อมกันได้ เพราะเป็นคนละ workflow

## งานที่ยังไม่จบ แยกจากงานที่เพียงยังไม่พิสูจน์

- **ค้างยืนยันชัด:** lint budget, Full Verify ครบทุก lane, billing-report failure, PERFORMANCE placeholder, การจัด route/acceptance ของ Org Health, update status ledger
- **workflow มี แต่ integration ไม่ยืนยัน:** AI scheduler/model execution, AI quotation generation, external bank/OCR/PDM, end-to-end accounting, production quota coverage และ live tenant-boundary acceptance
- **roadmap / ยังไม่พบ implementation ใน inventory:** Design Hub Phase 2, marketplace/UGC/learning/payment scope, Capacity Planning AI, Industry Benchmarks, Cross-functional Team Builder, SOP AI Assistant
- **UNKNOWN:** การปิดบ้าน dogfood ครบสาย, calibration/bench test เครื่องจริง, key/signoff ceremony ล่าสุด และ field acceptance. [dogfood record](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/docs/evidence/dogfood/house-01/started.json) บันทึก STARTED เมื่อ 18 ก.ค. และ `realCutAllowed=false`. Recursive-tree snapshot วันที่ 10 ก.ย. ของ SHA ที่ระบุแสดง `started.json` และ `started.sha256` ใต้ `docs/evidence/dogfood/house-01/`; การยอมรับครบสายยังไม่ยืนยันจาก snapshot นี้
- Change Readiness, AI Adoption Comfort, SpatialLM และ labels ไม่ควรถูกเรียกเสร็จจากชื่อโมดูลใกล้เคียง ต้องมี caller และ acceptance evidence เฉพาะ

## PR / issue ที่ค้าง

ผลค้น GitHub ณ เวลาตรวจ: open PR 5 รายการ ล้วน dependency upgrades; issue เปิดที่ query is:issue คืน 0 รายการ การไม่มี issue ไม่ได้แปลว่าไม่มี backlog

- [#72: chore(deps)(deps-dev): bump @vitest/ui from 3.2.7 to 5.0.0](https://github.com/indetailsgroup-hue/monolith-workspace/pull/72)
- [#71: chore(deps)(deps-dev): bump vitest from 2.1.9 to 5.0.0](https://github.com/indetailsgroup-hue/monolith-workspace/pull/71)
- [#69: chore(deps)(deps-dev): bump @vitest/coverage-v8 from 2.1.9 to 5.0.0](https://github.com/indetailsgroup-hue/monolith-workspace/pull/69)
- [#64: chore(deps/server)(deps): bump ioredis from 5.11.1 to 6.0.0 in /server](https://github.com/indetailsgroup-hue/monolith-workspace/pull/64)
- [#63: chore(deps/server)(deps): bump pdfkit from 0.17.2 to 0.20.2 in /server](https://github.com/indetailsgroup-hue/monolith-workspace/pull/63)

## งานในเครื่องที่ต้อง reconcile

Parent มีแผน tenancy/protected delivery ที่แก้ค้าง และงาน document renderer; nested มี order-adapter.ts กับ orderNormalization.property.test.ts ที่แก้ค้าง, generated dist และ Daph export changes จึงยังนับเป็น shipped ไม่ได้

พบ worktree/branch เฉพาะด้าน ProjectContext, protected delivery, LINE trust, repair, Section 16 และ Section 4. Parent preflight ของ ProjectContext อ้าง target codex/repair-operations-phase-a-adr และ DEPLOYED_LINEAGE_UNESTABLISHED; ห้ามเอาการปิดใน lane ไปปิด main โดยไม่เทียบ source/revision

## Appendix — checklist inventory

| Checklist | Checked | Unchecked |
|---|---:|---:|
| [.kiro/specs/capture-spine/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/capture-spine/tasks.md) | 30 | 6 |
| [.kiro/specs/curved-panel-system/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/curved-panel-system/tasks.md) | 2 | 31 |
| [.kiro/specs/daph-obsidian-second-brain/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/daph-obsidian-second-brain/tasks.md) | 61 | 0 |
| [.kiro/specs/design-hub-platform-phase2/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/design-hub-platform-phase2/tasks.md) | 0 | 56 |
| [.kiro/specs/entitlement-tier/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/entitlement-tier/tasks.md) | 8 | 11 |
| [.kiro/specs/field-purchase/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/field-purchase/tasks.md) | 0 | 16 |
| [.kiro/specs/installation-pm/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/installation-pm/tasks.md) | 112 | 37 |
| [.kiro/specs/line-oa-commerce/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/line-oa-commerce/tasks.md) | 81 | 0 |
| [.kiro/specs/monolith-accounting/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/monolith-accounting/tasks.md) | 32 | 49 |
| [.kiro/specs/monolith-mcp-layer/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/monolith-mcp-layer/tasks.md) | 43 | 6 |
| [.kiro/specs/monolith-workflow-copilot/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/monolith-workflow-copilot/tasks.md) | 137 | 0 |
| [.kiro/specs/_archived/obsidian-second-brain/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/.kiro/specs/_archived/obsidian-second-brain/tasks.md) | 0 | 16 |
| [specs/main/tasks.md](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/specs/main/tasks.md) | 0 | 0 |

นับ checkbox line ทั้ง parent และ child ไม่ใช่ unique deliverables และไม่คำนวณเป็น progress %. Archived Second Brain ถูกแทนด้วย active checklist. `specs/main/tasks.md` ใช้รูปแบบอื่น; ผล 0/0 วัดเฉพาะรูปแบบ checkbox ส่วนสถานะ requirement ต้องประเมินจากรูปแบบงานภายในไฟล์นั้น. รายการ checkbox ทุกบรรทัดอยู่ใน evidence JSON (local evidence snapshot; not published)

## ลำดับแนะนำและเกณฑ์รับงาน (PROPOSAL)

| ลำดับ | Owner ที่เสนอ | งาน | เกณฑ์รับ |
|---|---|---|---|
| 1 | Engineering / QA | ปิด lint และ billing workflow; rerun main | warnings ไม่เกิน 2,235; Full Verify ทุก required lane รันจริงและผ่าน |
| 2 | Product / Tech Lead | รวม status ledger | ทุก requirement ผูก commit, route, test/run และ release/deploy status; ลบ claim เก่าด้วย supersession |
| 3 | Data / Product | Org Health + AI integrations | PERFORMANCE มาจากข้อมูลจริงหรือแสดง unavailable; route/permissions/test ครบ; AI มี invocation และ acceptance |
| 4 | Platform / Finance / Field | Live tenant/accounting/LINE validation | หลักฐานข้าม tenant ถูกปฏิเสธ, transaction และ rollback ครบ; field acceptance ลงชื่อ |
| 5 | PO / TL / Security / Factory | Manufacturing real-cut gate | exact-byte signatures, complete dogfood, calibrated profile/bench proof และอนุมัติครบก่อนเปลี่ยน NFP |
| 6 | Product | Rebaseline remaining roadmap | scope/owner/acceptance ชัดก่อนเพิ่ม Design Hub และ advanced AI |

## ความเชื่อมั่นและข้อจำกัด

สูงสำหรับ revision, source presence, explicit placeholder/flag, release existence และ CI conclusions; ปานกลางสำหรับภาพรวม implementation; ยังไม่ยืนยัน live operation ทุกระบบ ไม่แก้ product, governance status, commit, push, merge หรือ deploy ในรอบตรวจนี้

หลักฐาน source ที่อ่านและ checklist/CI job metadata เก็บใน evidence JSON; tree/run snapshots อยู่ tmp/2026-09-10-github-tree.json และ tmp/2026-09-10-github-runs.json. GitHub อาจเดินหน้าหลัง snapshot นี้ ให้ยึด SHA ที่ระบุ
