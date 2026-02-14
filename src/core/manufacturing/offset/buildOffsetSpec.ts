// src/core/manufacturing/offset/buildOffsetSpec.ts
/**
 * Offset Spec Builder.
 *
 * Builds OffsetSpec for different operations and passes:
 * - PROFILE: outside/inside cuts with tool radius compensation
 * - GROOVE: centerline or offset grooves
 * - POCKET: clearing and finish passes
 *
 * Offset distance formulas:
 *
 * ROUGH pass (leave stock for finish):
 *   dist = max(0, R + user + kerf - stock)
 *   - stock is subtracted because we want to leave material
 *
 * FINISH pass (final dimension):
 *   dist = R + user + kerf
 *   - no stock allowance (cutting to final size)
 *
 * v0.10.6.2 - Variable Offset by Tool Radius
 */

import {
  OffsetSpec,
  OffsetSide,
  OffsetWhy,
  OffsetInputs,
} from "./offsetSpec.v1";
import {
  Winding,
  CutSide,
  offsetSideForProfile,
  offsetSideForPocket,
  offsetSideForGroove,
} from "./offsetSide";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Operation kind for offset calculation.
 */
export type OffsetOpKind = "PROFILE" | "GROOVE" | "POCKET";

/**
 * Pass type for offset calculation.
 */
export type OffsetPassKind = "ROUGH" | "FINISH";

/**
 * Request to build an offset spec.
 */
export interface BuildOffsetRequest {
  /** Operation type */
  opKind: OffsetOpKind;

  /** Pass type (affects stock allowance) */
  pass: OffsetPassKind;

  /** Cut side (PROFILE only) */
  cutSide?: CutSide;

  /** Path winding direction */
  pathWinding: Winding;

  /** Tool diameter in mm */
  toolDiameterMm: number;

  /** User/designer adjustment in mm (can be negative) */
  userAllowanceMm?: number;

  /** Kerf/saw allowance in mm (usually 0 for routing) */
  kerfAllowanceMm?: number;

  /** Stock to leave for finish pass in mm (rough only) */
  stockToLeaveMm?: number;

  /** Groove side for offset grooves */
  grooveSide?: "LEFT" | "RIGHT";

  /** Groove width for V-groove calculations */
  grooveWidthMm?: number;
}

/**
 * Result of building an offset spec.
 */
export interface BuildOffsetResult {
  /** The built offset spec */
  spec: OffsetSpec;

  /** Warnings encountered during build */
  warnings: string[];
}

// =============================================================================
// PROFILE OFFSET
// =============================================================================

/**
 * Build offset spec for PROFILE operation.
 *
 * Profile cuts offset the tool to follow the part boundary.
 * The offset side depends on whether it's an outside or inside cut.
 *
 * @param req Build request with profile parameters
 * @returns Offset spec and warnings
 */
function buildProfileOffsetSpec(req: BuildOffsetRequest): BuildOffsetResult {
  const warnings: string[] = [];

  // Validate required fields
  if (!req.cutSide) {
    throw new Error("cutSide is required for PROFILE operations");
  }

  // Calculate base values
  const R = req.toolDiameterMm * 0.5;
  const user = req.userAllowanceMm ?? 0;
  const kerf = req.kerfAllowanceMm ?? 0;
  const stock = req.pass === "ROUGH" ? (req.stockToLeaveMm ?? 0) : 0;

  // Determine offset side
  const side = offsetSideForProfile(req.pathWinding, req.cutSide);

  // Calculate distance
  const base = R + user + kerf;
  let dist: number;
  let formula: string;

  if (req.pass === "ROUGH") {
    dist = Math.max(0, base - stock);
    formula = "dist = max(0, R + user + kerf - stock)";

    // Warn if stock exceeds base (zero offset)
    if (stock >= base) {
      warnings.push(
        `Stock to leave (${stock}mm) >= base offset (${base}mm). ` +
        `Rough pass will be on centerline.`
      );
    }
  } else {
    dist = base;
    formula = "dist = R + user + kerf";
  }

  // Build reason codes
  const why: OffsetWhy[] = [
    req.cutSide === "OUTSIDE" ? "PROFILE_OUTSIDE" : "PROFILE_INSIDE",
    "RADIUS_COMP",
  ];

  if (user !== 0) why.push("USER_ALLOWANCE");
  if (kerf !== 0) why.push("KERF_ALLOWANCE");
  if (stock > 0) why.push("FINISH_ALLOWANCE");

  // Build inputs
  const inputs: OffsetInputs = {
    toolDiameterMm: req.toolDiameterMm,
    toolRadiusMm: R,
    stockToLeaveMm: stock,
    kerfAllowanceMm: kerf,
    userAllowanceMm: user,
  };

  const spec: OffsetSpec = {
    version: "1.0",
    distanceMm: dist,
    side,
    why,
    inputs,
    formula,
  };

  return { spec, warnings };
}

