# Monolith User Manual

> Built-in Furniture Design & Factory Manufacturing System

**Version:** 1.2.0
**Last Updated:** February 2026

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Interface Overview](#interface-overview)
3. [Designing Cabinets](#designing-cabinets)
4. [Materials & Finishes](#materials--finishes)
5. [Hardware Configuration](#hardware-configuration)
6. [Gate Validation](#gate-validation)
7. [Export & Manufacturing](#export--manufacturing)
8. [Projects Management](#projects-management)
9. [Keyboard Shortcuts](#keyboard-shortcuts)
10. [Troubleshooting](#troubleshooting)

---

## Getting Started

### System Requirements

- Modern web browser (Chrome, Firefox, Edge, Safari)
- WebGL 2.0 support for 3D visualization
- Minimum 4GB RAM recommended
- Screen resolution: 1280x720 or higher

### Launching the Application

1. Open your web browser
2. Navigate to the application URL
3. The application will automatically load your last project (or create a new one)

### First-Time Setup

On first launch:
1. A new project named "Kitchen Base Cabinet" is created automatically
2. The 3D viewport shows a default base cabinet
3. Use the side panels to customize your design

---

## Interface Overview

### Main Screen Layout

```
┌─────────────────────────────────────────────────────────┐
│  Header Bar (Project name, Save status, Tools)          │
├─────────────┬─────────────────────────────┬─────────────┤
│             │                             │             │
│   Left      │      3D Viewport            │   Right     │
│   Panel     │                             │   Panel     │
│   (Tools)   │   [Interactive Cabinet]     │   (Props)   │
│             │                             │             │
├─────────────┴─────────────────────────────┴─────────────┤
│  Status Bar (Dimensions, Selection info)                │
└─────────────────────────────────────────────────────────┘
```

### Navigation Controls

| Action | Mouse | Touch |
|--------|-------|-------|
| Rotate view | Left-click + drag | One finger drag |
| Pan view | Right-click + drag | Two finger drag |
| Zoom | Scroll wheel | Pinch gesture |
| Reset view | Double-click background | Double tap |

---

## Designing Cabinets

### Cabinet Types

Monolith supports several cabinet categories:

| Type | Description | Use Case |
|------|-------------|----------|
| **BASE** | Floor-standing cabinet | Kitchen base, bathroom vanity |
| **WALL** | Wall-mounted cabinet | Upper kitchen cabinets |
| **TALL** | Full-height cabinet | Pantry, wardrobe |
| **CORNER** | L-shaped corner unit | Kitchen corners |

### Creating a New Cabinet

1. Click **New Cabinet** in the toolbar
2. Select a cabinet type
3. Enter initial dimensions (width, height, depth)
4. Click **Create**

### Adjusting Dimensions

#### Using the Properties Panel

1. Select the cabinet in the 3D view
2. Find **Dimensions** in the right panel
3. Enter values for:
   - **Width**: Cabinet width (mm)
   - **Height**: Cabinet height (mm)
   - **Depth**: Cabinet depth (mm)
4. Press Enter or click outside to apply

#### Using Dimension Gizmos

1. Enable the **Dimension** tool from the toolbar
2. Drag the handles on the cabinet edges
3. Values snap to common increments (50mm by default)

### Adding Internal Components

#### Shelves

1. Click inside a compartment
2. Click **Add Shelf** button
3. Adjust shelf position using the slider
4. Multiple shelves can be added to one compartment

#### Dividers

1. Click inside a compartment
2. Click **Add Divider** button
3. Adjust divider position to create columns
4. Dividers split compartments vertically

---

## Materials & Finishes

### Material Categories

| Category | Description | Examples |
|----------|-------------|----------|
| **Core** | Structural panel material | MDF, Particleboard, Plywood |
| **Surface** | Visible face finish | Melamine, HPL, Veneer |
| **Edge** | Edge band finish | ABS, PVC, Wood veneer |

### Applying Materials

#### To All Panels

1. Open the **Materials** tab
2. Click on a material category (Core/Surface/Edge)
3. Select a material from the grid
4. Click **Apply to All**

#### To Selected Panel

1. Click a panel in the 3D view to select it
2. Open the **Materials** tab
3. Select a material
4. Click **Apply to Selected**

### Material Properties

Each material displays:
- **Name**: Human-readable material name
- **Type**: Material category (MDF, HPL, etc.)
- **Thickness**: Material thickness in mm
- **Cost**: Price per square meter

---

## Hardware Configuration

### Minifix Connectors

Minifix is the standard cam-and-bolt connector system for cabinet assembly.

#### Components

| Part | Description | Drill Diameter |
|------|-------------|----------------|
| **Cam Housing** | Rotating lock mechanism | Ø15mm |
| **Bolt** | Threaded connector | Ø8mm shank, Ø10mm head |
| **Dowel** | Alignment pin | Ø8mm |

#### Configuration Steps

1. Select a joint between panels
2. Open **Hardware** panel
3. Choose **Minifix** connector type
4. Configure placement:
   - **Distance from edge**: 37mm (System 32 standard)
   - **Spacing**: 32mm pitch
5. Click **Apply Hardware**

### System 32 Holes

System 32 is the European standard for adjustable shelf pin holes.

#### Parameters

- **First hole**: 37mm from front edge
- **Pitch**: 32mm between holes
- **Diameter**: 5mm
- **Depth**: 13mm

---

## Gate Validation

Gate validation ensures your design is manufacturable before sending to the factory.

### Running Validation

1. Click the **Gate** button in the toolbar
2. Wait for validation to complete
3. Review the results

### Issue Severity Levels

| Level | Symbol | Description |
|-------|--------|-------------|
| **BLOCKER** | 🔴 | Must fix before manufacturing |
| **WARNING** | 🟡 | Review recommended |
| **INFO** | 🔵 | Informational only |

### Common Issues

#### B_CUTSIZE_NONPOSITIVE
**Problem**: Cut size is zero or negative
**Cause**: Edge band thickness exceeds panel dimension
**Fix**: Reduce edge thickness or increase panel size

#### B_SAFETY_DRILL_DEPTH
**Problem**: Drill depth exceeds material thickness
**Cause**: Drill depth too deep for panel material
**Fix**: Reduce drill depth or use thicker material

#### B_MIN_MARGIN_DRILL
**Problem**: Drill too close to panel edge
**Cause**: Hardware placement within 8mm of edge
**Fix**: Move hardware away from edge

#### W_PREMILL_GT_EDGE
**Problem**: Premill exceeds edge thickness
**Cause**: Possible configuration error
**Fix**: Verify premill and edge thickness settings

---

## Export & Manufacturing

### Export Formats

| Format | Use Case |
|--------|----------|
| **Project File** (.monolith.json) | Full project backup/transfer |
| **Cut List** (CSV) | Panel dimensions for ordering/cutting |
| **Drill Map** (JSON) | CNC drilling program data |
| **BOM** (PDF) | Bill of materials for ordering |
| **Nesting Layout** (CSV) | Optimized sheet cutting layout |
| **Machine-Specific CNC** | See [CNC Machine Formats](#cnc-machine-formats) below |

### Exporting Your Design

1. Ensure Gate validation passes (no blockers)
2. Click **Export** in the toolbar
3. Select export format
4. Choose destination folder
5. Click **Export**

### Cut Optimization (Sheet Nesting)

The **Nesting Panel** optimizes how panels are arranged on raw material sheets to minimize waste.

#### Opening the Nesting Panel

1. Navigate to the **Export** section
2. Click **Cut Optimization** or open the **Nesting Panel**
3. Your cut list is automatically loaded

#### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| **Kerf Width** | 3.5 mm | Width removed by saw blade between cuts |
| **Edge Clearance** | 10 mm | Minimum distance from sheet edge |

Sheet dimensions are loaded automatically from the material catalog (e.g., 1220 × 2440 mm for standard plywood).

#### Running Optimization

1. Adjust kerf and edge clearance if needed
2. Click **Run Optimization**
3. View results in the SVG visualization

#### Understanding Results

- **Sheet tabs**: Navigate between sheets (NEST_01, NEST_02, ...)
- **Part rectangles**: Color-coded panels with labels showing part ID and dimensions
- **Grain lines**: Toggle grain direction indicators (═ horizontal, ║ vertical)
- **Rotation indicator** (↻): Shows parts that were rotated 90° to fit
- **Utilization overlay**: Percentage of sheet area used

#### Summary Statistics

| Statistic | Description |
|-----------|-------------|
| **Total Sheets** | Number of raw sheets required |
| **Utilization** | Average material usage percentage |
| **Waste** | Total wasted area in m² |
| **Unplaced** | Parts that couldn't fit on any sheet |

#### Grain Direction

Materials with visible grain (wood veneer, some melamine) are locked to prevent rotation — this preserves visual consistency across assembled cabinets. Materials without grain (MDF, particleboard) can rotate freely for better utilization.

| Grain Setting | Rotation Allowed |
|---------------|------------------|
| **NONE** | Yes — free rotation for best fit |
| **HORIZONTAL** | No — grain must run horizontally |
| **VERTICAL** | No — grain must run vertically |

#### Exporting Nesting Results

Click **Export CSV** to download the nesting layout as a CSV file for your panel saw operator.

### CNC Machine Formats

Monolith generates machine-specific CNC programs for drilling and routing operations.

#### Supported Machines

| Machine Brand | CNC Format | File Extension | Description |
|---------------|------------|----------------|-------------|
| **KDT** | FANUC G-code | `.nc` | Standard ISO G-code |
| **Biesse** | CIX | `.cix` | Biesse XML format |
| **HOMAG** | MPR | `.mpr` | WoodWOP text format |
| **SCM** | XXL | `.xxl` | Xilog Plus format |
| **Generic** | FANUC G-code | `.nc` | Universal G-code |

#### Generating CNC Files

1. Complete your cabinet design
2. Ensure Gate validation passes
3. Select your target machine from the **Machine** dropdown
4. Click **Export CNC**
5. The system generates format-appropriate files for each panel

#### Machine-Specific Notes

**HOMAG (MPR format)**:
- WoodWOP-compatible text format
- Separate blocks for drilling, routing, and sawing operations
- Depth referenced from panel face (top-of-material)

**Biesse (CIX format)**:
- XML-based program format
- Compatible with Biesse CNC routers
- Depth referenced from panel face

**SCM (XXL format)**:
- Xilog Plus program format
- Compatible with SCM CNC machines
- Depth referenced from spoilboard (bottom-of-material)

### Factory Bundle

For factory production, use the **Release** workflow:

1. **Freeze**: Lock design for review
2. **Gate**: Run manufacturing validation
3. **Release**: Generate signed factory bundle

The factory bundle includes:
- All cut lists and drill maps
- CNC programs for your target machine
- Nesting layout for panel cutting
- Cryptographic signatures for verification
- Manufacturing policy compliance proof

---

## Projects Management

### Saving Projects

- **Auto-save**: Projects are automatically persisted to IndexedDB using Yjs CRDTs
- **Manual save**: Press `Ctrl+S` or click Save button
- **Indicator**: Dot (•) appears when unsaved changes exist
- **Local persistence**: All data is stored in your browser's IndexedDB — no server required

### Opening Projects

1. Click **File** → **Open Project**
2. Select from recent projects list
3. Or click **Import** to load a .monolith.json file

### Project Information

- **Name**: Editable project title
- **Created**: Original creation date
- **Modified**: Last save date
- **Version**: Project file version

### Data Storage & Sync Status

Monolith uses a local-first architecture for data persistence:

- **Storage**: Projects are stored in IndexedDB (per-project databases)
- **Sync status**: The sync indicator shows the current state:
  - **Idle** — No project loaded
  - **Loading** — Loading data from IndexedDB
  - **Synced** — All changes persisted
  - **Error** — Sync issue (check console for details)
- **Migration**: On first use, existing localStorage data is automatically migrated to IndexedDB (one-time, non-destructive)
- **Data safety**: Your original localStorage data is preserved as a backup after migration

---

## Keyboard Shortcuts

### General

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New project |
| `Ctrl+S` | Save project |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Escape` | Deselect / Cancel |

### View

| Shortcut | Action |
|----------|--------|
| `1` | Front view |
| `2` | Back view |
| `3` | Left view |
| `4` | Right view |
| `5` | Top view |
| `6` | Bottom view |
| `0` | Isometric view |
| `F` | Focus on selection |

### Tools

| Shortcut | Action |
|----------|--------|
| `V` | Select tool |
| `M` | Move tool |
| `R` | Rotate tool |
| `D` | Dimension tool |
| `H` | Hardware tool |

---

## Troubleshooting

### 3D View Not Loading

**Symptoms**: Black screen, "WebGL not available" message

**Solutions**:
1. Update your graphics drivers
2. Enable hardware acceleration in browser settings
3. Try a different browser (Chrome recommended)
4. Check if WebGL is enabled at [get.webgl.org](https://get.webgl.org)

### Performance Issues

**Symptoms**: Slow rendering, lag when rotating view

**Solutions**:
1. Close other browser tabs
2. Reduce cabinet complexity (fewer shelves/dividers)
3. Disable texture preview in settings
4. Use a device with dedicated graphics

### Changes Not Saving

**Symptoms**: "Unsaved changes" indicator persists

**Solutions**:
1. Check localStorage quota in browser settings
2. Clear old project data from browser storage
3. Try exporting project manually as backup

### Gate Validation Fails Unexpectedly

**Symptoms**: Valid design shows blockers

**Solutions**:
1. Verify dimension units are in millimeters
2. Check material thickness settings
3. Ensure hardware setbacks meet minimums
4. Review edge band thickness vs panel size

---

## Support

### Getting Help

- **In-App**: Press `F1` or click Help button
- **Documentation**: See `/docs` folder for technical details
- **Issues**: Report bugs at the project repository

### Providing Feedback

We welcome feedback to improve Monolith:
1. Use the feedback form in the Help menu
2. Include screenshots for visual issues
3. Describe steps to reproduce problems

---

*© 2026 Monolith Project. All rights reserved.*
