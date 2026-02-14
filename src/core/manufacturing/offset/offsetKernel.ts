// src/core/manufacturing/offset/offsetKernel.ts
/**
 * Offset Kernel Adapter.
 *
 * Applies OffsetSpec to paths using the underlying offset kernel.
 * Bridges the spec-based API with the existing signed-distance kernel.
 *
 * Convention:
 * - LEFT offset: positive signed distance (normal-left of tangent)
 * - RIGHT offset: negative signed distance
 *
 * v0.10.6.2 - Variable Offset by Tool Radius
 */

import { OffsetSpec, PathOffsetMeta } from "./offsetSpec.v1";
import { simpleHashObject } from "../audit/hashing";

// =============================================================================
// TYPES (Path abstraction - compatible with existing types)
// =============================================================================

/**
 * 2D point.
 */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * Line segment.
 */
export interface LineSegment {
  kind: "LINE";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Arc segment.
 */
export interface ArcSegment {
  kind: "ARC";
  cx: number;
  cy: number;
  r: number;
  startDeg: number;
  endDeg: number;
  cw: boolean;
}

/**
 * Path segment (line or arc).
 */
export type PathSegment = LineSegment | ArcSegment;

/**
 * Path with metadata.
 */
export interface Path {
  id: string;
  segs: PathSegment[];
  closed: boolean;
  winding?: "CW" | "CCW";
  meta?: Record<string, unknown>;
}

/**
 * End cap style for open paths.
 */
export type CapStyle = "BUTT" | "ROUND" | "SQUARE";

// =============================================================================
// FINGERPRINT COMPUTATION
// =============================================================================

/**
 * Compute fingerprint for an offset spec.
 *
 * Creates a deterministic hash of the offset parameters for audit trail.
 * Uses simpleHashObject for fast, synchronous fingerprinting.
 *
 * @param spec Offset specification
 * @returns 8-char hex fingerprint
 */
export function computeOffsetFingerprint(spec: OffsetSpec): string {
  // Hash the essential offset parameters that affect the result
  const fingerprintData = {
    version: spec.version,
    distanceMm: spec.distanceMm,
    side: spec.side,
    inputs: spec.inputs,
  };
  return simpleHashObject(fingerprintData);
}

// =============================================================================
// SIGNED DISTANCE CONVERSION
// =============================================================================

/**
 * Convert OffsetSpec to signed distance for kernel.
 *
 * Convention:
 * - LEFT = positive distance (offset to left of path)
 * - RIGHT = negative distance (offset to right of path)
 *
 * @param spec Offset specification
 * @returns Signed distance for kernel
 */
export function specToSignedDistance(spec: OffsetSpec): number {
  return spec.side === "LEFT" ? spec.distanceMm : -spec.distanceMm;
}

/**
 * Convert signed distance to OffsetSpec side.
 *
 * @param signedDistance Signed distance value
 * @returns Tuple of [absoluteDistance, side]
 */
export function signedDistanceToSpec(
  signedDistance: number
): [number, "LEFT" | "RIGHT"] {
  if (signedDistance >= 0) {
    return [signedDistance, "LEFT"];
  }
  return [-signedDistance, "RIGHT"];
}

// =============================================================================
// OFFSET KERNEL INTERFACE
// =============================================================================

/**
 * Offset result with metadata.
 */
export interface OffsetResult {
  /** Resulting offset path(s) */
  paths: Path[];

  /** Applied offset spec */
  spec: OffsetSpec;

