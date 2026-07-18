# MONOLITH Love Roadmap — "ทุกฟังก์ชันทำงานจริง และเป็นที่รักของทุกตำแหน่ง"

วันที่: 2026-07-18 · baseline: `main@955d127b` (G0 ปิดแล้ว — ทุกอย่างในเอกสารนี้อ้างจาก main เดียว)
ที่มา: workflow 14 agents (10 readers กวาดทุก surface + 3 synthesizers + 1 adversarial critic ตรวจกับโค้ดจริง) → สังเคราะห์+แก้ baseline drift โดย reviewer track
สถานะ: **เสนอคุณเดฟตัดสิน** — เอกสารนี้ไม่สร้าง authority ใด ๆ · NO_CUT ยังคุมทุกบรรทัด

> **Tenet ที่ใช้วัดทุกข้อ:** easy front, rigorous back — ความรักเกิดจาก "กดแล้วได้จริง ไม่โกหก ไม่ทางตัน" ส่วนความเข้มงวดอยู่หลังบ้านเสมอ

---

## 0. ภาพรวมที่ readers เจอ (ความจริงที่ต้องกล้ามอง)

จุดแข็ง: **เครื่องยนต์หลังบ้านแข็งแรงผิดคาด** — nesting optimizer (47 tests), tax/eTax/WHT (เทสครบ), workflow engine (134/134), CNC chain, offline photo queue, S17 packet line ทั้งสาย — ปัญหาไม่ใช่ "ยังสร้างไม่เสร็จ" แต่คือ **"สร้างเสร็จแล้วไม่ได้ต่อสายถึงมือผู้ใช้"**

จุดเจ็บที่ซ้ำทุก lane: ปุ่มที่กดแล้วเงียบ · ข้อมูล mock บนจอจริง · ฟีเจอร์ถูกซ่อนหลัง role ที่สลับไม่ได้ · engine เทสผ่าน 100% แต่ไม่มี caller

## 1. Love Matrix — ตำแหน่ง × กลุ่มฟังก์ชัน (คะแนน 0–5)

> คะแนน = functionality audit จากโค้ดจริง (ยังไม่ใช่เสียงผู้ใช้จริง — การวัดความรักจริงครั้งแรกคือ dogfood house-01) · ทุกช่องมี evidence file:line ในรายงาน reader ฉบับเต็ม

