/**
 * Kernel Truth Service - Contract Types
 *
 * SPEC-08 v8.2: Plasticity-DNA Design Engine
 * Deliverable A: Core Contract Types
 *
 * This file defines the TypeScript contract between:
 * - Frontend (TypeScript/React)
 * - Backend Kernel Service (Python/PyOCC)
 *
 * PRINCIPLES:
 * 1. Kernel = Source of Truth for geometry (B-Rep, not mesh)
 * 2. All ops are deterministic and reversible
 * 3. Canonical JSON for hashing (sorted keys, no whitespace)
 * 4. SHA-256 hash for every delta → Gate chain-of-custody
 */

// ============================================================================
// CORE TRANSPORT TYPES
// ============================================================================

/**
 * Request envelope for all kernel operations
 */
export interface KernelOpRequest<T = unknown> {
  /** API version for forward compatibility */
  apiVersion: 'v1';

  /** Operation identifier from command registry */
  op: string;

  /** Operation-specific payload */
  payload: T;

  /** Optional correlation ID for tracing */
  correlationId?: string;

  /** Timestamp when request was created */
  createdAtIso?: string;
}

/**
 * Response envelope for all kernel operations
 */
export interface KernelOpResponse<T = unknown> {
  /** Success flag */
  ok: boolean;

  /** Result data (present when ok=true) */
  result?: T;

  /** Error details (present when ok=false) */
  error?: KernelError;

  /** Processing time in milliseconds */
  processingTimeMs: number;

  /** Correlation ID echoed from request */
  correlationId?: string;
}

/**
 * Error response structure
 */
export interface KernelError {
  code: KernelErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type KernelErrorCode =
  | 'INVALID_OP'
  | 'INVALID_PAYLOAD'
  | 'GEOMETRY_ERROR'
  | 'BOOLEAN_FAILED'
  | 'FILLET_FAILED'
  | 'VALIDATION_FAILED'
  | 'INTERNAL_ERROR';

// ============================================================================
// GEOMETRY PRIMITIVES
// ============================================================================

/**
 * 2D Path for profiles and contours
 * Coordinates in millimeters
 */
export interface Path2D {
  /** Path segments */
  segments: PathSegment[];

  /** Whether the path is closed */
  closed: boolean;
}

export type PathSegment =
  | { type: 'moveTo'; x: number; y: number }
  | { type: 'lineTo'; x: number; y: number }
  | { type: 'arcTo'; x: number; y: number; cx: number; cy: number; ccw?: boolean }
  | { type: 'bezierTo'; x: number; y: number; cp1x: number; cp1y: number; cp2x: number; cp2y: number };

/**
 * 3D Point in millimeters
 */
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/**
 * 3D Vector (unit or magnitude)
 */
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Axis-Aligned Bounding Box
 */
export interface AABB {
  min: Point3D;
  max: Point3D;
}

/**
 * Transform matrix (4x4 column-major)
 */
export type Matrix4x4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
];

// ============================================================================
// KERNEL DELTA (Geometry Change Record)
// ============================================================================

/**
 * KernelDelta represents a single geometry change
 * Each delta is hashed and chained for Gate enforcement
 */
export interface KernelDeltaV1 {
  /** Delta version for migration */
  version: 'v1';

  /** Unique delta identifier */
  deltaId: string;

  /** Operation that created this delta */
  op: string;

  /** Input payload (canonicalized) */
  inputPayloadJson: string;

  /** SHA-256 hash of input payload */
  inputHash: string;

  /** Output geometry hash (SHA-256 of result) */
  outputHash: string;

  /** Previous delta ID (for chain) */
  previousDeltaId: string | null;

  /** Timestamp */
  createdAtIso: string;

  /** Session ID for grouping */
  sessionId?: string;
}

// ============================================================================
// FLATTEN OUTPUT TYPES
// ============================================================================

/**
 * Planar loops extracted from a solid face
 * Used for DXF export
 */
export interface PlanarLoopsV1 {
  /** Version for schema evolution */
  version: 'v1';

  /** Source face identifier */
  faceId: string;

  /** Outer boundary loop */
  outer: Loop2D;

  /** Inner holes (cutouts) */
  holes: Loop2D[];

  /** Original 3D face normal */
  normal: Vector3D;

  /** Transform from 3D to 2D plane */
  planeToWorld: Matrix4x4;
}

/**
 * 2D Loop (closed contour)
 */
export interface Loop2D {
  /** Loop segments */
  segments: LoopSegment[];

  /** Winding direction (true = CCW = outer, false = CW = hole) */
  ccw: boolean;
}

export type LoopSegment =
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'arc'; x1: number; y1: number; x2: number; y2: number; cx: number; cy: number; ccw: boolean };

// ============================================================================
// OPERATION PAYLOADS
// ============================================================================

/**
 * Create solid from 2D profile extrusion
 */
export interface CreateSolidFromProfilePayload {
  /** Profile to extrude */
  profile: Path2D;

  /** Extrusion depth in mm */
  depth: number;

  /** Extrusion direction (default: +Z) */
  direction?: Vector3D;

  /** Optional transform to apply */
  transform?: Matrix4x4;
}

export interface CreateSolidFromProfileResult {
  /** Resulting solid handle */
  solidId: string;

  /** Bounding box */
  aabb: AABB;

  /** Face count */
  faceCount: number;

  /** Edge count */
  edgeCount: number;
}

/**
 * Boolean cut operation
 */
export interface BooleanCutPayload {
  /** Target solid to cut */
  targetSolidId: string;

  /** Tool solid to subtract */
  toolSolidId: string;

