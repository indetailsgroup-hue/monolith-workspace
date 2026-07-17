# Machine Profile — KDT KD-866A

> `profile_id: kdt.drilling.kd_866a@0.1-research-draft` · as-of: 2026-07-17
> [TH edition / ฉบับภาษาไทย](machine-profile.th.md)

**Drilling Tech** — Through-feed drilling; reduced footprint

## 1. Model identity

| | |
|---|---|
| Manufacturer | KDT (Guangzhou/Guangdong KDT Machinery) |
| Model | **KD-866A** |
| Aliases | none |
| Family | Drilling Tech |
| Catalog status | current-global |
| Region | Global |
| Purpose | Through-feed drilling; reduced footprint |
| Source URLs | [en.kdtmac.com](https://en.kdtmac.com/products_list/5.html) |

## 2. Platform template vs. tenant machine instance

This document describes a **reusable platform template** derived from public catalog evidence. It is **not** a tenant-specific machine instance. A physical machine owned by a tenant (e.g. Daph) is a separate **machine instance** whose controller hardware, firmware, tool table, coordinate origin, physical delivery path and known-good job remain **Unknown** until onsite machine-instance evidence is recorded.

## 3. Technical field groups (7)

| Field group | Value | Evidence status | Source |
|---|---|---|---|
| Working envelope (`envelope`) | Panel L 200-1600mm x W L/R workstation 45-650/45-650mm x T 9-60mm | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/162.html) |
| Capabilities (`capabilities`) | Drills: Upper 26V+20H, Lower 18V; spindles 5.5kW*2 + 3.5kW*2; footprint reduced variant | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/162.html) |
| Capacities (`capacities`) | Max feeding speed 140 m/min | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/162.html) |
| Controller / HMI (`controller_hmi`) | Unknown | Unknown | none |
| Native / import formats (`native_import_formats`) | Unknown | Unknown | none |
| Automation (`automation`) | Dual work-station | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/162.html) |
| Footprint / power / weight (`footprint_power_weight`) | Total spindle power 49.1kW; overall 4700L x 4000W x 2190H mm; dust Ø200*2+Ø150*2; weight Unknown | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/162.html) |

## 4. Documented conflicts (not resolved)

**Conflict:** Exhibition id 162 (en.kdtmac.com) = KD-866A; note www.kdtmac.com/products_details/162.html is KS-828DL (different numbering space between exhibition vs products_details).

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