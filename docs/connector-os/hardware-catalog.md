# Connector OS v1.0 - Hardware Catalog (Gems Catalog)

## 1. Hafele Minifix 15

### Specifications

| Feature | Kind | Dia (mm) | Depth (mm) | N-Center | Distance B |
|---------|------|----------|------------|----------|------------|
| CAM Housing | FACE_BORE | 15 | 12.5 (16mm) / 13.5 (18mm) | 9.0 (Core) | 24 or 34mm |
| Bolt Hole | EDGE_BORE | 8 | 34 | 9.0 (Core) | - |

### Drilling Parameters by Wood Thickness

| Wood (mm) | CAM Depth (mm) | Dim A (mm) | N-Center (mm) |
|-----------|----------------|------------|----------------|
| 12 | 9.5 | 6 | 6.0 |
| 16 | 12.5 | 8 | 8.0 |
| **18** | **13.5** | **9** | **9.0** |
| 19 | 14.0 | 9.5 | 9.5 |

### Part Numbers

#### Minifix 15 Housing (Nickel-plated)

| Wood Thickness | Depth | Part No. |
|----------------|-------|----------|
| 12mm+ | 9.5mm | **262.25.570** |
| 16mm+ | 12.5mm | **262.25.533** |
| 19mm+ | 14.5mm | **262.25.535** |

#### Connecting Bolts

| Model | Thread | Distance B | Part No. |
|-------|--------|------------|----------|
| S300 | Special | 24mm | **262.27.462** |
| S300 | Special | 34mm | **262.28.462** |
| S100 | M6 | 24mm | **262.27.911** |

---

## 2. Italiana Ferramenta Target J10

### Specifications

| Feature | Kind | Dia (mm) | Depth (mm) | N-Center | Transform |
|---------|------|----------|------------|----------|-----------|
| Pinion Housing | FACE_BORE | 10 | 13 | 9.0 (Core) | B = A - 25 |
| Threaded Dowel | EDGE_BORE | 10 | 12 | 9.0 (Core) | - |

### Transform Logic

The Target J10 uses a **COORD_TRANSFORM** relationship between panels:

```
B_pinion = A_side - 25
```

Where:
- `A_side` = distance from join edge on side panel
- `B_pinion` = pinion hole position on bottom panel

**Example:**
- If A = 34.5mm → B = 34.5 - 25 = **9.5mm**
- If A = 32.0mm → B = 32.0 - 25 = **7.0mm**

### Part Numbers

#### Target J10 Pinion Housing (Nickel-plated, YA)

| Wood Thickness | Code | Part No. |
|----------------|------|----------|
| 16mm | P10.16 | **21821300YA** |
| 18mm | P10.18 | **21821320YA** |
| 25mm | P10.25 | **21821250YA** |

#### Target J10 Threaded Dowels

| Thread Type | Code | Part No. |
|-------------|------|----------|
| M6 | J10.M6 | **21802160ZN** |
| Euro 8mm | J10.EURO8 | **21803160ZN** |
| Euro 11mm | J10.EURO11 | **21803220ZN** |

---

## 3. Italiana Ferramenta Target J12 (Heavy Duty)

### Part Numbers

| Wood Thickness | Code | Part No. |
|----------------|------|----------|
| 16mm | P12.16 | **21822160YA** |
| 18mm | P12.18 | **21822320YA** |
| 25mm | P12.25 | **21822340YA** |

---

## 4. Accessories

### Insert Nuts (Italiana Ferramenta)

| Size | Part No. |
|------|----------|
| M6 x 10mm | **20102010GR** |
| M6 x 13mm | **20102020GR** |
| M6 x 17mm | **20102040GR** |

### Cross Dowels (10mm)

| Length | L1 | Part No. |
|--------|-----|----------|
| 12mm | 6mm | **21001040ZN** |
| 18mm | 8.3mm | **21001010ZN** |

### Bolts for Cross Dowels (M6, 10mm)

| Length | Part No. |
|--------|----------|
| 32.5mm | **21201011ZN** |
| 44.5mm | **21201031ZN** |

### Wood Dowels (Hafele)

| Size | Part No. |
|------|----------|
| 8 x 30mm | **267.83.230** |
| 8 x 35mm | **267.83.235** |
| 10 x 30mm | **267.83.330** |

---

## Part Number Suffix Reference

| Suffix | Meaning |
|--------|---------|
| **ZN** | Zinc-plated (white zinc) |
| **YA** | Nickel-plated |
| **GR** | Grey finish |

> These suffixes should be stored in `metadata.finish` field in the OS for procurement team reference.
