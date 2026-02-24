/**
 * DXF Generator - CNC Export Engine
 * 
 * ARCHITECTURE (North Star v4.0):
 * - Converts PanelProductionData to DXF format
 * - Supports multiple layer configurations
 * - Implements Mirror Logic for Face B operations
 * 
 * LAYER CONVENTION:
 * - CUT_OUT: Panel outline (cutting path)
 * - DRILL_V_{diameter}_D{depth}: Vertical drilling
 * - DRILL_H_{diameter}_Z{z}_D{depth}: Horizontal drilling
 * - SAW_GROOVE_D{depth}: Routing/grooving
 * - HINGE_CUP_35: 35mm hinge cup drilling
 * - ANNOTATION: Non-cutting info
 * 
 * MIRROR LOGIC:
 * When drilling Face B, X coordinates must be mirrored:
 * X_mirrored = panel_width - X_original
 */

import { 
  PanelProductionData, 
  MachineOperation,
  LAYER_CONFIG,
} from '../types/Production';

// ============================================
// DXF CONSTANTS
// ============================================

const DXF_HEADER = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1015
9
$INSUNITS
70
4
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LTYPE
70
1
0
LTYPE
2
CONTINUOUS
70
0
3
Solid line
72
65
73
0
40
0.0
0
ENDTAB
0
TABLE
2
LAYER
70
32
`;

const DXF_LAYER_TEMPLATE = (name: string, color: number): string => `0
LAYER
2
${name}
70
0
62
${color}
6
CONTINUOUS
`;

const DXF_TABLES_END = `0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
`;

const DXF_FOOTER = `0
ENDSEC
0
EOF
`;

// Layer colors (AutoCAD color index)
const LAYER_COLORS: Record<string, number> = {
  CUT_OUT: 7,           // White - cutting
  DRILL_V: 1,           // Red - vertical drilling
  DRILL_H: 3,           // Green - horizontal drilling
  SAW_GROOVE: 5,        // Blue - grooving
  POCKET: 4,            // Cyan - pocket milling
  HINGE_CUP: 6,         // Magenta - hinge cups
  ANNOTATION: 8,        // Grey - annotations
  CONTOUR: 2,           // Yellow - contour cutting
  EDGE_BAND: 30,        // Orange - edge banding indicators
};

// ============================================
// DXF ENTITY GENERATORS
// ============================================

/**
 * Generate DXF circle entity
 */
const dxfCircle = (x: number, y: number, radius: number, layer: string): string => `0
CIRCLE
8
${layer}
10
${x.toFixed(4)}
20
${y.toFixed(4)}
30
0.0
40
${radius.toFixed(4)}
`;

/**
 * Generate DXF line entity
 */
const dxfLine = (x1: number, y1: number, x2: number, y2: number, layer: string): string => `0
LINE
8
${layer}
10
${x1.toFixed(4)}
20
${y1.toFixed(4)}
30
0.0
11
${x2.toFixed(4)}
21
${y2.toFixed(4)}
31
0.0
`;

/**
 * Generate DXF polyline (rectangle)
 */
const dxfRectangle = (x: number, y: number, width: number, height: number, layer: string): string => {
  const x2 = x + width;
  const y2 = y + height;
  
  return `0
