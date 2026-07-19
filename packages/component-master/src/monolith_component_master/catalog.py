"""Reference Component Master two-layer catalog governed by ADR-002."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
import json
from pathlib import Path
from typing import Optional


class DriveType(str, Enum):
    PZ2 = "PZ2"
    PZ3 = "PZ3"
    PH2 = "PH2"
    BLADE_1x5_5 = "BLADE_1x5.5"
    HEX_4 = "HEX_4"
    HEX_5 = "HEX_5"
    TORX_T15 = "TORX_T15"
    TORX_T20 = "TORX_T20"
    TORX_T25 = "TORX_T25"
    TOOL_FREE = "TOOL_FREE"
    LEVER = "LEVER"


class ThreadClass(str, Enum):
    M6 = "M6"
    M8 = "M8"
    M10 = "M10"
    NONE = "NONE"


class Substitutability(str, Enum):
    FUNCTIONALLY_EQUIVALENT = "functionally-equivalent"
    DIMENSIONALLY_INTERCHANGEABLE = "dimensionally-interchangeable"
    REQUIRES_REBORE = "requires-rebore"
    UNIQUE = "unique"


class SpecStatus(str, Enum):
    PROPOSED = "Proposed"
    RATIFIED = "Ratified"
    DEPRECATED = "Deprecated"


class BoringSystem(str, Enum):
    ANY = "any"
    SYSTEM_32_BLUM = "32mm-blum"
    SYSTEM_32_GRASS = "32mm-grass"
    SYSTEM_32_HETTICH = "32mm-hettich"
    SYSTEM_32_GENERIC = "32mm-generic"
    LAMELLO_P_SYSTEM = "lamello-p"


@dataclass
class ComponentSpec:
    spec_id: str
    spec_version: str
    category: str
    function_en: str
    function_th: str = ""
    standards: list[str] = field(default_factory=list)
    thread: ThreadClass = ThreadClass.NONE
    drill_dia_mm: Optional[float] = None
    drill_depth_mm: Optional[float] = None
    panel_min_mm: Optional[float] = None
    load_min_N: Optional[float] = None
    drives: list[DriveType] = field(default_factory=list)
    assembly_sequence: list[str] = field(default_factory=list)
    symbols: list[str] = field(default_factory=list)
    boring_system: BoringSystem = BoringSystem.ANY
    machine_dependency: list[str] = field(default_factory=list)
    substitutability_class: Substitutability = (
        Substitutability.FUNCTIONALLY_EQUIVALENT
    )
    provenance: list[str] = field(default_factory=list)
    status: SpecStatus = SpecStatus.PROPOSED

    def validate(self) -> list[str]:
        errors: list[str] = []
        if not self.spec_id.startswith("spec:"):
            errors.append(f"spec_id must start with 'spec:' (got {self.spec_id!r})")
        if self.drill_dia_mm is not None and self.drill_dia_mm <= 0:
            errors.append(f"drill_dia_mm must be > 0 (got {self.drill_dia_mm})")
        if self.panel_min_mm is not None and self.panel_min_mm <= 0:
            errors.append("panel_min_mm must be > 0")
        if self.drill_depth_mm is not None and self.panel_min_mm is not None:
            if self.drill_depth_mm > self.panel_min_mm:
                errors.append(
                    f"drill_depth_mm ({self.drill_depth_mm}) exceeds "
                    f"panel_min_mm ({self.panel_min_mm}) — will blow through"
                )
        return errors


@dataclass
class Dimensions:
    L: Optional[float] = None
    L1: Optional[float] = None
    L2: Optional[float] = None
    L3: Optional[float] = None
    H: Optional[float] = None
    diameter: Optional[float] = None


@dataclass
class SupplierSKU:
    sku_id: str
    spec_id: str
    supplier: str
    manufacturer_part_no: str
    finish_code: str = ""
    dimensions: Dimensions = field(default_factory=Dimensions)
    pack_qty: int = 1
    moq: int = 1
    availability: list[str] = field(default_factory=list)
    catalog_url: str = ""
    catalog_page: str = ""
    equivalent_skus: list[str] = field(default_factory=list)
    substitution_notes: str = ""
    discontinued_at: Optional[str] = None
    verified: bool = False
    provenance: str = ""

    def validate(self) -> list[str]:
        errors: list[str] = []
        if not self.sku_id.startswith("sku:"):
            errors.append(f"sku_id must start with 'sku:' (got {self.sku_id!r})")
        if not self.spec_id.startswith("spec:"):
            errors.append(f"spec_id (FK) invalid: {self.spec_id!r}")
        if self.pack_qty < 1:
            errors.append("pack_qty must be >= 1")
        return errors


def default_data_dir() -> Path:
    """Return the repository-owned seed directory, independent of process CWD."""
    repository_root = Path(__file__).resolve().parents[4]
    return repository_root / "data" / "component-master"


def load_default_catalog() -> "HardwareCatalog":
    """Load the governed repository seed without relying on process CWD."""
    data_dir = default_data_dir()
    catalog = HardwareCatalog()
    catalog.load_jsonl(data_dir / "specs.jsonl", data_dir / "skus.jsonl")
    return catalog


class HardwareCatalog:
    """In-memory reference repository; production persistence is out of scope."""

    def __init__(self) -> None:
        self._specs: dict[str, ComponentSpec] = {}
        self._skus: dict[str, SupplierSKU] = {}

    def add_spec(self, spec: ComponentSpec) -> None:
        errors = spec.validate()
        if errors:
            raise ValueError(f"Invalid spec {spec.spec_id}: {errors}")
        if spec.spec_id in self._specs:
            raise ValueError(f"Duplicate spec_id: {spec.spec_id}")
        self._specs[spec.spec_id] = spec

    def get_spec(self, spec_id: str) -> Optional[ComponentSpec]:
        return self._specs.get(spec_id)

    def list_specs(self, category_prefix: str = "") -> list[ComponentSpec]:
        if not category_prefix:
            return list(self._specs.values())
        return [
            spec
            for spec in self._specs.values()
            if spec.category.startswith(category_prefix)
        ]

    def add_sku(self, sku: SupplierSKU) -> None:
        errors = sku.validate()
        if errors:
            raise ValueError(f"Invalid SKU {sku.sku_id}: {errors}")
        if sku.spec_id not in self._specs:
            raise ValueError(
                f"SKU {sku.sku_id} references unknown spec_id {sku.spec_id}"
            )
        if sku.sku_id in self._skus:
            raise ValueError(f"Duplicate sku_id: {sku.sku_id}")
        self._skus[sku.sku_id] = sku

    def get_sku(self, sku_id: str) -> Optional[SupplierSKU]:
        return self._skus.get(sku_id)

    def skus_for_spec(self, spec_id: str) -> list[SupplierSKU]:
        return [sku for sku in self._skus.values() if sku.spec_id == spec_id]

    def skus_by_supplier(self, supplier: str) -> list[SupplierSKU]:
        return [sku for sku in self._skus.values() if sku.supplier == supplier]

    def substitutable(
        self,
        sku_a_id: str,
        sku_b_id: str,
        tenant_policy: Optional[dict] = None,
    ) -> tuple[bool, str]:
        a = self.get_sku(sku_a_id)
        b = self.get_sku(sku_b_id)
        if a is None:
            return False, f"SKU not found: {sku_a_id}"
        if b is None:
            return False, f"SKU not found: {sku_b_id}"
        if a.spec_id != b.spec_id:
            return False, (
                f"Different spec_id: {a.spec_id} vs {b.spec_id} — "
                "design intent differs; explicit spec change required."
            )
        spec = self.get_spec(a.spec_id)
        if spec is None:
            return False, f"Spec not found: {a.spec_id}"
        if not a.verified or not b.verified:
            return False, (
                "One or both SKU records are not primary-source Verified; "
                "they remain research candidates, not approved substitutes."
            )
        if spec.status != SpecStatus.RATIFIED:
            return False, (
                f"Spec {spec.spec_id} status = {spec.status.value}; "
                "only Ratified specs can authorize substitution."
            )
        if spec.substitutability_class != Substitutability.FUNCTIONALLY_EQUIVALENT:
            return False, (
                f"Spec {spec.spec_id} substitutability_class = "
                f"{spec.substitutability_class} — not freely substitutable."
            )
        if tenant_policy:
            allowed = tenant_policy.get("allowed_suppliers")
            if allowed and (a.supplier not in allowed or b.supplier not in allowed):
                return False, (
                    "Tenant policy restricts supplier list; "
                    f"one of {a.supplier}, {b.supplier} not permitted."
                )
        if a.discontinued_at or b.discontinued_at:
            return False, "One or both SKUs discontinued."
        return True, "Substitutable"

    def resolve_spec_to_sku(
        self,
        spec_id: str,
        tenant_policy: dict,
        availability_region: str = "TH",
    ) -> Optional[SupplierSKU]:
        candidates = self.skus_for_spec(spec_id)
        preferred = tenant_policy.get("preferred_suppliers", [])
        allowed = tenant_policy.get("allowed_suppliers")
        if allowed:
            candidates = [sku for sku in candidates if sku.supplier in allowed]
        if not candidates:
            return None

        def score(sku: SupplierSKU) -> tuple[bool, bool, int, bool]:
            in_region = availability_region in sku.availability or not sku.availability
            preference_rank = (
                preferred.index(sku.supplier) if sku.supplier in preferred else 999
            )
            return (
                sku.discontinued_at is None,
                in_region,
                -preference_rank,
                sku.verified,
            )

        return max(candidates, key=score)

    def load_jsonl(self, specs_path: Path, skus_path: Path) -> None:
        with specs_path.open(encoding="utf-8") as specs_file:
            for line in specs_file:
                if line.strip():
                    self.add_spec(_dict_to_spec(json.loads(line)))
        with skus_path.open(encoding="utf-8") as skus_file:
            for line in skus_file:
                if line.strip():
                    self.add_sku(_dict_to_sku(json.loads(line)))

    def stats(self) -> dict:
        by_category: dict[str, int] = {}
        for spec in self._specs.values():
            by_category[spec.category] = by_category.get(spec.category, 0) + 1
        by_supplier: dict[str, int] = {}
        for sku in self._skus.values():
            by_supplier[sku.supplier] = by_supplier.get(sku.supplier, 0) + 1
        return {
            "specs_total": len(self._specs),
            "skus_total": len(self._skus),
            "specs_by_category": by_category,
            "skus_by_supplier": by_supplier,
            "verified_skus": sum(1 for sku in self._skus.values() if sku.verified),
        }


def _dict_to_spec(data: dict) -> ComponentSpec:
    values = {**data}
    for field_name, enum_class in (
        ("thread", ThreadClass),
        ("substitutability_class", Substitutability),
        ("status", SpecStatus),
        ("boring_system", BoringSystem),
    ):
        if field_name in values and isinstance(values[field_name], str):
            values[field_name] = enum_class(values[field_name])
    if "drives" in values:
        values["drives"] = [
            DriveType(value) if isinstance(value, str) else value
            for value in values["drives"]
        ]
    return ComponentSpec(**values)


def _dict_to_sku(data: dict) -> SupplierSKU:
    values = {**data}
    if "dimensions" in values and isinstance(values["dimensions"], dict):
        values["dimensions"] = Dimensions(**values["dimensions"])
    return SupplierSKU(**values)
