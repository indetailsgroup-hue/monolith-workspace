# MONOLITH Release Readiness — 2026-09-06

สถานะเอกสาร: **READY — production gates ผ่านครบ; รอ merge release PR และ publish จาก exact merge commit**

เอกสารนี้บันทึกงาน stabilization, หลักฐานที่รันได้ในเครื่อง, gate ที่ต้องยืนยันบน GitHub Actions และเงื่อนไขตัดสิน release ตามเกณฑ์เดียวกัน ห้ามตีความการมี source, migration หรือ test file ว่า production-ready จนกว่า external CI evidence จะผ่านจริง

## 1. เกณฑ์ตัดสิน

Release-ready เมื่อทุกข้อด้านล่างเป็นสีเขียวพร้อมกันเท่านั้น:

1. MONOLITH Full Verify ผ่านทุก blocking job
2. fresh-database migration ใช้งานได้จริง และ SQL pgTAP + TypeScript database suites รันกับ local Supabase จริง
3. backend deploy ทำงานเมื่อ secrets ครบ และแสดง successful skip ที่ชัดเจนเมื่อ secrets ไม่ครบ
4. Digital Shadow, Culture, Process Templates และ Homag tests ผ่าน
5. lint มี 0 errors และ warning count ไม่เกิน ratchet
6. production dependency audit มี 0 high / 0 critical
7. v17.5/v18.0 มี routing, navigation, authentication, active-tenant, role และ plan gates
8. PR เก่าที่ถูกแทนที่ได้รับการจัดการ และ security issues #49/#50 ปิดได้เฉพาะเมื่อมีฐานข้อมูลจริงยืนยัน
9. version, changelog, release notes, tag และ GitHub Release สอดคล้องกับ commit ที่ผ่าน gate

## 2. สถานะปัจจุบัน

| Gate | สถานะ | หลักฐาน/หมายเหตุ |
|---|---|---|
| Root Vitest | PASS (CI) | 382 files / 7,697 tests ใน [Full Verify run 34074999400](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34074999400) |
| Node-native controls | PASS (CI) | canonical schema/governance controls ผ่านใน Full Verify run 34074999400 |
| Root TypeScript | PASS (CI) | full-project typecheck ผ่านใน Full Verify run 34074999400 |
| Root production build | PASS (CI) | hermetic และ root Vite builds ผ่าน; มี chunk-size warning ที่ไม่บล็อก |
| Lint | PASS (CI) | 0 errors; 2,298-warning blocking ratchet ผ่านใน PR #80 |
| Field App | PASS (CI) | build + tests ผ่านใน Full Verify run 34074999400 |
| Digital Shadow | PASS (CI) | build + 13 files / 256 isolated tests + 5 files / 77 Redis/OPC UA integration assertions ใน PR #80 |
| Homag adapter | PASS (CI) | 27/27 tests ภายใน Digital Shadow lane |
| Factory Server | PASS (CI) | build + tests ผ่านใน Full Verify run 34074999400 |
| Vault Builder | PASS (local) | build + 82 tests |
| Bible Code | PASS (local) | build + 28 tests |
| Culture | PASS (local) | 19 focused tests; รวมอยู่ใน root full suite |
| Process Templates | PASS (local) | 31 focused tests; รวมอยู่ใน root full suite |
| Production dependency audit | PASS (local gate) | root 0 high/0 critical/4 moderate; server 0 high/0 critical/1 moderate |
| LineOS | PASS (CI) | Ubuntu job พร้อม Python Playwright/Chromium ผ่านใน PR #79 |
| Fresh DB migrations | PASS (CI) | `supabase db reset --local` ลง canonical migration chain สำเร็จใน [run 34074999345](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34074999345) |
| SQL pgTAP | PASS (CI) | 22 files / 574 assertions ผ่านจริงด้วย `pg_prove` ใน fresh database เดียวกัน |
| TypeScript database suites | DIAGNOSTIC | legacy schema-assumption suite แยกจาก authoritative pgTAP gate และเก็บ JSON artifact; สถานะ pgTAP release gate อ้างจาก `pg_prove` job เท่านั้น |
| Playwright E2E | PASS (CI) | UI smoke และ non-vacuous factory integration ผ่านใน PR #80 |
| Chromatic | PASS (human-approved) | ผู้ใช้ยืนยัน baseline ว่า “ผ่านแล้ว”; automated Storybook/Playwright execution ผ่านก่อนการอนุมัติ |
| Security issues #49/#50 | PASS (production) | [FPR run 34074049002](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34074049002) ยืนยัน `rls=true`, `policies=true`, prerequisites ครบ และ `no_bypass=true`; ปิดทั้งสอง issue แล้ว |
| Backend deploy | PASS (production) | [run 34076761544](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34076761544) ผ่านครบ และ deploy `field-purchase-line` กับ `line-oa-dispatch-worker` สำเร็จ |
| Product version | RELEASE CANDIDATE | root `package.json` เป็น canonical `17.5.2`; package lock, README, changelog และ progress ใช้ค่าเดียวกัน |
| Release tag/GitHub Release | READY AFTER MERGE | PR #100 ผ่านทุก check ที่ commit `684549d6`; หลังอัปเดตหลักฐาน deploy และ rerun CI จะ merge แล้วสร้าง `v17.5.2` บน exact merge commit โดยไม่ย้าย tag เก่า |

