# Machine Profile — KDT KN-2409LP

> `profile_id: kdt.nesting.kn_2409lp@0.1-research-draft` · as-of: 2026-07-17 · **Daph pilot-instance relevant**
> [TH edition / ฉบับภาษาไทย](machine-profile.th.md)

**Nesting Tech** — Flat-bed CNC nesting center with standard CAM software, quick panel replenishment, real-time labeling

## 1. Model identity

| | |
|---|---|
| Manufacturer | KDT (Guangzhou/Guangdong KDT Machinery) |
| Model | **KN-2409LP** |
| Aliases | KN2409LP, KN-2409 LP |
| Family | Nesting Tech |
| Catalog status | current-regional |
| Region | Global (CIFF booth + listing) + RU/UA/AU regional; owner-attested (Daph) |
| Purpose | Flat-bed CNC nesting center with standard CAM software, quick panel replenishment, real-time labeling |
| Source URLs | [click2connect.ciff-gz.com](https://click2connect.ciff-gz.com/products/674ad4db132dab0f42f43d89) · [en.kdtmac.com](https://en.kdtmac.com/products_list/p-27-9.html) · [stancomplect.com](https://stancomplect.com/en/cnc-machining-center-kn-2409nl-ncstudio-kdt-spindle-linear-tool-change) · [www.machines4u.com.au](https://www.machines4u.com.au/view/advert/KDT-KN-2409LP-Flat-Bed-Nesting-CNC-Router/821993/) |

## 2. Platform template vs. tenant machine instance

This document describes a **reusable platform template** derived from public catalog evidence. It is **not** a tenant-specific machine instance. A physical machine owned by a tenant (e.g. Daph) is a separate **machine instance** whose controller hardware, firmware, tool table, coordinate origin, physical delivery path and known-good job remain **Unknown** until onsite machine-instance evidence is recorded.

## 3. Technical field groups (7)

| Field group | Value | Evidence status | Source |
|---|---|---|---|
| Working envelope (`envelope`) | Working X/Y/Z 2850x1260x40mm | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/140.html) |
| Capabilities (`capabilities`) | Main spindle 9kW ISO-30; standard with CAM software | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/140.html) |
| Capacities (`capacities`) | Max moving speed 100/100/30 m/min; vacuum 7 zones, 244 m3/h | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/140.html) |
| Controller / HMI (`controller_hmi`) | KDT-official CIFF: PC Control; CONFLICT distributor NCstudio Taiwan | Verified in documents | [click2connect.ciff-gz.com](https://click2connect.ciff-gz.com/products/674ad4db132dab0f42f43d89) |
| Native / import formats (`native_import_formats`) | Unknown | Unknown | none |
| Automation (`automation`) | 12-post Linear ATC; BECKER vacuum ~250 m3/h (distributor) | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/140.html) |
| Footprint / power / weight (`footprint_power_weight`) | Total power 20.5kW; overall 3980x2800x2160mm (exhibition) | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/140.html) |

## 4. Documented conflicts (not resolved)

**Conflict:** Same controller conflict as KN-2409NL (KDT PC vs NCstudio). Vacuum 244 (KDT) vs 250 (distributors) m3/h.

## 5. Controller Profile

Instance-level controller facts are **Unknown** unless the exact-model evidence explicitly supports them. Family or sibling-model controllers are never inferred here.

| | |
|---|---|
| Controller vendor | KDT-official CIFF: PC Control; CONFLICT distributor NCstudio Taiwan ([click2connect.ciff-gz.com](https://click2connect.ciff-gz.com/products/674ad4db132dab0f42f43d89)) |
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