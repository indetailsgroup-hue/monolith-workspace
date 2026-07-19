"""Safety-first finish equivalence checks governed by ADR-003."""

from __future__ import annotations


def _has_measurement_contract(record: dict) -> bool:
    measurement = record.get("measurement", {})
    lab = measurement.get("lab", {})
    return (
        all(channel in lab for channel in ("L", "a", "b"))
        and all(
            measurement.get(field)
            for field in (
                "illuminant",
                "observer",
                "instrument_geometry",
                "sample_id",
                "measured_at",
            )
        )
    )


def _append_once(reasons: list[str], code: str) -> None:
    if code not in reasons:
        reasons.append(code)


def assess_finish_equivalence(
    left: dict,
    right: dict,
    approval: dict,
) -> tuple[bool, list[str]]:
    """Return whether supplied physical evidence supports a scoped substitution.

    The function does not calculate colour difference from raw measurements. It
    validates a declared, approved observation and its measurement contract.
    """
    reasons: list[str] = []
    records = (left, right)
    for record in records:
        if not record.get("supplier_native_code"):
            _append_once(reasons, "SUPPLIER_NATIVE_CODE_REQUIRED")
        if not record.get("canonical_finish_id"):
            _append_once(reasons, "CANONICAL_FINISH_REQUIRED")
        if not record.get("substrate_family") or not record.get("coating_family"):
            _append_once(reasons, "MATERIAL_CONTRACT_REQUIRED")
        if not _has_measurement_contract(record):
            _append_once(reasons, "MEASUREMENT_CONDITIONS_REQUIRED")
        gloss = record.get("gloss", {})
        if not all(
            field in gloss for field in ("value_gu", "geometry_degrees", "standard")
        ):
            _append_once(reasons, "GLOSS_CONTRACT_REQUIRED")
        texture = record.get("texture", {})
        if not texture.get("descriptor") or not texture.get("method"):
            _append_once(reasons, "TEXTURE_CONTRACT_REQUIRED")
        if not record.get("provenance"):
            _append_once(reasons, "PROVENANCE_REQUIRED")
        if not record.get("rights", {}).get("license_status"):
            _append_once(reasons, "RIGHTS_REQUIRED")
        if not record.get("batch_lot"):
            _append_once(reasons, "BATCH_LOT_REQUIRED")

    if not approval.get("physical_sample_approval_id"):
        _append_once(reasons, "PHYSICAL_SAMPLE_REQUIRED")
    if not approval.get("tenant_project_approval"):
        _append_once(reasons, "TENANT_PROJECT_APPROVAL_REQUIRED")
    tolerance_fields = (
        approval.get("delta_e_method"),
        approval.get("approved_tolerance"),
        approval.get("observed_delta_e"),
    )
    if any(value is None or value == "" for value in tolerance_fields):
        _append_once(reasons, "APPROVED_TOLERANCE_REQUIRED")

    if reasons:
        return False, reasons

    compatibility_fields = (
        ("canonical_finish_id", "CANONICAL_FINISH_MISMATCH"),
        ("substrate_family", "SUBSTRATE_MISMATCH"),
        ("coating_family", "COATING_MISMATCH"),
        ("batch_lot", "BATCH_LOT_MISMATCH"),
    )
    for field, code in compatibility_fields:
        if left[field] != right[field]:
            _append_once(reasons, code)

    for field in ("illuminant", "observer", "instrument_geometry"):
        if left["measurement"][field] != right["measurement"][field]:
            _append_once(reasons, "MEASUREMENT_CONDITIONS_MISMATCH")

    if left["gloss"]["geometry_degrees"] != right["gloss"]["geometry_degrees"]:
        _append_once(reasons, "GLOSS_GEOMETRY_MISMATCH")
    if left["texture"]["descriptor"] != right["texture"]["descriptor"]:
        _append_once(reasons, "TEXTURE_MISMATCH")
    if approval["observed_delta_e"] > approval["approved_tolerance"]:
        _append_once(reasons, "DELTA_E_EXCEEDS_TOLERANCE")

    return not reasons, reasons
