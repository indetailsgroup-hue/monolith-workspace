"""List the pre- and post-amendment sha256 of every amended REPORT file (round 1,
commit 48b72d4c7) and prove each pre-amendment hash equals the bytes of the
blob at the base a97c3c847. Read-only; prints to stdout.
usage: python pre_amendment_hashes.py   (run from the repository root)"""
import hashlib
import subprocess
import sys

BASE = "a97c3c8479a5fcbff9fb134e0e661f7f0d828a8e"
AMENDED = "48b72d4c7c3f0d3bab197cb19483ca973807add2"
BUNDLES = [
    "line-b12-catalog-fixture-2026-09-30", "line-b12-monolith-catalog-attempt2-2026-09-30",
    "line-ci-source-2026-09-30", "line-p010-catalog-2026-09-30", "line-p010-ci-hardening-green-2026-09-30",
    "line-p010-evidence-followup-2026-09-30", "line-p010-failclosed-green-2026-09-30", "line-p012-green-2026-09-30",
]
REPORTS = [f"REPORT.{l}.{e}" for l in ("en", "th") for e in ("md", "html")]


def blob(rev, path):
    return subprocess.run(["git", "-c", "core.longpaths=true", "cat-file", "blob", f"{rev}:{path}"],
                          capture_output=True, check=True).stdout


def sums(rev, bundle):
    out = {}
    for line in blob(rev, f"docs/governance/evidence/{bundle}/SHA256SUMS").decode().splitlines():
        digest, name = line.split(maxsplit=1)
        out[name.lstrip("*")] = digest
    return out


bad = 0
print(f"base (pre-amendment): {BASE}")
print(f"amendment commit:     {AMENDED}")
print("bundle | file | pre-amendment sha256 | post-amendment sha256 | pre equals base blob | post equals amended blob")
for b in BUNDLES:
    old, new = sums(BASE, b), sums(AMENDED, b)
    for r in REPORTS:
        path = f"docs/governance/evidence/{b}/{r}"
        pre_ok = hashlib.sha256(blob(BASE, path)).hexdigest() == old[r]
        post_ok = hashlib.sha256(blob(AMENDED, path)).hexdigest() == new[r]
        bad += (not pre_ok) + (not post_ok) + (old[r] == new[r])
        print(f"{b} | {r} | {old[r]} | {new[r]} | {pre_ok} | {post_ok}")
print(f"entries: {len(BUNDLES) * len(REPORTS)}; problems: {bad}")
sys.exit(1 if bad else 0)
