"""Conformance contracts for the internal MON-BS-001 profile."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_SOURCE = REPOSITORY_ROOT / "packages" / "component-master" / "src"
sys.path.insert(0, str(PACKAGE_SOURCE))

import monolith_component_master as component_master  # noqa: E402


PROFILE_PATH = (
    REPOSITORY_ROOT
    / "data"
    / "component-master"
    / "boring-standards"
    / "MON-BS-001.json"
)


def read_profile() -> dict:
    if not PROFILE_PATH.is_file():
        raise AssertionError(f"Required boring profile is missing: {PROFILE_PATH}")
    with PROFILE_PATH.open(encoding="utf-8") as source:
        return json.load(source)


class BoringStandardTests(unittest.TestCase):
    def validator(self):
        validator = getattr(component_master, "validate_profile_pin", None)
        self.assertTrue(callable(validator), "validate_profile_pin is not implemented")
        return validator

    def generator(self):
        generator = getattr(component_master, "generate_grid_coordinates", None)
        self.assertTrue(
            callable(generator), "generate_grid_coordinates is not implemented"
        )
        return generator

    def test_profile_declares_internal_non_safety_scope(self) -> None:
        profile = read_profile()

        self.assertEqual("MON-BS-001", profile["profile_id"])
        self.assertEqual("Proposed", profile["status"])
        self.assertFalse(profile["claims"]["is_iso_en_din_standard"])
        self.assertIn("does not prove", profile["safety_disclaimer"].lower())
        self.assertEqual(32.0, profile["core"]["pitch_mm"])

    def test_profile_version_mismatch_is_rejected(self) -> None:
        profile = read_profile()
        pin = {
            "profile_id": "MON-BS-001",
            "version": "99.0.0",
            "variant_id": "generic-reference",
        }

        errors = self.validator()(profile, pin)

        self.assertIn("PROFILE_VERSION_MISMATCH", errors)

    def test_unknown_supplier_variant_is_rejected(self) -> None:
        profile = read_profile()
        pin = {
            "profile_id": "MON-BS-001",
            "version": profile["version"],
            "variant_id": "supplier:unknown",
        }

        errors = self.validator()(profile, pin)

        self.assertIn("VARIANT_NOT_RECOGNIZED", errors)

    def test_pinned_profile_generates_exact_32_mm_coordinates(self) -> None:
        profile = read_profile()
        pin = {
            "profile_id": "MON-BS-001",
            "version": profile["version"],
            "variant_id": "generic-reference",
        }

        coordinates = self.generator()(
            profile, pin, start_mm=0.0, count=4
        )

        self.assertEqual([0.0, 32.0, 64.0, 96.0], coordinates)


if __name__ == "__main__":
    unittest.main()