| ตำแหน่ง (อ้าง DAPH JD) | กลุ่มฟังก์ชัน | คะแนน | เหตุผลย่อ |
|---|---|---|---|
| **Designer** | ออกแบบ 3D / catalog / minifix | **4** | WORKING มีเทสครบ — หัก: ไม่มี undo, ปุ่ม Materials ตาย 2 ปุ่ม |
| | Safety Gate + Freeze | **2** | drillMap null = PASS เงียบ · gate ไม่ auto-run · **freeze ข้าม blocker ได้** |
| | Export / ส่ง packet | **2** | ส่งได้จริงแต่ผลอยู่ที่ console.log · กติกา export ไม่ตรงกัน 3 จอ |
| | บันทึกงาน / เวอร์ชัน | **2** | แบบอยู่ localStorage เครื่องเดียว ขณะ server จำว่า FROZEN — ล้าง browser = แบบหาย |
| | Nesting / yield | **1** | optimizer จริง 47 tests แต่ซ่อนหลัง role FACTORY — Designer ไม่เห็น waste |
| **Factory Operator** | รับงาน / Verify | **0** | `startVerify` ไม่แนบ auth → **FAIL "ห้ามผลิต" ทุกครั้ง** · PacketTab เรียก endpoint ที่ไม่มีจริง |
| | Export / download | **1** | server พร้อม แต่ UI รอ options ที่ไม่มีวันมา |
| | CNC + tool health | **1** | ทั้งสายมีเทสครบ แต่ PacketIngestPanel **ไม่ถูก mount** — เข้าไม่ถึงเลย |
| | Audit / trust | **0** | endpoint ล่ม → โชว์ mock "VERIFY PASS" ปลอม · TrustStrip = PENDING ตลอดกาล |
| **Field Operator** | เช็คลิสต์ + LINE flows | **4** | ใช้จริงได้ — หัก: ติ๊กตอนเน็ตหลุดไม่ revert (ความจริงหายเงียบ) |
| | คิวรูปหลักฐาน | **2** | แกนดี แต่ fail 5 ครั้ง = ค้างถาวร ไม่มีปุ่ม retry (โค้ด retry เขียน+เทสแล้ว!) |
| | Offline | **1** | ทุกจอโหลด RPC สด — แอป "หน้างาน" ใช้ไม่ได้ในจุดอับสัญญาณ |
| | งานหัวหน้าทีม (QC/ตรวจรับ) | **4** | ครบสายถึงการ์ดตรวจรับ flex |
| **Surveyor** *(persona สังเคราะห์ — ยังไม่มีไฟล์ JD ตรง)* | คิววัด/บันทึกวัด | **1** | มีแค่คิว — **ไม่มีจอกรอกขนาด/โซนเลย** ใบวัดยังกระดาษ (PFMEA sev 8) |
| **Sale** | Intake / สัญญา / turnkey | **3** | WORKING — หัก: 16 ฟิลด์ไม่มี autosave, รหัสผูกกลุ่มโชว์ผ่าน `alert()` |
| **Finance (F3)** | งานเงินรายวัน (field-app) | **3** | สลิป/ใบเสร็จ/เตือนค้าง WORKING — หัก: กระทบยอดแบงก์ด้วยตาทุกงวด |
| | แอปหลัก `/finance` + ภาษี | **0** | `/finance` = "Coming soon" · eTax/WHT เทสผ่าน 100% แต่**ไม่มี caller** |
| **ลูกค้า** | ดูแบบ/ตรวจรับ/งวดผ่าน LINE | **3** | backend พร้อม — หัก: reject ไม่มีช่องเหตุผล, ลิงก์หมดอายุ = ทางตัน |
| **QA** | อนุมัติของดี/เสีย | **0** | JD ให้อำนาจชัด แต่**ไม่มี flow ในระบบเลย** |
| **Owner/Admin** | Governance / gates | **3** | แข็งแรงจริง — หัก: สถานะ real-cut กระจาย 5+ เอกสาร, **ADR-064 ยังไม่มีแม้ตัวเอกสาร** |
| **Production Planning / Draftsman / PM / MD / Manager สายต่าง ๆ** *(เพิ่มตามผล adversarial H1)* | — | **0–1** | มี JD จริงแต่ matrix ยังไม่มี journey — เข้าคิว W2/W4 |
| **Warehouse / Purchasing / back-office (~8 ตำแหน่ง)** | ทั้งหมด | **0** | PRD ระบุเอง "(stock — roadmap)" — W4 |

> **หมายเหตุ H1 (adversarial):** ไฟล์ JD จริงมี ~22–27 ตำแหน่ง (ไม่ใช่ 38) — งานแรกของ lane เอกสารคือ mapping table matrix↔ไฟล์ JD ครบชุด แล้วปรับเลขเป้า W4 ตามจริง

## 2. Top-10 Love Gaps (ความเจ็บ × จำนวนคนเจ็บ)

