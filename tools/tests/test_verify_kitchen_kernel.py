from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest


MODULE_PATH = Path(__file__).resolve().parents[1] / "verify_kitchen_kernel.py"
SPEC = importlib.util.spec_from_file_location("verify_kitchen_kernel", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load verifier from {MODULE_PATH}")
VERIFIER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIER)


def check_named(evidence: object, name: str) -> dict[str, object]:
    return next(check for check in evidence.checks if check["name"] == name)


class PublicationWorktreeTests(unittest.TestCase):
    def test_context_inventory_allows_preexisting_workspace_packages(self) -> None:
        evidence = VERIFIER.Evidence()

        VERIFIER.check_contexts_and_docs(evidence)

        check = check_named(evidence, "bounded_context_inventory")
        self.assertTrue(check["passed"])
        self.assertEqual(check["details"]["matched_count"], 15)
        self.assertIn("field-app", check["details"]["observed_non_context_packages"])

    def test_git_check_accepts_the_approved_publication_worktree(self) -> None:
        evidence = VERIFIER.Evidence()

        VERIFIER.check_git(evidence)

        check = check_named(evidence, "git_bootstrap_state")
        self.assertTrue(check["passed"])
        self.assertEqual(check["details"]["mode"], "publication-worktree")
        self.assertEqual(check["details"]["branch_name"], "agent/kitchen-kernel-bootstrap")

    def test_command_evidence_uses_portable_paths(self) -> None:
        result = VERIFIER.run(
            [sys.executable, "-c", "pass", str(VERIFIER.ROOT / "tests")]
        )

        self.assertEqual(result["command"][0], "python")
        self.assertEqual(result["command"][-1], "tests")


if __name__ == "__main__":
    unittest.main()
