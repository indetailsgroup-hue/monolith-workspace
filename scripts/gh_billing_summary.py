#!/usr/bin/env python3
"""Publish the sampled billing CSV to the GitHub job summary; never send messages."""
import csv
import html
import math
import os
from pathlib import Path

from gh_billing_report import MAX_RUNS_PER_WORKFLOW, RATES, RATES_AS_OF, PRICING_URL, ATTEMPT_SCOPE


def build_summary(report_file, threshold_text, outcome, period):
    lines = ["## GitHub Actions sampled gross runner-cost estimate", "",
             f"Run creation window: {html.escape(period)}", "",
             f"Sample: up to {MAX_RUNS_PER_WORKFLOW} completed runs per workflow.",
             f"Attempt scope: {ATTEMPT_SCOPE}.",
             "This is not an invoice or total monthly spend. Quotas, discounts, free public-repository usage, "
             "storage and other runner sizes are not calculated.", "",
             f"Standard-runner rate assumptions ({RATES_AS_OF}): Linux ${RATES['UBUNTU']:.3f}/min, "
             f"Windows ${RATES['WINDOWS']:.3f}/min, macOS ${RATES['MACOS']:.3f}/min. "
             f"[Pricing source]({PRICING_URL})", "",
             "Delivery: GitHub job summary and workflow artifacts; no external message is sent.", ""]
    try:
        threshold = float(threshold_text)
        if not math.isfinite(threshold) or threshold < 0:
            raise ValueError("threshold must be finite and non-negative")
    except ValueError:
        lines.append("**Report summary unavailable:** threshold must be a finite, non-negative USD number. CSV/log artifacts are retained.")
        return "\n".join(lines) + "\n", 1
    try:
        with Path(report_file).open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            required = {"workflow", "total_cost_usd", "linux_min", "windows_min", "macos_min",
                        "data_status", "failed_requests"}
            missing = required - set(reader.fieldnames or [])
            if missing:
                raise ValueError("CSV fields required: " + ", ".join(sorted(missing)))
            rows = list(reader)
        total = 0.0
        minutes = {"linux_min": 0, "windows_min": 0, "macos_min": 0}
        incomplete = outcome != "success"
        for row in rows:
            cost = float(row["total_cost_usd"])
            if not math.isfinite(cost) or cost < 0:
                raise ValueError("CSV total_cost_usd must be finite and non-negative")
            total += cost
            for key in minutes:
                value = int(row[key])
                if value < 0:
                    raise ValueError("CSV minutes must be non-negative")
                minutes[key] += value
            if row["data_status"] not in {"sampled", "partial"}:
                raise ValueError("CSV data_status must be sampled or partial")
            failed = int(row["failed_requests"])
            if failed < 0:
                raise ValueError("CSV failed_requests must be non-negative")
            incomplete |= row["data_status"] == "partial" or failed > 0
        lines.extend([f"Sample inventory: {len(rows)} workflows", "",
                      f"Linux: {minutes['linux_min']:,} min · Windows: {minutes['windows_min']:,} min · "
                      f"macOS: {minutes['macos_min']:,} min", "",
                      f"Known sampled estimate: **${total:.2f} USD**", ""])
        if incomplete:
            lines.append("**Incomplete data:** collector failures or unpriced runners remain. "
                         "Threshold comparison is unavailable; inspect the retained CSV and log.")
            return "\n".join(lines) + "\n", 1
        if threshold == 0:
            lines.append("Threshold flag requested for every generated sample (threshold: $0.00).")
        elif total >= threshold:
            lines.append(f"**Sample meets or exceeds threshold: ${threshold:.2f}.**")
        else:
            lines.append(f"Sample is below threshold (${threshold:.2f}); total monthly spend remains unverified.")
        return "\n".join(lines) + "\n", 0
    except (OSError, ValueError, TypeError) as error:
        lines.append(f"**Report unavailable:** {html.escape(str(error))}. Inspect the retained collector log; "
                     "a failed collection is not zero spend.")
        return "\n".join(lines) + "\n", 1


def main():
    text, status = build_summary(os.environ.get("REPORT_FILE", ""), os.environ.get("THRESHOLD_USD", "20"),
                                 os.environ.get("BILLING_OUTCOME", "unknown"), os.environ.get("MONTH_LABEL", "unknown"))
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as handle:
            handle.write(text)
    if os.environ.get("SUMMARY_FILE"):
        Path(os.environ["SUMMARY_FILE"]).write_text(text, encoding="utf-8")
    print(text)
    return status


if __name__ == "__main__":
    raise SystemExit(main())
