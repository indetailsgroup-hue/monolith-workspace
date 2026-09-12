# การแก้ tenant และภาพหน้าจอ — เอกสารส่งต่องานเทคนิค

**ฉบับ:** ภาษาไทย

**วันที่:** 12 กันยายน 2026

**สถานะ:** ฉบับร่างสำหรับตรวจทาน; ยังรอ CI ของ candidate และการรับภาพใหม่

**ฐาน source:** product commit `a99b474b790d1b94932302ed818834272f16e529`

**Candidate code commit:** `3da55463ccb1bacb179068084218afae9c78a6c4` (commit local; ยังรอ hosted CI)

**ฉบับคู่กัน:** [English edition](2026-09-12-tenant-and-visual-repair.en.md)

แพตช์นี้แก้การข้าม policy INSERT ของ jobs, organization claim ที่ RPC เดิมต้องใช้, assertion การอนุมัติ invoice ซ้ำที่ไม่ตรงสัญญา และข้อบกพร่องด้านภาพที่พบระหว่างตรวจ Build 93 หลักฐานครอบคลุมการอ่าน source ผลทดสอบที่ระบุ และการตรวจ browser ที่มีชื่อกำกับ เอกสารนี้ไม่ได้ให้สิทธิ์ deploy production หรือรับรองการใช้งานจริง และไม่ได้ผนวกแพ็กเกจ SciSpace v2

## 1. ขอบเขต repository และหลักฐาน

ตรวจ governance parent และ product เดิมใน nested repository แยกกันก่อนเขียนเอกสารนี้ และรักษาการเปลี่ยนแปลงเดิมไว้

| Repository | HEAD ที่ตรวจพบ | ขอบเขต |
|---|---|---|
| Parent governance/bootstrap: `C:/Users/thai3/determined-williams (2)` | `aa1b30e509ece9d8efad3d68e949860aa79bdecf` | บันทึก governance และหลักฐาน local; ตอนตรวจมี tracked changes 11 / untracked แบบจัดกลุ่ม 607 รายการ |
| Product เดิมใน nested: `determined-williams/` | `9c4bee6759f6d1919a320a2f56088ce683287f58` | Working tree ของ product เดิม; tracked changes 22 / untracked แบบจัดกลุ่ม 61 รายการ รักษาไว้ |
| Checkout สำหรับ implementation: `C:/Users/thai3/.codex/worktrees/monolith-scispace-r0-20260912` | `a99b474b790d1b94932302ed818834272f16e529` | Source product และ candidate tests บน `codex/scispace-r0-quality-gates`; ทีมกำลังแก้ร่วมกัน |

เอกสารอำนาจกำกับที่อยู่เฉพาะ parent คือ `CONTEXT.md` และ `docs/reports/2026-07-21-ima-schelling-monolith-repository-scope-correction.en.md` ระบุเป็น path ของ parent ไม่สร้าง relative link ที่ใช้ไม่ได้เมื่อเผยแพร่ product checkout ข้อสรุป implementation ด้านล่างอ้าง checkout สำหรับ implementation

## 2. ผลฐานเดิมจริงและการตรวจ candidate

ผลชุด legacy จริงที่ `a99b474` คือ **ผ่าน 47 และไม่ผ่าน 4 จาก 51 กรณี โดยไม่ข้ามกรณีใด** ส่วน SQL lane บันทึก **ผ่าน 673 assertions ใน 35 ไฟล์** ข้อผิดพลาดทั้งสี่คือ VIEWER INSERT jobs, RPC สองกรณีที่ต้องใช้ organization claim ระดับบน และ assertion อนุมัติ invoice ซ้ำ ก่อนหน้านี้ชื่อ database fixture ที่ล้าสมัยขวางทั้ง 51 กรณีก่อนถึง authorization assertions การแก้ compatibility จึงเปิดให้เห็นข้อผิดพลาดจริงสี่กรณีนี้ ดังนั้นผล SQL ไม่ได้ยืนยันว่าชุดสัญญา TypeScript legacy ผ่านแล้ว หลักฐานจากผู้ประสานงาน: [baseline run 34668739760, job 103485889281](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34668739760/job/103485889281)