  /** Success flag */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** Warnings */
  warnings: string[];
}

/**
 * Core offset function type (to be implemented by kernel).
 *
 * This matches the expected signature of the existing offset kernel.
 */
export type OffsetKernelFn = (
  path: Path,
  signedDistance: number,
  options?: { caps?: CapStyle }
) => Path[];

// =============================================================================
// DEFAULT OFFSET KERNEL (Placeholder)
// =============================================================================

/**
 * Placeholder offset kernel for closed paths.
 *
 * In production, this would call the Clipper or Python kernel.
 * For now, it just clones the path with updated metadata.
 *
 * @param path Input path
 * @param signedDistance Signed offset distance
 * @returns Offset path(s)
 */
function defaultOffsetClosedPath(
  path: Path,
  signedDistance: number
): Path[] {
  // Placeholder: in production, call actual offset kernel
  // For now, clone with metadata note
  console.warn(
    `[offsetKernel] Placeholder offset: ${signedDistance}mm on path ${path.id}`
  );

  return [
    {
      ...path,
      id: `${path.id}_offset`,
      meta: {
        ...(path.meta || {}),
        _placeholder: true,
        _requestedOffset: signedDistance,
      },
    },
  ];
}

/**
 * Placeholder offset kernel for open paths.
 *
 * @param path Input path
 * @param signedDistance Signed offset distance
 * @param caps End cap style
 * @returns Offset path(s)
 */
function defaultOffsetOpenPath(
  path: Path,
  signedDistance: number,
  caps: CapStyle
): Path[] {
  console.warn(
    `[offsetKernel] Placeholder open offset: ${signedDistance}mm, caps=${caps} on path ${path.id}`
  );

  return [
    {
      ...path,
      id: `${path.id}_offset`,
      meta: {
        ...(path.meta || {}),
        _placeholder: true,
        _requestedOffset: signedDistance,
        _caps: caps,
      },
    },
  ];
}

// =============================================================================
// OFFSET BY SPEC
// =============================================================================

/**
 * Apply offset spec to a closed path.
 *
 * Converts the spec to signed distance and applies the kernel.
 * Attaches offset metadata for audit trail.
 *
 * @param path Input closed path
 * @param spec Offset specification
 * @param kernelFn Optional custom kernel function
 * @returns Offset result
 */
export function offsetClosedPathBySpec(
  path: Path,
  spec: OffsetSpec,
  kernelFn?: OffsetKernelFn
): OffsetResult {
  const warnings: string[] = [];

  // Validate path is closed
  if (!path.closed) {
    return {
      paths: [],
      spec,
      success: false,
      error: "Path must be closed for offsetClosedPathBySpec",
      warnings,
    };
  }

  // Handle zero offset
  if (spec.distanceMm === 0) {
    const result: Path = {
      ...path,
      id: `${path.id}_offset`,
      meta: {
        ...(path.meta || {}),
        offsetSpec: spec,
        offsetFp: computeOffsetFingerprint(spec),
      },
    };
    return { paths: [result], spec, success: true, warnings };
  }

  // Convert to signed distance
  const signedDistance = specToSignedDistance(spec);

  // Apply kernel
  const kernel = kernelFn || defaultOffsetClosedPath;
  let offsetPaths: Path[];

  try {
    offsetPaths = kernel(path, signedDistance);
  } catch (err) {
    return {
      paths: [],
      spec,
      success: false,
      error: `Offset kernel failed: ${err instanceof Error ? err.message : String(err)}`,
      warnings,
    };
  }

  // Attach metadata to results
  const resultPaths = offsetPaths.map((p, i) => ({
    ...p,
    id: offsetPaths.length === 1 ? `${path.id}_offset` : `${path.id}_offset_${i}`,
    meta: {
      ...(p.meta || {}),
      offsetSpec: spec,
      offsetFp: computeOffsetFingerprint(spec),
      sourcePathId: path.id,
      offsetAppliedAt: new Date().toISOString(),
    } as PathOffsetMeta,
  }));

  return {
    paths: resultPaths,
    spec,
    success: true,
    warnings,
  };
}

/**
 * Apply offset spec to an open path.
 *
 * Open path offset creates a "stroke" around the path.
 *
 * @param path Input open path
 * @param spec Offset specification
 * @param caps End cap style
 * @param kernelFn Optional custom kernel function
 * @returns Offset result
 */
export function offsetOpenPathBySpec(
  path: Path,
  spec: OffsetSpec,
  caps: CapStyle = "BUTT",
  kernelFn?: OffsetKernelFn
): OffsetResult {
  const warnings: string[] = [];

  // Validate path is open
  if (path.closed) {
    return {
      paths: [],
      spec,
      success: false,
      error: "Path must be open for offsetOpenPathBySpec",
      warnings,
    };
  }

  // Handle zero offset
  if (spec.distanceMm === 0) {
    const result: Path = {
      ...path,
      id: `${path.id}_offset`,
      meta: {
        ...(path.meta || {}),
        offsetSpec: spec,
        offsetFp: computeOffsetFingerprint(spec),
      },
    };
    return { paths: [result], spec, success: true, warnings };
  }

  // Convert to signed distance
  const signedDistance = specToSignedDistance(spec);

  // Apply kernel
  const kernel = kernelFn || ((p, d) => defaultOffsetOpenPath(p, d, caps));
  let offsetPaths: Path[];

  try {
    offsetPaths = kernel(path, signedDistance, { caps });
  } catch (err) {
    return {
      paths: [],
      spec,
      success: false,
      error: `Open offset kernel failed: ${err instanceof Error ? err.message : String(err)}`,
      warnings,
    };
  }

  // Attach metadata
  const resultPaths = offsetPaths.map((p, i) => ({
    ...p,
    id: offsetPaths.length === 1 ? `${path.id}_offset` : `${path.id}_offset_${i}`,
    meta: {
      ...(p.meta || {}),
      offsetSpec: spec,
      offsetFp: computeOffsetFingerprint(spec),
      sourcePathId: path.id,
      offsetAppliedAt: new Date().toISOString(),
    } as PathOffsetMeta,
  }));

  return {
    paths: resultPaths,
    spec,
    success: true,
    warnings,
  };
}

// =============================================================================
// BATCH OFFSET
// =============================================================================

/**
 * Apply same offset spec to multiple paths.
 *
 * @param paths Input paths
 * @param spec Offset specification
 * @param kernelFn Optional custom kernel function
 * @returns Combined results
 */
export function offsetPathsBySpec(
  paths: Path[],
  spec: OffsetSpec,
  kernelFn?: OffsetKernelFn
): {
  results: OffsetResult[];
  allSuccess: boolean;
  allWarnings: string[];
} {
  const results = paths.map((path) =>
    path.closed
      ? offsetClosedPathBySpec(path, spec, kernelFn)
      : offsetOpenPathBySpec(path, spec, "BUTT", kernelFn)
  );

  const allSuccess = results.every((r) => r.success);
  const allWarnings = results.flatMap((r) => r.warnings);

  return { results, allSuccess, allWarnings };
}

// =============================================================================
// EXTRACT SPEC FROM PATH
// =============================================================================

/**
 * Extract offset spec from path metadata.
 *
 * @param path Path with potential offset metadata
 * @returns Offset spec or undefined
 */
export function extractOffsetSpec(path: Path): OffsetSpec | undefined {
  const meta = path.meta as PathOffsetMeta | undefined;
  return meta?.offsetSpec;
}

/**
 * Check if path has offset spec attached.
 *
 * @param path Path to check
 * @returns True if offset spec is present
 */
export function hasOffsetSpec(path: Path): boolean {
  return extractOffsetSpec(path) !== undefined;
}
