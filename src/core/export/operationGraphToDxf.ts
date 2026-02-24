/**
 * operationGraphToDxf.ts - OperationGraph to DXF Converter
 *
 * ARCHITECTURE (AGENT-T008):
 * - DXF export MUST be sourced from OperationGraph (manufacturing intent)
 * - NOT from 3D mesh or Cabinet geometry
 * - This ensures DXF exactly matches G-code output
 *
 * LAYER CONVENTION:
 * - DRILL_{diameter}D{depth}: Drilling operations
 * - BORE_{diameter}D{depth}: Boring operations (large holes)
 * - POCKET_{depth}: Pocket milling
 * - PROFILE_{side}: Profile cutting
 * - SLOT_{width}D{depth}: Slot cutting
 * - OUTLINE: Panel outline (if provided)
 * - ANNOTATION: Text labels
 *
 * UNITS: All DXF output is in millimeters (INSUNITS=4)
 *
 * @version 1.0.0 - AGENT-T008: OperationGraph source of truth
 */

import type {
    Operation,
    OperationGraph,
    DrillOperation,
    BoreOperation,
    PocketOperation,
    ProfileOperation,
    SlotOperation,
} from '../../cnc/operation/operationTypes';
import { getOperationDiameter } from './toolDiameterParser';

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

// AutoCAD Color Index
const LAYER_COLORS = {
    DRILL: 1,      // Red
    BORE: 6,       // Magenta
    POCKET: 4,     // Cyan
    PROFILE: 7,    // White
    SLOT: 3,       // Green
    OUTLINE: 2,    // Yellow
    ANNOTATION: 8, // Grey
    EDGE_BAND: 30, // Orange - edge banding indicators
} as const;

// ============================================
// DXF ENTITY GENERATORS
// ============================================

/**
 * Generate DXF circle entity
 */
function dxfCircle(x: number, y: number, radius: number, layer: string): string {
    return `0
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
}

/**
 * Generate DXF line entity
 */
function dxfLine(x1: number, y1: number, x2: number, y2: number, layer: string): string {
    return `0
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
}

/**
 * Generate DXF rectangle (LWPOLYLINE)
 */
function dxfRectangle(x: number, y: number, width: number, height: number, layer: string): string {
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
}

/**
 * Generate DXF text entity
 */
