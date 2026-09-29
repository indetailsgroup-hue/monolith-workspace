# CHANGELOG [15.3.0] — 2026-09-01

> **Release Candidate Declaration** — `release/15.0.0` is hereby marked **RC-1**.
> All feature migrations, edge functions, test suites, staging validators, UI
> components, and documentation deliverables are complete. PR #74
> (`release/15.0.0 → main`) is open and awaiting final code review.

---

## [15.3.0] – 2026-09-01

### Maintenance

#### `scripts/staging_validate_all.sh` — 13-Validator Complete (commit `6c61b4c02f7a`)

The master staging orchestrator previously stopped at 12 validators (0186–0196 + 0195b).
This patch adds `0197` (partition_archive_log) and corrects the combined vitest
`TEST_PATTERN` to cover both `src/__tests__/rls/` and `src/__tests__/migrations/`
subdirectories.

**Changes applied:**

| # | Change | Detail |
|---|--------|--------|
| 1 | Added registry entry | `"0197\|${SCRIPT_DIR}/staging_validate_0197.sh"` as 13th entry in `SCRIPT_REGISTRY` |
| 2 | Updated header comment | Dependency chain now ends `→ 0195b → 0196 → 0197` |
| 3 | Fixed vitest `TEST_PATTERN` | Widened from `src/__tests__/rls/` to `src/__tests__/(rls\|migrations)/` — ensures 0195b and 0197 tests (which live under `migrations/`) are included |
| 4 | Updated vitest log messages | Info message and summary label updated to `0186–0197` |

**Full validator registry (13 entries):**

```
0186  staging_validate_0186.sh   v_etax_compliance_dashboard view
0187  staging_validate_0187.sh   mv_etax_compliance_dashboard materialized view
0188  staging_validate_0188.sh   MV refresh-lag alert trigger
0189  staging_validate_0189.sh   v_mv_alert_history view
0190  staging_validate_0190.sh   v_etax_submission_health view
0191  staging_validate_0191.sh   v_etax_health_trend view
0192  staging_validate_0192.sh   mv_etax_health_trend + rpc_etax_health_trend_cached
0193  staging_validate_0193.sh   v_etax_full_health_summary view
0194  staging_validate_0194.sh   v_etax_org_risk_ranking view
0195  staging_validate_0195.sh   etax_risk_tier_state + fn_check_risk_tier_changes
0195b staging_validate_0195b.sh  pg_net HTTP POST dispatch + platform_config
0196  staging_validate_0196.sh   monthly partitioning on etax_submissions
0197  staging_validate_0197.sh   partition_archive_log audit table + RPCs
```

---

### Release Candidate Checklist — `release/15.0.0` RC-1

| Category | Item | Status |
|----------|------|--------|
| **Migrations** | 0000 multi-tenant schema | ✅ |
| | 0176 auto-journal on invoice approval | ✅ |
| | 0177 auto-receipt posting on payment_slip confirm | ✅ |
| | 0178 multi-tenant RLS hardening (pluralized tables) | ✅ |
| | 0179 multi-book dynamic support with `book_id` | ✅ |
| | 0180 overdue invoice detection + auto-notification | ✅ |
| | 0181 notification queue | ✅ |
| | 0182 `notification_settings` JSONB on `organizations` | ✅ |
| | 0183 eTax PDF download pipeline | ✅ |
| | 0184 eTax submission retry hardening | ✅ |
| | 0185 `etax_submissions` audit log | ✅ |
| | 0186 `v_etax_compliance_dashboard` view | ✅ |
| | 0187 `mv_etax_compliance_dashboard` materialized view + pg_cron | ✅ |
| | 0188 MV refresh-lag alert trigger | ✅ |
| | 0189 `v_mv_alert_history` view | ✅ |
| | 0190 `v_etax_submission_health` view | ✅ |
| | 0191 `v_etax_health_trend` (30-day daily trend) | ✅ |
| | 0192 `mv_etax_health_trend` + pg_cron + `rpc_etax_health_trend_cached` | ✅ |
| | 0193 `v_etax_full_health_summary` view | ✅ |
| | 0194 `v_etax_org_risk_ranking` cross-org risk ranking | ✅ |
| | 0195 `etax_risk_tier_state` + `fn_check_risk_tier_changes` pg_notify trigger | ✅ |
| | 0195b `fn_check_risk_tier_changes` pg_net HTTP POST patch + `platform_config` | ✅ |
| | 0196 monthly partition on `etax_submissions` (2024-01 → 2027-03) | ✅ |
| | 0197 `partition_archive_log` audit table + RPCs | ✅ |
| **Edge Functions** | `notify-overdue` — overdue invoice LINE/webhook alerts | ✅ |
| | `etax-submit-worker` — eTax submission queue processor + PDF download | ✅ |
| | `etax-risk-notify` — pg_notify consumer, CRITICAL tier LINE/webhook | ✅ |
| **Test Suites** | All migration test suites (0173–0197, 0195b) | ✅ |
| | `0195b_pgnet_notify.test.ts` (636 lines) | ✅ |
| | `0197_partition_archive_log.test.ts` (718 lines) | ✅ |
| | `EtaxComplianceDashboard.test.tsx` + `AccountingManagement.test.tsx` | ✅ |
| | `e2e/etax-compliance.spec.ts` + `e2e/accounting-management.spec.ts` | ✅ |
| **Staging Validators** | `staging_validate_0186.sh` through `staging_validate_0197.sh` (13 scripts) | ✅ |
| | `staging_validate_all.sh` master orchestrator (13 validators) | ✅ |
| | `preflight_db_reset.sh` with `--dry-run` flag | ✅ |
| | `etax_partition_lifecycle.sh` with `--dry-run` + `--execute` modes | ✅ |
| **Configuration** | `supabase/config.toml` — 6 pg_cron jobs + 3 edge function sections | ✅ |
| **UI** | `EtaxComplianceDashboard` React component | ✅ |
| | `AccountingManagement` React component | ✅ |
| | `public/etax-compliance-dashboard.html` standalone static dashboard | ✅ |
| | `src/routes/index.tsx` v0.13.0 with new UI routes | ✅ |
| **Documentation** | `docs/CHANGELOG_1400.md` through `docs/CHANGELOG_1530.md` | ✅ |
| | `docs/openapi_monolith_rpcs.yaml` v15.2.0 (14 paths, 28 schemas) | ✅ |
| | `docs/PROJECT_ROADMAP.md` | ✅ |
| **Git** | PR #74 `release/15.0.0 → main` — open, body updated | ✅ |
| | Tag `v14.8.0` on `release/15.0.0` HEAD | ✅ |

**RC-1 declared. No known blockers. Ready for final reviewer sign-off and merge.**

---

### Upgrade Path

No schema changes in this version. This is a scripts/tooling-only patch.

```bash
# No migration to run for 15.3.0
# Simply re-run the updated master validator:
./scripts/staging_validate_all.sh --dry-run   # smoke test
./scripts/staging_validate_all.sh             # full run
```

---

### What's Next (Phase 8 — Deployment)

See `docs/PROJECT_ROADMAP.md` Phase 8 for the full production deployment checklist:

1. Run `./scripts/preflight_db_reset.sh` on staging
2. Apply migrations in order: `0000 → 0176 → … → 0197 → 0195b`
3. Run `./scripts/staging_validate_all.sh` on staging — all 13 must PASS
4. Deploy Edge Functions: `supabase functions deploy --project-ref <ref>`
5. Merge PR #74 to `main` and tag `v15.0.0`
