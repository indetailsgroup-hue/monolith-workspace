"""Regenerate the final SHA256SUMS of the amended bundles for the REPORT lines only.

For every bundle: parse SHA256SUMS keeping each line's exact format (text or
binary marker, order, line ending), recompute only REPORT.{en,th}.{md,html},
and require that every other listed file still matches its recorded hash and
that SHA256SUMS.run is byte-identical to the base commit. Prints old -> new per
changed line. Writes only with --write.
usage: python reseal.py <repo> <base-commit> [--write]
"""
import hashlib
import re
import subprocess
import sys
from pathlib import Path

REPO, BASE = Path(sys.argv[1]), sys.argv[2]
WRITE = "--write" in sys.argv
BUNDLES = [
    "line-b12-catalog-fixture-2026-09-30",
    "line-b12-monolith-catalog-attempt2-2026-09-30",
    "line-ci-source-2026-09-30",
    "line-p010-catalog-2026-09-30",
    "line-p010-ci-hardening-green-2026-09-30",
    "line-p010-evidence-followup-2026-09-30",
    "line-p010-failclosed-green-2026-09-30",
    "line-p012-green-2026-09-30",
]
REPORTS = {f"REPORT.{l}.{e}" for l in ("en", "th") for e in ("md", "html")}
LINE = re.compile(r"^([0-9a-f]{64}) ([ *])(.+?)(\r?\n)?$")
fail = 0
for b in BUNDLES:
    d = REPO / "docs/governance/evidence" / b
    rel = f"docs/governance/evidence/{b}"
    run_now = (d / "SHA256SUMS.run").read_bytes() if (d / "SHA256SUMS.run").exists() else None
    if run_now is not None:
        run_base = subprocess.run(["git", "-C", str(REPO), "show", f"{BASE}:{rel}/SHA256SUMS.run"],
                                  capture_output=True, check=True).stdout
        print(f"{b}: SHA256SUMS.run identical to {BASE}: {run_now == run_base}")
        fail += run_now != run_base
    else:
        print(f"{b}: no SHA256SUMS.run in this bundle")
    raw = (d / "SHA256SUMS").read_bytes().decode("utf-8")
    out, seen = [], set()
    for line in raw.splitlines(keepends=True):
        m = LINE.match(line)
        if not m:
            raise SystemExit(f"{b}: unparsable line {line!r}")
        old, mark, name, eol = m.group(1), m.group(2), m.group(3), m.group(4) or ""
        actual = hashlib.sha256((d / name).read_bytes()).hexdigest()
        if name in REPORTS:
            seen.add(name)
            if actual != old:
                print(f"  {name}: {old} -> {actual}")
            out.append(f"{actual} {mark}{name}{eol}")
        else:
            if actual != old:
                print(f"  MISMATCH (not a REPORT): {name}")
                fail += 1
            out.append(line)
    if seen != REPORTS:
        print(f"  REPORT entries missing from SHA256SUMS: {sorted(REPORTS - seen)}")
        fail += 1
    if WRITE:
        (d / "SHA256SUMS").write_bytes("".join(out).encode("utf-8"))
print("RESULT:", "FAIL" if fail else "PASS")
sys.exit(1 if fail else 0)