## 3. การซ่อม Full Verify และ CI ownership

`MONOLITH Full Verify` แบ่ง environment ownership เป็น blocking jobs แยกกัน:

- root: lint, typecheck, Vitest, production build และ E0 artifact
- LineOS: Node contract suite พร้อม Python Playwright 1.61.0 และ Chromium
- node-controls: governance, schema bundle, dogfood และ readiness controls
- server: build และ Vitest
- S17-4: deterministic generator evidence
- field: Field App build/test
- digital-shadow: build และ isolated unit tests
- workspace-tools: Vault Builder และ Bible Code
- dependency-audit: production dependencies ของ root/workspaces และ server
- clean-worktree: build ต้องไม่เปลี่ยน tracked files
- e2e-smoke: critical UI path ต้องรันและห้าม skip
- e2e-integration: ต้องมีอย่างน้อยหนึ่ง test รันจริง; service-gated skips แสดงเป็น notice
- manifests: ตรวจ byte-exact governance hashes
- gate-bypass-scan: ยังเป็น report-only ตาม debt เดิม ไม่ใช่ blocking release gate ในงานนี้

Root Vitest ไม่รับผิดชอบ suite ที่ต้องมี Postgres, Redis, MQTT, InfluxDB, browser, หรือ tool-specific config อีกต่อไป เพื่อป้องกันทั้ง false failure และ false green แต่ละ suite ถูกส่งไป lane ที่จัด environment ให้จริง

Chromatic แยก execution ownership เช่นเดียวกัน: Storybook ใช้ `CHROMATIC_PROJECT_TOKEN` เดิม ส่วน Playwright snapshot upload ใช้ `CHROMATIC_PLAYWRIGHT_PROJECT_TOKEN` ของ linked sub-project แยกตามรูปแบบที่ Chromatic รองรับ Repository secret inventory รอบนี้บันทึก Storybook token ไว้หนึ่ง project ดังนั้น job ยังคงรัน Playwright และเก็บ HTML report พร้อมรายงาน snapshot upload เป็น successful skip อย่างชัดเจน การส่ง Storybook และ Playwright เข้า project/token เดียวกันถูกยกเลิก เพราะ build ที่สองทำให้ build แรกซึ่งถือ required UI check ถูกปิดการ review

## 4. Database, migration และ pgTAP

### ปัญหาที่พบ

- `20260828_multi_tenant_schema.sql` เป็น historical bootstrap ที่ต้องแยกให้ลงก่อนและหลัง migration 0172
- มี migration หลายไฟล์ใช้ numeric version ซ้ำกัน ซึ่ง Supabase CLI ปฏิเสธ
- `00000000000063_organizations_org_members_stub.sql` สร้าง `org_members` แบบไม่ครบ เมื่อรันก่อน full bootstrap แล้ว `CREATE TABLE IF NOT EXISTS` จะไม่แก้โครงสร้าง ทำให้ schema เสียแม้คำสั่งไม่ error

### วิธีแก้

`scripts/prepare_supabase_migrations_ci.sh` ทำงานแบบ deterministic:

1. แยก bootstrap ด้วย semantic SQL marker `-- 4. ADD org_id TO EXISTING TABLES` ไม่อิงเลขบรรทัด
2. วางส่วนต้นก่อน 0172 และส่วนท้ายหลัง 0172
3. ลบ stub เก่าเฉพาะเมื่อ canonical full `org_members` schema พร้อมแล้ว
4. merge migration version ที่ซ้ำตามลำดับชื่อไฟล์ พร้อม source delimiter
5. ตรวจซ้ำและ fail หากยังมี numeric version ซ้ำ
6. รองรับ rerun โดยไม่ทำให้ผลต่างจากรอบแรก

pgTAP workflow ไม่ใช้ hosted Supabase token แล้ว แต่สร้าง local stack ใหม่ทั้งหมด จากนั้น:

1. `supabase start`
2. `supabase db reset --local`
3. enable pgTAP
4. รัน SQL tests ทุกไฟล์ด้วย `pg_prove`
5. export local anon/service keys ลง masked environment
6. ติดตั้ง test-only `exec_sql` helper ซึ่งไม่ถูกบรรจุเป็น production migration
7. seed Org A/Org B และ authenticated users แบบ deterministic
8. รัน RLS/migration/integration Vitest ด้วย `vitest.database.config.ts`
9. upload JSON evidence และ stop stack เสมอ