LWPOLYLINE
8
${layer}
90
4
70
1
10
${x.toFixed(4)}
20
${y.toFixed(4)}
10
${x2.toFixed(4)}
20
${y.toFixed(4)}
10
${x2.toFixed(4)}
20
${y2.toFixed(4)}
10
${x.toFixed(4)}
20
${y2.toFixed(4)}
`;
};

/**
 * Generate DXF text entity
 */
const dxfText = (x: number, y: number, height: number, text: string, layer: string): string => `0
TEXT
8
${layer}
10
${x.toFixed(4)}
20
${y.toFixed(4)}
30
0.0
40
${height.toFixed(4)}
1
${text}
`;

// ============================================
// MAIN DXF GENERATOR
// ============================================

export interface DXFGeneratorOptions {
  includeDimensions?: boolean;    // Add dimension annotations
  includePartInfo?: boolean;      // Add part name/number
  includeEdgeBanding?: boolean;   // Add edge banding indicators
  origin?: 'bottom_left' | 'center';  // Coordinate origin
}

/**
 * Generate DXF file content from panel data
 */
export const generatePanelDXF = (
  panel: PanelProductionData,
  options: DXFGeneratorOptions = {}
): string => {
  const {
    includeDimensions = true,
    includePartInfo = true,
    includeEdgeBanding = true,
    origin = 'bottom_left'
  } = options;
  
  // Collect all unique layers
  const layers = new Set<string>([LAYER_CONFIG.OUTLINE]);
  panel.operations.forEach(op => {
    if (op.layerName) {
      layers.add(op.layerName);
    } else {
      // Auto-generate layer names
      if (op.type === 'drill_vertical') {
        layers.add(`${LAYER_CONFIG.DRILL_V_PREFIX}${op.diameter}_D${op.depth}`);
      } else if (op.type === 'drill_horizontal') {
        layers.add(`${LAYER_CONFIG.DRILL_H_PREFIX}${op.diameter}_Z${op.z_center}_D${op.depth}`);
      } else if (op.type === 'groove') {
        layers.add(`${LAYER_CONFIG.SAW_GROOVE}_D${op.depth}`);
      } else if (op.type === 'hinge_cup') {
        layers.add(LAYER_CONFIG.HINGE_CUP);
      } else if (op.type === 'pocket') {
        layers.add(`${LAYER_CONFIG.POCKET}_D${op.depth}`);
      }
    }
  });
  
  if (includeDimensions || includePartInfo) {
    layers.add(LAYER_CONFIG.ANNOTATION);
  }

  // Edge banding layer
  const hasEdgeBanding = includeEdgeBanding && panel.edges &&
    (panel.edges.top || panel.edges.bottom || panel.edges.left || panel.edges.right);
  if (hasEdgeBanding) {
    layers.add(LAYER_CONFIG.EDGE_BAND);
  }
  
  // Build DXF content
  let dxf = DXF_HEADER;
  
  // Add layers
  layers.forEach(layer => {
    // Determine color based on layer prefix
    let color = 7; // Default white
    for (const [prefix, c] of Object.entries(LAYER_COLORS)) {
      if (layer.startsWith(prefix) || layer.includes(prefix)) {
        color = c;
        break;
      }
    }
    dxf += DXF_LAYER_TEMPLATE(layer, color);
  });
  
  dxf += DXF_TABLES_END;
  
  // Calculate offset for center origin
  const offsetX = origin === 'center' ? -panel.cutDim.w / 2 : 0;
  const offsetY = origin === 'center' ? -panel.cutDim.h / 2 : 0;
  
  // 1. Draw panel outline
  dxf += dxfRectangle(offsetX, offsetY, panel.cutDim.w, panel.cutDim.h, LAYER_CONFIG.OUTLINE);
  
  // 2. Process operations
  panel.operations.forEach((op, index) => {
    dxf += processOperation(op, panel.cutDim.w, panel.cutDim.h, offsetX, offsetY, index);
  });

  // 3. Draw edge banding indicators
  // Offset lines inside the panel outline show where edge tape is applied
  if (hasEdgeBanding) {
    const EDGE_INDICATOR_OFFSET = 2; // mm inset from panel edge

    // Bottom edge
    if (panel.edges.bottom) {
      dxf += dxfLine(
        offsetX, offsetY + EDGE_INDICATOR_OFFSET,
        offsetX + panel.cutDim.w, offsetY + EDGE_INDICATOR_OFFSET,
        LAYER_CONFIG.EDGE_BAND
      );
      dxf += dxfText(
        offsetX + panel.cutDim.w / 2, offsetY + EDGE_INDICATOR_OFFSET + 1, 1.5,
        `EB:${panel.edges.bottom.thickness}mm`,
        LAYER_CONFIG.EDGE_BAND
      );
    }

    // Top edge
    if (panel.edges.top) {
      dxf += dxfLine(
        offsetX, offsetY + panel.cutDim.h - EDGE_INDICATOR_OFFSET,
        offsetX + panel.cutDim.w, offsetY + panel.cutDim.h - EDGE_INDICATOR_OFFSET,
        LAYER_CONFIG.EDGE_BAND
      );
      dxf += dxfText(
        offsetX + panel.cutDim.w / 2, offsetY + panel.cutDim.h - EDGE_INDICATOR_OFFSET - 3, 1.5,
        `EB:${panel.edges.top.thickness}mm`,
        LAYER_CONFIG.EDGE_BAND
      );
    }

    // Left edge
    if (panel.edges.left) {
      dxf += dxfLine(
        offsetX + EDGE_INDICATOR_OFFSET, offsetY,
        offsetX + EDGE_INDICATOR_OFFSET, offsetY + panel.cutDim.h,
        LAYER_CONFIG.EDGE_BAND
      );
      dxf += dxfText(
        offsetX + EDGE_INDICATOR_OFFSET + 1, offsetY + panel.cutDim.h / 2, 1.5,
        `EB:${panel.edges.left.thickness}mm`,
        LAYER_CONFIG.EDGE_BAND
      );
    }

    // Right edge
    if (panel.edges.right) {
      dxf += dxfLine(
        offsetX + panel.cutDim.w - EDGE_INDICATOR_OFFSET, offsetY,
        offsetX + panel.cutDim.w - EDGE_INDICATOR_OFFSET, offsetY + panel.cutDim.h,
        LAYER_CONFIG.EDGE_BAND
      );
      dxf += dxfText(
        offsetX + panel.cutDim.w - EDGE_INDICATOR_OFFSET - 1, offsetY + panel.cutDim.h / 2, 1.5,
        `EB:${panel.edges.right.thickness}mm`,
        LAYER_CONFIG.EDGE_BAND
      );
    }
  }

  // 4. Add annotations
  if (includePartInfo) {
    dxf += dxfText(
      offsetX + 10, 
      offsetY + panel.cutDim.h + 10, 
      5, 
      `${panel.name} (${panel.partNumber || panel.id})`, 
      LAYER_CONFIG.ANNOTATION
    );
  }
  
  if (includeDimensions) {
    // Width dimension
    dxf += dxfText(
      offsetX + panel.cutDim.w / 2, 
      offsetY - 15, 
      3, 
      `${panel.cutDim.w.toFixed(1)}mm`, 
      LAYER_CONFIG.ANNOTATION
    );
    
    // Height dimension
    dxf += dxfText(
      offsetX - 15, 
      offsetY + panel.cutDim.h / 2, 
      3, 
      `${panel.cutDim.h.toFixed(1)}mm`, 
      LAYER_CONFIG.ANNOTATION
    );
    
    // Material info
    dxf += dxfText(
      offsetX + 10, 
      offsetY + panel.cutDim.h + 20, 
      3, 
      `Material: ${panel.materialId} | T=${panel.cutDim.t}mm | Grain: ${panel.grain}`, 
      LAYER_CONFIG.ANNOTATION
    );
  }
  
  dxf += DXF_FOOTER;
  
  return dxf;
};

/**
 * Process a single machine operation and return DXF entities
 */
const processOperation = (
  op: MachineOperation,
  panelWidth: number,
  panelHeight: number,
  offsetX: number,
  offsetY: number,
  index: number
): string => {
  let dxf = '';
  
  // ===== MIRROR LOGIC =====
  // When operation is on Face B, flip X coordinate
  const mirrorX = (x: number, face: 'A' | 'B'): number => {
    return face === 'B' ? panelWidth - x : x;
  };
  
  switch (op.type) {
    case 'drill_vertical': {
      // Apply mirror logic for Face B
      const finalX = mirrorX(op.x, op.face);
      const finalY = op.y;
      
      // Adjust depth for through holes (+1mm for clean cut)
      const actualDepth = op.isThrough ? op.depth + 1 : op.depth;
      
      const layer = op.layerName || `${LAYER_CONFIG.DRILL_V_PREFIX}${op.diameter}_D${actualDepth}`;
      dxf += dxfCircle(
        offsetX + finalX, 
        offsetY + finalY, 
        op.diameter / 2, 
        layer
      );
      break;
    }
    
    case 'drill_horizontal': {
      // Horizontal drilling: represented as circle on panel edge
      let hX = 0, hY = 0;
      
      switch (op.side) {
        case 'left':
          hX = 0;
          hY = op.offset;
          break;
        case 'right':
          hX = panelWidth;
          hY = op.offset;
          break;
        case 'top':
          hX = op.offset;
          hY = panelHeight;
          break;
        case 'bottom':
          hX = op.offset;
          hY = 0;
          break;
      }
      
      const layer = op.layerName || `${LAYER_CONFIG.DRILL_H_PREFIX}${op.diameter}_Z${op.z_center}_D${op.depth}`;
      dxf += dxfCircle(
        offsetX + hX, 
        offsetY + hY, 
        op.diameter / 2, 
        layer
      );
      break;
    }
    
    case 'groove': {
      // Groove: represented as line (centerline)
      let sX = 0, eX = 0, sY = 0, eY = 0;
      
      if (op.axis === 'x') {
        // Horizontal groove
        sX = op.start;
        eX = op.start + op.length;
        sY = op.position;
        eY = op.position;
      } else {
        // Vertical groove
        sX = op.position;
        eX = op.position;
        sY = op.start;
        eY = op.start + op.length;
      }
      
      // Apply mirror for Face B
      if (op.face === 'B') {
        sX = panelWidth - sX;
        eX = panelWidth - eX;
      }
      
      const layer = op.layerName || `${LAYER_CONFIG.SAW_GROOVE}_D${op.depth}`;
      dxf += dxfLine(
        offsetX + sX, 
        offsetY + sY, 
        offsetX + eX, 
        offsetY + eY, 
        layer
      );
      break;
    }
    
    case 'hinge_cup': {
      const finalX = mirrorX(op.x, op.face);
      const layer = op.layerName || LAYER_CONFIG.HINGE_CUP;
      dxf += dxfCircle(
        offsetX + finalX, 
        offsetY + op.y, 
        op.diameter / 2, 
        layer
      );
      break;
    }
    
    case 'pocket': {
      const finalX = mirrorX(op.x, op.face);
      const layer = op.layerName || `${LAYER_CONFIG.POCKET}_D${op.depth}`;
      
      // Draw pocket as rectangle
      const halfW = op.width / 2;
      const halfH = op.height / 2;
      dxf += dxfRectangle(
        offsetX + finalX - halfW,
        offsetY + op.y - halfH,
        op.width,
        op.height,
        layer
      );
      break;
    }
    
    case 'contour': {
      // Contour: series of connected lines
      const layer = op.layerName || `${LAYER_CONFIG.CONTOUR}`;
      const points = op.points;
      
      for (let i = 0; i < points.length - 1; i++) {
        let x1 = points[i].x;
        let x2 = points[i + 1].x;
        
        if (op.face === 'B') {
          x1 = panelWidth - x1;
          x2 = panelWidth - x2;
        }
        
        dxf += dxfLine(
          offsetX + x1,
          offsetY + points[i].y,
          offsetX + x2,
          offsetY + points[i + 1].y,
          layer
        );
      }
      break;
    }
  }
  
  return dxf;
};

// ============================================
// BATCH EXPORT
// ============================================

/**
 * Generate DXF files for multiple panels
 */
export const generateBatchDXF = (
  panels: PanelProductionData[],
  options?: DXFGeneratorOptions
): Map<string, string> => {
  const result = new Map<string, string>();
  
  panels.forEach(panel => {
    const filename = `${panel.name}_${panel.cutDim.t}mm.dxf`;
    const content = generatePanelDXF(panel, options);
    result.set(filename, content);
  });
  
  return result;
};

/**
 * Download DXF file in browser
 */
export const downloadDXF = (content: string, filename: string): void => {
  const blob = new Blob([content], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  
  document.body.appendChild(link);
  link.click();
  
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Download all panels as individual DXF files
 */
export const downloadAllDXF = (
  panels: PanelProductionData[],
  options?: DXFGeneratorOptions
): void => {
  panels.forEach(panel => {
    const content = generatePanelDXF(panel, options);
    const filename = `${panel.name}_${panel.cutDim.t}mm.dxf`;
    downloadDXF(content, filename);
  });
};
