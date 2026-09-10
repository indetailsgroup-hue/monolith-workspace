#!/usr/bin/env python3
"""
gh_billing_report.py — GitHub Actions per-workflow minute spend
for the current billing cycle (1st of current month → today).

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

Requires only Python 3.9+ stdlib — no pip installs needed.
"""

import csv
import json
import os
import sys
import argparse
import datetime
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed, wait, FIRST_COMPLETED
from urllib.request import Request, urlopen
from urllib.error import HTTPError

# Force line-buffered output so progress appears even when piped
sys.stdout.reconfigure(line_buffering=True)

# ─── constants ────────────────────────────────────────────────────────────────
BASE = "https://api.github.com"

# GitHub Actions billing multipliers (minutes → USD)
RATES  = {"UBUNTU": 0.008, "WINDOWS": 0.016, "MACOS": 0.08}
LABELS = {"UBUNTU": "Linux", "WINDOWS": "Windows", "MACOS": "macOS"}

MAX_WORKERS           = 20   # parallel requests
MAX_RUNS_PER_WORKFLOW = 10   # cap per workflow; 30 wf × 10 = 300 timing calls max
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
def org_billing_summary(token: str, owner: str) -> dict:
    for endpoint in (
        f"{BASE}/orgs/{owner}/settings/billing/actions",
        f"{BASE}/users/{owner}/settings/billing/actions",
    ):
        try:
            return api_get(token, endpoint)
        except RuntimeError as e:
            if "HTTP 404" in str(e) or "HTTP 403" in str(e):
                continue
            raise
    return {}


def list_workflows(token: str, owner: str, repo: str) -> list[dict]:
    out, page = [], 1
    while True:
        d = api_get(token, f"{BASE}/repos/{owner}/{repo}/actions/workflows?per_page=100&page={page}")
        batch = d.get("workflows", [])
        out.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    return out


def workflow_runs_since(token: str, owner: str, repo: str,
                        workflow_id: int, since: str) -> list[dict]:
    """Fetch up to MAX_RUNS_PER_WORKFLOW completed runs on/after `since`."""
    url = (f"{BASE}/repos/{owner}/{repo}/actions/runs"
           f"?workflow_id={workflow_id}&status=completed"
           f"&created=>={since}&per_page={MAX_RUNS_PER_WORKFLOW}&page=1")
    try:
        d = api_get(token, url)
        return d.get("workflow_runs", [])
    except Exception:
        return []


def run_billing_minutes(token: str, owner: str, repo: str,
                        run_id: int) -> dict[str, int]:
    """Returns {OS_KEY: billable_minutes} for one run; {} on any error."""
    try:
        d = api_get(token, f"{BASE}/repos/{owner}/{repo}/actions/runs/{run_id}/timing")
        return {
            os_key: data.get("total_ms", 0) // 60_000
            for os_key, data in d.get("billable", {}).items()
        }
    except Exception:
        return {}


# ─── report helpers ───────────────────────────────────────────────────────────
def cycle_start() -> str:
    return datetime.date.today().replace(day=1).isoformat()


def print_org_summary(summary: dict) -> None:
    if not summary:
        print("  (org billing endpoint not accessible with this token)")
        return
    inc  = summary.get("included_minutes", "n/a")
    used = summary.get("total_minutes_used", "n/a")
    paid = summary.get("total_paid_minutes_used", 0)
    bd   = summary.get("minutes_used_breakdown", {})
    print(f"  Included quota : {inc!s:>8} min")
    print(f"  Total used     : {used!s:>8} min")
    for key, label in LABELS.items():
        mins = bd.get(key, 0)
        if mins:
            print(f"    {label:<10}: {mins:>6} min  (${mins * RATES[key]:.2f})")
    if paid:
        print(f"  Paid overage   : {paid:>8} min")


def write_csv(path: str, rows: list[dict]) -> None:
    fieldnames = ["workflow", "file", "runs_sampled", "total_min", "total_cost_usd",
                  "linux_min", "windows_min", "macos_min"]
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
            })


# ─── main ─────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="GitHub Actions billing report — per-workflow minute spend"
    )
    parser.add_argument("--owner",  default=os.environ.get("GH_OWNER", "indetailsgroup-hue"))
    parser.add_argument("--repo",   default=os.environ.get("GH_REPO",  "monolith-workspace"))
    parser.add_argument("--token",  default=os.environ.get("GH_TOKEN", ""),
                        help="GitHub PAT (or set GH_TOKEN env var)")
    parser.add_argument("--since",  default=None,
                        help="Cycle start date YYYY-MM-DD; default = 1st of current month")
    parser.add_argument("--csv",    default=None, metavar="FILE",
                        help="Also write per-workflow table to this CSV file")
    parser.add_argument("--top",    default=None, type=int, metavar="N",
                        help="Print only the top N most expensive workflows in the summary table")
    args = parser.parse_args()

    if not args.token:
        sys.exit("ERROR: pass --token or set the GH_TOKEN environment variable.")

    since = args.since or cycle_start()
    today = datetime.date.today().isoformat()

    print(f"\n{'='*68}")
    print(f"  GitHub Actions Billing Report")
    print(f"  Repo   : {args.owner}/{args.repo}")
    print(f"  Period : {since} -> {today}")
    print(f"  Sample : up to {MAX_RUNS_PER_WORKFLOW} most-recent runs per workflow")
    print(f"{'='*68}\n")

    # ── org-level totals ──────────────────────────────────────────────────────
    print("-- Org-level Actions billing (full cycle) --")
    summary = org_billing_summary(args.token, args.owner)
    print_org_summary(summary)

    # ── list workflows ────────────────────────────────────────────────────────
    print(f"\n-- Fetching workflows & runs since {since} --")
    workflows = list_workflows(args.token, args.owner, args.repo)
    if not workflows:
        print("  No workflows found.")
        return
    print(f"  {len(workflows)} workflows found")

    # Fetch run lists for all workflows in parallel
    wf_runs: dict[int, list[dict]] = {}
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        fs = {
            pool.submit(workflow_runs_since, args.token, args.owner,
                        args.repo, wf["id"], since): wf
            for wf in workflows
        }
        for f in as_completed(fs):
            wf = fs[f]
            try:
                wf_runs[wf["id"]] = f.result()
            except Exception:
                wf_runs[wf["id"]] = []

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
            except Exception:
                run_totals[run_id] = {}

    print(f"  Timing complete.")

    # ── aggregate per-workflow ────────────────────────────────────────────────
    run_id_to_wf: dict[int, int] = {
        run["id"]: wf_id
        for wf_id, runs in wf_runs.items()
        for run in runs
    }
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
    print(f"  {'TOTAL (all workflows)':<{col_w}} {'':>5}  {grand_min:>7}  ${grand_cost:>8.2f}")
    print()

    # ── optional CSV ─────────────────────────────────────────────────────────
    if args.csv:
        write_csv(args.csv, rows)
        print(f"  CSV written -> {args.csv}")


if __name__ == "__main__":
    main()
