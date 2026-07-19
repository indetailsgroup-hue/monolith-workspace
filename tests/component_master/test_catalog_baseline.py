"""Baseline package and path contracts for Component Master."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_SOURCE = REPOSITORY_ROOT / "packages" / "component-master" / "src"
EXPECTED_DATA_DIR = REPOSITORY_ROOT / "data" / "component-master"


def run_package_probe(code: str, cwd: Path) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    current = env.get("PYTHONPATH")
    env["PYTHONPATH"] = (
        str(PACKAGE_SOURCE)
        if not current
        else os.pathsep.join((str(PACKAGE_SOURCE), current))
    )
    return subprocess.run(
        [sys.executable, "-c", code],
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


class ComponentMasterPackageBaselineTests(unittest.TestCase):
    def test_package_exports_reference_engine(self) -> None:
        with tempfile.TemporaryDirectory() as work_dir:
            result = run_package_probe(
                "from monolith_component_master import "
                "HardwareCatalog, boring_recipe, validate_project_hardware; "
                "assert HardwareCatalog and boring_recipe and validate_project_hardware",
                Path(work_dir),
            )

        self.assertEqual(0, result.returncode, result.stderr)

    def test_default_data_dir_is_independent_of_working_directory(self) -> None:
        with tempfile.TemporaryDirectory() as work_dir:
            result = run_package_probe(
                "from monolith_component_master import default_data_dir; "
                "print(default_data_dir().resolve())",
                Path(work_dir),
            )

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(str(EXPECTED_DATA_DIR.resolve()), result.stdout.strip())


if __name__ == "__main__":
    unittest.main()
