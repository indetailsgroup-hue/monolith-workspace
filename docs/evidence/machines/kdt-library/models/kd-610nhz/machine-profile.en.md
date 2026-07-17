# Machine Profile — KDT KD-610NHZ

> `profile_id: kdt.six_sided_drill.kd_610nhz@0.1-research-draft` · as-of: 2026-07-17
> [TH edition / ฉบับภาษาไทย](machine-profile.th.md)

**Six-sided drilling** — Six-sided drilling; 3 drilling spindles in X-direction (Z variant)

## 1. Model identity

| | |
|---|---|
| Manufacturer | KDT (Guangzhou/Guangdong KDT Machinery) |
| Model | **KD-610NHZ** |
| Aliases | none |
| Family | Six-sided drilling |
| Catalog status | current-global |
| Region | Global |
| Purpose | Six-sided drilling; 3 drilling spindles in X-direction (Z variant) |
| Source URLs | [en.kdtmac.com](https://en.kdtmac.com/products_list/19.html) |

## 2. Platform template vs. tenant machine instance

This document describes a **reusable platform template** derived from public catalog evidence. It is **not** a tenant-specific machine instance. A physical machine owned by a tenant (e.g. Daph) is a separate **machine instance** whose controller hardware, firmware, tool table, coordinate origin, physical delivery path and known-good job remain **Unknown** until onsite machine-instance evidence is recorded.

## 3. Technical field groups (7)

| Field group | Value | Evidence status | Source |
|---|---|---|---|
| Working envelope (`envelope`) | Panel L 70-3000mm x W 30-1000mm x T 9-60mm | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/65.html) |
| Capabilities (`capabilities`) | Drills: Upper 13V+10H+1S, Lower 9V; spindles 1x5.5kW + 1x3.5kW; 3 drilling spindles in X-direction | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/65.html) |
| Capacities (`capacities`) | Max feeding speed 140 m/min | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/65.html) |
| Controller / HMI (`controller_hmi`) | Unknown | Unknown | none |
| Native / import formats (`native_import_formats`) | Unknown | Unknown | none |
| Automation (`automation`) | Through-feed six-sided drilling | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/65.html) |
| Footprint / power / weight (`footprint_power_weight`) | Total spindle power 21.9kW; overall 5270L x 2660W x 2190H mm; dust Ø200*1+Ø150*1; weight Unknown | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/65.html) |

## 4. Documented conflicts (not resolved)

**Conflict:** Overall width differs from KD-610NH (2660 vs 2277mm) despite identical drill/power spec.

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