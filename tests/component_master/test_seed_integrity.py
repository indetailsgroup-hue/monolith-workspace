"""Integrity contracts for the first governed Component Master seed."""

from __future__ import annotations

import json
from pathlib import Path
import re
import sys
import unittest


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_SOURCE = REPOSITORY_ROOT / "packages" / "component-master" / "src"
sys.path.insert(0, str(PACKAGE_SOURCE))

import monolith_component_master as component_master  # noqa: E402
from monolith_component_master import HardwareCatalog  # noqa: E402


DATA_DIR = REPOSITORY_ROOT / "data" / "component-master"
SPECS_PATH = DATA_DIR / "specs.jsonl"
SKUS_PATH = DATA_DIR / "skus.jsonl"
BORING_PROFILES_PATH = DATA_DIR / "boring-profiles.jsonl"

BOOK_11_CONNECTOR_IDS = {
    "spec:conn:confirmat-screw:7x50",
    "spec:conn:cross-dowel:corner:m6",
    "spec:conn:cross-dowel:m10:d16",
    "spec:conn:cross-dowel:m6:d10",
    "spec:conn:cross-dowel:m8:d14",
    "spec:conn:eccentric-cam:d15",
    "spec:conn:eccentric-cam:d20",
    "spec:conn:expansion-sleeve:d8:m6",
    "spec:conn:housing-bolt:m6",
    "spec:conn:housing-bolt:m8",
    "spec:conn:invisible-detachable",
    "spec:conn:invisible-selfclamping",
    "spec:conn:screw-in-housing",
    "spec:conn:threaded-insert:m6",
    "spec:conn:tool-free:press-fit",
}
HINGE_IDS = {
    "spec:hinge:concealed:110deg:soft-close",
    "spec:hinge:concealed:155deg:soft-close",
}
DRAWER_RUNNER_IDS = {
    "spec:runner:drawer:concealed:full-extension:soft-close",
    "spec:runner:drawer:box:full-extension:soft-close",
}
EXPECTED_SPEC_IDS = BOOK_11_CONNECTOR_IDS | HINGE_IDS | DRAWER_RUNNER_IDS
SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")


def read_jsonl(path: Path) -> list[dict]:
    if not path.is_file():
        raise AssertionError(f"Required seed file is missing: {path}")
    with path.open(encoding="utf-8") as source:
        return [json.loads(line) for line in source if line.strip()]


