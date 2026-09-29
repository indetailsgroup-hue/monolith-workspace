#!/usr/bin/env python3
"""
validate_client_config.py
MONOLITH Platform — Client Configuration Validator
============================================================
Usage:
    python3 validate_client_config.py client_daph.json
    python3 validate_client_config.py client_swift.json

Validates that a MONOLITH client_<id>.json config file
contains all required fields with correct types and values.

Returns exit code 0 if ALL checks pass, 1 if any check fails.
============================================================
"""

import json
import sys
import os
from typing import Any


# ─── ANSI colours ──────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

PASS   = f"{GREEN}✅ PASS{RESET}"
FAIL   = f"{RED}❌ FAIL{RESET}"
WARN   = f"{YELLOW}⚠️  WARN{RESET}"


# ─── Result tracker ─────────────────────────────────────────────────────────────
results: list[tuple[str, str, str]] = []  # (check_name, status, message)


def check(name: str, condition: bool, fail_msg: str, warn_only: bool = False) -> bool:
    """Record a validation check result."""
    if condition:
        results.append((name, PASS, ""))
    else:
        status = WARN if warn_only else FAIL
        results.append((name, status, fail_msg))
    return condition


# ─── Helper: safe deep-get ────────────────────────────────────────────────────
def get_nested(obj: dict, *keys: str, default: Any = None) -> Any:
    """Safely retrieve a nested key from a dict."""
    cur = obj
    for k in keys:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(k, default)
        if cur is None:
            return default
    return cur


# ─── Validation sections ─────────────────────────────────────────────────────

def validate_top_level(cfg: dict) -> None:
    required_str_fields = [
        "client_id", "client_name", "domain",
        "language", "timezone",
    ]
    for field in required_str_fields:
        val = cfg.get(field)
        check(
            f"top_level.{field}",
            bool(val) and isinstance(val, str),
            f"Missing or empty required field: '{field}'"
        )

    # client_id must be lowercase alphanumeric
    cid = cfg.get("client_id", "")
    check(
        "top_level.client_id_format",
        bool(cid) and cid.isidentifier() and cid == cid.lower(),
        f"client_id '{cid}' must be lowercase identifier (e.g. 'daph', 'swift')"
    )

    # domain whitelist
    known_domains = {"interior_decoration", "logistics_delivery", "retail", "healthcare", "finance"}
    domain = cfg.get("domain", "")
    check(
        "top_level.domain_known",
        domain in known_domains,
        f"domain '{domain}' not in known domains {known_domains}",
        warn_only=True
    )


def validate_line(cfg: dict) -> None:
    line = cfg.get("line")
    if not check("line.exists", isinstance(line, dict), "Missing 'line' object"):
        return

    # Required string fields
    for field in ["channel_access_token", "channel_secret"]:
        val = line.get(field, "")
        check(
            f"line.{field}",
            bool(val) and isinstance(val, str),
            f"line.{field} is missing or empty"
        )

    # LIFF IDs — must have all 5
    liff = line.get("liff_ids")
    if check("line.liff_ids.exists", isinstance(liff, dict), "Missing 'line.liff_ids' object"):
        for key in ["status", "schedule", "gallery", "approval", "review"]:
            check(
                f"line.liff_ids.{key}",
                bool(liff.get(key)) and isinstance(liff.get(key), str),
                f"line.liff_ids.{key} is missing or empty"
            )

    # Rich Menu IDs — must have all 5
    rm = line.get("rich_menu_ids")
    if check("line.rich_menu_ids.exists", isinstance(rm, dict), "Missing 'line.rich_menu_ids' object"):
        for key in ["default", "project", "approval", "install", "complete"]:
            check(
                f"line.rich_menu_ids.{key}",
                bool(rm.get(key)) and isinstance(rm.get(key), str),
                f"line.rich_menu_ids.{key} is missing or empty"
            )

    # webhook_url must be present and start with https
    wh = line.get("webhook_url", "")
    check(
        "line.webhook_url",
        bool(wh) and wh.startswith("https://"),
        f"line.webhook_url missing or not HTTPS: '{wh}'"
    )


def validate_supabase(cfg: dict) -> None:
    sb = cfg.get("supabase")
    if not check("supabase.exists", isinstance(sb, dict), "Missing 'supabase' object"):
        return

    for field in ["url", "anon_key"]:
        val = sb.get(field, "")
        check(
            f"supabase.{field}",
            bool(val) and isinstance(val, str),
            f"supabase.{field} is missing or empty"
        )

    url = sb.get("url", "")
    check(
        "supabase.url_format",
        url.startswith("https://") and ".supabase.co" in url,
        f"supabase.url should be 'https://<project>.supabase.co', got: '{url}'",
        warn_only=True
    )


