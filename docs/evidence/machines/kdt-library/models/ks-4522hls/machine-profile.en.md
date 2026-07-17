# Machine Profile — KDT KS-4522HLS

> `profile_id: kdt.saw.ks_4522hls@0.1-research-draft` · as-of: 2026-07-17
> [TH edition / ฉบับภาษาไทย](machine-profile.th.md)

**Saw Tech** — Angular saw center

## 1. Model identity

| | |
|---|---|
| Manufacturer | KDT (Guangzhou/Guangdong KDT Machinery) |
| Model | **KS-4522HLS** |
| Aliases | none |
| Family | Saw Tech |
| Catalog status | current-global |
| Region | Global |
| Purpose | Angular saw center |
| Source URLs | [en.kdtmac.com](https://en.kdtmac.com/products_detail/222.html) |

## 2. Platform template vs. tenant machine instance

This document describes a **reusable platform template** derived from public catalog evidence. It is **not** a tenant-specific machine instance. A physical machine owned by a tenant (e.g. Daph) is a separate **machine instance** whose controller hardware, firmware, tool table, coordinate origin, physical delivery path and known-good job remain **Unknown** until onsite machine-instance evidence is recorded.

## 3. Technical field groups (7)

| Field group | Value | Evidence status | Source |
|---|---|---|---|
| Working envelope (`envelope`) | Rip/cross cut 4300/2100mm; max package 4300x2100x120mm; min grip 34x45mm; max cut thickness 120mm | Verified in documents | [stancomplect.com](https://stancomplect.com/en/angular-cnc-panel-sawbeam-saw-ks-4522hls-with-rear-loading-and-twin-pusher-batch-cutting-height-120-mm-size-4300x2100-mm) |
| Capabilities (`capabilities`) | Angular saw center; 2 saw carriages (longitudinal + cross); main saw drive 2x30kW (Stancomplect) CONFLICT 2x25kW (KDT Russia/ligasz) CONFLICT 2x28kW (Stancomplect video); scoring 2x2.2kW; main blade 450/75, scoring 200/50; rotary table; twin pusher | Verified in documents | [stancomplect.com](https://stancomplect.com/en/angular-cnc-panel-sawbeam-saw-ks-4522hls-with-rear-loading-and-twin-pusher-batch-cutting-height-120-mm-size-4300x2100-mm) |
| Capacities (`capacities`) | Saw carriage travel 120 m/min; idle 180 m/min; pusher 95 m/min (fwd 25); ~3500-4000 m2/12h shift | Verified in documents | [stancomplect.com](https://stancomplect.com/en/angular-cnc-panel-sawbeam-saw-ks-4522hls-with-rear-loading-and-twin-pusher-batch-cutting-height-120-mm-size-4300x2100-mm) |
| Controller / HMI (`controller_hmi`) | Industrial computer, Windows 10 (distributor Stancomplect - distributor claim) | Verified in documents | [stancomplect.com](https://stancomplect.com/en/angular-cnc-panel-sawbeam-saw-ks-4522hls-with-rear-loading-and-twin-pusher-batch-cutting-height-120-mm-size-4300x2100-mm) |
| Native / import formats (`native_import_formats`) | Works with optimizer programs; imports cutting-map files, prints labels (distributor description) | Verified in documents | [stancomplect.com](https://stancomplect.com/en/angular-cnc-panel-sawbeam-saw-ks-4522hls-with-rear-loading-and-twin-pusher-batch-cutting-height-120-mm-size-4300x2100-mm) |
| Automation (`automation`) | Rear + 2 side loading; rotary table 90deg; independent pusher; auto waste discharge (optional); hydraulic lift table 4000kg | Verified in documents | [stancomplect.com](https://stancomplect.com/en/angular-cnc-panel-sawbeam-saw-ks-4522hls-with-rear-loading-and-twin-pusher-batch-cutting-height-120-mm-size-4300x2100-mm) |
| Footprint / power / weight (`footprint_power_weight`) | Installed power 83kW; overall 15375 x 11542 x 2030mm; weight 13000kg (Stancomplect); working pressure 0.6-0.8 MPa | Verified in documents | [stancomplect.com](https://stancomplect.com/en/angular-cnc-panel-sawbeam-saw-ks-4522hls-with-rear-loading-and-twin-pusher-batch-cutting-height-120-mm-size-4300x2100-mm) |

## 4. Documented conflicts (not resolved)

**Conflict:** Main saw motor power varies by source: 2x30kW (Stancomplect EN spec table), 2x25kW (KDT Russia + ligasz.ru + KDT videos), 2x28kW (Stancomplect promo video). KDT-official exhibition page 122 is image-only (no legible table).

## 5. Controller Profile

Instance-level controller facts are **Unknown** unless the exact-model evidence explicitly supports them. Family or sibling-model controllers are never inferred here.

| | |
|---|---|
| Controller vendor | Industrial computer, Windows 10 (distributor Stancomplect - distributor claim) ([stancomplect.com](https://stancomplect.com/en/angular-cnc-panel-sawbeam-saw-ks-4522hls-with-rear-loading-and-twin-pusher-batch-cutting-height-120-mm-size-4300x2100-mm)) |
| Controller hardware model | Unknown |
| Firmware / software version | Unknown |
| HMI shell / version | Unknown |
| Operating system | Unknown |

## 6. Delivery Contract

All fields below are **Unknown** unless exact-model evidence supports them. Formats, postprocessors, barcode payloads, channels and coordinate/tool contracts are instance-level and are not generalized from other models.

| | |
|---|---|
| Authoritative native format | Works with optimizer programs; imports cutting-map files, prints labels (distributor description) ([stancomplect.com](https://stancomplect.com/en/angular-cnc-panel-sawbeam-saw-ks-4522hls-with-rear-loading-and-twin-pusher-batch-cutting-height-120-mm-size-4300x2100-mm)) |
| Accepted import formats | Works with optimizer programs; imports cutting-map files, prints labels (distributor description) ([stancomplect.com](https://stancomplect.com/en/angular-cnc-panel-sawbeam-saw-ks-4522hls-with-rear-loading-and-twin-pusher-batch-cutting-height-120-mm-size-4300x2100-mm)) |
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

**7 / 7** — Populated technical field-groups with a source-cited value, out of 7. · As of 2026-07-17

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