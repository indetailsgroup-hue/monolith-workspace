# Machine Profile — KDT KB-399R

> `profile_id: kdt.edge_bander.kb_399r@0.1-research-draft` · as-of: 2026-07-17
> [TH edition / ฉบับภาษาไทย](machine-profile.th.md)

**Banding Machine (Edge Bander)** — Edge bander (tilt/straight)

## 1. Model identity

| | |
|---|---|
| Manufacturer | KDT (Guangzhou/Guangdong KDT Machinery) |
| Model | **KB-399R** |
| Aliases | KE-399R |
| Family | Banding Machine (Edge Bander) |
| Catalog status | current-global |
| Region | Global |
| Purpose | Edge bander (tilt/straight) |
| Source URLs | [en.kdtmac.com](https://en.kdtmac.com/products_detail/212.html) |

## 2. Platform template vs. tenant machine instance

This document describes a **reusable platform template** derived from public catalog evidence. It is **not** a tenant-specific machine instance. A physical machine owned by a tenant (e.g. Daph) is a separate **machine instance** whose controller hardware, firmware, tool table, coordinate origin, physical delivery path and known-good job remain **Unknown** until onsite machine-instance evidence is recorded.

## 3. Technical field groups (7)

| Field group | Value | Evidence status | Source |
|---|---|---|---|
| Working envelope (`envelope`) | Panel T 9-25/9-22/9-20 (tilt) or 9-60 (straight); L >=300(tilt)/>=120(straight); W >=150(tilt)/>=90(straight) | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/products_detail/212.html) |
| Capabilities (`capabilities`) | Beveled/tilt edge bander (=KE-399R); tape 0.5-0.8(tilt)/0.4-3(straight)mm | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/products_detail/212.html) |
| Capacities (`capacities`) | Feeding 10-15-18-24(tilt), 10(straight) m/min | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/products_detail/212.html) |
| Controller / HMI (`controller_hmi`) | Unknown | Unknown | none |
| Native / import formats (`native_import_formats`) | Unknown | Unknown | none |
| Automation (`automation`) | Unknown | Unknown | none |
| Footprint / power / weight (`footprint_power_weight`) | Total power 42.74kW; overall 10291x990x1730mm; dust Ø125*10+Ø50*1; weight Unknown | Verified in documents | [en.kdtmac.com](https://en.kdtmac.com/products_detail/212.html) |

## 4. Documented conflicts (not resolved)

**Conflict:** Listed as KB-399R but official spec table header reads KE-399R (same machine, dual code).

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

**4 / 7** — Populated technical field-groups with a source-cited value, out of 7. · As of 2026-07-17

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