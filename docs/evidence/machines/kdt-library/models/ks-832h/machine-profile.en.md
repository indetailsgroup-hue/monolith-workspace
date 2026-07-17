# Machine Profile — KDT KS-832H

> `profile_id: kdt.saw.ks_832h@0.1-research-draft` · as-of: 2026-07-17
> [TH edition / ฉบับภาษาไทย](machine-profile.th.md)

**Saw Tech** — Panel saw; twin-pusher structure

## 1. Model identity

| | |
|---|---|
| Manufacturer | KDT (Guangzhou/Guangdong KDT Machinery) |
| Model | **KS-832H** |
| Aliases | none |
| Family | Saw Tech |
| Catalog status | current-global |
| Region | Global |
| Purpose | Panel saw; twin-pusher structure |
| Source URLs | [en.kdtmac.com](https://en.kdtmac.com/products_list/2.html) |

## 2. Platform template vs. tenant machine instance

This document describes a **reusable platform template** derived from public catalog evidence. It is **not** a tenant-specific machine instance. A physical machine owned by a tenant (e.g. Daph) is a separate **machine instance** whose controller hardware, firmware, tool table, coordinate origin, physical delivery path and known-good job remain **Unknown** until onsite machine-instance evidence is recorded.

## 3. Technical field groups (7)

| Field group | Value | Evidence status | Source |
|---|---|---|---|
| Working envelope (`envelope`) | Max cut 3100L x 3200W (Lesmak) / 3180x3180 (Prostanki); max cut thickness 90mm (option 120); min grip 34x45mm | Verified in documents | [lesmak.si](https://lesmak.si/en/product/beam-saw-kdt-ks-832h/) |
| Capabilities (`capabilities`) | Main engine power 15kW (KDT Russia) CONFLICT 18.5kW (KDT Lithuania/Slovakia/Lesmak/Leda); pre-cutter/scoring 1.5kW (RU) or 2.2kW (SK); main blade 400/450x75, scoring 200/50; 8-10 pneumatic pliers | Verified in documents | [lesmak.si](https://lesmak.si/en/product/beam-saw-kdt-ks-832h/) |
| Capacities (`capacities`) | Cutting speed 1-95 m/min (servo); saw unit moving speed up to 120 m/min; NC lateral press stroke 2200mm | Verified in documents | [lesmak.si](https://lesmak.si/en/product/beam-saw-kdt-ks-832h/) |
| Controller / HMI (`controller_hmi`) | PC computer with Windows environment; optimization software; barcode printer (Lesmak distributor) | Verified in documents | [lesmak.si](https://lesmak.si/en/product/beam-saw-kdt-ks-832h/) |
| Native / import formats (`native_import_formats`) | Optimization software with import (distributor description) | Verified in documents | [lesmak.si](https://lesmak.si/en/product/beam-saw-kdt-ks-832h/) |
| Automation (`automation`) | 3x air table with sliding rollers at entrance; servo saw-unit motion via gear/rack | Verified in documents | [lesmak.si](https://lesmak.si/en/product/beam-saw-kdt-ks-832h/) |
| Footprint / power / weight (`footprint_power_weight`) | Installed power 35kW; overall 7480x5495x1890mm (Lesmak/RU) / 7750x5495x2030mm (Slovakia); weight 6000kg | Verified in documents | [lesmak.si](https://lesmak.si/en/product/beam-saw-kdt-ks-832h/) |

## 4. Documented conflicts (not resolved)

**Conflict:** Main saw power 15kW (KDT Russia) vs 18.5kW (KDT Lithuania, KDT Slovakia, Lesmak, Leda). Overall size 7480x5495x1890 vs 7750x5495x2030. Scoring 1.5kW vs 2.2kW. KDT-official exhibition page 5 is image-only.

## 5. Controller Profile

Instance-level controller facts are **Unknown** unless the exact-model evidence explicitly supports them. Family or sibling-model controllers are never inferred here.

| | |
|---|---|
| Controller vendor | PC computer with Windows environment; optimization software; barcode printer (Lesmak distributor) ([lesmak.si](https://lesmak.si/en/product/beam-saw-kdt-ks-832h/)) |
| Controller hardware model | Unknown |
| Firmware / software version | Unknown |
| HMI shell / version | Unknown |
| Operating system | Unknown |

## 6. Delivery Contract

All fields below are **Unknown** unless exact-model evidence supports them. Formats, postprocessors, barcode payloads, channels and coordinate/tool contracts are instance-level and are not generalized from other models.

| | |
|---|---|
| Authoritative native format | Optimization software with import (distributor description) ([lesmak.si](https://lesmak.si/en/product/beam-saw-kdt-ks-832h/)) |
| Accepted import formats | Optimization software with import (distributor description) ([lesmak.si](https://lesmak.si/en/product/beam-saw-kdt-ks-832h/)) |
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