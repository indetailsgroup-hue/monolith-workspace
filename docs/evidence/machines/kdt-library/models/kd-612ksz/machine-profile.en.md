# Machine Profile — KDT KD-612KSZ

> `profile_id: kdt.drilling.kd_612ksz@0.1-research-draft` · as-of: 2026-07-17
> [TH edition / ฉบับภาษาไทย](machine-profile.th.md)

**Drilling Tech** — Drilling machine

## 1. Model identity

| | |
|---|---|
| Manufacturer | KDT (Guangzhou/Guangdong KDT Machinery) |
| Model | **KD-612KSZ** |
| Aliases | none |
| Family | Drilling Tech |
| Catalog status | current-global |
| Region | Global |
| Purpose | Drilling machine |
| Source URLs | [en.kdtmac.com](https://en.kdtmac.com/products_list/5.html) |

## 2. Platform template vs. tenant machine instance

This document describes a **reusable platform template** derived from public catalog evidence. It is **not** a tenant-specific machine instance. A physical machine owned by a tenant (e.g. Daph) is a separate **machine instance** whose controller hardware, firmware, tool table, coordinate origin, physical delivery path and known-good job remain **Unknown** until onsite machine-instance evidence is recorded.

## 3. Technical field groups (7)

| Field group | Value | Evidence status | Source |
|---|---|---|---|
| Working envelope (`envelope`) | Panel L 70-2800mm x W 50-1200mm (35-50 when L<=1000) x T 9-60mm; min panel 70x35 | Verified in documents | [ledamachinery.com.au](https://ledamachinery.com.au/wp-content/uploads/2024/05/KD-612KSZ-kdt-quotation-05.23.pdf) |
| Capabilities (`capabilities`) | Drills: Top 26V+12H, Bottom 9V; spindle Top 5.5kW / Bottom 3.5kW; 5 ATC types; double-drill package six-side; drill clip Ø10 | Verified in documents | [ledamachinery.com.au](https://ledamachinery.com.au/wp-content/uploads/2024/05/KD-612KSZ-kdt-quotation-05.23.pdf) |
| Capacities (`capacities`) | Max speed 140(X)/90(Y)/50(Z) m/min; B axis 75, C axis 30 m/min; gripper 140 m/min; gripper trip up to 5.5m | Verified in documents | [ledamachinery.com.au](https://ledamachinery.com.au/wp-content/uploads/2024/05/KD-612KSZ-kdt-quotation-05.23.pdf) |
| Controller / HMI (`controller_hmi`) | Unknown | Unknown | none |
| Native / import formats (`native_import_formats`) | Unknown | Unknown | none |
| Automation (`automation`) | Double gripper, long guide rail; auto hole-position detect; connects to various split software | Verified in documents | [ledamachinery.com.au](https://ledamachinery.com.au/wp-content/uploads/2024/05/KD-612KSZ-kdt-quotation-05.23.pdf) |
| Footprint / power / weight (`footprint_power_weight`) | Total power 28.22kW; overall 6040L x 3134W x 2190H mm; package 5700x2600x2350; dust 200*2+100*2; working pressure 0.6MPa | Verified in documents | [ledamachinery.com.au](https://ledamachinery.com.au/wp-content/uploads/2024/05/KD-612KSZ-kdt-quotation-05.23.pdf) |

## 4. Documented conflicts (not resolved)

No documented conflicts recorded in the research corpus for this model.

## 5. Controller Profile

Instance-level controller facts are **Unknown** unless the exact-model evidence explicitly supports them. Family or sibling-model controllers are never inferred here.

| | |
|---|---|
| Controller vendor | Unknown |
| Controller hardware model | Unknown |
| Firmware / software version | Unknown |
| HMI shell / version | Unknown |
| Operating system | Unknown |

## 6. Delivery Contract

All fields below are **Unknown** unless exact-model evidence supports them. Formats, postprocessors, barcode payloads, channels and coordinate/tool contracts are instance-level and are not generalized from other models.

| | |
|---|---|
| Authoritative native format | Unknown |
| Accepted import formats | Unknown |
| Postprocessor | Unknown |
| Barcode payload | Unknown |
| Delivery channel / path | Unknown |
| Coordinate / tool contract | Unknown |

### Proposed logical delivery URI (non-secret)

```
monolith://tenants/{tenant_id}/machines/{machine_instance_id}/delivery/inbound
```

This is a **logical** identifier only, not a physical path, IP address, hostname or share. Tenant and instance identifiers are placeholders resolved by the platform at runtime.

## 7. Coverage score

**5 / 7** — Populated technical field-groups with a source-cited value, out of 7. · As of 2026-07-17

## 8. Required machine-side evidence checklist

- [ ] Photograph the nameplate: exact model code, serial number, build year.
- [ ] Photograph the controller/HMI “About” screen: vendor, hardware model, firmware/software/HMI/OS version.
- [ ] Export or photograph the live tool table and coordinate/work-offset settings.
- [ ] Confirm the authoritative native format and accepted imports from the machine’s own import dialog.
- [ ] Confirm the physical delivery channel/path actually used on this machine.
- [ ] Capture one immutable known-good job that the machine already runs correctly.
- [ ] Record any conflicts resolved on-site, with photographic evidence.

---
MONOLITH · KDT Machine Intelligence Library — research draft, as of 2026-07-17. Public catalog values are **Verified in documents**, never Observed in operation. This document confers no manufacturing authority.