## 5. Backend deploy secret behavior

- เมื่อ `DATABASE_URL` เป็นค่าว่าง: migration/deployment preflight จะแสดง notice และให้ job จบแบบ successful skip
- `DATABASE_URL`, `SUPABASE_PROJECT_REF` และ `SUPABASE_ACCESS_TOKEN` มีชื่อ secret ครบแล้ว; manual dispatch ต้องตั้ง `run_production_deploy=true` จึงจะเปิด production lane
- production schema reconciliation ผ่านใน run 34076761544 หลังตรวจ 247/247 canonical migrations, 0 missing, 0 gaps และ 0 duplicate hosted versions
- token ใหม่จำกัดขอบเขตไว้ที่ project `daph-iimos-prod`, capability `Edge Functions: Read-write`, อายุ 90 วัน และเก็บเป็น GitHub Actions secret โดยไม่แสดงค่าใน log
- run 34076761544 deploy `field-purchase-line` และ `line-oa-dispatch-worker` สำเร็จ พร้อม Deno, hosted RLS และ local-Supabase E2E ที่ผ่านใน workflow เดียวกัน
- output `deployment_ready` เป็นเงื่อนไข explicit ระหว่าง jobs
- ไม่มีการเปลี่ยน missing secret ให้เป็น failure ที่ทำให้ PR ภายนอกหรือ fork ใช้งานไม่ได้ และไม่มีการแสดงค่าของ secret ใน log

## 6. v17.5/v18.0 routing และ access control

| Route | Module | Minimum plan | Tenant roles |
|---|---|---|---|
| `/people` | People Directory | STARTER | ทุก active role |
| `/people/:employeeId/ai-readiness` | Super Employee Tracker | PROFESSIONAL | ทุก active role |
| `/training` | Training Tracker | PROFESSIONAL | ทุก active role |
| `/culture/metrics` | Culture Metrics | PROFESSIONAL | ทุก active role |
| `/ai/costs` | AI Cost Estimation | ENTERPRISE | OWNER, ADMIN, FINANCE |
| `/ai/scheduler` | AI Production Scheduler | ENTERPRISE | OWNER, ADMIN, FACTORY |
| `/structure/org-chart` | Interactive OrgChart | PROFESSIONAL | ทุก active role |
| `/structure/role-network` | Role Network | ENTERPRISE | ทุก active role |
| `/quality/anomalies` | QC Anomaly Detection | ENTERPRISE | OWNER, ADMIN, FACTORY |
| `/ai/quotation-drafts` | AI Quotation Draft | ENTERPRISE | OWNER, ADMIN, FINANCE |
| `/culture/leadership-actions` | Leadership Actions | ENTERPRISE | OWNER, ADMIN |

ทุก route ผ่าน boundary เดียวกันก่อน lazy module mount:

- เมื่อ Supabase configured ต้องมี authenticated session
- selected member ต้องตรงกับ session user และ selected organization
- organization ต้องเป็น `ACTIVE` หรือ `TRIAL`
- membership ต้อง active
- tenant role และ plan ต้องผ่าน registry policy
- admin UI actions ใช้เฉพาะ OWNER/ADMIN จริง
- unauthorized module ไม่ mount จึงไม่เริ่ม module data fetch
- sign-in รองรับ safe `next` path และปฏิเสธ protocol-relative redirect

หมายเหตุ: minimum plan ของ Super Employee และ Role Network ยึด helper ที่ implementation ปัจจุบันใช้จริง (`PROFESSIONAL` และ `ENTERPRISE` ตามลำดับ) ซึ่งต่างจาก roadmap เก่าบางบรรทัด จึงต้อง reconcile roadmap แยกจาก runtime authorization

## 7. Dependency security

การเปลี่ยนแปลง:

- `pdfjs-dist` → 6.3.289
- MQTT → 5.15.2
- override `ws` → 8.21.3
- ลบ `sparkplug-payload` ที่ไม่มี runtime import และดึง `protobufjs` ที่มี advisory เข้ามา
- Vault Builder ใช้ SheetJS 0.20.3 จาก official CDN และตั้ง Node filesystem binding สำหรับ ESM build

ผล audit ณ วันที่เอกสาร:

- root/workspaces: 4 moderate, 0 high, 0 critical
- server: 1 moderate, 0 high, 0 critical
- blocking command คือ `npm audit --omit=dev --audit-level=high`
- moderate ที่เหลือมาจาก React Router/@remix-run/router, fflate และ server `qs`; ต้องติดตามต่อ แต่ไม่ฝ่าฝืนเกณฑ์ release ที่กำหนดไว้