function dxfText(x: number, y: number, height: number, text: string, layer: string): string {
    return `0
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
}

/**
 * Generate DXF polyline from points
 */
function dxfPolyline(points: Array<{ x: number; y: number }>, layer: string, closed: boolean): string {
    if (points.length < 2) return '';

    let dxf = `0
LWPOLYLINE
8
${layer}
90
${points.length}
70
${closed ? 1 : 0}
`;

    for (const point of points) {
        dxf += `10
${point.x.toFixed(4)}
20
${point.y.toFixed(4)}
`;
    }

    return dxf;
}

// ============================================
// OPTIONS
// ============================================

export interface EdgeBandingInfo {
    top?: { thickness: number; materialCode?: string };
    bottom?: { thickness: number; materialCode?: string };
    left?: { thickness: number; materialCode?: string };
    right?: { thickness: number; materialCode?: string };
}

export interface OperationGraphDxfOptions {
    /** Include annotations with operation details */
    includeAnnotations?: boolean;
    /** Include panel outline (requires panel dimensions) */
    includeOutline?: boolean;
    /** Panel dimensions for outline (if includeOutline is true) */
    panelWidth?: number;
    panelHeight?: number;
    /** Coordinate origin */
    origin?: 'bottom_left' | 'center';
    /** Include metadata text */
    includeMetadata?: boolean;
    /** Filename prefix for layer naming */
    filenamePrefix?: string;
    /** Include edge banding indicator lines */
    includeEdgeBanding?: boolean;
    /** Edge banding data for indicator lines */
    edgeBanding?: EdgeBandingInfo;
}

const DEFAULT_OPTIONS: OperationGraphDxfOptions = {
    includeAnnotations: true,
    includeOutline: false,
    origin: 'bottom_left',
    includeMetadata: true,
};

// ============================================
// OPERATION CONVERTERS
// ============================================

function drillOperationToDxf(op: DrillOperation, offsetX: number, offsetY: number): { dxf: string; layer: string } {
    const diameter = getOperationDiameter(op);
    const layer = `DRILL_${diameter.toFixed(0)}_D${op.depth.toFixed(0)}`;
    const dxf = dxfCircle(
        offsetX + op.position.x,
        offsetY + op.position.y,
        diameter / 2,
        layer
    );
    return { dxf, layer };
}

function boreOperationToDxf(op: BoreOperation, offsetX: number, offsetY: number): { dxf: string; layer: string } {
    const layer = `BORE_${op.diameter.toFixed(0)}D${op.depth.toFixed(0)}`;
    const dxf = dxfCircle(
        offsetX + op.position.x,
        offsetY + op.position.y,
        op.diameter / 2,
        layer
    );
    return { dxf, layer };
}

function pocketOperationToDxf(op: PocketOperation, offsetX: number, offsetY: number): { dxf: string; layer: string } {
    const layer = `POCKET_D${op.depth.toFixed(0)}`;
    const dxf = dxfRectangle(
        offsetX + op.position.x - op.width / 2,
        offsetY + op.position.y - op.height / 2,
        op.width,
        op.height,
        layer
    );
    return { dxf, layer };
}

function profileOperationToDxf(op: ProfileOperation, offsetX: number, offsetY: number): { dxf: string; layer: string } {
    const layer = `PROFILE_${op.side}`;
    const points = op.path.map(p => ({
        x: offsetX + p.x,
        y: offsetY + p.y,
    }));
    const dxf = dxfPolyline(points, layer, true);
    return { dxf, layer };
}

function slotOperationToDxf(op: SlotOperation, offsetX: number, offsetY: number): { dxf: string; layer: string } {
    const layer = `SLOT_${op.width.toFixed(0)}D${op.depth.toFixed(0)}`;
    const dxf = dxfLine(
        offsetX + op.position.x,
        offsetY + op.position.y,
        offsetX + op.endPosition.x,
        offsetY + op.endPosition.y,
        layer
    );
    return { dxf, layer };
}

function operationToDxf(op: Operation, offsetX: number, offsetY: number): { dxf: string; layer: string } | null {
    switch (op.type) {
        case 'DRILL':
            return drillOperationToDxf(op, offsetX, offsetY);
        case 'BORE':
            return boreOperationToDxf(op, offsetX, offsetY);
        case 'POCKET':
            return pocketOperationToDxf(op, offsetX, offsetY);
        case 'PROFILE':
            return profileOperationToDxf(op, offsetX, offsetY);
        case 'SLOT':
            return slotOperationToDxf(op, offsetX, offsetY);
        default:
            return null;
    }
}

// ============================================
// MAIN CONVERTER
// ============================================

/**
 * Convert OperationGraph to DXF content
 *
 * THIS IS THE SOURCE OF TRUTH FOR DXF EXPORT.
 * DXF must come from OperationGraph (manufacturing intent),
 * not from 3D mesh or Cabinet geometry.
 *
 * @param graph - OperationGraph from CNC pipeline
 * @param options - DXF generation options
 * @returns DXF file content as string
 */
export function operationGraphToDxf(
    graph: OperationGraph,
    options: OperationGraphDxfOptions = {}
): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Calculate offset for center origin
    const offsetX = opts.origin === 'center' && opts.panelWidth
        ? -opts.panelWidth / 2
        : 0;
    const offsetY = opts.origin === 'center' && opts.panelHeight
        ? -opts.panelHeight / 2
        : 0;

    // Collect all unique layers
    const layers = new Set<string>();

    if (opts.includeOutline && opts.panelWidth && opts.panelHeight) {
        layers.add('OUTLINE');
    }
    if (opts.includeAnnotations || opts.includeMetadata) {
        layers.add('ANNOTATION');
    }

    // Edge banding layer
    const hasEdgeBanding = opts.includeEdgeBanding && opts.edgeBanding &&
        (opts.edgeBanding.top || opts.edgeBanding.bottom || opts.edgeBanding.left || opts.edgeBanding.right);
    if (hasEdgeBanding) {
        layers.add('EDGE_BAND');
    }

    // Process operations to collect layers
    const operationDxfData: Array<{ dxf: string; layer: string }> = [];
    for (const op of graph.operations) {
        const result = operationToDxf(op, offsetX, offsetY);
        if (result) {
            layers.add(result.layer);
            operationDxfData.push(result);
        }
    }

    // Build DXF content
    let dxf = DXF_HEADER;

    // Add layers
    for (const layer of layers) {
        let color: number = LAYER_COLORS.ANNOTATION;
        if (layer.startsWith('DRILL')) color = LAYER_COLORS.DRILL;
        else if (layer.startsWith('BORE')) color = LAYER_COLORS.BORE;
        else if (layer.startsWith('POCKET')) color = LAYER_COLORS.POCKET;
        else if (layer.startsWith('PROFILE')) color = LAYER_COLORS.PROFILE;
        else if (layer.startsWith('SLOT')) color = LAYER_COLORS.SLOT;
        else if (layer === 'OUTLINE') color = LAYER_COLORS.OUTLINE;
        else if (layer === 'EDGE_BAND') color = LAYER_COLORS.EDGE_BAND;

        dxf += DXF_LAYER_TEMPLATE(layer, color);
    }

    dxf += DXF_TABLES_END;

    // Draw panel outline if enabled
    if (opts.includeOutline && opts.panelWidth && opts.panelHeight) {
        dxf += dxfRectangle(offsetX, offsetY, opts.panelWidth, opts.panelHeight, 'OUTLINE');
    }

    // Draw all operations
    for (const data of operationDxfData) {
        dxf += data.dxf;
    }

    // Draw edge banding indicators
    if (hasEdgeBanding && opts.panelWidth && opts.panelHeight) {
        const eb = opts.edgeBanding!;
        const INSET = 2; // mm inset from panel edge

        if (eb.bottom) {
            dxf += dxfLine(offsetX, offsetY + INSET, offsetX + opts.panelWidth, offsetY + INSET, 'EDGE_BAND');
            dxf += dxfText(offsetX + opts.panelWidth / 2, offsetY + INSET + 1, 1.5, `EB:${eb.bottom.thickness}mm`, 'EDGE_BAND');
        }
        if (eb.top) {
            dxf += dxfLine(offsetX, offsetY + opts.panelHeight - INSET, offsetX + opts.panelWidth, offsetY + opts.panelHeight - INSET, 'EDGE_BAND');
            dxf += dxfText(offsetX + opts.panelWidth / 2, offsetY + opts.panelHeight - INSET - 3, 1.5, `EB:${eb.top.thickness}mm`, 'EDGE_BAND');
        }
        if (eb.left) {
            dxf += dxfLine(offsetX + INSET, offsetY, offsetX + INSET, offsetY + opts.panelHeight, 'EDGE_BAND');
            dxf += dxfText(offsetX + INSET + 1, offsetY + opts.panelHeight / 2, 1.5, `EB:${eb.left.thickness}mm`, 'EDGE_BAND');
        }
        if (eb.right) {
            dxf += dxfLine(offsetX + opts.panelWidth - INSET, offsetY, offsetX + opts.panelWidth - INSET, offsetY + opts.panelHeight, 'EDGE_BAND');
            dxf += dxfText(offsetX + opts.panelWidth - INSET - 1, offsetY + opts.panelHeight / 2, 1.5, `EB:${eb.right.thickness}mm`, 'EDGE_BAND');
        }
    }

    // Add metadata annotation
    if (opts.includeMetadata) {
        const textY = opts.panelHeight ? offsetY + opts.panelHeight + 10 : 10;
        const metadata = [
            `Machine: ${graph.machineId}`,
            `Operations: ${graph.operations.length}`,
            `Tools: ${graph.toolsUsed.join(', ')}`,
        ];

        for (let i = 0; i < metadata.length; i++) {
            dxf += dxfText(offsetX, textY + i * 5, 3, metadata[i], 'ANNOTATION');
        }
    }

    dxf += DXF_FOOTER;

    return dxf;
}

// ============================================
// STATISTICS
// ============================================

export interface OperationGraphDxfStats {
    totalOperations: number;
    operationsByType: Record<string, number>;
    uniqueLayers: number;
    toolsUsed: string[];
}

/**
 * Get statistics about DXF output from OperationGraph
 */
export function getOperationGraphDxfStats(graph: OperationGraph): OperationGraphDxfStats {
    const operationsByType: Record<string, number> = {};
    const layers = new Set<string>();

    for (const op of graph.operations) {
        // Count by type
        operationsByType[op.type] = (operationsByType[op.type] || 0) + 1;

        // Track layers
        switch (op.type) {
            case 'DRILL':
                layers.add(`DRILL_${op.toolId}_D${op.depth.toFixed(0)}`);
                break;
            case 'BORE':
                layers.add(`BORE_${op.diameter.toFixed(0)}D${op.depth.toFixed(0)}`);
                break;
            case 'POCKET':
                layers.add(`POCKET_D${op.depth.toFixed(0)}`);
                break;
            case 'PROFILE':
                layers.add(`PROFILE_${op.side}`);
                break;
            case 'SLOT':
                layers.add(`SLOT_${op.width.toFixed(0)}D${op.depth.toFixed(0)}`);
                break;
        }
    }

    return {
        totalOperations: graph.operations.length,
        operationsByType,
        uniqueLayers: layers.size,
        toolsUsed: graph.toolsUsed,
    };
}

// ============================================
// VALIDATION
// ============================================

export interface DxfValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Validate OperationGraph before DXF export
 */
export function validateOperationGraphForDxf(graph: OperationGraph): DxfValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for empty graph
    if (!graph.operations || graph.operations.length === 0) {
        errors.push('OperationGraph has no operations');
    }

    // Check for missing machine ID
    if (!graph.machineId) {
        errors.push('OperationGraph has no machineId');
    }

    // Check for operations with invalid positions
    for (let i = 0; i < graph.operations.length; i++) {
        const op = graph.operations[i];
        const { x, y, z } = op.position;

        if (!isFinite(x) || !isFinite(y) || !isFinite(z)) {
            errors.push(`Operation ${i} has invalid position: (${x}, ${y}, ${z})`);
        }

        // Warn about negative coordinates
        if (x < 0 || y < 0) {
            warnings.push(`Operation ${i} has negative coordinates: (${x}, ${y})`);
        }
    }

    // Check for missing tool IDs
    if (!graph.toolsUsed || graph.toolsUsed.length === 0) {
        warnings.push('OperationGraph has no toolsUsed array');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

// ============================================
// BATCH EXPORT
// ============================================

/**
 * Generate DXF files for multiple OperationGraphs
 * Returns a Map of filename -> content
 */
export function operationGraphBatchToDxf(
    graphs: OperationGraph[],
    options?: OperationGraphDxfOptions
): Map<string, string> {
    const result = new Map<string, string>();

    for (const graph of graphs) {
        const panelId = graph.metadata.panelId || graph.metadata.jobId;
        const filename = `${panelId}_${graph.machineId}.dxf`;
        const content = operationGraphToDxf(graph, options);
        result.set(filename, content);
    }

    return result;
}
