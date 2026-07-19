"""Public API for the Proposed MONOLITH Component Master reference package."""

from .boring import (
    DrillProgram,
    Face,
    Hole,
    boring_recipe,
    build_cross_dowel_joint,
    build_hinge_cup_pair,
    build_shelf_pin_row,
    generate_grid_coordinates,
    validate_profile_pin,
    validate_boring,
)
from .catalog import (
    BoringSystem,
    ComponentSpec,
    Dimensions,
    DriveType,
    HardwareCatalog,
    SpecStatus,
    Substitutability,
    SupplierSKU,
    ThreadClass,
    default_data_dir,
    load_default_catalog,
)
from .validators import ValidationIssue, report, validate_project_hardware
from .finishes import assess_finish_equivalence

__all__ = [
    "BoringSystem",
    "ComponentSpec",
    "Dimensions",
    "DrillProgram",
    "DriveType",
    "Face",
    "HardwareCatalog",
    "Hole",
    "SpecStatus",
    "Substitutability",
    "SupplierSKU",
    "ThreadClass",
    "ValidationIssue",
    "boring_recipe",
    "assess_finish_equivalence",
    "build_cross_dowel_joint",
    "build_hinge_cup_pair",
    "build_shelf_pin_row",
    "default_data_dir",
    "load_default_catalog",
    "generate_grid_coordinates",
    "report",
    "validate_boring",
    "validate_profile_pin",
    "validate_project_hardware",
]