// =============================================================================
// GROOVE OFFSET
// =============================================================================

/**
 * Build offset spec for GROOVE operation.
 *
 * Grooves typically follow the centerline, but can be offset
 * for specific groove profiles (e.g., V-groove with shoulder).
 *
 * @param req Build request with groove parameters
 * @returns Offset spec and warnings
 */
function buildGrooveOffsetSpec(req: BuildOffsetRequest): BuildOffsetResult {
  const warnings: string[] = [];

  const R = req.toolDiameterMm * 0.5;
  const user = req.userAllowanceMm ?? 0;
  const kerf = req.kerfAllowanceMm ?? 0;

  // Grooves are typically centerline
  // Offset only if explicit grooveSide is specified
  if (!req.grooveSide) {
    // Centerline groove
    const inputs: OffsetInputs = {
      toolDiameterMm: req.toolDiameterMm,
      toolRadiusMm: R,
      stockToLeaveMm: 0,
      kerfAllowanceMm: kerf,
      userAllowanceMm: user,
    };

    return {
      spec: {
        version: "1.0",
        distanceMm: 0,
        side: "LEFT",
        why: ["GROOVE_CENTERLINE"],
        inputs,
        formula: "dist = 0 (centerline)",
      },
      warnings,
    };
  }

  // Offset groove
  const side = offsetSideForGroove(req.grooveSide);
  const dist = R + user + kerf;

  const inputs: OffsetInputs = {
    toolDiameterMm: req.toolDiameterMm,
    toolRadiusMm: R,
    stockToLeaveMm: 0,
    kerfAllowanceMm: kerf,
    userAllowanceMm: user,
  };

  const why: OffsetWhy[] = ["GROOVE_OFFSET", "RADIUS_COMP"];
  if (user !== 0) why.push("USER_ALLOWANCE");
  if (kerf !== 0) why.push("KERF_ALLOWANCE");

  return {
    spec: {
      version: "1.0",
      distanceMm: dist,
      side,
      why,
      inputs,
      formula: "dist = R + user + kerf",
    },
    warnings,
  };
}

// =============================================================================
// POCKET OFFSET
// =============================================================================

/**
 * Build offset spec for POCKET operation.
 *
 * Pocket clearing offsets inward from the pocket boundary.
 * Multiple passes may be needed for larger pockets.
 *
 * @param req Build request with pocket parameters
 * @returns Offset spec and warnings
 */