<!-- adversary: ผู้ประสานงานส่งผล job ของ a99b474 ตามลิงก์ โดย legacy ได้ 47/51 และ SQL ได้ 673 เอกสารนี้คงข้อผิดพลาดทั้งสี่ ไม่เปลี่ยนผลฐานเดิมเป็น tenant lane ที่ผ่านครบ และยังไม่มีผล candidate CI ส่งมา -->

| การตรวจ candidate | หลักฐานที่มีสำหรับฉบับร่าง | ข้อจำกัด |
|---|---|---|
| Restrictive guard ของ jobs | Source มี 7 assertions; log PostgreSQL 18 แบบ native บันทึก PASS 7 รายการ | เป็น minimal fixture ที่แยกจาก source ไม่ใช่ migration chain เดิมทั้งหมด |
| Auth hook ร่วม | Source มี 15 assertions; log PostgreSQL 18 แบบ native บันทึก PASS 15 รายการ รวมสิทธิ์เรียก function และพฤติกรรม claim | ใช้ native fixture ขอบเขตจำกัดเดียวกัน; hosted Auth activation และ Supabase startup เต็มยังเป็นคนละการตรวจ |
| Legacy SDK suite | Candidate file มีรวม 55 กรณี เพิ่มเส้นทาง password login/refresh จริงและกรณีบวกของ FINANCE | ยังรอรันชุด 55 กรณีที่แก้แล้วผ่าน CI |
| Culture chart regression | ผู้ลงมือแก้รายงาน focused tests ผ่าน 20 กรณี รวม regression ที่ใช้ selector และแกนกราฟจริง | เป็นผล local แบบจำกัดขอบเขต; ยังรอภาพใหม่และ CI สุดท้ายของ candidate |
| รูปแบบ control ของ QC | Scoped ESLint และ `git diff --check` เฉพาะไฟล์จบด้วย exit 0 สำหรับการแก้ 9 บรรทัด | เป็น style change ที่ย้อนกลับได้; Build 93 ยังเป็นภาพเดิม |

<!-- adversary: อ่าน native logs ทั้งสองและนับ PASS ได้ 7 บวก 15 โดยไม่อ้างว่าทดสอบ full chain; ผล Culture 20 tests ระบุที่มาจากผู้ลงมือแก้ ส่วน scoped lint และ diff checks ของ QC รันจริงระหว่างการตรวจนี้ -->

ไฟล์หลักฐาน native อยู่เฉพาะ parent: `tmp/legacy-db-20260912/jobs-native-final.log` และ `tmp/legacy-db-20260912/hook-native-final.log` ตัวช่วย `tmp/legacy-db-20260912/native_assertions.sql` และ local fixture ที่เตรียมไว้เป็นหลักฐานเสริม ไม่ทดแทนการใช้ migration ทุกไฟล์

ต่อมาผู้ประสานงานบันทึกผล local root Vitest **360 ไฟล์ / 7,326 tests ผ่านทั้งหมดโดยไม่มีการข้าม** และ full TypeScript build check จบ exit 0 หลักฐานอยู่เฉพาะ parent ที่ `tmp/final-aggregate-20260912/root-vitest.json`, `root-vitest.log`, `typecheck.log` และ `status.json` ผลรวมนี้เกิดก่อนการแก้ป้ายภาษี quotation ที่พบภายหลังตามด้านล่าง จึงไม่ใช่ผลตรวจ candidate หลังแก้จุดนั้น และไม่ใช่ผล hosted CI ที่สำเร็จ

<!-- adversary: ผู้ประสานงานส่งผล 360 ไฟล์/7326 tests และ TypeScript exit 0 โดยระบุว่า local aggregate ตามชื่อไฟล์เกิดก่อนแก้ tax จุดหลังสุด ส่วน Supabase SDK lane 55 กรณีที่แก้ยังต้องมีผล CI ของตัวเอง -->

## 3. กลไกการแก้ tenant และสัญญาที่รักษาไว้

