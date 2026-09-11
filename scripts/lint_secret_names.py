#!/usr/bin/env python3
"""lint_secret_names.py — validate GitHub Actions secret references against
the MODULE_SERVICE_CREDENTIAL_TYPE naming convention.

See docs/secrets-naming-convention.md for the full specification.

Exit codes:
  0  all secret references comply (or are allowlisted)
  1  one or more violations found
"""

import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).parent.parent
WORKFLOWS_DIR = REPO_ROOT / ".github" / "workflows"

# Matches ${{ secrets.NAME }}  (whitespace-flexible)
_SECRET_REF = re.compile(r"\$\{\{[ \t]*secrets\.([A-Za-z0-9_]+)[ \t]*\}\}")

# Names that pre-date the convention or are GitHub built-ins.
# Add here only after explicit discussion — do NOT silently grandfather new secrets.
ALLOWLIST: frozenset[str] = frozenset(
    {
        "GITHUB_TOKEN",          # GitHub built-in, auto-provisioned
        "DATABASE_URL",          # 2-segment grandfathered name
        "MIGRATION_BACKUP_KEY",  # 2-segment grandfathered name
    }
)

# ---------------------------------------------------------------------------
# Compliance check
# ---------------------------------------------------------------------------
# A name is compliant when ALL of:
#   1. Matches ^[A-Z][A-Z0-9_]+$  (uppercase letters / digits / underscores only)
#   2. Contains at least 2 underscores  →  ≥3 segments  →  MODULE_SERVICE_TYPE
#   3. No segment is empty  (no leading / trailing / consecutive underscores)


def is_compliant(name: str) -> bool:
    if name in ALLOWLIST:
        return True
    if not re.fullmatch(r"[A-Z][A-Z0-9_]+", name):
        return False
    segments = name.split("_")
    return len(segments) >= 3 and all(s for s in segments)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    violations: list[tuple[str, int, str]] = []  # (rel_path, lineno, secret_name)

    yaml_files = sorted(WORKFLOWS_DIR.glob("*.yml")) + sorted(
        WORKFLOWS_DIR.glob("*.yaml")
    )
    if not yaml_files:
        print(f"ERROR: no workflow files found under {WORKFLOWS_DIR}", file=sys.stderr)
        return 1

    for path in yaml_files:
        rel = str(path.relative_to(REPO_ROOT))
        for lineno, line in enumerate(
            path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            for match in _SECRET_REF.finditer(line):
                name = match.group(1)
                if not is_compliant(name):
                    violations.append((rel, lineno, name))

    if violations:
        print(f"\n[FAIL] Secret name violations ({len(violations)} found):\n")
        for filepath, lineno, name in violations:
            print(f"  {filepath}:{lineno}  ->  secrets.{name}")
        print(
            "\nExpected pattern: MODULE_SERVICE_CREDENTIAL_TYPE"
            "  (>=3 uppercase segments, e.g. MONOLITH_SUPABASE_URL)\n"
            "See docs/secrets-naming-convention.md for the allowlist and"
            " migration steps.\n"
            "To allowlist a grandfathered name edit ALLOWLIST in"
            " scripts/lint_secret_names.py and document the reason."
        )
        return 1

    scanned = len(yaml_files)
    print(
        f"[PASS] All secret references comply with MODULE_SERVICE_CREDENTIAL_TYPE"
        f" ({scanned} workflow file(s) scanned)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
