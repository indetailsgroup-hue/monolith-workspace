"""Cross-cutting validators for Component Master selections."""

from __future__ import annotations

from dataclasses import dataclass

from .catalog import HardwareCatalog, SpecStatus


@dataclass
class ValidationIssue:
    severity: str
    code: str
    message: str
    context: dict


def validate_project_hardware(
    catalog: HardwareCatalog,
    selections: list[dict],
    tenant_policy: dict,
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    tenant_tools = set(tenant_policy.get("available_drives", []))
    tenant_machines = set(tenant_policy.get("available_machines", []))
    allowed_suppliers = set(tenant_policy.get("allowed_suppliers", []) or [])

    for selection in selections:
        spec_id = selection["spec_id"]
        sku_id = selection.get("sku_id")
        panel_thickness = selection.get("panel_thickness_mm")
        context = {"spec_id": spec_id, "sku_id": sku_id}
        spec = catalog.get_spec(spec_id)
        if spec is None:
            issues.append(
                ValidationIssue(
                    "error", "SPEC_NOT_FOUND", f"Unknown spec_id {spec_id!r}", context
                )
            )
            continue

        if spec.status == SpecStatus.PROPOSED:
            issues.append(
                ValidationIssue(
                    "warning",
                    "SPEC_PROPOSED_NOT_RATIFIED",
                    f"Spec {spec_id} is Proposed — evidence chain incomplete",
                    context,
                )
            )
        elif spec.status == SpecStatus.DEPRECATED:
            issues.append(
                ValidationIssue(
                    "error", "SPEC_DEPRECATED", f"Spec {spec_id} is Deprecated", context
                )
            )

        if (
            panel_thickness is not None
            and spec.panel_min_mm is not None
            and panel_thickness < spec.panel_min_mm
        ):
            issues.append(
                ValidationIssue(
                    "error",
                    "PANEL_TOO_THIN",
                    f"Panel {panel_thickness}mm < min {spec.panel_min_mm}mm "
                    f"required by {spec_id}",
                    context,
                )
            )

        if tenant_tools and spec.drives:
            if not any(drive.value in tenant_tools for drive in spec.drives):
                issues.append(
                    ValidationIssue(
                        "warning",
                        "DRIVE_TOOL_MISSING",
                        f"Tenant workshop lacks drive tools for {spec.drives}",
                        context,
                    )
                )

        missing_machines = [
            machine
            for machine in spec.machine_dependency
            if machine not in tenant_machines
        ]
        if missing_machines:
            issues.append(
                ValidationIssue(
                    "error",
                    "MACHINE_MISSING",
                    f"Missing machine(s): {missing_machines} required by {spec_id}",
                    context,
                )
            )

        if sku_id:
            sku = catalog.get_sku(sku_id)
            if sku is None:
                issues.append(
                    ValidationIssue(
                        "error", "SKU_NOT_FOUND", f"Unknown sku_id {sku_id!r}", context
                    )
                )
                continue
            if sku.spec_id != spec_id:
                issues.append(
                    ValidationIssue(
                        "error",
                        "SKU_SPEC_MISMATCH",
                        f"SKU {sku_id} realizes {sku.spec_id}, not {spec_id}",
                        context,
                    )
                )
            if sku.discontinued_at:
                issues.append(
                    ValidationIssue(
                        "error",
                        "SKU_DISCONTINUED",
                        f"SKU {sku_id} discontinued at {sku.discontinued_at}",
                        context,
                    )
                )
            if allowed_suppliers and sku.supplier not in allowed_suppliers:
                issues.append(
                    ValidationIssue(
                        "error",
                        "SUPPLIER_NOT_ALLOWED",
                        f"Tenant policy disallows supplier {sku.supplier!r}",
                        context,
                    )
                )
            if not sku.verified:
                issues.append(
                    ValidationIssue(
                        "info",
                        "SKU_UNVERIFIED",
                        f"SKU {sku_id} data is Reported, not primary-source Verified",
                        context,
                    )
                )
    return issues


def report(issues: list[ValidationIssue]) -> str:
    if not issues:
        return "OK — no issues."
    counts = {"error": 0, "warning": 0, "info": 0}
    lines: list[str] = []
    for issue in issues:
        counts[issue.severity] = counts.get(issue.severity, 0) + 1
        lines.append(
            f"[{issue.severity.upper():7}] {issue.code:30} {issue.message}"
        )
    header = (
        f"{counts['error']} error(s), {counts['warning']} warning(s), "
        f"{counts['info']} info"
    )
    return header + "\n" + "\n".join(lines)