class ComponentMasterSeedIntegrityTests(unittest.TestCase):
    def load_default_catalog(self) -> HardwareCatalog:
        loader = getattr(component_master, "load_default_catalog", None)
        self.assertTrue(callable(loader), "load_default_catalog is not implemented")
        return loader()

    def test_seed_contains_exact_approved_spec_set(self) -> None:
        records = read_jsonl(SPECS_PATH)
        actual_ids = [record["spec_id"] for record in records]

        self.assertEqual(19, len(records))
        self.assertEqual(19, len(set(actual_ids)))
        self.assertEqual(EXPECTED_SPEC_IDS, set(actual_ids))
        self.assertEqual(
            {"connector": 15, "hinge": 2, "drawer-runner": 2},
            {
                "connector": sum(
                    record["category"].startswith("connector.")
                    for record in records
                ),
                "hinge": sum(
                    record["category"].startswith("hinge.") for record in records
                ),
                "drawer-runner": sum(
                    record["category"].startswith("drawer-runner.")
                    for record in records
                ),
            },
        )

    def test_specs_are_proposed_versioned_and_sourced(self) -> None:
        for record in read_jsonl(SPECS_PATH):
            with self.subTest(spec_id=record["spec_id"]):
                self.assertEqual("Proposed", record["status"])
                self.assertRegex(record["spec_version"], SEMVER)
                self.assertTrue(record["function_en"].strip())
                self.assertTrue(record["function_th"].strip())
                self.assertTrue(record["provenance"])
                self.assertTrue(
                    all(source.strip() for source in record["provenance"])
                )

    def test_skus_are_unique_sourced_and_reference_seed_specs(self) -> None:
        records = read_jsonl(SKUS_PATH)
        sku_ids = [record["sku_id"] for record in records]
        referenced_spec_ids = {record["spec_id"] for record in records}

        self.assertGreaterEqual(len(records), 19)
        self.assertEqual(len(sku_ids), len(set(sku_ids)))
        self.assertEqual(EXPECTED_SPEC_IDS, referenced_spec_ids)
        for record in records:
            with self.subTest(sku_id=record["sku_id"]):
                self.assertIn(record["spec_id"], EXPECTED_SPEC_IDS)
                self.assertTrue(record["manufacturer_part_no"].strip())
                self.assertTrue(record["supplier"].strip())
                self.assertTrue(record["provenance"].strip())

    def test_catalog_loads_and_preserves_foreign_keys(self) -> None:
        self.assertTrue(SPECS_PATH.is_file(), f"Missing {SPECS_PATH}")
        self.assertTrue(SKUS_PATH.is_file(), f"Missing {SKUS_PATH}")
        catalog = HardwareCatalog()
        catalog.load_jsonl(SPECS_PATH, SKUS_PATH)
        stats = catalog.stats()

        self.assertEqual(19, stats["specs_total"])
        self.assertGreaterEqual(stats["skus_total"], 19)
        self.assertIn("Blum", stats["skus_by_supplier"])
        self.assertIn("Häfele", stats["skus_by_supplier"])
        self.assertIn("Italiana Ferramenta", stats["skus_by_supplier"])
        self.assertIn("Lamello", stats["skus_by_supplier"])

    def test_cross_spec_substitution_is_rejected(self) -> None:
        self.assertTrue(SPECS_PATH.is_file(), f"Missing {SPECS_PATH}")
        self.assertTrue(SKUS_PATH.is_file(), f"Missing {SKUS_PATH}")
        catalog = HardwareCatalog()
        catalog.load_jsonl(SPECS_PATH, SKUS_PATH)

        allowed, reason = catalog.substitutable(
            "sku:italiana:21001010ZN",
            "sku:italiana:21004010ZN",
        )

        self.assertFalse(allowed)
        self.assertIn("Different spec_id", reason)

    def test_boring_profile_seed_is_versioned_and_proposed(self) -> None:
        records = read_jsonl(BORING_PROFILES_PATH)

        self.assertGreaterEqual(len(records), 2)
        self.assertEqual(
            len(records), len({record["profile_id"] for record in records})
        )
        for record in records:
            with self.subTest(profile_id=record["profile_id"]):
                self.assertEqual("Proposed", record["status"])
                self.assertRegex(record["version"], SEMVER)
                self.assertTrue(record["provenance"])

    def test_default_catalog_resolves_preferred_supplier(self) -> None:
        catalog = self.load_default_catalog()

        sku = catalog.resolve_spec_to_sku(
            "spec:conn:eccentric-cam:d15",
            tenant_policy={"preferred_suppliers": ["Häfele"]},
            availability_region="TH",
        )

        self.assertIsNotNone(sku)
        self.assertEqual("Häfele", sku.supplier)

    def test_unverified_skus_cannot_be_declared_substitutable(self) -> None:
        catalog = self.load_default_catalog()

        allowed, reason = catalog.substitutable(
            "sku:hafele:262.17.020",
            "sku:titus:tl5-cam",
        )

        self.assertFalse(allowed)
        self.assertIn("not primary-source Verified", reason)

    def test_boring_lookup_matches_book_11_m6_nominal(self) -> None:
        self.load_default_catalog()
        recipe = component_master.boring_recipe(
            "spec:conn:cross-dowel:m6:d10"
        )

        self.assertEqual(10.0, recipe["primary_dia_mm"])
        self.assertEqual(12.0, recipe["panel_min_mm"])

    def test_project_validator_rejects_panel_below_spec_minimum(self) -> None:
        catalog = self.load_default_catalog()
        issues = component_master.validate_project_hardware(
            catalog,
            [
                {
                    "spec_id": "spec:conn:cross-dowel:m8:d14",
                    "sku_id": "sku:italiana:21004010ZN",
                    "panel_thickness_mm": 12.0,
                }
            ],
            tenant_policy={},
        )

        self.assertIn("PANEL_TOO_THIN", {issue.code for issue in issues})


if __name__ == "__main__":
    unittest.main()
