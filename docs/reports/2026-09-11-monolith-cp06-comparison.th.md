# เปรียบเทียบ MONOLITH, CP06 และ FieldFlow

หมายเหตุการเผยแพร่: เอกสารอ้างหลักฐานตามวันที่เดิม ไม่ใช่การตรวจ runtime หรือ CI ใหม่ ไฟล์หลักฐานเฉพาะในเครื่องไม่ได้รวมในการเผยแพร่นี้ SC-01–SC-18 เป็นรหัสสายงาน roadmap แยกจากรหัสมติ Steering Committee

วันที่ตรวจ: 11 กันยายน 2026 · TH · Advisory review

## ข้อสรุป
เป็นคนละ codebase และคนละขอบเขตงาน ไม่ใช่สามเวอร์ชันของแอปเดียวกัน:
- **monolith-workspace:** งานออกแบบตู้/โรงงาน/CNC พร้อมโมดูลองค์กรและธุรกิจ
- **cp06-clean-cowork:** Thai Curry Cloud Kitchen — วัตถุดิบ/สูตร/ต้นทุน/ปฏิบัติการครัว/AI control plane
- **FieldFlow artifact:** Expo mobile สำหรับงานติดตั้ง/หน้างาน เป็น source แยกที่ยังประกอบไม่ครบ

ค้น tree main ของทั้งสอง repository ไม่พบชื่อ fieldflow-mobile หรือ sprint1–3-dod ของ artifact. นี่ไม่ใช่การรับรองว่าไม่มี code ที่ถูกย้ายชื่อหรือคัดลอกบางส่วน; ยังไม่ได้เทียบ content ทุกไฟล์แบบ semantic หรือค้นทุก branch

## Revision และขอบเขต
| Repository | main ที่ตรวจ | Inventory |
|---|---|---|
| monolith-workspace | 52e0eeb12527d4bb3866ee726b4f30d4d74dca57 | 4,137 blob files; tree ไม่ truncated |
| cp06-clean-cowork | b659916b00fb7fe0ae3a0b38ab4594c919baf62b | 1,622 blob files; 144 SQL migration source files; tree ไม่ truncated |

CP06 main เป็น merge PR #2: API-role grants/CI/Actions checklist. MONOLITH main ยังตรงกับ snapshot รายงาน 10 ก.ย. ตรวจ Git status parent และ nested ในเครื่องแยกแล้ว ทั้งสองยังมี changes เดิม; ไม่ใช้ local HEAD เก่าแทน GitHub main. อ่าน CONTEXT/scope correction แล้วในงานต่อเนื่องนี้

## MONOLITH: ทำแล้ว / ค้าง
**มี implementation:** Designer/cabinet/3D, drawer/hinge/connector, curved panel/kerf/DXF, workflow/LINE, packet/CNC/verifier, field app, digital shadow, accounting/eTax และ People/Training/OrgChart/QC/Leadership modules. [Routes](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/routes/index.tsx)

**ค้างยืนยันชัด:**
- [Full Verify](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34459950518) และ [Lint](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34459950559) ยัง failure; log ที่ตรวจรอบก่อนบน SHA เดียวกันระบุ 2,237 warnings เกินเพดาน 2,235
- root tests ใน Full Verify ถูกข้าม; standalone E2E Smoke และ pgTAP มี success เป็นคนละ workflow
- billing-report failure ยังไม่วินิจฉัยสาเหตุ
- [shadowMode](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/core/config/shadowMode.ts) ยัง true จึงไม่อนุญาตให้ Designer packet ใช้ตัดจริง
- Org Health PERFORMANCE placeholder และ live AI/integration acceptance ยังตามรายงานเดิม
- open PR 5 รายการ: #72/#71/#69/#64/#63 เป็น dependency upgrades

รายงานละเอียดก่อนหน้า: [TH](2026-09-10-monolith-work-status.th.html) / [EN](2026-09-10-monolith-work-status.en.html)

## CP06: สิ่งที่ทำแล้ว
| งาน | หลักฐาน | ขอบเขตที่รับรองได้ |
|---|---|---|
| Dashboard / ingredient / menu / recipe / purchasing / stock / sales / expense / reports | README, AppContent, data-table wiring | มี UI/data workflow; README ระบุ local-first state/seed เป็นฐาน |
| Master Sauce / AI SOP / Lab Analysis | renderSpecialTabContent เรียก lazy tabs | มี runtime entry; release-backed source ต้องมี Supabase config และ active projection |
| AI Control Plane | agentControlPlaneBackend เรียก start/queue/complete/review/promote RPC | มี adapter จริง; ไม่เท่ากับ AI ทุก agent ทำงานอัตโนมัติหรือผ่าน production แล้ว |
| Supplier Compliance / Digital Labels / Environmental Checks / CAPA | tabs, backend/test files, Phase-2B migrations | มี implementation ของ read/write lanes; ไม่ใช่ lifecycle เต็มทุก feature |
| Enterprise Structure / Security Federation | imports/หน้าจอใน App.tsx และ feature folders | มี implementation source; acceptance เต็มต้องยืนยันเพิ่ม |
| Costing / Channel Profitability / Forecasting / Predictive Ordering | feature directories พร้อม tests/components/hooks | source presence; ไม่ให้ production-ready จากชื่อ folder |
| Pilot tooling | auth/runtime/control-plane summaries + rollout packet + approval ledger | มี historical evidence และ signoff records จริงใน repo |

