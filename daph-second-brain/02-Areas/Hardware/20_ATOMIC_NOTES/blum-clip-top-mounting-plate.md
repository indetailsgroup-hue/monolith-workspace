---
note_type: product
vendor: blum
system: hinge
truth_layer: draft
review_status: review_ready
sku: ["175H3100","175H3130","177H3100E","177H3130E","175H4100","175H4130","177H3100","177H3130","173H7100","173H7130","174H7100I","174H7130I","174H7100E","174H7130E","175H9100","175H9130","171A5010","171A5040","171A5070","171A5500"]
source_refs: ["Blum-2024:p.150-156"]
specs:
  boring_pattern: system32
  hole_pitch_mm: 32
  first_hole_mm: null            # VERIFY — เทียบกับ MONOLITH (37mm)
  adjustment_axes: 3
  cam_height_adjustment_mm: "±2"
related_monolith: ["src/core/designer/policy.ts"]
tags: [blum, hinge, mounting-plate, system32, part-numbers]
last_verified_at: null
is_stale: false
---

# Blum CLIP top — Mounting Plates (หน้า 150–156)

> review_ready — part numbers จริง · ปรับ cam height ±2mm

## Horizontal cam mounting plate (เพลทเส้นตรง)
| การยึด | Spacing | Height | Part no. |
|---|---|---|---|
| Chipboard screw | 0 | 8.5 | 175H3100 |
| Chipboard screw | 3 | 11.5 | 175H3130 |
| EXPANDO | 0 | 8.5 | 177H3100E |
| EXPANDO | 3 | 11.5 | 177H3130E |
| System screw | 0 | 8.5 | 175H4100 |
| System screw | 3 | 11.5 | 175H4130 |
| Knock-in | 0 | 8.5 | 177H3100 |
| Knock-in | 3 | 11.5 | 177H3130 |

## Cruciform cam mounting plate (เพลทกากบาท)
| การยึด | Spacing | Height | Part no. |
|---|---|---|---|
| Chipboard screw | 0 | 8.5 | 173H7100 |
| Chipboard screw | 3 | 11.5 | 173H7130 |
| INSERTA | 0 | 8.5 | 174H7100I |
| INSERTA | 3 | 11.5 | 174H7130I |
| EXPANDO | 0 | 8.5 | 174H7100E |
| EXPANDO | 3 | 11.5 | 174H7130E |
| System screw | 0 | 8.5 | 175H9100 |
| System screw | 3 | 11.5 | 175H9130 |

## Angled spacers (ลิ่มรองปรับองศา) (หน้า 156)
| ชนิด | Spacing | Part no. |
|---|---|---|
| +5° obtuse (ป้าน) | 0.8 | 171A5010 |
| +5° obtuse | 3.0 | 171A5040 |
| +5° obtuse | 6.0 | 171A5070 |
| −5° acute (แหลม) | 6.0 | 171A5500 |

## เชื่อมกับ MONOLITH (สำคัญ)
- รู System 32 (pitch 32mm) ↔ `SYSTEM_32` ใน `src/core/designer/policy.ts`
- **ต้องตรวจ:** first-hole 37mm ของ MONOLITH ตรงกับสเปก Blum หรือไม่ → ดู [[hinge-cup-35mm-system32]]
- Spacing (MD 0/3) ↔ ตาราง TB→FA ใน [[blum-hinge-110-standard]]

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · [[blum-hinge-systems-moc]] · Validation: [[CK-blum-hinge-specs]]