**Jobs INSERT** Policy INSERT และ FOR ALL แบบ permissive เดิมที่ตรวจเฉพาะ organization รวมกับ permissive policy อื่นด้วย OR จึงยอมให้ VIEWER ที่ organization ตรงผ่านได้ แม้ role predicate มาตรฐานใน `0178` จะปฏิเสธ Policy ใหม่เป็น restrictive เฉพาะ INSERT ของ jobs โดยบังคับ organization และ role predicate เดิมอย่างอิสระ ได้แก่ factory, admin, designer หรือ governance role โดย FINANCE ยังใช้สิทธิ์ governance เดิม การแก้ครั้งนี้ไม่ครอบคลุม semantics ของ UPDATE และ DELETE Source: `supabase/migrations/20270324_jobs_insert_role_guard.sql:6`; regression: `supabase/tests/20270324_jobs_insert_role_guard.sql:4`

**Organization claim ที่ออกโดย Auth** Guard ของ RPC ใน `0180` ต้องใช้ `org_id` ระดับบน แต่ signed local fixture เดิมมีเพียง `app_metadata.org_id` Candidate เพิ่ม `public.custom_access_token_hook` ที่ใช้ร่วมกัน และเปิดใช้ function เดียวกันใน local `supabase/config.toml:40` โดยตรวจว่า user ใน Auth event ตรงกับ token subject และ organization ที่เลือกจาก metadata ซึ่งฝั่ง server จัดการมีอยู่จริงพร้อม active membership หากการเลือกไม่ถูกต้องหรือหมดสิทธิ์ ให้ลบ `org_id` ระดับบน แต่รักษา claims อื่นไว้ ไม่ใช้ metadata ที่ผู้ใช้แก้เองเป็นอำนาจ tenant และไม่เลือก organization สำรองให้เอง รวมทั้งไม่เปลี่ยน role Source: `supabase/migrations/20270325_auth_org_claim_hook.sql:6`

Function ใช้ SECURITY DEFINER พร้อม search path ว่างและอ้าง relation แบบระบุ schema ชัดเจน ให้ `supabase_auth_admin` เรียกเท่านั้น และถอนสิทธิ์ EXECUTE จาก PUBLIC, anon, authenticated และ service_role SQL 15 กรณีครอบคลุมสิทธิ์, subject, การเลือก active/foreign/inactive/malformed, การลบ claim เก่า, การรักษา claim อื่น และ refresh ส่วน SDK cases ใช้ password login และ refresh ผ่าน Supabase Auth จริง อ่าน signed claims ที่ได้รับ แล้วเรียก RPC ด้วย token นั้น ไม่สร้าง signed session เอง Source: `supabase/tests/20270325_auth_org_claim_hook.sql:4`, `src/__tests__/rls/0173_rls_multitenancy.test.ts:234`

เอกสาร Supabase ระบุว่า hook นี้ทำงานก่อนออก access token รวม authentication method `token_refresh` และต้องรักษา standard claims ของ token ให้ถูกต้อง ดู [เอกสาร Custom Access Token Hook ทางการ](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)

**การอนุมัติ invoice ซ้ำ** Function เดิมจงใจยก `P0004` เมื่อ invoice อนุมัติแล้ว Client จึงได้ PostgREST error และ data เป็น null แทน payload `data.success=false` Assertion ที่แก้ตรวจ error ดังกล่าว พร้อมตรวจว่าฟิลด์อนุมัติและจำนวน journal ไม่เปลี่ยน Source ของสัญญา: `supabase/migrations/0176_auto_journal_on_approval.sql:470`; assertion candidate: `src/__tests__/rls/0173_rls_multitenancy.test.ts:1000` เป็นการแก้ test ให้ตรงสัญญา ไม่ได้แก้ invoice function

## 4. เงื่อนไขเปิด Auth และข้อจำกัด tenant ที่ยังอยู่

