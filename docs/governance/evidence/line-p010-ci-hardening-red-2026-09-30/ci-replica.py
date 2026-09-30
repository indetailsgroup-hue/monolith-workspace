"""Run the db-verify.yml steps that execute against the database, locally.

The `run:` text of each step is taken verbatim from the workflow file; only the
GitHub expression `${{ steps.db.outputs.DB_URL }}` is replaced by the local DSN
(the password travels in PGPASSWORD, never in the URL). Each step runs with
`bash -e` in the given working directory, like a GitHub Actions default run
step. Unlike GitHub Actions, every listed step runs even if an earlier one
failed, so later results stay visible. This is a local run, not a GitHub
Actions result.

Usage:
  ci-replica.py <workflow> <dsn> <workdir> <out-dir>
  ci-replica.py <workflow> <dsn> <workdir> <out-dir> --only-suites a,b,c
The second form runs only the pgTAP step, with its `for suite in ...; do` list
replaced by the given suites (textual substitution; the exact script is saved).
Writes <out-dir>/ci-step-*.sh (script run) and ci-step-*.log; prints one line
per step with its exit code; exits 0 only if every step run exits 0.
"""
import os
import pathlib
import re
import subprocess
import sys

import yaml

workflow, dsn, workdir, out = sys.argv[1], sys.argv[2], pathlib.Path(sys.argv[3]), pathlib.Path(sys.argv[4])
only = sys.argv[6].split(",") if len(sys.argv) == 7 and sys.argv[5] == "--only-suites" else None
PGTAP = "Run pgTAP suites (workflow + trust-kernel + Repair Phase 0)"
STEPS = [PGTAP] if only else [
    PGTAP,
    "Prove LINE outbound claims do not overlap across two clients",
    "Confirm migration chain reaches 0192",
    "Confirm 0198 removed direct client writes on LINE tables",
    "Assemble evidence",
]
doc = yaml.safe_load(pathlib.Path(workflow).read_text(encoding="utf-8"))
steps = {s.get("name"): s for s in doc["jobs"]["db-verify"]["steps"]}
failed = False
for n, name in enumerate(STEPS, 1):
    step = steps[name]
    script = step["run"].replace("${{ steps.db.outputs.DB_URL }}", dsn)
    tag = f"{n}"
    if only:
        script, count = re.subn(r"for suite in .*?; do", "for suite in " + " ".join(only) + "; do", script, count=1, flags=re.S)
        assert count == 1, "suite list not found"
        tag = "1-line-suites-only"
    assert "${{" not in script, f"unreplaced expression in step {name!r}"
    env = dict(os.environ)
    for k, v in (step.get("env") or {}).items():
        env[k] = str(v).replace("${{ steps.db.outputs.DB_URL }}", dsn)
    env.update(LINE_DB_EVIDENCE_ORIGIN="local", LINE_DB_TEST_DSN=dsn, GITHUB_ACTIONS="false", GITHUB_SHA="local", GITHUB_REF="local", GITHUB_SERVER_URL="local",
               GITHUB_REPOSITORY="local", GITHUB_RUN_ID="local")
    script_path = out / f"ci-step-{tag}.sh"
    script_path.write_text(script, encoding="utf-8", newline="\n")
    with open(out / f"ci-step-{tag}.log", "wb") as log:
        rc = subprocess.run([os.environ.get("BASH_BIN", "bash"), "-e", script_path.resolve().as_posix()],
                            cwd=workdir, env=env, stdout=log, stderr=subprocess.STDOUT).returncode
    print(f"step {tag} exit={rc} :: {name}")
    failed |= rc != 0
sys.exit(1 if failed else 0)