def validate_agents(cfg: dict) -> None:
    agents = cfg.get("agents")
    if not check("agents.exists", isinstance(agents, list), "Missing 'agents' list"):
        return

    check(
        "agents.min_count",
        len(agents) >= 1,
        "agents list must have at least 1 agent"
    )

    for i, agent in enumerate(agents):
        prefix = f"agents[{i}]"
        if not check(f"{prefix}.is_object", isinstance(agent, dict), f"{prefix} must be an object"):
            continue

        for field in ["id", "name", "role"]:
            val = agent.get(field, "")
            check(
                f"{prefix}.{field}",
                bool(val) and isinstance(val, str),
                f"{prefix}.{field} is missing or empty"
            )

        check(
            f"{prefix}.enabled",
            "enabled" in agent and isinstance(agent["enabled"], bool),
            f"{prefix}.enabled must be a boolean"
        )

        tools = agent.get("tools")
        check(
            f"{prefix}.tools",
            isinstance(tools, list) and len(tools) >= 1,
            f"{prefix}.tools must be a non-empty list"
        )

        mcp = agent.get("mcp_events")
        check(
            f"{prefix}.mcp_events",
            isinstance(mcp, list) and len(mcp) >= 1,
            f"{prefix}.mcp_events must be a non-empty list"
        )

        kpis = agent.get("kpis")
        check(
            f"{prefix}.kpis",
            isinstance(kpis, dict) and len(kpis) >= 1,
            f"{prefix}.kpis must be a non-empty object",
            warn_only=True
        )


def validate_pfmea(cfg: dict) -> None:
    pf = cfg.get("pfmea")
    if not check("pfmea.exists", isinstance(pf, dict), "Missing 'pfmea' object"):
        return

    for field in ["kb_file", "critical_sev_threshold"]:
        val = pf.get(field)
        check(
            f"pfmea.{field}",
            val is not None,
            f"pfmea.{field} is missing"
        )

    # critical_test_cases
    ctc = pf.get("critical_test_cases")
    if check("pfmea.critical_test_cases.exists",
             isinstance(ctc, list) and len(ctc) >= 1,
             "pfmea.critical_test_cases must be a non-empty list"):
        for j, tc in enumerate(ctc):
            prefix = f"pfmea.critical_test_cases[{j}]"
            if not isinstance(tc, dict):
                check(f"{prefix}", False, "must be an object")
                continue
            for field in ["id", "description", "score", "severity"]:
                check(
                    f"{prefix}.{field}",
                    tc.get(field) is not None,
                    f"{prefix}.{field} is missing"
                )
            # Score must be > 0
            score = tc.get("score")
            check(
                f"{prefix}.score_positive",
                isinstance(score, (int, float)) and score > 0,
                f"{prefix}.score must be a positive number, got: {score}"
            )

    # agent_step_mapping
    asm = pf.get("agent_step_mapping")
    check(
        "pfmea.agent_step_mapping",
        isinstance(asm, dict) and len(asm) >= 1,
        "pfmea.agent_step_mapping must be a non-empty object"
    )


def validate_field_app(cfg: dict) -> None:
    fa = cfg.get("field_app")
    if not check("field_app.exists", isinstance(fa, dict), "Missing 'field_app' object"):
        return

    for field in ["accent_color", "mcp_endpoint"]:
        val = fa.get(field, "")
        check(
            f"field_app.{field}",
            bool(val) and isinstance(val, str),
            f"field_app.{field} is missing or empty"
        )

    # accent_color must be hex
    ac = fa.get("accent_color", "")
    check(
        "field_app.accent_color_format",
        ac.startswith("#") and len(ac) in (4, 7),
        f"field_app.accent_color must be a hex color like '#5b4fcf', got: '{ac}'"
    )

    # mcp_endpoint must be HTTPS
    ep = fa.get("mcp_endpoint", "")
    check(
        "field_app.mcp_endpoint_https",
        ep.startswith("https://"),
        f"field_app.mcp_endpoint must be HTTPS, got: '{ep}'"
    )

    # checklist_items
    items = fa.get("checklist_items")
    if check("field_app.checklist_items.exists",
             isinstance(items, list) and len(items) >= 1,
             "field_app.checklist_items must be a non-empty list"):
        for k, item in enumerate(items):
            prefix = f"field_app.checklist_items[{k}]"
            if not isinstance(item, dict):
                check(f"{prefix}", False, "must be an object")
                continue
            for field in ["id", "label"]:
                check(
                    f"{prefix}.{field}",
                    bool(item.get(field)),
                    f"{prefix}.{field} is missing or empty"
                )
            check(
                f"{prefix}.required",
                "required" in item and isinstance(item["required"], bool),
                f"{prefix}.required must be a boolean"
            )


