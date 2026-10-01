"""Excerpt GitHub Actions results for PR #133 (read-only gh API calls).
For each run: URL, head sha, event, conclusion; for each listed job: conclusion,
sha256 of the full job log as downloaded now, and the log lines matching that
job's patterns (timestamps kept). Writes the excerpt to stdout.
usage: python ci_excerpt.py"""
import hashlib
import json
import re
import subprocess
import sys

REPO = "indetailsgroup-hue/monolith-workspace"
RUNS = {
    "36748427203": {"apply migrations + pgTAP invariants": [
        r"^\S+ [a-z0-9_]+: (pass|FAIL) \(plan", r"FAILED: \d+ of \d+ suites", r"PASS claim-race", r"incomplete-results",
        r'"(linePass|fullPass|migrationsApplied|commit|provenanceComplete)"']},
    "36748427202": {
        "claim linters (pinned governance baseline)": [r"unevidenced absence claim\(s\) beyond", r"allowlisted debt", r"uncorroborated certification", r"CLAIM LINTERS"],
        "edge + pgTAP": [r"not ok (8|9) - ", r"pgTAP failure in"],
        "shadow E2E": [r"reports/e2e\.json: No such file", r"##\[error\]"],
        "final acceptance gate": [r"TRUST KERNEL FINAL GATE"]},
    "36795389505": {
        "claim linters (pinned governance baseline)": [r"unevidenced absence claim\(s\) beyond", r"allowlisted debt", r"CLAIM LINTERS", r"every certification"],
        "edge + pgTAP": [r"ok (8|9) - factory-packets|ok 9 - the workload read policy", r"repair_phase0_containment\.sql:\d+: ERROR"],
        "shadow E2E": [r"shadow E2E environment is not provisioned"],
        "final acceptance gate": [r"TRUST KERNEL FINAL GATE", r"did not succeed"]},
}
# Drop lines that could carry a value (keys, JWTs, assignments); secret NAMES may stay.
SECRETISH = re.compile(r"(?i)(sb_(publishable|secret)_\w+|eyJ[A-Za-z0-9_-]{8,}|(password|token|apikey)\s*[=:])")


def gh(*args, raw=False):
    r = subprocess.run(["gh", "api", *args], capture_output=True, check=True)
    return r.stdout if raw else json.loads(r.stdout)


for run_id, jobs in RUNS.items():
    run = gh(f"repos/{REPO}/actions/runs/{run_id}")
    print(f"== run {run_id}: {run['html_url']}")
    print(f"   workflow={run['name']!r} event={run['event']} head_sha={run['head_sha']} conclusion={run['conclusion']} created={run['created_at']}")
    listed = {j["name"]: j for j in gh(f"repos/{REPO}/actions/runs/{run_id}/jobs?per_page=50")["jobs"]}
    for name, patterns in jobs.items():
        job = listed[name]
        log = gh(f"repos/{REPO}/actions/jobs/{job['id']}/logs", raw=True)
        lines = log.decode("utf-8", "replace").splitlines()
        print(f"   -- job {job['id']} {name!r}: conclusion={job['conclusion']} log_sha256={hashlib.sha256(log).hexdigest()} lines={len(lines)}")
        rx = re.compile("|".join(patterns))
        hits = [l for l in lines if rx.search(l) and not SECRETISH.search(l)]
        for l in hits[:40]:
            print("      " + l.strip()[:220])
        if len(hits) > 40:
            print(f"      ... {len(hits) - 40} more matching lines")
print("source: GitHub Actions job logs fetched read-only with `gh api`; logs expire on GitHub's retention schedule.")