function buildPocketOffsetSpec(req: BuildOffsetRequest): BuildOffsetResult {
  const warnings: string[] = [];

  const R = req.toolDiameterMm * 0.5;
  const user = req.userAllowanceMm ?? 0;
  const kerf = req.kerfAllowanceMm ?? 0;
  const stock = req.pass === "ROUGH" ? (req.stockToLeaveMm ?? 0) : 0;

  // Pocket offsets inward from boundary
  const side = offsetSideForPocket(req.pathWinding);

  // Calculate distance
  const base = R + user + kerf;
  let dist: number;
  let formula: string;

  if (req.pass === "ROUGH") {
    // Rough pocket: leave stock on walls
    dist = Math.max(0, base - stock);
    formula = "dist = max(0, R + user + kerf - stock)";

    if (stock >= base) {
      warnings.push(
        `Stock to leave (${stock}mm) >= base offset (${base}mm). ` +
        `Pocket rough pass will be on boundary.`
      );
    }
  } else {
    // Finish pocket: cut to final dimension
    dist = base;
    formula = "dist = R + user + kerf";
  }

  const why: OffsetWhy[] = [
    req.pass === "ROUGH" ? "POCKET_CLEAR" : "POCKET_FINISH",
    "RADIUS_COMP",
  ];

  if (user !== 0) why.push("USER_ALLOWANCE");
  if (kerf !== 0) why.push("KERF_ALLOWANCE");
  if (stock > 0) why.push("FINISH_ALLOWANCE");

  const inputs: OffsetInputs = {
    toolDiameterMm: req.toolDiameterMm,
    toolRadiusMm: R,
    stockToLeaveMm: stock,
    kerfAllowanceMm: kerf,
    userAllowanceMm: user,
  };

  return {
    spec: {
      version: "1.0",
      distanceMm: dist,
      side,
      why,
      inputs,
      formula,
    },
    warnings,
  };
}

// =============================================================================
// MAIN BUILDER
// =============================================================================

/**
 * Build an offset spec for the given operation and parameters.
 *
 * Routes to the appropriate builder based on opKind.
 *
 * @param req Build request
 * @returns Offset spec and warnings
 * @throws Error if required parameters are missing
 */
export function buildOffsetSpec(req: BuildOffsetRequest): BuildOffsetResult {
  // Validate tool diameter
  if (req.toolDiameterMm <= 0) {
    throw new Error(`Invalid tool diameter: ${req.toolDiameterMm}mm`);
  }

  switch (req.opKind) {
    case "PROFILE":
      return buildProfileOffsetSpec(req);
    case "GROOVE":
      return buildGrooveOffsetSpec(req);
    case "POCKET":
      return buildPocketOffsetSpec(req);
    default:
      throw new Error(`Unknown operation kind: ${req.opKind}`);
  }
}

/**
 * Build offset spec (convenience function that returns just the spec).
 *
 * Use buildOffsetSpec() if you need warnings.
 *
 * @param req Build request
 * @returns Offset spec
 */
export function buildOffsetSpecSimple(req: BuildOffsetRequest): OffsetSpec {
  return buildOffsetSpec(req).spec;
}

// =============================================================================
// MULTI-PASS HELPERS
// =============================================================================

/**
 * Build offset specs for rough and finish passes.
 *
 * Convenience function for common rough → finish workflow.
 *
 * @param req Base request (pass will be overridden)
 * @param finishAllowanceMm Stock to leave on rough pass
 * @returns Rough and finish specs with warnings
 */
export function buildRoughFinishOffsetSpecs(
  req: Omit<BuildOffsetRequest, "pass" | "stockToLeaveMm">,
  finishAllowanceMm: number
): {
  rough: OffsetSpec;
  finish: OffsetSpec;
  warnings: string[];
} {
  const roughResult = buildOffsetSpec({
    ...req,
    pass: "ROUGH",
    stockToLeaveMm: finishAllowanceMm,
  });

  const finishResult = buildOffsetSpec({
    ...req,
    pass: "FINISH",
    stockToLeaveMm: 0,
  });

  return {
    rough: roughResult.spec,
    finish: finishResult.spec,
    warnings: [...roughResult.warnings, ...finishResult.warnings],
  };
}

/**
 * Build offset spec for onion skin strategy.
 *
 * Onion skin leaves a thin layer at the bottom to hold the part.
 * This affects Z depth, not XY offset, but we track it for audit.
 *
 * @param baseSpec Base offset spec
 * @param onionSkinMm Thickness of onion skin layer
 * @returns Modified spec with onion skin flag
 */
export function addOnionSkinToSpec(
  baseSpec: OffsetSpec,
  onionSkinMm: number
): OffsetSpec {
  return {
    ...baseSpec,
    why: [...baseSpec.why, "ONION_SKIN"],
    formula: `${baseSpec.formula} + onionSkin=${onionSkinMm}mm`,
  };
}