หลักฐาน: [App tab wiring](https://github.com/indetailsgroup-hue/cp06-clean-cowork/blob/b659916b00fb7fe0ae3a0b38ab4594c919baf62b/src/components/layout/app-content/renderSpecialTabContent.tsx), [Control-plane backend](https://github.com/indetailsgroup-hue/cp06-clean-cowork/blob/b659916b00fb7fe0ae3a0b38ab4594c919baf62b/src/data/agentControlPlaneBackend.ts), [Phase-2B coverage](https://github.com/indetailsgroup-hue/cp06-clean-cowork/blob/b659916b00fb7fe0ae3a0b38ab4594c919baf62b/docs/FRANCHISE_EXECUTION_PHASE2B_COVERAGE_TH.md), [README](https://github.com/indetailsgroup-hue/cp06-clean-cowork/blob/b659916b00fb7fe0ae3a0b38ab4594c919baf62b/README.md)

## CP06: อะไรยังไม่ทำ / จงใจเลื่อน
อ้างตาม coverage/cut-list ที่อยู่บน SHA นี้; ยังไม่ได้ตรวจทุก deferred feature แบบ end-to-end:
- Vendor master create/edit, branch-wide vendor browsing และ auto-link source lot กับ approved vendor
- CAPA owner roster automation, SLA timer/escalation engine และ analytics/aging เต็มรูปแบบ
- Training-module authoring/write path
- Consumer/branch-facing digital-label presentation เต็มรูปแบบ
- Origin-claim write path และ multi-market label policy
- AIQC/computer-vision verification events, waste events และ model auto-blocking อยู่นอก pilot หรือ backlog
- Sensory relational/calibration scope เต็มถูก defer โดยมี manual bridge

[Backlog และ pilot scope](https://github.com/indetailsgroup-hue/cp06-clean-cowork/blob/b659916b00fb7fe0ae3a0b38ab4594c919baf62b/docs/FRANCHISE_EXECUTION_PHASE2B_BACKLOG_CUT_LIST_TH.md). Deferred ไม่เท่ากับ bug และต้องไม่เปิดกลับเข้าขอบเขตโดยไม่มี decision

## CP06: หลักฐานผ่านมี แต่เก่า
[pilot-rollout-packet.json](https://github.com/indetailsgroup-hue/cp06-clean-cowork/blob/b659916b00fb7fe0ae3a0b38ab4594c919baf62b/artifacts/pilot-rollout-packet.json) generated 14 เมษายน 2026 ระบุ readyForReview=true, readyForGoNoGo=true และ required approvals 4/4. Control-plane/runtime smoke ใน repo ระบุ passed วันที่เดียวกัน

จึงสรุปได้ว่า **มีบันทึก pilot evidence/signoffs แล้ว** ไม่ใช่ “ไม่เคยทำ pilot”. แต่ยังไม่ยืนยันว่า evidence ครอบ main b659916b และ live environment วันที่ 11 ก.ย. จำนวน test ใน unblock checklist เป็น reported historical local results ไม่ได้รันซ้ำในรอบนี้

## CP06: CI ล่าสุดไม่รองรับคำว่า green ทั้งระบบ
API คืน 78/78 runs ที่ผูกกับ HEAD นี้:
- พบ successful Dependabot และ Stale/Triage runs
- ไม่พบ Enterprise Modules CI / Control Plane / Pilot test-run success ในชุด runs นี้
- push run [27497840288](https://github.com/indetailsgroup-hue/cp06-clean-cowork/actions/runs/27497840288) วันที่ 14 มิ.ย. เป็น startup_failure
- เอกสาร [Actions unblock](https://github.com/indetailsgroup-hue/cp06-clean-cowork/blob/b659916b00fb7fe0ae3a0b38ab4594c919baf62b/docs/CI_GITHUB_ACTIONS_UNBLOCK_CHECKLIST.md) ที่บอกทุก workflow startup_failure และ repo private ล้าสมัย: ตอนตรวจ repo public และบาง workflow success แล้ว
- workflow enterprise มี blocking lint/unit และ DB channel-profitability; all-module DB canary เป็น continue-on-error จึงต้องอ่านผลแยก
- open PR 3 รายการ: #11 dev deps, #10 production deps, #5 GitHub Actions

ไม่ได้สรุปว่า Actions ปัจจุบันติด billing หรือ YAML เพราะยังไม่มีหลักฐานระบุสาเหตุปัจจุบัน

## งานต่อที่มีคุณค่าที่สุด
1. MONOLITH: ลด lint debt ที่เกิน ceiling แล้วรัน required CI ให้ครบ; real-cut ยังคงต้องผ่าน authority/field gates
2. CP06: รัน Enterprise Modules CI บน HEAD ที่ระบุใน environment ที่จัดครบ แล้วเก็บ authoritative test/DB results ใหม่
3. CP06: regenerate pilot evidence ที่ผูก revision/environment ปัจจุบัน; ให้เจ้าของตรวจ signoff applicability ไม่คัดลอกสถานะเก่ามาเป็น approval ใหม่
4. FieldFlow: แก้ package/photo/auth/storage gaps ใน lane แยก ก่อนตัดสินใจรวมกับ MONOLITH; ไม่มีหลักฐานว่า CP06 เป็น backend สำหรับ FieldFlow

## Verification / STOP
audit-by-inspection; GitHub API snapshot verified; NOT independently re-verified at runtime. Governance memory anchor ไม่พบในพื้นที่ค้น .claude: may-be-stale เฉพาะ static governance context; รายงานนี้ไม่ใช้ snapshot governance เก่ามาปิด lane ปัจจุบัน
STOP: ตรวจและรายงานเท่านั้น ไม่เปลี่ยน source, approvals, canonical status, migrations, visibility, CI settings หรือ deployment

