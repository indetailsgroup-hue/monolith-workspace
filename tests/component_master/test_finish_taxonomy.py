"""Safety contracts for canonical finish taxonomy and native mappings."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_SOURCE = REPOSITORY_ROOT / "packages" / "component-master" / "src"
sys.path.insert(0, str(PACKAGE_SOURCE))

import monolith_component_master as component_master  # noqa: E402


DATA_DIR = REPOSITORY_ROOT / "data" / "component-master"
TAXONOMY_PATH = DATA_DIR / "finish-taxonomy.jsonl"
MAPPINGS_PATH = DATA_DIR / "finish-mappings.jsonl"


def read_jsonl(path: Path) -> list[dict]:
    if not path.is_file():
        raise AssertionError(f"Required finish file is missing: {path}")
    with path.open(encoding="utf-8") as source:
        return [json.loads(line) for line in source if line.strip()]


class FinishTaxonomySafetyTests(unittest.TestCase):
    def assess(self, left: dict, right: dict, approval: dict) -> tuple[bool, list[str]]:
        assessor = getattr(component_master, "assess_finish_equivalence", None)
        self.assertTrue(
            callable(assessor), "assess_finish_equivalence is not implemented"
        )
        return assessor(left, right, approval)

    def test_name_and_image_alone_cannot_prove_equivalence(self) -> None:
        weak_record = {"name": "Nickel", "image_url": "https://example.invalid/a.jpg"}

        allowed, reasons = self.assess(weak_record, weak_record, {})

        self.assertFalse(allowed)
        self.assertIn("SUPPLIER_NATIVE_CODE_REQUIRED", reasons)
        self.assertIn("MEASUREMENT_CONDITIONS_REQUIRED", reasons)
        self.assertIn("PHYSICAL_SAMPLE_REQUIRED", reasons)
        self.assertIn("APPROVED_TOLERANCE_REQUIRED", reasons)

    def test_complete_measurement_and_approval_evidence_can_pass(self) -> None:
        common = {
            "canonical_finish_id": "finish:metal:nickel-plated:satin",
            "substrate_family": "zinc-alloy",
            "coating_family": "nickel-plated",
            "gloss": {
                "value_gu": 35.0,
                "geometry_degrees": 60,
                "standard": "ISO 2813:2014",
            },
            "texture": {"descriptor": "smooth", "method": "visual+tactile panel"},
            "rights": {"license_status": "identifier-and-facts-only"},
            "provenance": ["primary technical record"],
            "batch_lot": "LOT-2026-07",
        }
        left = {
            **common,
            "supplier_native_code": "SUP-A-NI",
            "measurement": {
                "lab": {"L": 63.1, "a": 0.2, "b": 2.0},
                "illuminant": "D65",
                "observer": "10deg",
                "instrument_geometry": "d/8 SCI",
                "sample_id": "SAMPLE-A",
                "measured_at": "2026-07-19",
            },
        }
        right = {
            **common,
            "supplier_native_code": "SUP-B-NI",
            "measurement": {
                "lab": {"L": 63.0, "a": 0.3, "b": 2.1},
                "illuminant": "D65",
                "observer": "10deg",
                "instrument_geometry": "d/8 SCI",
                "sample_id": "SAMPLE-B",
                "measured_at": "2026-07-19",
            },
        }
        approval = {
            "delta_e_method": "CIEDE2000",
            "approved_tolerance": 1.0,
            "observed_delta_e": 0.42,
            "physical_sample_approval_id": "APPROVAL-42",
            "tenant_project_approval": "tenant:test/project:test",
        }

        allowed, reasons = self.assess(left, right, approval)

        self.assertTrue(allowed, reasons)
        self.assertEqual([], reasons)

    def test_supplier_native_mappings_remain_lossless_and_non_equivalent(self) -> None:
        mappings = read_jsonl(MAPPINGS_PATH)

        self.assertEqual(
            {"Italiana Ferramenta", "Häfele", "Blum"},
            {record["supplier"] for record in mappings},
        )
        for record in mappings:
            with self.subTest(mapping_id=record["mapping_id"]):
                self.assertTrue(record["supplier_native_code"].strip())
                self.assertTrue(record["supplier_native_name"].strip())
                self.assertIn(
                    record["mapping_status"],
                    {"supplier_native_unmapped", "candidate"},
                )
                self.assertTrue(record["provenance"])
                self.assertTrue(record["rights"]["license_status"])
                self.assertFalse(record.get("physical_equivalence", False))

    def test_canonical_taxonomy_has_measurement_and_rights_contract(self) -> None:
        records = read_jsonl(TAXONOMY_PATH)

        self.assertGreaterEqual(len(records), 2)
        for record in records:
            with self.subTest(finish_id=record["finish_id"]):
                self.assertEqual("Proposed", record["status"])
                self.assertIn("measurement_contract", record)
                self.assertIn("physical_sample_contract", record)
                self.assertIn("rights_contract", record)
                self.assertTrue(record["provenance"])


if __name__ == "__main__":
    unittest.main()