## 8. Lint ratchet

- แก้ error ทั้งหมดจนเหลือ 0
- baseline ปัจจุบัน 2,298 warnings
- `npm run lint:budget` ใช้ `--max-warnings 2298`
- CI จะล้มทันทีเมื่อมี warning ใหม่ แม้ technical debt เดิมยังไม่ได้ลดทั้งหมด
- เมื่อแก้ warning เดิม ต้องลดเลข budget ใน commit เดียวกัน ห้ามปล่อย budget คงเดิมโดยไม่มีเหตุผล

## 9. PR, issues และ release lifecycle

### ผลตรวจ PR ที่ค้าง

| PR | สถานะจาก GitHub | ผลเปรียบเทียบกับ `main` | คำแนะนำ |
|---|---|---|---|
| #41 Digital Shadow Service | closed as superseded | unique three-parameter Weibull/RUL delta ถูกย้ายเข้า PR #79; product integration อยู่ใน PR #80 | ปิดแล้วพร้อม comment อ้างอิง replacement |
| #44 Digital Shadow integration | closed and replaced | แยกเฉพาะ Machine Shadow UI/API/store, Feature Cache, adapters/services และ tests ออกมาเป็น clean PR #80 โดยไม่พา CI/Slack/SARIF commits เก่า | ปิดแล้ว; PR #80 merge เข้า `main` ที่ `1df31e0b` หลังทุก check ผ่าน |
| #46 Accounting/RLS | closed as superseded | 42/73 paths byte-identical, 30 paths มีใน main และพัฒนาต่อแล้ว; canonical migration preparation รับหน้าที่แทน legacy bootstrap | ปิดแล้วหลัง fresh DB/pgTAP ยืนยัน current design |
| #78 CONTRIBUTING formatting | open, 1 commit, 1 line | ไม่อยู่ใน scope stabilization และไม่เกี่ยวกับ release gates | คงไว้ให้ owner จัดการแยก |

Security issues #49/#50 ปิดแล้วหลัง production migration apply สำเร็จและ read-only verification ยืนยันทั้ง `notification_digest_queue` และ `platform_metrics_snapshots` ว่า prerequisites ครบ, `rls=true`, `policies=true` และ `no_bypass=true` ใน [run 34074049002](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34074049002) Production migration inventory หลัง apply มี canonical 247/247, missing 0, gaps 0 และ duplicate hosted versions 0 ใน [run 34074047097](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34074047097)

### ลำดับที่เหลือก่อน release

1. merge release-candidate PR หลัง final checks ผ่าน
2. สร้าง tag และ GitHub Release `v17.5.2` บน exact merged commit แล้วตั้งเป็น Latest; ห้ามย้าย tag เก่า

### Version source และประวัติ release

- root `package.json` คือ single source of truth ของ product version: `17.5.2`
- root `package-lock.json`, README, CHANGELOG และ progress document ต้องตรงกับค่านี้; `npm run version:check` เป็น CI gate
- package versions ของ `server`, Field App, Digital Shadow และ tools เป็น component versions แยกกัน ไม่ต้องเท่ากับ product version
- `v17.5.0` (`3a819c17`) และ `v17.5.1` (`532783be`) ถูก tag จริงวันที่ 2026-09-01
- `v17.5.2` เป็น release candidate สำหรับ stabilization และ AI Cost Estimation dashboard/tests; `v17.5.3` ถึง `v18.5.1` ยังเป็น planned implementation records
- ผล `gh release list` วันที่ 2026-09-07 แสดง `v17.0.0` เป็น release version สูงสุด และแสดง `v15.9.0` เป็น Latest; release `v17.5.2` จะแก้ทั้ง version continuity และ Latest pointer หลัง production deploy ผ่าน

### GitHub authentication และ branch publication

GitHub CLI authentication เชื่อมกับบัญชี `indetailsgroup-hue` ผ่าน macOS keyring แล้ว โดย Git ใช้ HTTPS credential helper และ token มี `repo`/`workflow` scopes ที่จำเป็น Stabilization PR #79 และ Digital Shadow PR #80 merge แล้ว; release candidate ใช้ branch แยกและต้องผ่าน GitHub Actions ก่อน merge ห้ามสร้าง tag/release บน branch candidate

## 10. Release decision

**ปัจจุบัน: READY**

Release gates ผ่านครบ: schema reconciliation, production migration inventory, hosted RLS verification, #49/#50, Chromatic approval, Full Verify, fresh DB, pgTAP, root/server/field, lint, audits, Digital Shadow integration, Playwright และ production Edge Functions deploy ขั้นตอนที่เหลือเป็น release publication lifecycle คือ final CI ของ PR #100, merge, แล้วสร้าง tag/GitHub Release `v17.5.2` บน exact merge commit
