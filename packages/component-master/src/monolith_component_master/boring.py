"""Reference drilling lookup and program builders governed by ADR-005."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Face(str, Enum):
    L1 = "L1"
    L2 = "L2"
    W1 = "W1"
    W2 = "W2"
    FACE = "FACE"
    BACK = "BACK"


@dataclass
class Hole:
    x_mm: float
    y_mm: float
    face: Face
    diameter_mm: float
    depth_mm: float
    purpose: str = ""
    tool_hint: str = ""


@dataclass
class DrillProgram:
    panel_id: str
    panel_length_mm: float
    panel_width_mm: float
    panel_thickness_mm: float
    holes: list[Hole] = field(default_factory=list)
    boring_system: str = "any"
    notes: list[str] = field(default_factory=list)

    def total_holes(self) -> int:
        return len(self.holes)

    def unique_tools(self) -> list[str]:
        return sorted({hole.tool_hint for hole in self.holes if hole.tool_hint})


SYSTEM_32_PITCH_MM = 32.0
SYSTEM_32_HOLE_DIA_MM = 5.0
HINGE_CUP_DIA_MM = 35.0
HINGE_CUP_DEPTH_MM = 12.5
HINGE_SETBACK_MM_DEFAULT = 37.0
SHELF_PIN_DIA_MM = 5.0
SHELF_PIN_ROW_SETBACK_MM = 37.0


def boring_recipe(spec_id: str) -> dict:
    """Return the legacy reference recipe for a canonical specification."""
    recipes = {
        "spec:conn:cross-dowel:m6:d10": {
            "primary_dia_mm": 10.0,
            "primary_depth_mm": 12.0,
            "secondary_dia_mm": 8.0,
            "secondary_depth_mm": None,
            "panel_min_mm": 12.0,
            "edge_distance_min_mm": 25.0,
            "boring_system": "any",
        },
        "spec:conn:cross-dowel:m8:d14": {
            "primary_dia_mm": 14.0,
            "primary_depth_mm": 16.0,
            "secondary_dia_mm": 8.0,
            "secondary_depth_mm": None,
            "panel_min_mm": 16.0,
            "edge_distance_min_mm": 30.0,
            "boring_system": "any",
        },
        "spec:conn:cross-dowel:m10:d16": {
            "primary_dia_mm": 16.0,
            "primary_depth_mm": 18.0,
            "secondary_dia_mm": 10.0,
            "secondary_depth_mm": None,
            "panel_min_mm": 19.0,
            "edge_distance_min_mm": 35.0,
            "boring_system": "any",
        },
        "spec:conn:eccentric-cam:d15": {
            "primary_dia_mm": 15.0,
            "primary_depth_mm": 12.7,
            "secondary_dia_mm": 5.0,
            "secondary_depth_mm": 11.0,
            "panel_min_mm": 16.0,
            "edge_distance_min_mm": 9.5,
            "boring_system": "32mm-generic",
        },
        "spec:conn:eccentric-cam:d20": {
            "primary_dia_mm": 20.0,
            "primary_depth_mm": 12.7,
            "secondary_dia_mm": 5.0,
            "secondary_depth_mm": 11.5,
            "panel_min_mm": 19.0,
            "edge_distance_min_mm": 12.0,
            "boring_system": "32mm-generic",
        },
        "spec:conn:confirmat-screw:7x50": {
            "primary_dia_mm": 5.0,
            "primary_depth_mm": 50.0,
            "secondary_dia_mm": 7.0,
            "secondary_depth_mm": 15.0,
            "panel_min_mm": 15.0,
            "edge_distance_min_mm": 40.0,
            "boring_system": "any",
        },
        "spec:conn:invisible-detachable": {
            "primary_dia_mm": None,
            "primary_depth_mm": 13.5,
            "groove_width_mm": 7.0,
            "groove_length_mm": 45.0,
            "panel_min_mm": 16.0,
            "edge_distance_min_mm": 37.5,
            "boring_system": "lamello-p",
            "machine_dependency": ["Lamello Zeta P2"],
        },
        "spec:conn:screw-in-housing": {
            "primary_dia_mm": 12.0,
            "primary_depth_mm": 12.0,
            "secondary_dia_mm": None,
            "secondary_depth_mm": None,
            "panel_min_mm": 16.0,
            "edge_distance_min_mm": 14.0,
            "boring_system": "any",
        },
        "spec:hinge:concealed:110deg:soft-close": {
            "primary_dia_mm": 35.0,
            "primary_depth_mm": 12.5,
            "secondary_dia_mm": 8.0,
            "secondary_depth_mm": 12.0,
            "secondary_pitch_mm": 45.0,
            "panel_min_mm": 15.0,
            "edge_distance_min_mm": 3.0,
            "setback_default_mm": 37.0,
            "boring_system": "32mm-generic",
        },
    }
    return recipes.get(spec_id, {})


def validate_boring(
    spec_id: str,
    panel_thickness_mm: float,
    edge_distance_mm: float,
) -> list[str]:
    recipe = boring_recipe(spec_id)
    if not recipe:
        return [f"No boring recipe for spec_id={spec_id!r}"]
    errors: list[str] = []
    panel_min = recipe.get("panel_min_mm")
    if panel_min and panel_thickness_mm < panel_min:
        errors.append(
            f"Panel thickness {panel_thickness_mm}mm below minimum "
            f"{panel_min}mm for {spec_id}"
        )
    depth = recipe.get("primary_depth_mm")
    if depth and depth > panel_thickness_mm:
        errors.append(
            f"Drill depth {depth}mm exceeds panel thickness "
            f"{panel_thickness_mm}mm — will blow through"
        )
    edge_min = recipe.get("edge_distance_min_mm")
    if edge_min and edge_distance_mm < edge_min:
        errors.append(
            f"Edge distance {edge_distance_mm}mm below minimum "
            f"{edge_min}mm for {spec_id}"
        )
    return errors


def build_shelf_pin_row(
    panel_length_mm: float,
    panel_thickness_mm: float,
    face: Face = Face.FACE,
    setback_mm: float = SHELF_PIN_ROW_SETBACK_MM,
    top_margin_mm: float = 96.0,
    bottom_margin_mm: float = 96.0,
) -> list[Hole]:
    del panel_thickness_mm
    holes: list[Hole] = []
    y = top_margin_mm
    while y <= panel_length_mm - bottom_margin_mm:
        holes.append(
            Hole(
                x_mm=setback_mm,
                y_mm=y,
                face=face,
                diameter_mm=SHELF_PIN_DIA_MM,
                depth_mm=8.0,
                purpose="shelf pin (LR32)",
                tool_hint="5mm brad point",
            )
        )
        y += SYSTEM_32_PITCH_MM
    return holes


def build_hinge_cup_pair(
    panel_length_mm: float,
    panel_thickness_mm: float,
    top_hinge_mm: float = 100.0,
    bottom_hinge_mm: float = 100.0,
    setback_mm: float = HINGE_SETBACK_MM_DEFAULT,
) -> list[Hole]:
    del panel_thickness_mm
    holes: list[Hole] = []
    for y in (top_hinge_mm, panel_length_mm - bottom_hinge_mm):
        holes.append(
            Hole(
                x_mm=setback_mm,
                y_mm=y,
                face=Face.BACK,
                diameter_mm=HINGE_CUP_DIA_MM,
                depth_mm=HINGE_CUP_DEPTH_MM,
                purpose="hinge cup Ø35",
                tool_hint="35mm Forstner or drill block",
            )
        )
        for delta_x in (-22.5, 22.5):
            holes.append(
                Hole(
                    x_mm=setback_mm + delta_x,
                    y_mm=y,
                    face=Face.BACK,
                    diameter_mm=8.0,
                    depth_mm=12.0,
                    purpose="hinge fixing dowel",
                    tool_hint="8mm brad point",
                )
            )
    return holes


def build_cross_dowel_joint(
    panel_length_mm: float,
    panel_thickness_mm: float,
    spec_id: str = "spec:conn:cross-dowel:m6:d10",
    joint_positions_mm: Optional[list[float]] = None,
    face: Face = Face.L1,
) -> list[Hole]:
    recipe = boring_recipe(spec_id)
    if not recipe:
        return []
    positions = joint_positions_mm or [80.0, panel_length_mm - 80.0]
    return [
        Hole(
            x_mm=panel_thickness_mm / 2,
            y_mm=position,
            face=face,
            diameter_mm=recipe["primary_dia_mm"],
            depth_mm=recipe["primary_depth_mm"],
            purpose=f"cross dowel body ({spec_id})",
            tool_hint=f"{recipe['primary_dia_mm']}mm brad point",
        )
        for position in positions
    ]


def validate_profile_pin(profile: dict, pin: dict) -> list[str]:
    """Validate an exact project pin; no implicit profile upgrade is allowed."""
    errors: list[str] = []
    if pin.get("profile_id") != profile.get("profile_id"):
        errors.append("PROFILE_ID_MISMATCH")
    if pin.get("version") != profile.get("version"):
        errors.append("PROFILE_VERSION_MISMATCH")
    known_variants = {
        variant["variant_id"] for variant in profile.get("variants", [])
    }
    if pin.get("variant_id") not in known_variants:
        errors.append("VARIANT_NOT_RECOGNIZED")
    return errors


def generate_grid_coordinates(
    profile: dict,
    pin: dict,
    start_mm: float,
    count: int,
) -> list[float]:
    """Generate coordinates from an exactly pinned internal profile."""
    errors = validate_profile_pin(profile, pin)
    if errors:
        raise ValueError(",".join(errors))
    if count < 0:
        raise ValueError("count must be >= 0")
    pitch_mm = float(profile["core"]["pitch_mm"])
    return [start_mm + index * pitch_mm for index in range(count)]
