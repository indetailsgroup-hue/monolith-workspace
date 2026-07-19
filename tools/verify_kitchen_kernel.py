"""Produce repeatable verification evidence for the MONOLITH kitchen kernel.

This verifier intentionally uses only the Python standard library. It validates
the governed reference artifacts; it does not claim deployed or production
controls.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "artifacts" / "verification" / "kitchen-kernel-bootstrap-summary.json"
PACKAGE_SOURCE = ROOT / "packages" / "component-master" / "src"

EXPECTED_CONTEXTS = {
    "identity-tenancy",
    "product-configuration",
    "component-master",
    "cad-parametric-design",
    "geometry-kernel",
    "bom-costing",
    "manufacturing",
    "workflow",
    "procurement",
    "quality-field-service",
    "finance",
    "customer-partner",
    "ai-governance",
    "platform-api",
    "security-observability",
}

SECRET_PATTERNS = {
    "perplexity_api_key": re.compile(r"pplx-[A-Za-z0-9_-]{20,}"),
    "openai_api_key": re.compile(
        r"sk-(?:(?:proj|svcacct)-)?[A-Za-z0-9]{20,}"
    ),
    "github_token": re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),
    "aws_access_key": re.compile(r"AKIA[0-9A-Z]{16}"),
}


class Evidence:
    def __init__(self) -> None:
        self.checks: list[dict[str, Any]] = []

    def add(self, name: str, passed: bool, details: dict[str, Any]) -> None:
        self.checks.append({"name": name, "passed": passed, "details": details})

    @property
    def passed(self) -> bool:
        return all(check["passed"] for check in self.checks)


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def evidence_argument(argument: str) -> str:
    """Make command evidence portable without changing the executed command."""
    if argument == sys.executable:
        return "python"
    candidate = Path(argument)
    if candidate.is_absolute():
        try:
            return candidate.relative_to(ROOT).as_posix()
        except ValueError:
            return candidate.name
    return argument


def run(command: list[str]) -> dict[str, Any]:
    completed = subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    combined = completed.stdout + completed.stderr
    return {
        "command": [evidence_argument(argument) for argument in command],
        "exit_code": completed.returncode,
        "output": combined,
        "output_bytes": len(combined.encode("utf-8")),
        "output_sha256": hashlib.sha256(combined.encode("utf-8")).hexdigest(),
    }


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as source:
        return [json.loads(line) for line in source if line.strip()]


def check_commands(evidence: Evidence) -> None:
    tests = run(
        [
            sys.executable,
            "-m",
            "unittest",
            "discover",
            "-s",
            "tests",
            "-v",
        ]
    )
    test_match = re.search(r"Ran (\d+) tests?", tests["output"])
    test_count = int(test_match.group(1)) if test_match else None
    evidence.add(
        "unittest_full_suite",
        tests["exit_code"] == 0 and test_count == 27 and "OK" in tests["output"],
        {**tests, "test_count": test_count},
    )

    compile_result = run(
        [
            sys.executable,
            "-m",
            "compileall",
            "-q",
            str(PACKAGE_SOURCE),
            str(ROOT / "tests"),
            str(Path(__file__).resolve()),
        ]
    )
    evidence.add(
        "python_compile",
        compile_result["exit_code"] == 0,
        compile_result,
    )


def check_seed(evidence: Evidence) -> None:
    data_dir = ROOT / "data" / "component-master"
    json_paths = sorted(data_dir.rglob("*.json"))
    jsonl_paths = sorted(data_dir.rglob("*.jsonl"))
    parse_errors: list[dict[str, str]] = []
    for path in json_paths:
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            parse_errors.append({"path": relative(path), "error": type(error).__name__})
    for path in jsonl_paths:
        try:
            read_jsonl(path)
        except (OSError, json.JSONDecodeError) as error:
            parse_errors.append({"path": relative(path), "error": type(error).__name__})
    evidence.add(
        "component_master_json_parse",
        not parse_errors,
        {
            "json_files": [relative(path) for path in json_paths],
            "jsonl_files": [relative(path) for path in jsonl_paths],
            "errors": parse_errors,
        },
    )

    specs = read_jsonl(data_dir / "specs.jsonl")
    skus = read_jsonl(data_dir / "skus.jsonl")
    categories = Counter(
        "connector"
        if item["category"].startswith("connector.")
        else "hinge"
        if item["category"].startswith("hinge.")
        else "drawer-runner"
        if item["category"].startswith("drawer-runner.")
        else "other"
        for item in specs
    )
    spec_ids = [item["spec_id"] for item in specs]
    sku_ids = [item["sku_id"] for item in skus]
    invalid_fk = sorted(
        item["sku_id"] for item in skus if item["spec_id"] not in set(spec_ids)
    )
    expected_categories = {"connector": 15, "hinge": 2, "drawer-runner": 2}
    seed_passed = (
        len(specs) == 19
        and len(set(spec_ids)) == 19
        and len(skus) == 20
        and len(set(sku_ids)) == 20
        and dict(categories) == expected_categories
        and not invalid_fk
        and all(item["status"] == "Proposed" for item in specs)
    )
    evidence.add(
        "component_master_seed_contract",
        seed_passed,
        {
            "spec_count": len(specs),
            "sku_count": len(skus),
            "categories": dict(categories),
            "expected_categories": expected_categories,
            "invalid_sku_foreign_keys": invalid_fk,
            "verified_sku_count": sum(bool(item.get("verified")) for item in skus),
            "proposed_spec_count": sum(item["status"] == "Proposed" for item in specs),
        },
    )


def check_tenant_contract(evidence: Evidence) -> None:
    contract_dir = ROOT / "packages" / "identity-tenancy" / "contracts"
    errors: list[dict[str, str]] = []
    documents: dict[str, dict[str, Any]] = {}
    for path in sorted(contract_dir.glob("*.json")):
        try:
            documents[path.name] = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            errors.append({"path": relative(path), "error": type(error).__name__})
    policy = documents.get("tenant-boundary.schema.json", {}).get(
        "x-monolith-policy", {}
    )
    matrix = documents.get("isolation-test-matrix.json", {})
    expected_planes = {
        "database",
        "object-storage",
        "cache",
        "jobs",
        "events",
        "webhooks",
        "audit",
        "analytics-ai",
    }
    actual_planes = {case.get("plane") for case in matrix.get("negative_cases", [])}
    passed = (
        not errors
        and policy.get("isolation_model") == "Bridge"
        and policy.get("identity_model")
        == "global-identity+tenant-scoped-membership"
        and policy.get("customer_profile_scope") == "tenant-local"
        and policy.get("shared_kernel_write_authority")
        == "MONOLITH-governance-only"
        and policy.get("support_access", {}).get("mode") == "break-glass-only"
        and policy.get("status") == "Proposed"
        and actual_planes == expected_planes
    )
    evidence.add(
        "tenant_contract_contract",
        passed,
        {
            "parsed_files": sorted(documents),
            "errors": errors,
            "policy_status": policy.get("status"),
            "isolation_model": policy.get("isolation_model"),
            "negative_case_planes": sorted(actual_planes),
        },
    )


def check_contexts_and_docs(evidence: Evidence) -> None:
    actual_contexts = {
        path.name for path in (ROOT / "packages").iterdir() if path.is_dir()
    }
    missing_contexts = sorted(EXPECTED_CONTEXTS - actual_contexts)
    observed_non_context_packages = sorted(actual_contexts - EXPECTED_CONTEXTS)
    evidence.add(
        "bounded_context_inventory",
        not missing_contexts,
        {
            "expected_count": len(EXPECTED_CONTEXTS),
            "matched_count": len(EXPECTED_CONTEXTS & actual_contexts),
            "missing": missing_contexts,
            "observed_non_context_packages": observed_non_context_packages,
            "canonical_registry": "CONTEXT-MAP.md",
        },
    )

    required_groups = [
        ["CONTEXT.md", "CONTEXT.th.md", "CONTEXT.html", "CONTEXT.th.html"],
        [
            "CONTEXT-MAP.md",
            "CONTEXT-MAP.th.md",
            "CONTEXT-MAP.html",
            "CONTEXT-MAP.th.html",
        ],
        [
            "packages/identity-tenancy/README.en.md",
            "packages/identity-tenancy/README.th.md",
            "packages/identity-tenancy/README.en.html",
            "packages/identity-tenancy/README.th.html",
        ],
        [
            "docs/research/2026-07-19-kitchen-master-gap-analysis.en.md",
            "docs/research/2026-07-19-kitchen-master-gap-analysis.th.md",
            "docs/research/2026-07-19-kitchen-master-gap-analysis.en.html",
            "docs/research/2026-07-19-kitchen-master-gap-analysis.th.html",
        ],
        [
            "docs/superpowers/plans/2026-07-19-kitchen-knowledge-kernel-bootstrap.en.md",
            "docs/superpowers/plans/2026-07-19-kitchen-knowledge-kernel-bootstrap.th.md",
            "docs/superpowers/plans/2026-07-19-kitchen-knowledge-kernel-bootstrap.en.html",
            "docs/superpowers/plans/2026-07-19-kitchen-knowledge-kernel-bootstrap.th.html",
        ],
    ]
    for adr in ("001-tenant-boundary", "002-component-master-schema", "003-finish-library-ip", "005-boring-standard"):
        required_groups.append(
            [
                f"docs/adr/ADR-{adr}.en.md",
                f"docs/adr/ADR-{adr}.th.md",
                f"docs/adr/ADR-{adr}.en.html",
                f"docs/adr/ADR-{adr}.th.html",
            ]
        )
    report_group = [
        "docs/reports/2026-07-19-kitchen-kernel-bootstrap.en.md",
        "docs/reports/2026-07-19-kitchen-kernel-bootstrap.th.md",
        "docs/reports/2026-07-19-kitchen-kernel-bootstrap.en.html",
        "docs/reports/2026-07-19-kitchen-kernel-bootstrap.th.html",
    ]
    if any((ROOT / path).exists() for path in report_group):
        required_groups.append(report_group)
    missing = [path for group in required_groups for path in group if not (ROOT / path).is_file()]
    report_topology: dict[str, int] = {}
    report_parity = True
    if all((ROOT / path).is_file() for path in report_group):
        report_text = {
            "en": (ROOT / report_group[0]).read_text(encoding="utf-8"),
            "th": (ROOT / report_group[1]).read_text(encoding="utf-8"),
        }
        for language, text in report_text.items():
            report_topology[f"{language}_h2"] = len(
                re.findall(r"^## ", text, re.MULTILINE)
            )
            report_topology[f"{language}_h3"] = len(
                re.findall(r"^### ", text, re.MULTILINE)
            )
            report_topology[f"{language}_tables"] = len(
                re.findall(r"^\| ---", text, re.MULTILINE)
            )
        report_parity = report_topology == {
            "en_h2": 10,
            "en_h3": 7,
            "en_tables": 3,
            "th_h2": 10,
            "th_h3": 7,
            "th_tables": 3,
        }
    evidence.add(
        "bilingual_project_deliverables",
        not missing and report_parity,
        {
            "group_count": len(required_groups),
            "missing": missing,
            "implementation_report_topology": report_topology,
        },
    )

    html_paths = sorted(
        {
            ROOT / path
            for group in required_groups
            for path in group
            if path.endswith(".html")
        }
    )
    html_errors: list[dict[str, str]] = []
    for path in html_paths:
        text = path.read_text(encoding="utf-8")
        expected_lang = "th" if ".th.html" in path.name or path.name.endswith("th.html") else "en"
        if not text.lower().startswith("<!doctype html>"):
            html_errors.append({"path": relative(path), "error": "missing_doctype"})
        if f'<html lang="{expected_lang}"' not in text:
            html_errors.append({"path": relative(path), "error": "wrong_lang"})
        if "<title>" not in text or "</title>" not in text:
            html_errors.append({"path": relative(path), "error": "missing_title"})
        if "\ufffd" in text:
            html_errors.append({"path": relative(path), "error": "replacement_character"})
    evidence.add(
        "standalone_html",
        not html_errors,
        {"checked_count": len(html_paths), "errors": html_errors},
    )

    en_report = (
        ROOT / "docs" / "research" / "2026-07-19-kitchen-master-gap-analysis.en.md"
    ).read_text(encoding="utf-8")
    th_report = (
        ROOT / "docs" / "research" / "2026-07-19-kitchen-master-gap-analysis.th.md"
    ).read_text(encoding="utf-8")
    topology = {
        "en_h2": len(re.findall(r"^## ", en_report, re.MULTILINE)),
        "th_h2": len(re.findall(r"^## ", th_report, re.MULTILINE)),
        "en_h3": len(re.findall(r"^### ", en_report, re.MULTILINE)),
        "th_h3": len(re.findall(r"^### ", th_report, re.MULTILINE)),
        "en_tables": len(re.findall(r"^\| ---", en_report, re.MULTILINE)),
        "th_tables": len(re.findall(r"^\| ---", th_report, re.MULTILINE)),
        "en_links": len(re.findall(r"\]\(https://", en_report)),
        "th_links": len(re.findall(r"\]\(https://", th_report)),
    }
    evidence.add(
        "gap_report_parity",
        topology
        == {
            "en_h2": 14,
            "th_h2": 14,
            "en_h3": 22,
            "th_h3": 22,
            "en_tables": 9,
            "th_tables": 9,
            "en_links": 33,
            "th_links": 33,
        },
        topology,
    )


def check_adrs(evidence: Evidence) -> None:
    adr_dir = ROOT / "docs" / "adr"
    required_tokens = {
        "ADR-001-tenant-boundary.en.md": [
            "Bridge",
            "one global `actor_id`",
            "break-glass",
            "7 days",
            "RPO",
            "FORCE ROW LEVEL SECURITY",
            "home_region",
            "consulted pilot",
        ],
        "ADR-002-component-master-schema.en.md": [
            "19",
            "MONOLITH governance",
            "Daph",
            "Proposed",
        ],
        "ADR-003-finish-library-ip.en.md": [
            "canonical finish taxonomy",
            "supplier-native",
            "physical equivalence",
            "Proposed",
        ],
        "ADR-005-boring-standard.en.md": [
            "MON-BS-001",
            "internal",
            "not described as an ISO",
            "manufacturing",
            "Proposed",
        ],
    }
    missing_tokens: list[dict[str, str]] = []
    for filename, tokens in required_tokens.items():
        text = (adr_dir / filename).read_text(encoding="utf-8")
        lowered = text.lower()
        for token in tokens:
            if token.lower() not in lowered:
                missing_tokens.append({"file": filename, "token": token})
    evidence.add(
        "adr_decision_contract",
        not missing_tokens,
        {"checked_files": sorted(required_tokens), "missing_tokens": missing_tokens},
    )


def iter_secret_scan_paths() -> list[Path]:
    roots = [
        ROOT / "packages",
        ROOT / "data" / "component-master",
        ROOT / "tests",
        ROOT / "docs" / "adr",
        ROOT / "docs" / "research" / "2026-07-19-kitchen-master-gap-analysis.en.md",
        ROOT / "docs" / "research" / "2026-07-19-kitchen-master-gap-analysis.th.md",
        ROOT / "docs" / "reports",
        ROOT / "docs" / "superpowers" / "plans",
        ROOT / "CONTEXT.md",
        ROOT / "CONTEXT.th.md",
        ROOT / "CONTEXT-MAP.md",
        ROOT / "CONTEXT-MAP.th.md",
        Path(__file__).resolve(),
    ]
    paths: set[Path] = set()
    for root in roots:
        if root.is_file():
            paths.add(root)
        elif root.is_dir():
            for path in root.rglob("*"):
                if path.is_file() and path.suffix.lower() in {
                    ".py",
                    ".json",
                    ".jsonl",
                    ".md",
                    ".html",
                    ".toml",
                }:
                    paths.add(path)
    return sorted(paths)


def check_secrets(evidence: Evidence) -> None:
    findings: list[dict[str, str]] = []
    paths = iter_secret_scan_paths()
    for path in paths:
        text = path.read_text(encoding="utf-8", errors="replace")
        for label, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                findings.append({"path": relative(path), "pattern": label})
    evidence.add(
        "high_confidence_secret_scan",
        not findings,
        {"checked_file_count": len(paths), "findings_without_values": findings},
    )


def check_git(evidence: Evidence) -> None:
    status = run(["git", "status", "--short", "--branch"])
    head = run(["git", "rev-parse", "--verify", "HEAD"])
    head_exists = head["exit_code"] == 0
    staged = run(
        ["git", "diff", "--cached", "--name-only", "HEAD"]
        if head_exists
        else ["git", "ls-files", "--stage"]
    )
    remotes = run(["git", "remote"])
    branch = run(["git", "branch", "--show-current"])
    lines = [line for line in status["output"].splitlines() if line.strip()]
    staged_paths = [line for line in staged["output"].splitlines() if line.strip()]
    remote_names = [line for line in remotes["output"].splitlines() if line.strip()]
    branch_name = branch["output"].strip()
    bootstrap_source = not head_exists and not staged_paths and not remote_names
    publication_worktree = (
        head_exists
        and not staged_paths
        and branch_name == "agent/kitchen-kernel-bootstrap"
        and "origin" in remote_names
    )
    mode = (
        "bootstrap-source"
        if bootstrap_source
        else "publication-worktree" if publication_worktree else "unsupported"
    )
    evidence.add(
        "git_bootstrap_state",
        status["exit_code"] == 0
        and branch["exit_code"] == 0
        and staged["exit_code"] == 0
        and remotes["exit_code"] == 0
        and (bootstrap_source or publication_worktree),
        {
            "mode": mode,
            "status_command": status["command"],
            "status_exit_code": status["exit_code"],
            "branch_line": lines[0] if lines else None,
            "branch_name": branch_name or None,
            "status_line_count": len(lines),
            "head_exists": head_exists,
            "staged_path_count": len(staged_paths),
            "remote_count": len(remote_names),
            "note": (
                "Source bootstrap is uncommitted and remote-free."
                if bootstrap_source
                else "Publication worktree is based on origin/main, isolated on the approved branch, and has no staged paths at evidence capture."
            ),
        },
    )


def main() -> int:
    evidence = Evidence()
    check_commands(evidence)
    check_seed(evidence)
    check_tenant_contract(evidence)
    check_contexts_and_docs(evidence)
    check_adrs(evidence)
    check_secrets(evidence)
    check_git(evidence)

    payload = {
        "schema_version": "1.0.0",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "scope": "Governed reference-kernel bootstrap; no production or ratification claim",
        "repository_root": evidence_argument(str(ROOT)),
        "python_executable": evidence_argument(sys.executable),
        "overall_passed": evidence.passed,
        "check_count": len(evidence.checks),
        "passed_count": sum(check["passed"] for check in evidence.checks),
        "failed_count": sum(not check["passed"] for check in evidence.checks),
        "checks": evidence.checks,
        "residual_limitations": [
            "ADRs and fixtures are Proposed and are not deployed runtime evidence.",
            "All 19 component specs are Proposed; only 2 of 20 SKU records are primary-source Verified.",
            "MON-BS-001 and all variants prohibit manufacturing release.",
            "Finish mappings do not establish physical equivalence.",
            "Supplier/product/model completeness remains unknown without contracted feeds.",
        ],
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "overall_passed": payload["overall_passed"],
                "check_count": payload["check_count"],
                "passed_count": payload["passed_count"],
                "failed_count": payload["failed_count"],
                "output": relative(OUTPUT),
            },
            ensure_ascii=False,
        )
    )
    return 0 if evidence.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
