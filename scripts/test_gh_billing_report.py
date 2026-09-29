"""Offline billing regression checks: no credentials or external messages."""
import contextlib
import csv
import importlib.util
import inspect
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

SCRIPT_DIR = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("billing_report", SCRIPT_DIR / "gh_billing_report.py")
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)


class CollectorTests(unittest.TestCase):
    def test_run_query_is_scoped_to_workflow_and_previous_month(self):
        self.assertIn("until", inspect.signature(report.workflow_runs_since).parameters,
                      "a previous-month report needs an exclusive end bound")
        with patch.object(report, "api_get", return_value={"workflow_runs": []}) as request:
            report.workflow_runs_since("test", "owner", "repo", 7, "2026-08-01", "2026-09-01")
        url = urlparse(request.call_args.args[1])
        self.assertEqual(url.path, "/repos/owner/repo/actions/workflows/7/runs")
        self.assertEqual(parse_qs(url.query)["created"], ["2026-08-01..2026-08-31T23:59:59Z"])

    def test_failed_run_list_is_an_error_not_a_zero_usage_sample(self):
        with patch.object(report, "api_get", side_effect=RuntimeError("API unavailable")):
            with self.assertRaisesRegex(RuntimeError, "API unavailable"):
                report.workflow_runs_since("test", "owner", "repo", 7, "2026-08-01")

    def test_job_duration_uses_supported_endpoint_and_rounds_each_job_up(self):
        jobs = [{"labels": [label], "conclusion": "success", "started_at": "2026-08-10T00:00:00Z",
                 "completed_at": end} for label, end in [
                    ("ubuntu-latest", "2026-08-10T00:01:01Z"),
                    ("windows-2022", "2026-08-10T00:00:01Z")]]
        with patch.object(report, "api_get", return_value={"jobs": jobs}) as request:
            self.assertEqual(report.run_billing_minutes("test", "owner", "repo", 4),
                             {"UBUNTU": 2, "WINDOWS": 1})
        self.assertIn("/actions/runs/4/jobs?", request.call_args.args[1])

    def test_unknown_runner_and_failed_job_fetch_do_not_become_zero_cost(self):
        cases = [RuntimeError("API unavailable")]
        for labels in (["self-hosted", "linux"], ["custom-large-runner"], ["ubuntu-24.04-arm"],
                       ["ubuntu-latest", "custom-large-runner"]):
            cases.append({"jobs": [{"labels": labels, "conclusion": "success",
                         "started_at": "2026-08-10T00:00:00Z", "completed_at": "2026-08-10T00:01:00Z"}]})
        for response in cases:
            with self.subTest(response=response):
                args = {"side_effect": response} if isinstance(response, Exception) else {"return_value": response}
                with patch.object(report, "api_get", **args), self.assertRaises(RuntimeError):
                    report.run_billing_minutes("test", "owner", "repo", 4)

    def test_jobs_paginate_and_include_distinct_attempts_without_duplicate_job_ids(self):
        def job(identity, attempt=1):
            return {"id": identity, "run_attempt": attempt, "labels": ["ubuntu-latest"],
                    "conclusion": "success", "started_at": "2026-08-10T00:00:00Z",
                    "completed_at": "2026-08-10T00:00:01Z"}
        pages = [{"jobs": [job(identity) for identity in range(100)]},
                 {"jobs": [job(99), job(100, 2)]}]
        with patch.object(report, "api_get", side_effect=pages) as request:
            result = report.run_billing_minutes("test", "owner", "repo", 4)
        self.assertEqual(result, {"UBUNTU": 101})
        self.assertEqual(request.call_count, 2)
        self.assertEqual(parse_qs(urlparse(request.call_args.args[1]).query)["filter"], ["all"])
        self.assertEqual(parse_qs(urlparse(request.call_args.args[1]).query)["page"], ["2"])

    def test_partial_csv_survives_a_failed_run_and_command_reports_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "billing.csv"
            argv = ["report", "--token", "offline-test", "--since", "2026-08-01",
                    "--until", "2026-09-01", "--csv", str(target)]
            workflows = [{"id": 7, "name": "Build", "path": ".github/workflows/build.yml"}]
            def timing(_token, _owner, _repo, run_id):
                if run_id == 2:
                    raise RuntimeError("timing unavailable")
                return {"UBUNTU": 2}
            with patch.object(sys, "argv", argv), patch.object(report, "list_workflows", return_value=workflows), \
                    patch.object(report, "workflow_runs_since", return_value=[{"id": 1}, {"id": 2}]), \
                    patch.object(report, "run_billing_minutes", side_effect=timing), \
                    patch.object(report, "api_get", side_effect=AssertionError("unexpected retired API called")), \
                    contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(SystemExit) as failure:
                    report.main()
            self.assertEqual(failure.exception.code, 1)
            with target.open(newline="", encoding="utf-8") as handle:
                row = next(csv.DictReader(handle))
            self.assertEqual(row["data_status"], "partial")
            self.assertEqual(row["failed_requests"], "1")
            self.assertEqual(row["linux_min"], "2")
            self.assertGreater(float(row["total_cost_usd"]), 0)

    def test_cross_month_attempts_are_labeled_as_a_run_creation_cohort(self):
        jobs = [
            {"id": 1, "run_attempt": 1, "labels": ["ubuntu-latest"], "conclusion": "success",
             "started_at": "2026-08-31T23:58:00Z", "completed_at": "2026-08-31T23:59:00Z"},
            {"id": 2, "run_attempt": 2, "labels": ["ubuntu-latest"], "conclusion": "success",
             "started_at": "2026-09-02T00:00:00Z", "completed_at": "2026-09-02T01:00:00Z"},
        ]
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "billing.csv"
            argv = ["report", "--token", "offline-test", "--since", "2026-08-01",
                    "--until", "2026-09-01", "--csv", str(target)]
            workflows = [{"id": 7, "name": "Build", "path": ".github/workflows/build.yml"}]
            output = io.StringIO()
            with patch.object(sys, "argv", argv), patch.object(report, "list_workflows", return_value=workflows), \
                    patch.object(report, "workflow_runs_since", return_value=[{"id": 4}]), \
                    patch.object(report, "api_get", return_value={"jobs": jobs}), \
                    contextlib.redirect_stdout(output):
                report.main()
            with target.open(newline="", encoding="utf-8") as handle:
                row = next(csv.DictReader(handle))
            self.assertEqual(row["linux_min"], "61")
            self.assertEqual(row.get("run_created_since"), "2026-08-01")
            self.assertEqual(row.get("run_created_until_exclusive"), "2026-09-01")
            self.assertIn("outside the run creation window", row.get("attempt_scope", ""))
            self.assertIn("Run creation window", output.getvalue())
            self.assertIn("outside the run creation window", output.getvalue())


