# Machine Profile — KDT KN-2409NL

> `profile_id: kdt.nesting.kn_2409nl@0.1-research-draft` · as-of: 2026-07-17
> [TH edition / ฉบับภาษาไทย](machine-profile.th.md)

**Nesting Tech** — Flat-bed CNC nesting/machining center; drilling, molding, slotting of panel furniture

## 1. Model identity

| | |
|---|---|
| Manufacturer | KDT (Guangzhou/Guangdong KDT Machinery) |
| Model | **KN-2409NL** |
| Aliases | KN2409NL, KN-2409 NL, K2409NL |
| Family | Nesting Tech |
| Catalog status | current-global |
| Region | Global + AU/MX/RU/NZ regional |
| Purpose | Flat-bed CNC nesting/machining center; drilling, molding, slotting of panel furniture |
| Source URLs | [en.kdtmac.com](https://en.kdtmac.com/products_details/28.html) · [ledamachinery.com.au](https://ledamachinery.com.au/product/kdt-kn-2409l-flat-bed-cnc-router/) · [trimaq.mx](https://trimaq.mx/wp-content/uploads/2024/06/Router-CNC-KDT-modelo-KN-2409-NL.pdf) · [www.jacks.co.nz](https://www.jacks.co.nz/product/find/775) |

## 2. Platform template vs. tenant machine instance

This document describes a **reusable platform template** derived from public catalog evidence. It is **not** a tenant-specific machine instance. A physical machine owned by a tenant (e.g. Daph) is a separate **machine instance** whose controller hardware, firmware, tool table, coordinate origin, physical delivery path and known-good job remain **Unknown** until onsite machine-instance evidence is recorded.

## 3. Technical field groups (7)

| Field group | Value | Evidence status | Source |
|---|---|---|---|
| Working envelope (`envelope`) | Working X/Y/Z 2850x1260x40mm | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/28.html) |
| Capabilities (`capabilities`) | Main spindle 9kW ISO-30, single spindle | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/28.html) |
| Capacities (`capacities`) | Max moving speed 100/100/30 m/min; vacuum 7 zones, 244 m3/h | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/28.html) |
| Controller / HMI (`controller_hmi`) | KDT-official CIFF: PC Control/KDT self-developed software; CONFLICT distributor Stancomplect: NCstudio (Taiwan) | Verified in documents | [stancomplect.com](https://stancomplect.com/en/cnc-machining-center-kn-2409nl-ncstudio-kdt-spindle-linear-tool-change) |
| Native / import formats (`native_import_formats`) | Unknown | Unknown | none |
| Automation (`automation`) | 12-post Linear ATC | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/28.html) |
| Footprint / power / weight (`footprint_power_weight`) | Total power 20.5kW; overall 3980x2800x2160mm (exhibition) / 3980x2080x2160 (first pass); weight ~2300kg (distributor) | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/28.html) |

## 4. Documented conflicts (not resolved)

**Conflict:** Controller: KDT PC/self-developed (official) vs NCstudio Taiwan (distributor). rpm 18000/21000/24000 across distributors. weight 2300/2350/2500kg across distributors.

## 5. Controller Profile

Instance-level controller facts are **Unknown** unless the exact-model evidence explicitly supports them. Family or sibling-model controllers are never inferred here.

| | |
|---|---|
| Controller vendor | KDT-official CIFF: PC Control/KDT self-developed software; CONFLICT distributor Stancomplect: NCstudio (Taiwan) ([stancomplect.com](https://stancomplect.com/en/cnc-machining-center-kn-2409nl-ncstudio-kdt-spindle-linear-tool-change)) |
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