Hosted Supabase ต้องใช้ migration และเปิด function เดียวกันเป็น Custom Access Token hook แยกต่างหาก Local configuration ไม่ยืนยันว่า hosted เปิดแล้ว ก่อนใช้งานจริงต้องตรวจ hosted login ใหม่และ refresh ด้วย membership ที่มีสิทธิ์ รวมทั้งตรวจว่าการเลือก foreign organization หรือ membership ที่ inactive ทำให้ tenant claim ถูกลบ และ RPC เดิมปฏิเสธ token ที่ได้รับ ต้องรักษา role policy เดิมไว้ เพราะ hook นี้ไม่ใช่กลไกแจก role ใหม่

ความต่างของตัวเลือก organization สำหรับผู้มีหลาย membership ที่มีอยู่เดิมยังคงอยู่: `get_user_org_id()` เลือก active membership ที่เก่าที่สุดตาม `joined_at` ขณะที่ identity guard ตรวจ organization ที่เลือกใน JWT ได้ และ `rpc_job_board` ยังเลือก organization สำหรับ query ผ่าน `get_user_org_id()` ดังนั้นผู้ที่มี active membership หลาย organization ต้องมีงานติดตามเพื่อทำให้การเลือกและขอบเขต query ตรงกัน แพตช์นี้ไม่ได้ยืนยันว่าทั้งสองตรงกัน Source: `supabase/migrations/20261001_people_culture_schema.sql:24` และ `supabase/migrations/0180_identity_reconciliation_hardening.sql:296`

## 5. ข้อบกพร่องด้านภาพและการแก้ fixture

| ส่วน | สาเหตุที่พบและการแก้ candidate | หลักฐานตรวจและสิ่งที่ยังรอ |
|---|---|---|
| CultureDashboard | Selector ส่ง `period` แต่ XAxis อ่าน `periodLabel`; เปลี่ยนให้ใช้ field จริงของ selector และกำหนดพื้นหลังขาว/light control scheme ให้ native selects สองตัว | Regression ใช้ Zustand selector และ Recharts axes จริง mock เฉพาะขนาด responsive container; รายงาน focused tests 20 กรณี Source: `src/culture/cultureStore.ts:676`, `src/culture/CultureDashboard.tsx:385`, `src/culture/__tests__/CultureDashboard.chart.test.tsx` ยังรอภาพใหม่ |
| QcAnomalyDashboard | Native filters สามตัวรับพื้นหลังเข้มพร้อมข้อความเข้มบน panel สว่าง กำหนดพื้นหลังขาว ข้อความ `#374151` และ light control scheme | แก้ style 9 บรรทัด; scoped lint/diff check ตามด้านบน Source: `src/qc-anomaly/QcAnomalyDashboard.tsx:257` พักรับภาพเดิม 11 ภาพ |
| Role detail panel | ข้อความบน role panel สว่างรับ foreground ที่อ่านไม่ชัด กำหนดสีข้อความ `#111827` ให้ panel | `src/role-network/RoleNetworkCanvas.tsx:338`; ผู้ตรวจรายงาน scoped ESLint exit 0 สำหรับไฟล์นี้และ story corrections สองไฟล์ พักรับ role-panel เดิมห้าภาพเพื่อรอ capture ใหม่ |
| AiCostDashboard | Bar ที่ใช้ความสูงเปอร์เซ็นต์ไม่มี parent ที่กำหนดความสูงแน่นอนจึงยุบ ให้ column สูงเต็มและมีพื้นที่ plot ชัดเจน แก้ fixture ที่ชื่อ 40% เป็น 215 / 537.50 และใช้ชื่อเดือน/วันสิ้นเดือนจริง | ผู้ประสานงานวัด local browser ได้ความสูง 59.7143 / 94.875 / 120 px สำหรับค่าใช้จ่าย 107 / 170 / 215; ขอบล่างร่วม 520.857 px และ plot สูง 120 px ภาพแสดงสามแท่ง Source: `src/ai-cost/AiCostDashboard.tsx:353`, `src/ai-cost/AiCostDashboard.stories.tsx:68` ยังรอ hosted capture |
| BottleneckHeatmap SingleStage | Fixture มี 10 งานแต่จำนวน/rate bottleneck ไม่สอดคล้อง กำหนด 4 bottlenecks และ 40% | `src/jobs/BottleneckHeatmap.stories.tsx:92`; ต้องตรวจภาพ fixture ใหม่ |
| OrgChart drag interaction | Spy ใน story ไม่ใช้ optimistic coordinate update เหมือน store จริง ทำให้ card กับ SVG edge ใช้ตำแหน่งสุดท้ายต่างกัน จึงอัปเดต geometry ของ flat nodes หลัง drag ใน story | `src/orgchart/OrgChartCanvas.stories.tsx:322`; เป็นการทำ fixture ให้ตรง ไม่ได้แก้ production drag algorithm ยังรอภาพใหม่ |
| AiQuotationDraftBoard — พบภายหลัง | UI เดิมต่อเครื่องหมายเปอร์เซ็นต์ให้ค่า tax fraction ที่เก็บไว้ ทำให้ `0.07` แสดงเป็น 0.07% ทั้งที่ภาษี 700 บน subtotal 10,000 คือ 7% แก้เป็น fraction × 100 และทศนิยมไม่เกินสองตำแหน่ง โดยรักษาค่าที่เก็บและยอดเงินเดิม | `src/ai-quotation/AiQuotationDraftBoard.tsx:1123`; canonical `supabase/migrations/20270215_ai_quotation_draft.sql:62` เก็บ fraction และบรรทัด 147 คูณ subtotal ด้วยค่านั้น Rendering regressions สามกรณี (0.07 / 0.0725 / 0) ตรวจ 7% / 7.25% / 0% และยอดเงินไม่เปลี่ยน ภาพเดิมสองภาพยังพักรับ |