1. **สาย Verify→Export โรงงานพังทั้งเส้น** — กด VERIFY = FAIL เสมอ (ไม่แนบ auth) → แก้ชี้ `startVerify` ไปที่ `verifyJobApi` (adapter B1-02 **merge แล้วมีเทสครบ**)
2. **แอปหน้างานตายตอนไม่มีสัญญาณ + รูปค้างถาวร** → ปุ่ม retry (โค้ดมีแล้ว) + cache + ย่อรูป + Background Sync
3. **ข้อมูลปลอมบนจอจริง** — audit mock, dashboard 0/"—", mock G-code พร้อม SHA จริง → honest empty-state + 501
4. **3 ใน 5 role ไม่มีทางเข้าบ้านตัวเอง** — ไม่มี role switcher / login UI (hosted บังคับ JWT) → *นี่คือ blocker ของทุก hosted claim (adversarial C1)*
5. **Safety Gate ผ่านแบบกลวง + freeze ข้าม gate** — drillMap null = PASS, `canFreeze` ไม่เช็ค gate → ต่อ `isFreezeAllowed()` ที่มีอยู่แล้ว
6. **เครื่องมือโรงงาน client ไม่ถูก mount ทั้งชุด** — mount PacketIngestPanel จุดเดียว ปลด CNC+tool wear ทั้งสาย
7. **Finance = ห้องว่าง + เครื่องภาษีเกาะเดี่ยว** — dashboard read-only จาก `rpc_finance_home` + `composeFromNet` เข้าใบเสร็จ
8. **Surveyor ใช้ทุกวันแต่มีแค่ schema** — จอวัด/โซนมือเดียว + รูปต่อโซนผ่านคิวเดิม
9. **~10 ตำแหน่งไม่มี journey เลย** — reuse pattern ที่พิสูจน์แล้ว (การ์ด approve / คิว #ปัญหา / BOM)
10. **Trust leaks สาย CNC ก่อนวัน real-cut** — double-drill latent, DXF โหลดได้แม้ G10 FAIL, ไฟล์ไม่มีป้าย NFP → ปิดใน W1 (เส้นแดง)

## 3. Quick Wins (≤1 วัน/ชิ้น — ตรวจกับ main@955d127b แล้ว)

| # | งาน | ผล |
|---|---|---|
| 1 | `startVerify` → `verifyJobApi` (ไฟล์เดียว) | ปุ่ม Verify โรงงานมีชีวิต + STORAGE_HASH_MATCH โชว์จริงครั้งแรก |
| 2 | Mount PacketIngestPanel ใน Packet tab | ปลด CNC gen + tool wear ทั้งสาย |
| 3 | ลบ mock fallback ใน activityApi (~30 บรรทัด) | audit เลิกโกหก |
| 4 | ปุ่ม "ลองส่งอีกครั้ง" → `queue.retryFailed()` + revert checkbox + toast | แก้สอง dead end ใหญ่สุดของช่าง |
| 5 | ต่อ `isFreezeAllowed()` เข้า GateToolbar + drillMap null → WARNING | gate พูดความจริง |
| 6 | mock G-code → 501 + banner DEMO DATA *(หมายเหตุ H4: `useMockApi` route จริงเป็น false อยู่แล้ว — ข้อนี้เหลือแค่ hygiene)* | ปิดไฟล์ปลอม |
| 7 | `/finance` stub → dashboard read-only *(ต้องมี login ก่อนถึงใช้บน hosted ได้ — C1)* | ห้องว่างกลายเป็นของจริง |
| 8 | โลโก้→Hub · Shift+G→Safety tab · PWA icons | ระบบรู้สึกเป็นแอปเดียว |

---

## 4. Roadmap 4 Waves

> การแก้จาก adversarial: ทุกข้อที่แตะ hosted ติดป้าย **(prepare-only — human apply ตาม ADR-066)** · exit evidence ทุกข้อนิยามเป็น assertion วัดได้ · งานที่ทำไปแล้วบน main@955d127b ตัดออก (G0 reconciliation, STORAGE_HASH_MATCH, factory-flow CI gate, dogfood tools — **เสร็จแล้วทั้งหมด**)

### W1 — รักได้ทันที (1–2 สัปดาห์)
**เป้า:** ฆ่า dead end + ข้อมูลปลอม + รูรั่วเส้นแดง ด้วยโค้ดที่เสร็จแล้วแต่ไม่ได้ต่อสาย
- งานหลัก = Quick wins 1–8 + เส้นแดง NO_CUT: ป้าย NFP ทุก artifact (.nc/DXF/bundle), block DXF เมื่อ G10 FAIL, DUPLICATE_POSITION dedupe, `gate:bypass-scan:strict` เข้า CI
- **Login/session UI ขยับเข้า W1** (มติจาก C1) — ไม่งั้นทุก hosted claim วัดไม่ได้
- Human (จองทันที ไม่บล็อก): นัด KMS ceremony + นัด bench + เดิน house-01 ขั้น contract + เซ็น ADR-064 เมื่อ checklist พร้อม
- **Exit (วัดได้):** e2e "verify คืน verdict จริง" เขียวใน CI · grep ทั้ง repo ไม่มี mock ใน production path · ไฟล์ตัดทุกไฟล์มีป้าย NFP (เทส assert) · แบนเนอร์ค้างส่งมีปุ่มกดแล้วรายการลดจริง · ปฏิทินมีวันนัด KMS+bench

### W2 — ทุกฟังก์ชันทำงานจริง (2–4 สัปดาห์)
**เป้า:** ทุกตำแหน่งมีเส้น end-to-end บน hosted — engine จมน้ำถูกต่อประตูครบ
- Factory: PacketTab→`/state`+`/export` · CNC chain ครบ · URL navigation · Designer: nesting yield read-only + Export PDF drill map + design data ขึ้น server (ADR-060) · Field+Surveyor: offline cache + **จอวัด Surveyor** + QC ต่อห้อง · Finance: CSV bank import + `autoMatch` + จอสมุดรายวัน · Server: wire S17-4 generator เป็นต้นทาง packet *(prepare-only — human apply)* + S17-5 endpoint **shadow เท่านั้น** *(ห้ามเป็น authority จน SoD review ผ่าน)* · เพิ่ม journey แถวแรกให้ Production Planning / Draftsman / PM / MD (จาก H1)
- Human ขนาน: KMS ceremony จริง · bench เครื่องแรก · house-01 ขั้น 3–5 · บัญชี/ทนาย review ใบเสร็จ+RD Prep
- **Exit:** ต่อ role หนึ่ง journey ระบุชื่อ + assertion ปลายทาง (เช่น Finance: "import CSV → autoMatch ≥1 งวด → ยอดค้างลดบนจอ") · ทุก packet ใหม่มาจาก S17-4 generator · field-app 25 จอมี smoke test

### W3 — ปิด Real-Cut Gate (ตามจังหวะ human)
**เป้า:** หลักฐานครบ 4 เงื่อนไข → ปิด `SHADOW_MODE_NOT_FOR_PRODUCTION` อย่างมีพิธีการ
- AI: authority switch — export ปลดด้วย **verifier receipt (S17-5)** แทน storage hash *(หลัง SoD review เท่านั้น)* · B1-04: `markPacketAsValidated` → รับ opaque receipt · ตัดสิน ModelingReleasePanel (ลบ หรือ ed25519 จริง) · readiness dashboard เขียว 4 ช่องจาก evidence จริง
- Human (critical path เรียงตาม dependency): SoD review S17-5 → KMS (ถ้ายังไม่จบ) → bench ครบ 2 เครื่อง → house-01 ครบ chain → ADR-064 ครบ 4 ลายเซ็น → prod-apply Track A ใน pilot window → **flag closure ceremony**
- **Exit:** `readiness-status` เขียวครบ 4 ช่อง · เส้น export ทั้งระบบปลดด้วย receipt เท่านั้น

### W4 — ขยาย (หลัง G0–G3 + owner ratification เท่านั้น)
Back-office ~8 ตำแหน่ง (capture type ใหม่บน spine เดิม) · QA/Warehouse/Purchasing (reuse patterns) · ไซต์สอง *(hard gate: cross-site isolation tests)* · Entitlement Phase 3 *(trigger: มติเปิดขาย — ADR-069)* · LINE OA copilot *(AI advisory เท่านั้น)* · e-Tax เต็มรูป
- **Exit:** ทุกตำแหน่งใน mapping table JD (เลขจริงจาก H1) มี journey ≥1 เส้น = ลำดับ action ระบุชื่อ + assertion ปลายทาง

---

## 5. S18 Subagent Lane Plan (แก้ตาม adversarial แล้ว)

**Base เดียว: `origin/main` (955d127b+)** — ไม่มี dual-base (C2 หมดสภาพเพราะ G0 ปิดแล้ว) · ทุก lane:
```
git worktree add worktrees/lane-<ชื่อ> -b lane/s18-<ชื่อ> origin/main
```

### กติกาเหล็กใส่ทุก prompt
1. ห้ามแตะ `shadowMode.ts` / ห้ามลดป้าย NFP (L5 มีหน้าที่**เพิ่ม**)
2. hosted apply = คุณเดฟเท่านั้น (ADR-066) — งาน supabase จบที่ "ไฟล์+เทสพร้อม"
3. SoD: builder ≠ reviewer · reviewer ต้องรันคำสั่ง verify ซ้ำเองเห็น output เต็ม
4. ทุก slice จบด้วยคำสั่ง verify จริง + แปะ output (กติกา complete-output)

### Lanes (write-scope หลังแก้ H2)

| Lane | Write scope | Slice แรก (TDD) |
|---|---|---|
| **L1 designer-ux** | `src/App.tsx` · `src/components/**` (ยกเว้น layout/AppShell) · `src/gate/**` · `useSpecStore.ts` | ① canFreeze ผ่าน gate ② drillMap null→WARNING ③ mount GateProvider + Shift+G |
| **L2 factory-ux** | `src/factory/{state,pages,components,api}/**` (ห้ามแตะ `factory/packet/**`) | ① startVerify→verifyJobApi ② ลบ mock audit ③ align WARN + mount PacketIngestPanel |
| **L3 field-app** | `packages/field-app/**` (ยกเว้น FinanceHome/MoneyPanel) · `src/installation/offline-queue/**` | ① ปุ่ม retry ② revert checkbox+toast ③ ย่อรูปก่อน enqueue |
| **L4 finance-tax** | field-app Finance screens · `src/tax/**` · `src/ledger/**` · migrations **0164–0169** · `FinanceDashboard.tsx` | ① pgTAP site-scoping lock ② FinanceDashboard read-only ③ composeFromNet เข้าใบเสร็จ *(apply=human)* |
| **L5 cnc-safety** ⭐เส้นแดง | `src/cnc/**` · `src/core/export/**` · `src/core/gate/**` · `src/factory/packet/**` · **`scripts/gates/**` (ย้ายจาก L8 — H2)** | ① DUPLICATE_POSITION dedupe ② block DXF เมื่อ G10 FAIL ③ ป้าย NFP ทุก artifact |
| **L6 server-api** | `supabase/functions/**` · `server/**` · `src/core/api/**` · migrations **0170–0175** | ① mock G-code→501 ② Thai error map ③ เติม field จริง jobs_list *(apply=human)* |
| **L7 platform-core** | `src/routes/index.tsx` (single-writer) · `AppShell.tsx` · `src/core/auth/**` | ① **login/session UI + role switcher (ยกระดับจาก C1)** ② โลโก้/footer จริง ③ RoleGateDialog |
| **L8 evidence-gov** | `docs/**` · `.github/workflows/**` (single-writer) · `scripts/**` *(ยกเว้น scripts/gates)* | ① ADR-064 checklist (pattern CT-DEC-002) ② เพิ่ม bypass-scan เข้า CI *(interop+tamper+no-skip มีแล้วบน main)* ③ `readiness-status.mjs` |

**Must-wait-for:** L4-② route wiring → L7 ทำ (ส่ง component+request) · L2 backlog PacketIngest → หลัง L2 ①–③ merge · ทุก migration apply → human window
**Race-risk (single-writer):** `routes/index.tsx`=L7 · `App.tsx`=L1 · `factory/packet/**`=L5 · workflows=L8 · เลข migration จองช่วงแล้ว
**SoD pairing:** L1⇄L5 *(L5 ต้องมี second review โดยคุณเดฟหรือ session อิสระ — M1)* · L2⇄L6 · L3⇄L4 · L7⇄L8

### Kick-off กระจายสองวัน (แก้ M5 — ไม่บีบคุณเดฟวันเดียว)

**วันที่ 1 (Wave trust-critical):**
- [ ] เช้า: สร้าง worktrees L2/L5/L8 → dispatch 3 ตัวพร้อมกัน (แนบกติกาเหล็ก+scope+slices)
- [ ] เช้า: จองปฏิทิน KMS + bench (สองตัวปลดเงื่อนไข real-cut มากสุด)
- [ ] บ่าย: รีวิว SoD (L5 = คุณเดฟ second review) → merge ตามลำดับ **L8→L5→L2**
- [ ] เกณฑ์ผ่านวัน 1: verify e2e เขียวใน CI · DXF ที่ G10 fail โหลดไม่ได้ · audit ไม่มีของปลอม

**วันที่ 2 (Wave ประตูบ้าน+หน้างาน):**
- [ ] เช้า: dispatch L7+L1+L3 → บ่าย: dispatch L4+L6
- [ ] เย็น: merge L7→L1→L3→L6→L4 · ปิดวันด้วย `node scripts/readiness-status.mjs`

---

## 6. คิว Human ตลอดเส้น (AI เร่งไม่ได้ — จองจากวันนี้)

| งาน | ใคร | ปลดเงื่อนไข |
|---|---|---|
| KMS ceremony ECDSA P-256 (ADR-068) | PO+SO | S17-5 signature leg / real-cut ①|
| Bench KN-2409LP + KD-610R (ADR-070) | วิศวกร+FO | machine calibrated / real-cut ④ |
| Dogfood house-01 ขั้น 3–8 (`dogfood-record.mjs` **อยู่บน main แล้ว**) | ทีมหน้างาน | dogfood≥1 / real-cut ③ |
| เซ็น ADR-064 (4 บทบาท — L8 ร่าง checklist ให้) | PO/TL/SO/FO | real-cut ② |
| SoD review S17-5 (prompt เตรียมแล้ว — ห้าม Codex/builder) | คุณเดฟ หรือ AI ที่สาม | authority switch W3 |
| Deploy Edge 0163 + migrations ที่ L4/L6 เตรียม | คุณเดฟ | hosted ตามทัน main |
| Prod-apply Track A (0162) ใน pilot window | คุณเดฟ | ปิด P0 บน prod |

## 7. บันทึก Adversarial Review (โปร่งใสเต็ม — อะไรถูกจับได้และแก้อย่างไร)

| Finding | คำตัดสิน | การแก้ในเอกสารนี้ |
|---|---|---|
| C1 hosted exit วัดไม่ได้เพราะไม่มี login | **จริง** | login ยกเข้า W1 (L7-①) + exit W1 เปลี่ยนเป็น CI-verified |
| C2 dual-base ทำ G0 พัง | หมดสภาพ — critic ดู checkout เก่า (dd1119af); **G0 ปิดแล้วที่ 955d127b** | base เดียว origin/main |
| C3 merge CI เข้มก่อนจะ block ทุกคน | หมดสภาพบางส่วน — no-skip gate อยู่บน main แล้วและเขียว | L8 เหลือแค่เพิ่ม bypass-scan |
| H1 ตำแหน่งหาย + เลข 38 ไม่มีหลักฐาน | **จริง** | เพิ่มแถว matrix + งาน mapping table JD + แก้เลขเป้า W4 |
| H2 write-scope ชน `scripts/gates` | **จริง** | ย้ายให้ L5 ถือ, L8 exclude |
| H3 W2 hosted ไม่ annotate | **จริง** | ติดป้าย prepare-only ทุกข้อ |
| H4 useMockApi quick win กลวง | **จริง** | ลดเป็น hygiene |
| M1 SoD reciprocal + L5 เสี่ยง | **จริง** | L5 บังคับ second review อิสระ |
| M2 dogfood-record ไม่อยู่บน base | หมดสภาพ — merge แล้ว (PR #11) | อ้าง main ตรง ๆ |
| M3 love score ไม่มีเครื่องวัด | **จริง** | ประกาศชัด: วัดจริงครั้งแรก = dogfood house-01 |
| M4 exit vacuous | **จริง** | ทุก exit เป็น assertion ระบุชื่อ |
| M5 วันแรกเกิน capacity | **จริง** | kick-off กระจายสองวัน |

---

*เอกสารนี้เป็น derived snapshot — สถานะ ณ 2026-07-18 · source: main@955d127b · ก่อน kick-off ให้ตรวจ repo ล่าสุด · การเริ่ม S18 = มติคุณเดฟ*
