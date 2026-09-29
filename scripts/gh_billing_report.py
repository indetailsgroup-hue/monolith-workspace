#!/usr/bin/env python3
"""
gh_billing_report.py — GitHub Actions sampled gross runner-cost estimate
for runs created during the selected date window (default: current month).
All available attempts of those runs are included, even outside that window.

Usage:
  export GH_TOKEN=ghp_...
  python3 scripts/gh_billing_report.py

  # Override org/repo or date range:
  python3 scripts/gh_billing_report.py \\
      --owner indetailsgroup-hue \\
      --repo  monolith-workspace \\
      --since 2026-09-01

  # Also write results to a CSV file:
  python3 scripts/gh_billing_report.py --csv billing_report.csv

Requires only Python 3.10+ stdlib — no pip installs needed.
"""

import csv
import json
import os
import sys
import argparse
import datetime
import math
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError

# Force line-buffered output so progress appears even when piped
sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)

# ─── constants ────────────────────────────────────────────────────────────────
BASE = "https://api.github.com"

# Standard hosted x64 runner assumptions, not an account invoice. These rates
# exclude included minutes, public-repository discounts, storage and larger runners.
RATES_AS_OF = "2026-09-12"
PRICING_URL = "https://docs.github.com/en/billing/reference/actions-runner-pricing"
ATTEMPT_SCOPE = "All available job attempts, including attempts outside the run creation window"
RATES  = {"UBUNTU": 0.006, "WINDOWS": 0.010, "MACOS": 0.062}
LABELS = {"UBUNTU": "Linux", "WINDOWS": "Windows", "MACOS": "macOS"}
RUNNER_LABELS = {
    "UBUNTU": {"ubuntu-latest", "ubuntu-20.04", "ubuntu-22.04", "ubuntu-24.04"},
    "WINDOWS": {"windows-latest", "windows-2019", "windows-2022", "windows-2025"},
    "MACOS": {"macos-latest", "macos-13", "macos-14", "macos-15", "macos-26"},
}

MAX_WORKERS           = 20   # parallel requests
MAX_RUNS_PER_WORKFLOW = 10   # explicit sample cap; every workflow is enumerated
API_TIMEOUT           = 8    # seconds per individual API call


# ─── HTTP helper ──────────────────────────────────────────────────────────────
def api_get(token: str, url: str) -> dict:
    req = Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    try:
        with urlopen(req, timeout=API_TIMEOUT) as r:
            return json.loads(r.read())
    except HTTPError as e:
        body = e.read().decode(errors="replace")
        raise RuntimeError(f"HTTP {e.code} {url}\n  {body[:200]}") from e


# ─── API wrappers ─────────────────────────────────────────────────────────────
def list_workflows(token: str, owner: str, repo: str) -> list[dict]:
    out, page = [], 1
    while True:
        d = api_get(token, f"{BASE}/repos/{owner}/{repo}/actions/workflows?per_page=100&page={page}")
        batch = d.get("workflows")
        if not isinstance(batch, list):
            raise RuntimeError("Workflow API returned an invalid inventory")
        out.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    return out


def workflow_runs_since(token: str, owner: str, repo: str,
                        workflow_id: int, since: str, until: str | None = None) -> list[dict]:
    """Fetch up to MAX_RUNS_PER_WORKFLOW completed runs on/after `since`."""
    created = f">={since}"
    if until:
        last_day = datetime.date.fromisoformat(until) - datetime.timedelta(days=1)
        created = f"{since}..{last_day.isoformat()}T23:59:59Z"
    query = urlencode({"status": "completed", "created": created,
                       "per_page": MAX_RUNS_PER_WORKFLOW, "page": 1})
    d = api_get(token, f"{BASE}/repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs?{query}")
    runs = d.get("workflow_runs")
    if not isinstance(runs, list):
        raise RuntimeError("Run API returned an invalid sample")
    return runs