<!-- adversary: ตรวจข้อบกพร่องด้านภาพเทียบ source fixtures และ browser snapshots โดยไม่สมมติว่า spy เปลี่ยน store; geometry ของ AiCost เป็นผล DOM local ที่ผู้ประสานงานตรวจ ไม่ใช่ hosted capture หรือการรับรอง responsive layout ทุกขนาด -->

สาเหตุที่การตรวจเดิมไม่พบ: Unit assertions ของ AiCost นับ bar nodes แต่ไม่ได้วัดความสูงที่แสดงจริง หลักฐาน browser geometry ใหม่ของผู้ประสานงานอยู่เฉพาะ parent ที่ `tmp/ai-cost-cua-geometry-20260912.json` ส่วน Culture tests/stories เดิมเติม store selector methods ที่ไม่ได้ถูกเรียก จึงไม่ได้ทดสอบความคลาดเคลื่อนของ field XAxis ผ่าน production selector; regression ใหม่ใช้ selector นั้นและ Recharts axes จริง การทำจำนวน/rate และ geometry หลัง drag ใน fixture ให้ตรงจึงยึดสัญญาข้อมูล production แทนการรับภาพที่ spy ทำให้ไม่สอดคล้อง

Regression quotation ที่เพิ่มภายหลังเริ่มจากไม่ผ่าน 2 และผ่าน 1; หลังแก้การแสดงผล focused tests ผ่าน 77 กรณี (rendering ใหม่ 3 และ store 74) Incremental TypeScript build และ diff check จบ exit 0 ส่วน scoped ESLint มี 0 errors และคำเตือนเดิม 3 รายการ หลักฐาน: `src/ai-quotation/__tests__/AiQuotationDraftBoard.test.tsx`; และไฟล์เฉพาะ parent `tmp/quotation-tax-red.log`, `tmp/quotation-tax-green.log`, `tmp/quotation-tax-types.log`, `tmp/quotation-tax-types-status.json` เป็นการตรวจเพิ่มเฉพาะส่วนหลังผลรวม 7,326 tests เดิม โดยไม่ได้รัน full unit suite ใหม่หลังจากนั้น

<!-- adversary: ผู้ลงมือแก้ส่ง logs ของ red 2 fail/1 pass แล้ว green 77 กรณี ตรวจ tax/subtotal/total และ stored fraction ว่าไม่เปลี่ยน พร้อมผล incremental TypeScript exit 0 ผู้ประสานงานอ่านหลักฐานยืนยันแยกแล้ว แต่ยังรอ hosted CI -->

## 6. จุดตรวจการรับภาพ Build 93

