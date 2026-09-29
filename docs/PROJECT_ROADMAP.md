# MONOLITH Manufacturing OS — Project Roadmap
## Accounting & eTax Compliance Stack · Branch `feat/accounting-rls-multibook`

**Updated:** 2026-09-01 | **PR:** [#46](https://github.com/indetailsgroup-hue/monolith-workspace/pull/46)

---

## สถานะภาพรวม

```
Phase 1 Foundation          ████████████████████ 100% ✅
Phase 2 Business Logic      ████████████████████ 100% ✅
Phase 3 eTax Pipeline       ████████████████████ 100% ✅
Phase 4 Observability       ████████████████████ 100% ✅
Phase 5 UI Layer            ██████████████████░░  90% 🔄
Phase 6 Test Coverage       ████████████████░░░░  80% 🔄
Phase 7 Staging Validation  ████████████████░░░░  80% 🔄
Phase 8 Release & Deploy    ░░░░░░░░░░░░░░░░░░░░   0% ⏳
Phase 9 Post-Launch         ░░░░░░░░░░░░░░░░░░░░   0% 🔮
```

---

## Phase 1 — Foundation ✅ COMPLETE

| งาน | Migration | สถานะ |
|-----|-----------|-------|
| Academic research + architecture decision (84 papers) | — | ✅ |
| Multi-tenant base schema | `0000_multi_tenant_schema.sql` | ✅ |
| RLS hardening & deduplication | `0178_rls_dedup_and_hardening.sql` | ✅ |
| Multi-book dynamic accounting | `0179_multibook_dynamic.sql` | ✅ |
| Technical spec document | `accounting-technical-spec.md` | ✅ |
| Project roadmap doc | `monolith-project-roadmap.md` | ✅ |

---

## Phase 2 — Business Logic Layer ✅ COMPLETE

| งาน | Migration | สถานะ |
|-----|-----------|-------|
| Auto journal entry on invoice approval | `0176_auto_journal_on_approval.sql` | ✅ |
| Auto receipt posting on payment confirm | `0177_auto_receipt_on_payment_confirm.sql` | ✅ |
| Overdue invoice detection + notifications | `0180_overdue_invoice_detection.sql` | ✅ |
| Test: RLS multi-tenancy (0178) | `0173_rls_multitenancy.test.ts` | ✅ |
| Test: payment receipt (0177) | `0177_payment_receipt.test.ts` | ✅ |
| Test: overdue detection (0180) | `0180_overdue_detection.test.ts` | ✅ |

---

## Phase 3 — eTax Submission Pipeline ✅ COMPLETE

| งาน | Migration / File | สถานะ |
|-----|-----------------|-------|
| eTax auto-queue on invoice submit | `0181_etax_auto_submit.sql` | ✅ |
| Org notification settings (`notification_settings JSONB`) | `0182_org_notification_settings.sql` | ✅ |
| eTax PDF download pipeline | `0183_etax_pdf_download.sql` | ✅ |
| pg_cron scheduled jobs (5 jobs) | `0184_scheduled_jobs.sql` | ✅ |
| eTax audit log | `0185_etax_audit_log.sql` | ✅ |
| Edge Function: `etax-submit-worker` (inline PDF) | `supabase/functions/etax-submit-worker/index.ts` | ✅ |
| Edge Function: `notify-overdue` | `supabase/functions/notify-overdue/index.ts` | ✅ |
| `supabase/config.toml` cron schedule table | — | ✅ |
| Test: eTax auto submit (0181) | `0181_etax_auto_submit.test.ts` | ✅ |
| Test: eTax PDF download (0183) | `0183_etax_pdf_download.test.ts` | ✅ |
| Test: eTax audit log (0185) | `0185_etax_audit_log.test.ts` | ✅ |

---

## Phase 4 — Observability Stack ✅ COMPLETE

### Views & MVs

| งาน | Migration | สถานะ |
|-----|-----------|-------|
| `v_etax_compliance_dashboard` (14 cols) | `0186` | ✅ |
| `mv_etax_compliance_dashboard` + pg_cron 15 min | `0187` | ✅ |
| MV refresh-lag alert trigger (`mv_etax_compliance_mv_refresh_log`) | `0188` | ✅ |
| `v_mv_alert_history` | `0189` | ✅ |
| `v_etax_submission_health` (17 cols, status breakdown) | `0190` | ✅ |
| `v_etax_health_trend` (30-day daily trend) | `0191` | ✅ |
| `mv_etax_health_trend` + pg_cron daily | `0192` | ✅ |
| `v_etax_full_health_summary` (health_score formula) | `0193` | ✅ |
| `v_etax_org_risk_ranking` (DENSE_RANK, 18 cols) | `0194` | ✅ |
| `etax_risk_tier_state` + pg_notify `etax_risk_rank_changed` | `0195` | ✅ |

### Test Suites

| งาน | File | สถานะ |
|-----|------|-------|
| Test: compliance dashboard (0186) | `0186_compliance_dashboard.test.ts` | ✅ |
| Test: compliance MV (0187) | `0187_etax_compliance_dashboard_mv.test.ts` | ✅ |
| Test: MV refresh-lag alert (0188) | `0188_mv_refresh_lag_alert.test.ts` | ✅ |
| Integration: 0186+0187 | `0186_0187_integration.test.ts` | ✅ |
| Test: alert history (0189) | `0189_mv_alert_history.test.ts` | ✅ |
| Test: submission health (0190) | `0190_etax_submission_health.test.ts` | ✅ |
| Test: health trend (0191) | `0191_etax_health_trend.test.ts` | ✅ |
| Test: MV health trend (0192) | `0192_mv_etax_health_trend.test.ts` | ✅ |
| Test: full health summary (0193) | `0193_etax_full_health_summary.test.ts` | ✅ |
| Integration: 0192+0193 | `0192_0193_integration.test.ts` | ✅ |
| Test: risk ranking (0194) | `0194_etax_org_risk_ranking.test.ts` | ✅ |
| Integration: 0193+0194 | `0193_0194_integration.test.ts` | ✅ |
| **Test: risk tier notify (0195)** | `0195_etax_risk_tier_notify.test.ts` | **❌ PENDING** |

### Staging Validators

| Script | Migration | สถานะ |
|--------|-----------|-------|
| `staging_validate_0186.sh` | 0186 | ✅ |
| `staging_validate_0187.sh` | 0187 | ✅ |
| `staging_validate_0188.sh` | 0188 | ✅ |
| `staging_validate_0189.sh` | 0189 | ✅ |
| `staging_validate_0190.sh` | 0190 | ✅ |
| `staging_validate_0191.sh` | 0191 | ✅ |
| `staging_validate_0192.sh` | 0192 | ✅ |
| `staging_validate_0193.sh` | 0193 | ✅ |
| `staging_validate_0194.sh` | 0194 | ✅ |
| `staging_validate_0195.sh` | 0195 | ✅ |
| **`staging_validate_all.sh` (add entry #9 for 0195)** | all | **❌ PENDING** |

---

## Phase 5 — UI Layer 🔄 90%

| งาน | File | สถานะ |
|-----|------|-------|
| Hook: `useEtaxCompliance` | `src/hooks/useEtaxCompliance.ts` | ✅ |
| Component: `HealthScoreBadge`, `RiskTierBadge`, `FreshnessBadge` | `src/components/etax/HealthScoreBadge.tsx` | ✅ |
| Component: `ComplianceSummaryCards` (6-card KPI) | `src/components/etax/ComplianceSummaryCards.tsx` | ✅ |
| Component: `OrgRiskRankingTable` | `src/components/etax/OrgRiskRankingTable.tsx` | ✅ |
| Page: `EtaxComplianceDashboard` (3 tabs) | `src/pages/EtaxComplianceDashboard.tsx` | ✅ |
| Hook: `useBooks`, `useChartOfAccounts`, `useJournalEntries` | `src/hooks/useAccounting.ts` | ✅ |
| Component: `ChartOfAccounts` (recursive tree) | `src/components/accounting/ChartOfAccounts.tsx` | ✅ |
| Component: `MultiBookLedger` | `src/components/accounting/MultiBookLedger.tsx` | ✅ |
| Page: `AccountingManagement` | `src/pages/AccountingManagement.tsx` | ✅ |
| Standalone HTML Dashboard | `public/etax-compliance-dashboard.html` | ✅ |
| **Router: เพิ่ม routes สำหรับ 2 หน้าใหม่ใน App router** | `src/App.tsx` / `src/router.tsx` | **❌ PENDING** |
| **NavBar / Sidebar: เพิ่ม links ใน menu หลัก** | `src/components/layout/` | **❌ PENDING** |

---

## Phase 6 — Test Coverage 🔄 80%

| งาน | File | สถานะ |
|-----|------|-------|
| Unit tests: DB migrations 0176–0194 | *.test.ts | ✅ |
| **Unit tests: Migration 0195** | `0195_etax_risk_tier_notify.test.ts` | **❌ PENDING** |
| **UI unit tests: EtaxComplianceDashboard** | `src/__tests__/ui/EtaxComplianceDashboard.test.tsx` | **❌ PENDING** |
| **UI unit tests: AccountingManagement** | `src/__tests__/ui/AccountingManagement.test.tsx` | **❌ PENDING** |
| **e2e tests: eTax compliance flow** | `e2e/etax-compliance.spec.ts` | **❌ PENDING** |
| **e2e tests: accounting management flow** | `e2e/accounting-management.spec.ts` | **❌ PENDING** |

---

## Phase 7 — Staging Validation 🔄 80%

| งาน | สถานะ |
|-----|-------|
| Scripts เขียนครบทุก migration | ✅ |
| **อัปเดต `staging_validate_all.sh` เพิ่ม 0195 (entry #9)** | **❌ PENDING** |
| **CHANGELOG [15.0.0] — completion release** | **❌ PENDING** |
| **Run ทุก validator บน staging environment จริง** | **❌ PENDING** |
| **Pre-flight: `preflight_db_reset.sh` บน staging** | **❌ PENDING** |
| **ตรวจสอบ pg_cron jobs ทำงานถูกต้องบน staging** | **❌ PENDING** |
| **Load test: MV refresh ภายใต้ concurrent users** | **❌ PENDING** |

---

## Phase 8 — Release & Deployment ⏳ NOT STARTED

| งาน | สถานะ |
|-----|-------|
| PR #46 code review (self/team) | ⏳ |
| Squash & merge `feat/accounting-rls-multibook` → `main` | ⏳ |
| Tag `v14.8.0` on merge commit | ⏳ |
| Deploy migrations 0178–0195 ตามลำดับบน production | ⏳ |
| Deploy Edge Functions `etax-submit-worker` + `notify-overdue` | ⏳ |
| ตรวจ pg_cron jobs ทำงานบน production | ⏳ |
| Smoke test ทุก RPC บน production (service_role) | ⏳ |
| Enable Realtime Subscription บน `etax_risk_tier_state` | ⏳ |

---

## Phase 9 — Post-Launch 🔮 FUTURE

| งาน | คำอธิบาย | Priority |
|-----|----------|----------|
| **pg_notify Consumer Edge Function** | Edge Function subscribe ช่อง `etax_risk_rank_changed` → ส่ง webhook/email เมื่อ tier เป็น CRITICAL | 🔴 High |
| **Alert Delivery** | ส่ง LINE Notify / Email / Slack เมื่อ org เปลี่ยนเป็น CRITICAL | 🔴 High |
| **Realtime UI Update** | `useEtaxCompliance` subscribe Supabase Realtime แทน polling เพื่อลด latency | 🟡 Medium |
| **Export Reports** | Download CSV / Excel ของ compliance data จาก UI | 🟡 Medium |
| **OpenAPI / Swagger Docs** | Auto-gen spec จาก Supabase RPC signatures | 🟡 Medium |
| **Field App Integration** | `packages/field-app` แสดง eTax status ของ job | 🟡 Medium |
| **Performance Tuning** | Index audit, EXPLAIN ANALYZE บน views 0186–0194, partition `etax_submissions` by month | 🟢 Low |
| **Admin Dashboard** | Super-admin view cross-tenant risk summary (service_role only) | 🟢 Low |
| **Data Retention Policy** | Auto-archive `etax_submissions` > 7 ปี, `journal_entries` > 10 ปี | 🟢 Low |

---

## งานที่ต้องทำทันที (Next 5 Tasks)

```
1. ❌  Test suite สำหรับ Migration 0195
       → src/__tests__/rls/0195_etax_risk_tier_notify.test.ts
       → Groups: etax_risk_tier_state RLS, fn_check_risk_tier_changes,
                 pg_notify payload schema, rpc admin p_limit clamp

2. ❌  อัปเดต staging_validate_all.sh เพิ่ม entry 0195 (entry #9)
       → ทำให้ทุก 9 entries resolve PASS

3. ❌  เพิ่ม routes ใน App router สำหรับ EtaxComplianceDashboard + AccountingManagement
       → src/App.tsx หรือ src/router.tsx

4. ❌  CHANGELOG [15.0.0] — completion release
       → ระบุ migration lineage 0186→0195 ครบ, UI files, test coverage summary

5. ❌  PR #46 final review → merge to main
```

---

## สถิติรวม

| หมวด | จำนวน |
|------|-------|
| Migrations | 20 files (0176–0195) |
| Edge Functions | 2 files |
| Test suites | 17 files, ~650 tests |
| Staging validators | 10 scripts |
| UI files | 10 files (hooks, components, pages) |
| CHANGELOGs | 9 versions (14.0.0–14.8.0) |
| Lines of code (est.) | ~18,000 lines |

---

*MONOLITH Manufacturing OS · feat/accounting-rls-multibook*