def run_billing_minutes(token: str, owner: str, repo: str,
                        run_id: int) -> dict[str, int]:
    """Estimate rounded hosted-job minutes; reject unpriced/unknown observations.

    The retired /timing endpoint is deliberately not used. filter=all includes
    distinct retry attempts; stable job IDs deduplicate overlapping pages.
    """
    totals = defaultdict(int)
    seen = set()
    page = 1
    while True:
        d = api_get(token, f"{BASE}/repos/{owner}/{repo}/actions/runs/{run_id}/jobs"
                    f"?filter=all&per_page=100&page={page}")
        jobs = d.get("jobs")
        if not isinstance(jobs, list) or (page == 1 and not jobs):
            raise RuntimeError(f"Job data unavailable for run {run_id}")
        for job in jobs:
            job_id = job.get("id")
            if job_id is not None and job_id in seen:
                continue
            if job_id is not None:
                seen.add(job_id)
            if job.get("conclusion") == "skipped":
                continue
            labels = {str(label).lower() for label in job.get("labels", [])}
            matches = [key for key, allowed in RUNNER_LABELS.items() if labels & allowed]
            if len(labels) != 1 or "self-hosted" in labels or len(matches) != 1:
                raise RuntimeError(f"Unpriced runner in run {run_id}, job {job_id}")
            try:
                start = datetime.datetime.fromisoformat(job["started_at"].replace("Z", "+00:00"))
                end = datetime.datetime.fromisoformat(job["completed_at"].replace("Z", "+00:00"))
                seconds = (end - start).total_seconds()
                if seconds < 0:
                    raise ValueError("negative duration")
            except (KeyError, TypeError, ValueError, AttributeError) as error:
                raise RuntimeError(f"Job duration unavailable for run {run_id}, job {job_id}") from error
            totals[matches[0]] += math.ceil(seconds / 60)
        if len(jobs) < 100:
            break
        page += 1
    return dict(totals)


# ─── report helpers ───────────────────────────────────────────────────────────
def cycle_start() -> str:
    return datetime.date.today().replace(day=1).isoformat()


