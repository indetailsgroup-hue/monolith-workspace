"""Executable policy contracts for ADR-001 without pretending runtime deployment."""

from __future__ import annotations

import json
from pathlib import Path
import unittest


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
CONTRACT_DIR = REPOSITORY_ROOT / "packages" / "identity-tenancy" / "contracts"
SCHEMA_PATH = CONTRACT_DIR / "tenant-boundary.schema.json"
MATRIX_PATH = CONTRACT_DIR / "isolation-test-matrix.json"
README_VARIANTS = (
    REPOSITORY_ROOT / "packages" / "identity-tenancy" / "README.en.md",
    REPOSITORY_ROOT / "packages" / "identity-tenancy" / "README.th.md",
    REPOSITORY_ROOT / "packages" / "identity-tenancy" / "README.en.html",
    REPOSITORY_ROOT / "packages" / "identity-tenancy" / "README.th.html",
)


def read_json(path: Path) -> dict:
    if not path.is_file():
        raise AssertionError(f"Required tenant contract is missing: {path}")
    with path.open(encoding="utf-8") as source:
        return json.load(source)


class TenantBoundaryContractTests(unittest.TestCase):
    def test_bridge_identity_and_authority_decisions_are_exact(self) -> None:
        contract = read_json(SCHEMA_PATH)["x-monolith-policy"]

        self.assertEqual("Bridge", contract["isolation_model"])
        self.assertEqual(
            "global-identity+tenant-scoped-membership",
            contract["identity_model"],
        )
        self.assertEqual("tenant-local", contract["customer_profile_scope"])
        self.assertEqual(
            "MONOLITH-governance-only", contract["shared_kernel_write_authority"]
        )
        self.assertEqual("break-glass-only", contract["support_access"]["mode"])
        self.assertEqual(
            {"Platform Owner", "Architecture", "Security/Privacy"},
            set(contract["ratification"]["required_roles"]),
        )
        self.assertEqual("consulted-pilot-only", contract["ratification"]["Daph"])

    def test_authenticated_tenant_context_propagates_to_every_plane(self) -> None:
        document = read_json(SCHEMA_PATH)
        required_context = set(document["required"])
        policy = document["x-monolith-policy"]

        self.assertTrue(
            {
                "global_identity_id",
                "active_tenant_id",
                "membership_id",
                "home_region",
                "request_id",
            }.issubset(required_context)
        )
        self.assertEqual(
            {
                "database",
                "object-storage",
                "cache",
                "jobs",
                "events",
                "webhooks",
                "audit",
            },
            set(policy["tenant_context_planes"]),
        )
        self.assertEqual("authenticated-membership-only", policy["tenant_context_source"])

    def test_database_keys_region_and_analytics_red_lines_are_declared(self) -> None:
        policy = read_json(SCHEMA_PATH)["x-monolith-policy"]

        self.assertTrue(policy["database"]["force_rls"])
        self.assertEqual(
            {"superuser", "table-owner", "BYPASSRLS"},
            set(policy["database"]["runtime_role_forbidden"]),
        )
        self.assertEqual("separate", policy["database"]["migration_role"])
        self.assertEqual("tenant-specific-DEK", policy["encryption"]["standard"])
        self.assertEqual("customer-managed-key", policy["encryption"]["dedicated"])
        self.assertEqual("two-person-audited", policy["encryption"]["cryptographic_erase"])
        self.assertTrue(policy["residency"]["home_region_immutable"])
        self.assertFalse(policy["residency"]["silent_cross_region_failover"])
        self.assertFalse(policy["analytics_ai"]["raw_cross_tenant_default"])
        self.assertEqual(
            "irreversible-aggregate-only", policy["analytics_ai"]["default_allowed"]
        )
        self.assertEqual(
            "contractual-opt-in", policy["analytics_ai"]["broader_use"]
        )

    def test_offboarding_and_resilience_objectives_match_owner_decision(self) -> None:
        policy = read_json(SCHEMA_PATH)["x-monolith-policy"]

        self.assertEqual(
            {
                "export_window_days": 7,
                "recovery_window_days": 30,
                "production_delete_by_days": 30,
                "backup_unusable_by_days": 90,
                "legal_hold": "controlled-and-audited",
            },
            policy["offboarding"],
        )
        self.assertEqual(15, policy["resilience"]["standard_rpo_minutes"])
        self.assertEqual(240, policy["resilience"]["standard_rto_minutes"])
        self.assertTrue(policy["resilience"]["tenant_scoped_restore"])
        self.assertEqual(
            "contract-specific-stricter-objectives",
            policy["resilience"]["dedicated_tenant_objectives"],
        )

    def test_isolation_matrix_denies_cross_tenant_access_on_every_plane(self) -> None:
        matrix = read_json(MATRIX_PATH)
        negative_cases = matrix["negative_cases"]

        self.assertEqual(
            {
                "database",
                "object-storage",
                "cache",
                "jobs",
                "events",
                "webhooks",
                "audit",
                "analytics-ai",
            },
            {case["plane"] for case in negative_cases},
        )
        for case in negative_cases:
            with self.subTest(case_id=case["case_id"]):
                self.assertEqual("tenant:A", case["actor_tenant"])
                self.assertEqual("tenant:B", case["target_tenant"])
                self.assertEqual("deny", case["expected"])
                self.assertTrue(case["required_evidence"])

    def test_break_glass_requires_complete_time_bounded_audit_metadata(self) -> None:
        policy = read_json(SCHEMA_PATH)["x-monolith-policy"]["support_access"]

        self.assertEqual(
            {
                "ticket",
                "purpose",
                "tenant_id",
                "actor_id",
                "scope",
                "approver_id",
                "starts_at",
                "expires_at",
                "audit_event_id",
            },
            set(policy["required_metadata"]),
        )
        self.assertFalse(policy["standing_access"])

    def test_bilingual_readme_and_html_variants_exist(self) -> None:
        missing = [path for path in README_VARIANTS if not path.is_file()]
        self.assertEqual([], missing, f"Missing documentation variants: {missing}")


if __name__ == "__main__":
    unittest.main()