[Build 93](https://www.chromatic.com/build?appId=6a916bc5171efe1f3f09f56e&number=93) อยู่ที่ `a99b474` และเป็นภาพก่อนแก้ เวลาประมาณ **03:43 UTC วันที่ 12 กันยายน 2026** ผู้ประสานงานตรวจหน้า overview จริงได้ **ภาพที่เปลี่ยน 211 ภาพ: Accepted 170 และ Unreviewed/พักรับ 41** แต่ละภาพที่รับได้ดูแยกแล้ว ส่วนที่มีข้อบกพร่องพักรับเพื่อรอภาพใหม่ นี่คือผลตรวจ build เดิม ไม่ใช่การรับ candidate ที่แก้แล้ว

| ขอบเขตผู้ตรวจ | จุดตรวจที่ส่งมา | อำนาจของข้อมูล |
|---|---|---|
| ขอบเขตผู้ประสานงาน | ตรวจ 87: รับ 66; พักรับ 21 | ขอบเขตที่ผู้ประสานงานรับผิดชอบและตรวจครบ |
| ผู้ตรวจฉบับนี้: QC 14, SuperEmployee 10, courses 10, enrollment 8 | ตรวจ 42; ยืนยัน Accepted ที่บันทึกจริง 31 และคง QC 11 ภาพเป็น Unreviewed/พักรับ | Ledger ชื่อ/URL แบบตรงตัวอยู่เฉพาะ parent: `tmp/chromatic-build93-reconciliation-review.json`; ตรวจ URL ไม่ซ้ำครบ 42 |
| ผู้ตรวจภาพอีกคน | ตรวจ 82: รับ 73; พักรับ 9 | ครบขอบเขต 64 stories และ quotation 18 stories; พัก Bottleneck SingleStage, OrgChart NodeDrag, role-panel ห้าภาพ และ tax-label สองภาพ |

<!-- adversary: ขอบเขต 42 ภาพดูแยกหลัง image โหลดสมบูรณ์ ตรวจสถานะในตาราง build และย้อนเปิด story admin-resolve สุดท้ายเพื่อยืนยันว่าสถานะบันทึกจริง ไม่ใช้ batch accept ภาพที่ยังไม่ดู -->

Story การมอบหมายอบรมที่ล้มเหลวจงใจแสดง “DB write failed — server error” และเก็บ tag พนักงานไว้ให้ลองใหม่ ส่วน success ล้าง form โดย spy ไม่ได้เติม timeline จริง Story interaction อื่นอาจคง fixture เดิมเมื่อ callback มีหน้าที่บันทึกการเรียกเท่านั้น การตรวจรักษาผลที่คาดไว้เหล่านี้

ยังตรวจ local Storybook ต่อ ต้องผูกหลักฐานภาพใหม่ของ candidate กับ commit/build สุดท้ายก่อนรับรายการที่พักไว้

## 7. เกณฑ์ส่งต่องาน

1. เผยแพร่ candidate ที่ผ่านการตรวจทานพร้อมบันทึก commit ตรงตัว แล้วเก็บผล CI เต็มสำหรับ SDK 55 กรณีที่แก้และ SQL lane ที่ใช้ migration chain ครบ
2. บันทึก local Storybook checks สุดท้ายและดู hosted snapshots ที่เปลี่ยนทีละภาพ รวม QC 11 กรณีที่พักไว้ รวม ledger ของผู้ตรวจให้ตรงก่อนประกาศยอดรับทั้ง build
3. ตรวจ hosted Auth hook activation และ login/refresh แยกก่อนรับใช้งานจริง ติดตามงาน reconciliation ของ multi-organization resolver ต่อ
4. แยกการปล่อย production, การรับใช้งานจริง และ canonical integration ของ SciSpace v2 เป็นการตัดสินใจที่ใช้หลักฐานเฉพาะของแต่ละเรื่อง

เอกสารนี้เป็นการส่งต่องานแก้ทางเทคนิค โดยรักษาข้อผิดพลาดฐานเดิม การตรวจขอบเขตจำกัดที่ทำแล้ว และเกณฑ์ที่ยังต้องตรวจไว้สำหรับทบทวน
