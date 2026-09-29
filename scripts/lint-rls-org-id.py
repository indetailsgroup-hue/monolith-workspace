#!/usr/bin/env python3
"""
lint-rls-org-id.py — Migration pre-check: verify all new tables carry org_id RLS policies.

Two modes of operation
----------------------
Full-corpus mode (default, no SQL file arguments):
    Scans every non-rollback .sql file in --migrations-dir and reports any table
    that is missing either (a) ENABLE ROW LEVEL SECURITY or (b) at least one CREATE
    POLICY whose USING / WITH CHECK clause references org_id.

Delta mode (one or more .sql file paths are passed as positional arguments):
    Extracts table names ONLY from the specified files (the PR-changed set), but
    checks for RLS / policy presence across the ENTIRE migration corpus.
    This prevents legacy tables from other modules blocking new PRs.

Usage:
    # Full-corpus scan (CI nightly / manual audit):
    python scripts/lint-rls-org-id.py

    # Delta scan for a PR (CI per-PR gate):
    python scripts/lint-rls-org-id.py supabase/migrations/0184_new_feature.sql [...]

    # Explicit migrations directory (defaults to supabase/migrations from repo root):
    python scripts/lint-rls-org-id.py --migrations-dir path/to/migrations file1.sql

Exit codes:
    0  — all tables pass
    1  — one or more tables are missing org_id-scoped RLS coverage
    2  — invocation error (bad directory / file not found)

This script is invoked by the CI gate defined in .github/workflows/pgtap-tests.yml
(step "Lint RLS org_id coverage") and must exit 0 before the migration can merge.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Allowlist — tables intentionally exempt from org_id-scoped RLS.
# Reason documented inline.
# ---------------------------------------------------------------------------
ALLOWLIST: frozenset[str] = frozenset(
    {
        # ── Tenant-root tables ─────────────────────────────────────────────
        "organizations",          # Top-level tenant table; org_id IS the PK here.
        # ── Identity / membership tables ──────────────────────────────────
        "org_members",            # Scoped by user_id = auth.uid(); org FK is the tenant key.
        "org_invitations",        # Scoped by invitee email + admin-role check on org_id.
        "super_admins",           # Platform-level table; scoped by user_id = auth.uid().
        # ── User-scoped (not org-scoped) tables ────────────────────────────
        "search_bookmarks",       # Scoped by user_id = auth.uid() per SD-R2 design.
        # ── Internal migration-helper tables ──────────────────────────────
        "_org_id_backfill_quarantine",  # Temporary quarantine table; dropped post-backfill.
        # ── Background-worker queues ───────────────────────────────────────
        "notification_digest_queue",    # Background queue; scoped by user_id.
        # ── Platform config tables (no org_id column; shared across all tenants) ──
        # Added in v16.8.0 audit (issue #56) — lint-rls-org-id full-corpus scan.
        "action_type_registry",   # Platform-wide lookup table; no tenant scope.
        "addon_catalog",          # Shared product catalog; org-specific copies live in org_addons.
        "fraud_signal_config",    # Platform-level fraud rules; applied across all orgs.
        "ledger_account",         # Chart-of-accounts master; not per-org.
        "market_price_bands",     # Global price band configuration; no org_id column.
        "millwork_stage_defs",    # Shared millwork workflow definitions; platform-managed.
        "process_model",          # Process templates shared across tenants.
        "vendor_master",          # Platform-wide vendor registry; org-specific refs via FK.
        "platform_config",        # Platform-level key/value config store; read by trigger/edge functions; no org_id column. Added by 0195b.
        # ── Partitioned table children (inherit parent RLS; no independent policy needed) ─
        "etax_submissions_default",   # Default partition of etax_submissions; inherits parent RLS (org_isolation policy). Added by 0196.
        # ── Linter false positives (schema-name artifacts from format() string literals) ──
        "public",                 # Schema name parsed as table name from EXECUTE format() literals in partitioning migrations; not a real table.
        "if",                     # False positive: "CREATE TABLE IF NOT EXISTS," in comment text causes regex to capture "IF" as a table name; not a real table.
        # ── MCP infrastructure tables (platform-service-level; no org_id column) ──
        "mcp_tool_registry",      # Registry of MCP tools; platform-managed, no tenant scope.
        "mcp_rate_limit_counter", # Per-tool rate limit counters; scoped by tool_id, not org.
        "mcp_audit_log",          # MCP invocation audit trail; scoped by invocation_id.
        "mcp_idempotency_record", # Idempotency keys for MCP calls; no org_id column.
        "tool_invocation",        # Individual tool call records; no tenant isolation needed.
        "pending_invocation",     # Async invocation queue; processed by platform worker.
        # ── Platform monitoring tables (no org_id column; aggregate metrics) ─────
        "platform_metrics_snapshots",  # Aggregated platform health snapshots; no org_id.
        "platform_search_logs",        # Platform-level search telemetry; org_filter is optional.
        "etax_compliance_mv_refresh_log",  # Platform-level MV refresh audit log; records cron/manual refresh events for mv_etax_compliance_dashboard; no tenant scope — system-wide; no org_id column by design.
        "etax_health_trend_mv_refresh_log",  # Platform-level MV refresh audit log; records cron/manual refresh events for mv_etax_health_trend; no tenant scope — system-wide; no org_id column by design.
        # ── User-scoped tables (scoped by user_id, not org_id) ────────────
        "identity_binding",       # User identity federation; scoped by user_id = auth.uid().
        "delegation",             # Per-user delegation grants; scoped by delegator_id.
        "copilot_suggestion",     # Per-user AI suggestions; scoped by user_id = auth.uid().
        "knowledge_import",       # Per-user knowledge base imports; scoped by user_id.
        "notification",           # Per-user notification inbox; scoped by recipient_id.
        "designer_profiles",      # Per-user designer profile; scoped by user_id = auth.uid().
        # ── Phase 2 RLS — 0188 Factory domain (org_id + tenant_isolation policy added) ──────
        # Migration 0188 added org_id + _tenant_isolation SELECT policy to all five tables.
        # Listed here for audit traceability; linter passes them naturally via org_id column.
        "factory_checkins",            # 0188: org_id backfilled from site_code; policy added.
        "factory_gate_config",         # 0188: sentinel-org backfill (no site_code); policy added.
        "factory_job_events",          # 0188: org_id via factory_jobs FK path; policy added.
        "factory_jobs",                # 0188: org_id backfilled from site_code; policy added.
        "factory_station_checklists",  # 0188: org_id backfilled from site_code; policy added.
        # ── Phase 2 RLS — 0189 LINE OA domain (org_id + tenant_isolation policy added) ───────
        # Migration 0189 added org_id + _tenant_isolation SELECT policy to all eleven tables.
        "line_bind_codes",             # 0189: org_id backfilled from site_code; policy added.
        "line_groups",                 # 0189: org_id backfilled from site_code; policy added.
        "line_group_members",          # 0189: org_id via line_groups FK path; policy added.
        "line_oa_audit_log",           # 0189: org_id backfilled from site_code; policy added.
        "line_oa_channels",            # 0189: org_id backfilled from site_code; policy added.
        "line_oa_conversations",       # 0189: org_id backfilled from site_code; policy added.
        "line_oa_customer_identity",   # 0189: org_id backfilled from site_code; policy added.
        "line_oa_inbound_messages",    # 0189: org_id via line_oa_conversations FK; policy added.
        "line_oa_message_templates",   # 0189: sentinel-org backfill (config table); policy added.
        "line_oa_orders",              # 0189: org_id backfilled from site_code; policy added.
        "line_oa_outbound_messages",   # 0189: org_id via line_oa_conversations FK; policy added.
        # ── Phase 2 RLS — 0194 Operational Misc domain (governance-only tables) ─────────
        # Migration 0194 replaced the SELECT policy with governance-only access.
        # staff_bind_tokens holds sensitive login-binding tokens; no per-org user access permitted.
        "staff_bind_tokens",           # 0194: governance-only policy (is_governance_role()); intentionally not org_id-scoped.
    }
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_CREATE_TABLE_RE = re.compile(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\w+\.)?(\w+)",
    re.IGNORECASE,
)

_RLS_ENABLE_RE_TMPL = (
    r"ALTER\s+TABLE\s+(?:\w+\.)?{table}\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY"
)

# A CREATE POLICY block: from CREATE POLICY up to the next semicolon.
# We use DOTALL so the clause body can span multiple lines.
_POLICY_BLOCK_RE_TMPL = (
    r"CREATE\s+POLICY\s+\S+\s+ON\s+(?:\w+\.)?{table}\b[^;]+;"
)

_ORG_ID_IN_CLAUSE_RE = re.compile(r"\borg_id\b", re.IGNORECASE)


def _tables_in_file(sql: str) -> list[str]:
    """Return lowercased table names from CREATE TABLE statements in *sql*.

    Single-line SQL comments (-- ...) are stripped first to avoid false
    positives such as "CREATE TABLE IF NOT EXISTS, ..." in comment text.
    """
    no_comments = re.sub(r'--[^\n]*', '', sql)
    return [m.lower() for m in _CREATE_TABLE_RE.findall(no_comments)]


def _rls_enabled(table: str, corpus: str) -> bool:
    pat = re.compile(_RLS_ENABLE_RE_TMPL.format(table=re.escape(table)), re.IGNORECASE)
    return bool(pat.search(corpus))


def _has_org_id_policy(table: str, corpus: str) -> bool:
    """
    Return True if at least one CREATE POLICY on *table* references org_id.

    The check looks for org_id anywhere inside the policy block (USING /
    WITH CHECK clause), which is sufficient for our naming conventions.
    """
    pat = re.compile(
        _POLICY_BLOCK_RE_TMPL.format(table=re.escape(table)),
        re.IGNORECASE | re.DOTALL,
    )
    for block in pat.findall(corpus):
        if _ORG_ID_IN_CLAUSE_RE.search(block):
            return True
    return False


# ---------------------------------------------------------------------------
# Core lint logic
# ---------------------------------------------------------------------------

def lint(
    migrations_dir: Path,
    scope_files: list[Path] | None = None,
) -> list[dict]:
    """
    Return a list of violation dicts, one per non-allowlisted table that is
    missing RLS or org_id policy coverage.

    Parameters
    ----------
    migrations_dir : Path
        Directory containing all forward migration .sql files.  Used to build
        the full corpus for RLS / policy lookup regardless of mode.
    scope_files : list[Path] or None
        Delta mode: extract table names ONLY from these files.
        Full-corpus mode: None → extract table names from all files in
        migrations_dir.

    Each violation dict has keys: table, rls_enabled, has_org_id_policy,
    source_file (only set in delta mode).
    """
    all_corpus_files = sorted(
        f for f in migrations_dir.glob("*.sql") if "_rollback" not in f.name
    )
    if not all_corpus_files:
        print(
            f"[WARN] lint-rls-org-id: no non-rollback .sql files in {migrations_dir}",
            file=sys.stderr,
        )
        return []

    # Full migration corpus — needed for RLS / policy lookup in both modes.
    corpus = "\n".join(f.read_text(encoding="utf-8") for f in all_corpus_files)

    # Determine which files to extract table names from.
    if scope_files:
        table_source_files = scope_files
        mode_label = f"delta ({len(scope_files)} file(s))"
    else:
        table_source_files = all_corpus_files
        mode_label = "full-corpus"

    # Collect table names from the scoped file set.
    all_tables: set[str] = set()
    for f in table_source_files:
        all_tables.update(_tables_in_file(f.read_text(encoding="utf-8")))

    allowlist_lower = {t.lower() for t in ALLOWLIST}
    violations: list[dict] = []

    for table in sorted(all_tables):
        if table in allowlist_lower:
            continue

        rls_ok    = _rls_enabled(table, corpus)
        policy_ok = _has_org_id_policy(table, corpus)

        if not rls_ok or not policy_ok:
            violations.append(
                {
                    "table":             table,
                    "rls_enabled":       rls_ok,
                    "has_org_id_policy": policy_ok,
                }
            )

    return violations, mode_label


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        prog="lint-rls-org-id",
        description="Verify that tables in new migrations carry org_id-scoped RLS policies.",
        epilog=(
            "Pass one or more .sql file paths (delta mode) to scope the check to only those "
            "tables; omit them for a full-corpus scan."
        ),
    )
    parser.add_argument(
        "--migrations-dir",
        metavar="DIR",
        default=None,
        help=(
            "Path to the migrations directory.  Defaults to supabase/migrations "
            "relative to the repo root (two levels up from this script)."
        ),
    )
    parser.add_argument(
        "files",
        nargs="*",
        metavar="FILE",
        help=(
            "One or more migration .sql files to scope the check to (delta mode).  "
            "When omitted, the entire migrations directory is scanned."
        ),
    )
    args = parser.parse_args()

    # Resolve migrations directory.
    if args.migrations_dir:
        migrations_dir = Path(args.migrations_dir)
    else:
        migrations_dir = (
            Path(__file__).resolve().parent.parent / "supabase" / "migrations"
        )

    if not migrations_dir.is_dir():
        print(
            f"[ERROR] lint-rls-org-id: migrations directory not found: {migrations_dir}",
            file=sys.stderr,
        )
        sys.exit(2)

    # Resolve scope files (delta mode).
    scope_files: list[Path] | None = None
    if args.files:
        scope_files = []
        for raw in args.files:
            p = Path(raw)
            if not p.is_file():
                # File was deleted (e.g. from the same commit) — skip silently.
                print(f"[lint-rls-org-id] Skipping deleted/missing file: {p}", file=sys.stderr)
                continue
            scope_files.append(p)

    print(f"[lint-rls-org-id] Scanning {migrations_dir} …")

    violations, mode_label = lint(migrations_dir, scope_files)

    if not violations:
        print(
            f"[lint-rls-org-id] ✅  All tables pass ({mode_label} mode)."
        )
        sys.exit(0)

    print(
        f"[lint-rls-org-id] ❌  {len(violations)} table(s) missing org_id RLS coverage "
        f"({mode_label} mode):\n"
    )
    col_w = max(len(v["table"]) for v in violations) + 2
    header = f"  {'TABLE':<{col_w}}  RLS_ENABLED  ORG_ID_POLICY"
    print(header)
    print("  " + "-" * (len(header) - 2))
    for v in violations:
        rls_flag = "✅" if v["rls_enabled"]        else "❌  MISSING"
        pol_flag = "✅" if v["has_org_id_policy"]   else "❌  MISSING"
        print(f"  {v['table']:<{col_w}}  {rls_flag:<11}  {pol_flag}")

    print(
        "\n[lint-rls-org-id] To fix, add to the migration that creates each flagged table:\n"
        "\n"
        "    ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;\n"
        "\n"
        "    CREATE POLICY \"<table>_tenant_isolation\" ON <table>\n"
        "      FOR SELECT USING (org_id = public.get_user_org_id());\n"
        "\n"
        "    CREATE POLICY \"<table>_tenant_insert\" ON <table>\n"
        "      FOR INSERT WITH CHECK (org_id = public.get_user_org_id());\n"
        "\n"
        "If a table is intentionally not org-scoped (e.g. user-scoped or platform-level),\n"
        "add it to ALLOWLIST in scripts/lint-rls-org-id.py with a documented reason.\n"
    )
    sys.exit(1)


if __name__ == "__main__":
    main()