  /** Keep tool solid after operation */
  keepTool?: boolean;
}

export interface BooleanCutResult {
  /** Resulting solid handle */
  solidId: string;

  /** Bounding box */
  aabb: AABB;

  /** Face count after cut */
  faceCount: number;
}

/**
 * Fillet edges operation
 */
export interface FilletEdgesPayload {
  /** Solid to fillet */
  solidId: string;

  /** Edge IDs to fillet (empty = all edges) */
  edgeIds: string[];

  /** Fillet radius in mm */
  radius: number;
}

export interface FilletEdgesResult {
  /** Resulting solid handle */
  solidId: string;

  /** Number of edges filleted */
  filletedCount: number;

  /** Edges that couldn't be filleted */
  failedEdgeIds: string[];
}

/**
 * Extract planar loops from solid face
 */
export interface ExtractPlanarLoopsPayload {
  /** Solid to extract from */
  solidId: string;

  /** Face ID to extract (empty = all planar faces) */
  faceId?: string;

  /** Tolerance for arc detection */
  arcTolerance?: number;
}

export interface ExtractPlanarLoopsResult {
  /** Extracted loops per face */
  faces: PlanarLoopsV1[];

  /** Faces that couldn't be extracted */
  failedFaceIds: string[];
}

/**
 * Validate loops for manufacturability
 */
export interface ValidateLoopsPayload {
  /** Loops to validate */
  loops: PlanarLoopsV1;

  /** Minimum inner radius (tool radius) */
  minInnerRadius: number;

  /** Minimum segment length */
  minSegmentLength: number;
}

export interface ValidateLoopsResult {
  /** Validation passed */
  valid: boolean;

  /** Validation issues */
  issues: ValidationIssue[];
}

export interface ValidationIssue {
  type: 'SMALL_RADIUS' | 'SHORT_SEGMENT' | 'SELF_INTERSECT' | 'OPEN_LOOP';
  message: string;
  location?: Point3D;
  value?: number;
}

// ============================================================================
// SOLID QUERY OPERATIONS
// ============================================================================

/**
 * Get solid info
 */
export interface GetSolidInfoPayload {
  solidId: string;
}

export interface GetSolidInfoResult {
  solidId: string;
  aabb: AABB;
  volume: number;
  surfaceArea: number;
  faceCount: number;
  edgeCount: number;
  vertexCount: number;
  isValid: boolean;
}

/**
 * Get mesh representation for visualization
 */
export interface GetSolidMeshPayload {
  solidId: string;

  /** Mesh quality (higher = more triangles) */
  quality?: 'low' | 'medium' | 'high';

  /** Linear deflection tolerance */
  linearDeflection?: number;

  /** Angular deflection tolerance in degrees */
  angularDeflection?: number;
}

export interface GetSolidMeshResult {
  /** Vertex positions (x,y,z,x,y,z,...) */
  positions: number[];

  /** Vertex normals (nx,ny,nz,...) */
  normals: number[];

  /** Triangle indices */
  indices: number[];

  /** Per-face groups for material assignment */
  groups?: MeshGroup[];
}

export interface MeshGroup {
  faceId: string;
  start: number;
  count: number;
}

// ============================================================================
// COMMAND REGISTRY TYPES
// ============================================================================

/**
 * Command definition from registry
 */
export interface CommandDef {
  /** Unique command ID */
  id: string;

  /** Display name */
  name: string;

  /** Category for grouping */
  category: CommandCategory;

  /** Keyboard shortcut */
  hotkey?: string;

  /** Icon identifier */
  icon?: string;

  /** Description for tooltip */
  description: string;

  /** Preconditions that must be true */
  preconditions: CommandPrecondition[];

  /** Kernel operation to invoke */
  kernelOp?: string;

  /** UI action (for non-kernel commands) */
  uiAction?: string;

  /** Whether command is undoable */
  undoable: boolean;

  /** Gate state required (if any) */
  requiredGateState?: 'DRAFT' | 'FROZEN' | 'RELEASED';
}

export type CommandCategory =
  | 'file'
  | 'edit'
  | 'view'
  | 'create'
  | 'modify'
  | 'transform'
  | 'measure'
  | 'export'
  | 'gate';

export type CommandPrecondition =
  | { type: 'selection'; count: 'one' | 'many' | 'any' }
  | { type: 'toolActive'; toolId: string }
  | { type: 'gateState'; state: string }
  | { type: 'solidExists'; solidId: string }
  | { type: 'custom'; fn: string };

// ============================================================================
// CANONICAL JSON UTILITIES
// ============================================================================

/**
 * Canonicalize object for deterministic hashing
 * - Sort keys alphabetically
 * - No whitespace
 * - Numbers as-is (no trailing zeros)
 * - null/undefined omitted
 */
export function canonicalize(obj: unknown): string {
  return JSON.stringify(obj, (_, value) => {
    if (value === null || value === undefined) {
      return undefined;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce((sorted: Record<string, unknown>, key) => {
          sorted[key] = value[key];
          return sorted;
        }, {});
    }
    return value;
  });
}

/**
 * Compute SHA-256 hash of canonical JSON
 */
export async function computeHash(obj: unknown): Promise<string> {
  const canonical = canonicalize(obj);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isKernelError(response: KernelOpResponse): response is KernelOpResponse & { ok: false; error: KernelError } {
  return !response.ok && response.error !== undefined;
}

export function isKernelSuccess<T>(response: KernelOpResponse<T>): response is KernelOpResponse<T> & { ok: true; result: T } {
  return response.ok && response.result !== undefined;
}