def write_csv(path: str, rows: list[dict], since: str, until: str) -> None:
    fieldnames = ["workflow", "file", "runs_sampled", "total_min", "total_cost_usd",
                  "linux_min", "windows_min", "macos_min", "data_status", "failed_requests",
                  "rate_assumptions_date", "run_created_since", "run_created_until_exclusive", "attempt_scope"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            bd = r["breakdown"]
            w.writerow({
                "workflow":       r["name"],
                "file":           r["file"],
                "runs_sampled":   r["runs"],
                "total_min":      r["mins"],
                "total_cost_usd": f"{r['cost']:.4f}",
                "linux_min":      bd.get("UBUNTU", 0),
                "windows_min":    bd.get("WINDOWS", 0),
                "macos_min":      bd.get("MACOS", 0),
                "data_status":    "partial" if r["failed_requests"] else "sampled",
                "failed_requests": r["failed_requests"],
                "rate_assumptions_date": RATES_AS_OF,
                "run_created_since": since,
                "run_created_until_exclusive": until,
                "attempt_scope": ATTEMPT_SCOPE,
            })


# ─── main ─────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="GitHub Actions sampled gross runner-cost estimate (not an invoice)"
    )
    parser.add_argument("--owner",  default=os.environ.get("GH_OWNER", "indetailsgroup-hue"))
    parser.add_argument("--repo",   default=os.environ.get("GH_REPO",  "monolith-workspace"))
    parser.add_argument("--token",  default=os.environ.get("GH_TOKEN", ""),
                        help="GitHub PAT (or set GH_TOKEN env var)")
    parser.add_argument("--since",  default=None,
                        help="Cycle start date YYYY-MM-DD; default = 1st of current month")
    parser.add_argument("--until", default=None,
                        help="Exclusive end date YYYY-MM-DD; default = today plus one day")
    parser.add_argument("--csv",    default=None, metavar="FILE",
                        help="Also write per-workflow table to this CSV file")
    parser.add_argument("--top",    default=None, type=int, metavar="N",
                        help="Print only the top N most expensive workflows in the summary table")
    args = parser.parse_args()

    if not args.token:
        sys.exit("ERROR: pass --token or set the GH_TOKEN environment variable.")

    since = args.since or cycle_start()
    until = args.until or (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
    try:
        if datetime.date.fromisoformat(since) >= datetime.date.fromisoformat(until):
            raise ValueError("since must precede until")
    except ValueError as error:
        parser.error(str(error))

    print(f"\n{'='*68}")
    print(f"  GitHub Actions sampled gross runner-cost estimate — NOT AN INVOICE")
    print(f"  Repo   : {args.owner}/{args.repo}")
    print(f"  Run creation window : {since} -> {until} (exclusive)")
    print(f"  Sample : up to {MAX_RUNS_PER_WORKFLOW} most-recent runs per workflow")
    print(f"  Attempt scope: {ATTEMPT_SCOPE}")
    print(f"{'='*68}\n")

    print(f"Standard-runner rate assumptions ({RATES_AS_OF}): {RATES}; {PRICING_URL}")
    print("Not total monthly spend: quotas, discounts, public-repository free usage, storage and other runner sizes are excluded.")

    # ── list workflows ────────────────────────────────────────────────────────
    print(f"\n-- Fetching workflows & runs since {since} --")
    workflows = list_workflows(args.token, args.owner, args.repo)
    if not workflows:
        print("  No workflows found.")
        if args.csv:
            write_csv(args.csv, [], since, until)
        return
    print(f"  {len(workflows)} workflows found")

    # Fetch run lists for all workflows in parallel
    wf_runs: dict[int, list[dict]] = {}
    failed_requests = defaultdict(int)
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        fs = {
            pool.submit(workflow_runs_since, args.token, args.owner,
                        args.repo, wf["id"], since, until): wf
            for wf in workflows
        }
        for f in as_completed(fs):
            wf = fs[f]
            try:
                wf_runs[wf["id"]] = f.result()
            except Exception as error:
                wf_runs[wf["id"]] = []
                failed_requests[wf["id"]] += 1
                print(f"WARNING: run inventory unavailable for workflow {wf['id']}: {error}")

    all_run_pairs = [
        (run["id"], wf_id)
        for wf_id, runs in wf_runs.items()
        for run in runs
    ]
    total_runs = len(all_run_pairs)
    print(f"  {total_runs} runs sampled ({MAX_RUNS_PER_WORKFLOW} cap/workflow)")
    print(f"  Fetching timing ({MAX_WORKERS} workers, {API_TIMEOUT}s timeout each)...")

    # Global parallel timing fetch
    run_totals: dict[int, dict[str, int]] = {}
    run_id_to_wf = {run_id: wf_id for run_id, wf_id in all_run_pairs}
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        fs2 = {
            pool.submit(run_billing_minutes, args.token, args.owner,
                        args.repo, run_id): run_id
            for run_id, _ in all_run_pairs
        }
        for f in as_completed(fs2):
            run_id = fs2[f]
            try:
                run_totals[run_id] = f.result()
            except Exception as error:
                run_totals[run_id] = {}
                failed_requests[run_id_to_wf[run_id]] += 1
                print(f"WARNING: sampled run {run_id} could not be priced: {error}")

    print(f"  Timing complete.")

    # ── aggregate per-workflow ────────────────────────────────────────────────
    wf_breakdown: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for run_id, timing in run_totals.items():
        wf_id = run_id_to_wf.get(run_id)
        if wf_id is None:
            continue
        for os_key, mins in timing.items():
            wf_breakdown[wf_id][os_key] += mins

    # ── build + sort rows ─────────────────────────────────────────────────────
    rows: list[dict] = []
    for wf in workflows:
        bd        = dict(wf_breakdown.get(wf["id"], {}))
        total_min = sum(bd.values())
        cost      = sum(bd.get(k, 0) * RATES.get(k, 0) for k in RATES)
        n_runs    = len(wf_runs.get(wf["id"], []))
        rows.append({
            "name":      wf["name"],
            "file":      wf["path"].split("/")[-1],
            "runs":      n_runs,
            "mins":      total_min,
            "cost":      cost,
            "breakdown": bd,
            "failed_requests": failed_requests[wf["id"]],
        })

    rows.sort(key=lambda r: r["mins"], reverse=True)

    # ── summary table ─────────────────────────────────────────────────────────
    grand_min  = sum(r["mins"]  for r in rows)
    grand_cost = sum(r["cost"]  for r in rows)
    col_w = 44

    display_rows = [r for r in rows if not (r["mins"] == 0 and r["runs"] == 0)]
    if args.top:
        display_rows = display_rows[:args.top]
        top_label = f"  (top {args.top} of {len(rows)} workflows)"
    else:
        top_label = ""

    print(f"\n{'-'*78}")
    print(f"  {'Workflow':<{col_w}} {'Runs':>5}  {'Min':>7}  {'Cost':>9}  Breakdown{top_label}")
    print(f"{'-'*78}")
    for r in display_rows:
        if r["mins"] == 0 and r["runs"] == 0:
            continue
        bd_str = "  ".join(
            f"{LABELS.get(k, k)} {v}m"
            for k, v in sorted(r["breakdown"].items())
            if v
        )
        print(f"  {r['name']:<{col_w}} {r['runs']:>5}  {r['mins']:>7}  ${r['cost']:>8.2f}  {bd_str}")
    print(f"{'-'*78}")
    print(f"  {'KNOWN SAMPLE (all workflows)':<{col_w}} {'':>5}  {grand_min:>7}  ${grand_cost:>8.2f}")
    print()

    # ── optional CSV ─────────────────────────────────────────────────────────
    if args.csv:
        write_csv(args.csv, rows, since, until)
        print(f"  CSV written -> {args.csv}")
    if sum(failed_requests.values()):
        print(f"INCOMPLETE: {sum(failed_requests.values())} failed or unpriced requests; known sample only.")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
