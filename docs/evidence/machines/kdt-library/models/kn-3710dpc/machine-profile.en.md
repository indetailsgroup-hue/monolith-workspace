# Machine Profile — KDT KN-3710DPC

> `profile_id: kdt.nesting.kn_3710dpc@0.1-research-draft` · as-of: 2026-07-17
> [TH edition / ฉบับภาษาไทย](machine-profile.th.md)

**Nesting Tech** — Nesting cell; 250mm Z-clearance

## 1. Model identity

| | |
|---|---|
| Manufacturer | KDT (Guangzhou/Guangdong KDT Machinery) |
| Model | **KN-3710DPC** |
| Aliases | none |
| Family | Nesting Tech |
| Catalog status | current-global |
| Region | Global |
| Purpose | Nesting cell; 250mm Z-clearance |
| Source URLs | [en.kdtmac.com](https://en.kdtmac.com/products_list/3.html) · [en.kdtmac.com](https://en.kdtmac.com/products_list/20.html) |

## 2. Platform template vs. tenant machine instance

This document describes a **reusable platform template** derived from public catalog evidence. It is **not** a tenant-specific machine instance. A physical machine owned by a tenant (e.g. Daph) is a separate **machine instance** whose controller hardware, firmware, tool table, coordinate origin, physical delivery path and known-good job remain **Unknown** until onsite machine-instance evidence is recorded.

## 3. Technical field groups (7)

| Field group | Value | Evidence status | Source |
|---|---|---|---|
| Working envelope (`envelope`) | Working X/Y/Z 3100 x 2210 x 225mm (250mm Z-clearance nesting cell) | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/158.html) |
| Capabilities (`capabilities`) | Main spindle 13.2kW HSK-F63; drill head 10V or 12V8H1S | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/158.html) |
| Capacities (`capacities`) | Max moving speed X/Y/Z 80/80/30 m/min; vacuum 6 zones, 244*2 m3/h | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/158.html) |
| Controller / HMI (`controller_hmi`) | Unknown | Unknown | none |
| Native / import formats (`native_import_formats`) | Unknown | Unknown | none |
| Automation (`automation`) | 16-post Rotary + 1-post aggregate holder; nesting cell configuration | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/158.html) |
| Footprint / power / weight (`footprint_power_weight`) | Total power 35.6kW; overall 4600L x 3790W x 2650H mm; dust Ø200*1; weight Unknown | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/Exhibitions_product_detail_1/158.html) |

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