class SummaryTests(unittest.TestCase):
    def run_summary(self, rows=None, *, threshold="20", outcome="success", columns=None):
        summary_script = SCRIPT_DIR / "gh_billing_summary.py"
        self.assertTrue(summary_script.exists(), "billing summary must run independently of notification credentials")
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "billing.csv"
            destination = Path(directory) / "summary.md"
            if rows is not None:
                fieldnames = columns or ["workflow", "runs_sampled", "total_cost_usd", "linux_min",
                                         "windows_min", "macos_min", "data_status", "failed_requests"]
                with source.open("w", newline="", encoding="utf-8") as handle:
                    writer = csv.DictWriter(handle, fieldnames=fieldnames)
                    writer.writeheader()
                    writer.writerows(rows)
            env = {key: value for key, value in os.environ.items() if "TOKEN" not in key and "SECRET" not in key}
            env.update(GITHUB_STEP_SUMMARY=str(destination), REPORT_FILE=str(source),
                       THRESHOLD_USD=threshold, BILLING_OUTCOME=outcome, MONTH_LABEL="August 2026")
            completed = subprocess.run([sys.executable, str(summary_script)], env=env,
                                       capture_output=True, text=True, encoding="utf-8")
            self.assertTrue(destination.exists(), completed.stderr)
            self.assertIsInstance(completed.stdout, str, "CLI summary stdout must be valid UTF-8")
            text = destination.read_text(encoding="utf-8")
            self.assertEqual(completed.stdout.strip(), text.strip())
            return completed, text

    @staticmethod
    def row(**changes):
        row = dict(workflow="Build", runs_sampled="2", total_cost_usd="22.50", linux_min="5",
                   windows_min="3", macos_min="7", data_status="sampled", failed_requests="0")
        return row | changes

    def test_summary_uses_csv_cost_includes_macos_and_needs_no_notification_credentials(self):
        result, text = self.run_summary([self.row()])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("$22.50", text)
        self.assertIn("macOS: 7 min", text)
        self.assertIn("threshold", text.lower())
        self.assertIn("exceeds", text.lower())
        self.assertIn("not an invoice", text.lower())
        self.assertIn("no external message", text.lower())
        self.assertIn("Run creation window: August 2026", text)
        self.assertIn("outside the run creation window", text)

    def test_partial_data_never_reports_a_below_threshold_success(self):
        result, text = self.run_summary([self.row(total_cost_usd="0", data_status="partial", failed_requests="1")],
                                        outcome="failure")
        self.assertEqual(result.returncode, 1)
        self.assertIn("incomplete", text.lower())
        self.assertNotIn("below threshold", text.lower())

    def test_missing_csv_produces_failure_summary_instead_of_silent_success(self):
        result, text = self.run_summary(outcome="failure")
        self.assertEqual(result.returncode, 1)
        self.assertIn("unavailable", text.lower())

    def test_wrong_cost_column_is_rejected_instead_of_defaulting_to_zero(self):
        result, text = self.run_summary([{"workflow": "Build", "estimated_usd": "50"}],
                                        columns=["workflow", "estimated_usd"])
        self.assertEqual(result.returncode, 1)
        self.assertIn("total_cost_usd", text)

    def test_invalid_threshold_is_reported_after_csv_is_preserved(self):
        for threshold in ("NaN", "Infinity", "-1", "not-a-number"):
            with self.subTest(threshold=threshold):
                result, text = self.run_summary([self.row()], threshold=threshold)
                self.assertEqual(result.returncode, 1)
                self.assertIn("threshold", text.lower())

    def test_empty_valid_sample_is_explicit(self):
        result, text = self.run_summary([])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("0 workflows", text)
        self.assertIn("sample", text.lower())


if __name__ == "__main__":
    unittest.main()
