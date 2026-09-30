"""P0-10 evidence commit gate. Exit 0 only when every check passes.

Index mode (before commit):  gate-p010-commit.py <bundle-dir>
Commit mode (after commit):  gate-p010-commit.py <bundle-dir> --rev <commit>

Checks: the change set touches only this bundle; every bundle file is present;
SHA256SUMS matches disk bytes and Git blobs; SHA256SUMS.run (written by the
runner) still matches the raw run outputs; the in-run exact-credential scan
passed; and a pattern scan of the Git blobs finds no credential-shaped value.
"""
import hashlib
import pathlib
import re
import subprocess
import sys

bundle = pathlib.Path(sys.argv[1]).as_posix().rstrip("/")
rev = sys.argv[3] if len(sys.argv) == 4 and sys.argv[2] == "--rev" else None
failures = []


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, check=True).stdout


def check(ok, message):
    print(("PASS: " if ok else "FAIL: ") + message)
    if not ok:
        failures.append(message)


def blob(path):
    return git("show", f"{rev}:{path}" if rev else f":{path}")


if rev:
    changed = git("diff-tree", "--no-commit-id", "--name-only", "-r", rev).decode().split()
    parents = git("rev-list", "--parents", "-n", "1", rev).decode().split()
    check(len(parents) == 2, f"{rev} has exactly one parent")
else:
    changed = git("diff", "--cached", "--name-only").decode().split()
check(bool(changed), "change set is not empty")
outside = [p for p in changed if not p.startswith(bundle + "/")]
check(not outside, f"change set touches only {bundle}/ (outside: {outside})")

disk = sorted(p.relative_to(pathlib.Path(bundle)).as_posix()
              for p in pathlib.Path(bundle).rglob("*") if p.is_file())
check(sorted(p[len(bundle) + 1:] for p in changed) == disk,
      f"all {len(disk)} bundle files are in the change set and nothing else")

sums = {}
for line in pathlib.Path(bundle, "SHA256SUMS").read_text(encoding="utf-8").splitlines():
    digest, name = line.split(maxsplit=1)
    sums[name.lstrip("*")] = digest
check(sorted(sums) == sorted(n for n in disk if n != "SHA256SUMS"),
      f"SHA256SUMS lists every bundle file except itself ({len(sums)} entries)")
bad_disk = [n for n, d in sums.items() if hashlib.sha256(pathlib.Path(bundle, n).read_bytes()).hexdigest() != d]
check(not bad_disk, f"SHA256SUMS matches working-tree bytes (mismatch: {bad_disk})")
bad_blob = [n for n, d in sums.items() if hashlib.sha256(blob(f"{bundle}/{n}")).hexdigest() != d]
check(not bad_blob, f"SHA256SUMS matches {'commit ' + rev if rev else 'staged'} Git blobs byte-for-byte (mismatch: {bad_blob})")

run_sums = {}
for line in pathlib.Path(bundle, "SHA256SUMS.run").read_text(encoding="utf-8").splitlines():
    digest, name = line.split(maxsplit=1)
    run_sums[name.lstrip("*")] = digest
changed_since_run = [n for n, d in run_sums.items() if sums.get(n) != d]
check(not changed_since_run, f"{len(run_sums)} raw run outputs unchanged since the runner wrote SHA256SUMS.run (changed: {changed_since_run})")

scan = pathlib.Path(bundle, "07-credential-scan.txt").read_text(encoding="utf-8")
check("PASS: positive control" in scan and "PASS: no generated credential bytes" in scan,
      "in-run exact-bytes credential scan passed with its positive control")

# Credential-shaped patterns. Placeholders such as ${PW} and [REDACTED] are allowed.
patterns = {
    "jwt": re.compile(rb"eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"),
    "private_key": re.compile(rb"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "supabase_secret_key": re.compile(rb"sb_secret_[A-Za-z0-9_-]{16,}"),
    "uri_password": re.compile(rb"[a-z][a-z0-9+.-]*://[^/\s:@'\"]+:([^@\s/'\"]+)@"),
    "assigned_secret": re.compile(rb"(?i)(?:password|passwd|secret|api[_-]?key|token)[\"']?\s*[=:]\s*[\"']?([A-Za-z0-9+/_.-]{16,})"),
}
placeholder = re.compile(rb"^(\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\[REDACTED\])$")
seg = "Aa0" * 4
controls = {
    "jwt": ("eyJ" + seg + ".eyJ" + seg + "." + seg).encode(),
    "private_key": ("-----BEGIN " + "RSA PRIVATE KEY-----").encode(),
    "supabase_secret_key": ("sb_" + "secret_" + seg * 2).encode(),
    "uri_password": ("postgres://u:" + seg + "@h").encode(),
    "assigned_secret": ("pass" + "word=" + seg * 2).encode(),
}


def findings(data):
    out = []
    for name, rx in patterns.items():
        for m in rx.finditer(data):
            value = m.group(1) if m.groups() else m.group(0)
            if not placeholder.match(value):
                out.append(name)
    return out


check(all(findings(c) for c in controls.values()), "pattern scanner positive controls all detected")
hits = {n: findings(blob(f"{bundle}/{n}")) for n in disk}
hits = {n: sorted(set(h)) for n, h in hits.items() if h}
check(not hits, f"no credential-shaped value in {len(disk)} Git blobs (findings: {hits})")

print("RESULT:", "GATE PASS" if not failures else f"GATE FAIL ({len(failures)} check(s))")
sys.exit(1 if failures else 0)
