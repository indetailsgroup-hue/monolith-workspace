# Machine Profile — KDT KD-610R

> `profile_id: kdt.six_sided_drill.kd_610r@0.1-research-draft` · as-of: 2026-07-17 · **Daph pilot-instance relevant**
> [TH edition / ฉบับภาษาไทย](machine-profile.th.md)

**Six-sided drilling** — CNC six-sided drilling center; through/blind holes on ends and planes of furniture panels; milling of straight grooves/profiles

## 1. Model identity

| | |
|---|---|
| Manufacturer | KDT (Guangzhou/Guangdong KDT Machinery) |
| Model | **KD-610R** |
| Aliases | KD 610 R, KD-610 R, KDT 610R |
| Family | Six-sided drilling |
| Catalog status | current-global |
| Region | Global + EU/Greece/Iberica/Turkey regional |
| Purpose | CNC six-sided drilling center; through/blind holes on ends and planes of furniture panels; milling of straight grooves/profiles |
| Source URLs | [en.kdtmac.com](https://en.kdtmac.com/products_list/19.html) · [kdteurope.com](https://kdteurope.com/urun/kd-610r/) · [kdt-greece.gr](https://kdt-greece.gr/en/machines/drilling-centers/drilling-center-six-sides/drilling-center-kd-610r/) · [kdtiberica.com](https://kdtiberica.com/en/drills/cnc-drills/cnc-drill-kd-610r/) |

## 2. Platform template vs. tenant machine instance

This document describes a **reusable platform template** derived from public catalog evidence. It is **not** a tenant-specific machine instance. A physical machine owned by a tenant (e.g. Daph) is a separate **machine instance** whose controller hardware, firmware, tool table, coordinate origin, physical delivery path and known-good job remain **Unknown** until onsite machine-instance evidence is recorded.

## 3. Technical field groups (7)

| Field group | Value | Evidence status | Source |
|---|---|---|---|
| Working envelope (`envelope`) | Panel L 70-2800 (kdt-greece)/200-2800 (kdteurope) x W 35-1000 x T 9-60mm | Verified in documents | [kdteurope.com](https://kdteurope.com/urun/kd-610r/) |
| Capabilities (`capabilities`) | Drills CONFLICT: upper 10V+8H (Greece/Iberica) vs 12V+8H+1mill (Europe); lower 9V; milling 3.5kW | Verified in documents | [kdteurope.com](https://kdteurope.com/urun/kd-610r/) |
| Capacities (`capacities`) | Feed 100/90/50 (Greece) vs 140 (Europe) m/min | Verified in documents | [kdt-greece.gr](https://kdt-greece.gr/en/machines/drilling-centers/drilling-center-six-sides/drilling-center-kd-610r/) |
| Controller / HMI (`controller_hmi`) | Windows control panel (regional distributor description) | Verified in documents | [kdteurope.com](https://kdteurope.com/urun/kd-610r/) |
| Native / import formats (`native_import_formats`) | Unknown | Unknown | none |
| Automation (`automation`) | Six-sided through-feed drilling; connects to split software | Verified in documents | [kdteurope.com](https://kdteurope.com/urun/kd-610r/) |
| Footprint / power / weight (`footprint_power_weight`) | Total power 15.7kW; overall 4115x2250x2210mm; weight 2700kg (regional) | Verified in documents | [kdteurope.com](https://kdteurope.com/urun/kd-610r/) |

## 4. Documented conflicts (not resolved)

**Conflict:** KD-610R vs KD-610RH near-identical (same 15.7kW/4115x2250x2210). Regional drill-count/speed conflicts: Greece 10V+8H upper & feed 100/90/50; Europe 12V+8H+1mill & feed 140.

## 5. Controller Profile

Instance-level controller facts are **Unknown** unless the exact-model evidence explicitly supports them. Family or sibling-model controllers are never inferred here.

| | |
|---|---|
| Controller vendor | Windows control panel (regional distributor description) ([kdteurope.com](https://kdteurope.com/urun/kd-610r/)) |
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