def validate_branding(cfg: dict) -> None:
    br = cfg.get("branding")
    if not check("branding.exists", isinstance(br, dict), "Missing 'branding' object"):
        return

    for field in ["primary_color", "accent_color", "font_family", "logo_url"]:
        val = br.get(field, "")
        check(
            f"branding.{field}",
            bool(val) and isinstance(val, str),
            f"branding.{field} is missing or empty"
        )

    # Color fields must be hex
    for color_field in ["primary_color", "accent_color"]:
        col = br.get(color_field, "")
        check(
            f"branding.{color_field}_format",
            col.startswith("#") and len(col) in (4, 7),
            f"branding.{color_field} must be hex like '#1f2d5a', got: '{col}'"
        )


# ─── Main ─────────────────────────────────────────────────────────────────────

def print_banner(filepath: str) -> None:
    print(f"\n{BOLD}{CYAN}══════════════════════════════════════════════════════{RESET}")
    print(f"{BOLD}{CYAN}  MONOLITH Client Config Validator{RESET}")
    print(f"{BOLD}{CYAN}══════════════════════════════════════════════════════{RESET}")
    print(f"  File : {BOLD}{filepath}{RESET}")
    print(f"  Size : {os.path.getsize(filepath):,} bytes")
    print(f"{CYAN}------------------------------------------------------{RESET}\n")


def print_results() -> tuple[int, int, int]:
    """Print all results. Returns (pass_count, fail_count, warn_count)."""
    pass_count = fail_count = warn_count = 0
    for name, status, msg in results:
        if "PASS" in status:
            pass_count += 1
        elif "FAIL" in status:
            fail_count += 1
        elif "WARN" in status:
            warn_count += 1

        line = f"  {status}  {name}"
        if msg:
            line += f"\n       {YELLOW}↳ {msg}{RESET}"
        print(line)
    return pass_count, fail_count, warn_count


def main() -> None:
    if len(sys.argv) < 2:
        print(f"{RED}Usage: python3 validate_client_config.py <path_to_client_config.json>{RESET}")
        sys.exit(1)

    filepath = sys.argv[1]
    if not os.path.isfile(filepath):
        print(f"{RED}Error: File not found: {filepath}{RESET}")
        sys.exit(1)

    # Load JSON
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except json.JSONDecodeError as e:
        print(f"{RED}Error: Invalid JSON — {e}{RESET}")
        sys.exit(1)

    print_banner(filepath)

    # Run all validations
    sections = [
        ("Top Level",    validate_top_level),
        ("LINE",         validate_line),
        ("Supabase",     validate_supabase),
        ("Agents",       validate_agents),
        ("PFMEA",        validate_pfmea),
        ("Field App",    validate_field_app),
        ("Branding",     validate_branding),
    ]

    for section_name, fn in sections:
        print(f"{BOLD}[{section_name}]{RESET}")
        before = len(results)
        fn(cfg)
        section_results = results[before:]
        for name, status, msg in section_results:
            short = name.split(".")[-1]  # show only leaf key for brevity
            line = f"  {status}  {short}"
            if msg:
                line += f"\n       {YELLOW}↳ {msg}{RESET}"
            print(line)
        print()

    # Summary
    print(f"{CYAN}══════════════════════════════════════════════════════{RESET}")
    pass_c = sum(1 for _, s, _ in results if "PASS" in s)
    fail_c = sum(1 for _, s, _ in results if "FAIL" in s)
    warn_c = sum(1 for _, s, _ in results if "WARN" in s)
    total  = len(results)

    print(f"  {BOLD}Total checks : {total}{RESET}")
    print(f"  {GREEN}Passed       : {pass_c}{RESET}")
    print(f"  {RED}Failed       : {fail_c}{RESET}")
    print(f"  {YELLOW}Warnings     : {warn_c}{RESET}")
    print(f"{CYAN}══════════════════════════════════════════════════════{RESET}")

    if fail_c == 0:
        print(f"\n  {BOLD}{GREEN}✅ ALL REQUIRED CHECKS PASSED — Config is valid!{RESET}")
        if warn_c > 0:
            print(f"  {YELLOW}⚠️  {warn_c} warning(s) — review recommended but not blocking{RESET}")
    else:
        print(f"\n  {BOLD}{RED}❌ {fail_c} REQUIRED CHECK(S) FAILED — Config is INVALID{RESET}")
        print(f"  Fix the failed fields above before deploying this client.\n")
        sys.exit(1)

    print()


if __name__ == "__main__":
    main()
