# Machine Profile — KDT KD-612G

> `profile_id: kdt.drilling.kd_612g@0.1-research-draft` · as-of: 2026-07-17
> [TH edition / ฉบับภาษาไทย](machine-profile.th.md)

**Drilling Tech** — Drilling machine

## 1. Model identity

| | |
|---|---|
| Manufacturer | KDT (Guangzhou/Guangdong KDT Machinery) |
| Model | **KD-612G** |
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
| Working envelope (`envelope`) | Panel L 70-3000mm (KDT Iberica) / 70-2800 (KDT UA) / 200-2800 (KDT Europe); W 50-1215mm (35-50 when L<=1000); T 9-60mm | Verified in documents | [kdtiberica.com](https://kdtiberica.com/en/drills/cnc-drills/cnc-drill-kd-612g/) |
| Capabilities (`capabilities`) | Drills: Upper 14V+10H, Lower 9V; upper milling 9kW (C-axis)+5.5kW, lower 2x3.5kW; C-axis rotary on upper-left milling spindle | Verified in documents | [kdtiberica.com](https://kdtiberica.com/en/drills/cnc-drills/cnc-drill-kd-612g/) |
| Capacities (`capacities`) | Max speed X/Y/Z 140/90/30 (Iberica) or 140/90/50 (KDT UA/Stancomplect) m/min; clamp speed 140 m/min | Verified in documents | [kdtiberica.com](https://kdtiberica.com/en/drills/cnc-drills/cnc-drill-kd-612g/) |
| Controller / HMI (`controller_hmi`) | Industrial computer, Windows-based; GIBLAB optimizer compatible (per distributor Stancomplect - distributor claim, not KDT-confirmed) | Verified in documents | [stancomplect.com](https://stancomplect.com/en/cnc-drilling-center-kd-612g-with-c-axis-and-tool-changer) |
| Native / import formats (`native_import_formats`) | Unknown | Unknown | none |
| Automation (`automation`) | Linear ATC 12 positions (10 tools + 2 aggregates); two grippers | Verified in documents | [kdtiberica.com](https://kdtiberica.com/en/drills/cnc-drills/cnc-drill-kd-612g/) |
| Footprint / power / weight (`footprint_power_weight`) | Total installed power 36.27kW; overall 6040x3300x2190mm (Iberica/UA) CONFLICT 7508x2855x2190mm (KDT Europe); weight 3700kg (Iberica) CONFLICT 3300kg (KDT UA); dust Ø200*1+Ø150*1+Ø100*1 | Verified in documents | [kdtiberica.com](https://kdtiberica.com/en/drills/cnc-drills/cnc-drill-kd-612g/) |

## 4. Documented conflicts (not resolved)

**Conflict:** Overall size 6040x3300x2190 (KDT Iberica/UA) vs 7508x2855x2190 (KDT Europe). Weight 3700kg (Iberica) vs 3300kg (UA). Panel length 70-3000 vs 70-2800 vs 200-2800 across regional sites. Z speed 30 (Iberica) vs 50 (UA/Stancomplect).

## 5. Controller Profile

Instance-level controller facts are **Unknown** unless the exact-model evidence explicitly supports them. Family or sibling-model controllers are never inferred here.

| | |
|---|---|
| Controller vendor | Industrial computer, Windows-based; GIBLAB optimizer compatible (per distributor Stancomplect - distributor claim, not KDT-confirmed) ([stancomplect.com](https://stancomplect.com/en/cnc-drilling-center-kd-612g-with-c-axis-and-tool-changer)) |
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

**6 / 7** — Populated technical field-groups with a source-cited value, out of 7. · As of 2026-07-17

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