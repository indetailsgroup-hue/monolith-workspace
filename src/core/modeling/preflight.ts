/**
 * Preflight Validation System
 *
 * Validates design intents against manufacturing constraints:
 * - Depth vs panel thickness
 * - Tool radius clearance
 * - Edge distance minimums
 * - Material-specific limits
 *
 * Returns validation errors with severity levels for UI display.
 *
 * v1.0: Initial preflight system
 */

import type { DesignIntent, EdgeProfileIntent, GrooveIntent, ProfileAsset } from './types';

// ============================================================================
// Validation Types
// ============================================================================

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationError {
  id: string;
  severity: ValidationSeverity;
  code: string;
  message: string;
  /** Target element ID for highlighting */
  targetId?: string;
  /** Suggested fix value */
  suggestedValue?: number;
  /** Additional context */
  context?: Record<string, unknown>;
}

export interface PreflightResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  info: ValidationError[];
}

// ============================================================================
// Panel Context (for validation)
// ============================================================================

export interface PanelContext {
  panelId: string;
  thickness: number; // mm
  width: number; // mm
  height: number; // mm
  material: {
    type: 'mdf' | 'plywood' | 'particleboard' | 'solid-wood';
    density?: number; // kg/m³
  };
  /** Already applied intents on this panel */
  existingIntents: DesignIntent[];
}

// ============================================================================
// Tool Context (CNC constraints)
// ============================================================================

export interface ToolContext {
  /** Available tool radii */
  availableToolRadii: number[]; // mm
  /** Maximum depth per pass */
  maxDepthPerPass: number; // mm
  /** Minimum edge distance */
  minEdgeDistance: number; // mm
  /** Minimum feature spacing */
  minFeatureSpacing: number; // mm
}

const DEFAULT_TOOL_CONTEXT: ToolContext = {
  availableToolRadii: [1.5, 2, 3, 4, 6, 8, 10, 12],
  maxDepthPerPass: 8,
  minEdgeDistance: 5,
  minFeatureSpacing: 3,
};

// ============================================================================
// Validation Rules
// ============================================================================

/** Rule: Depth cannot exceed panel thickness minus safety margin */
function validateDepthVsThickness(
  intent: DesignIntent,
  panel: PanelContext
): ValidationError | null {
  const SAFETY_MARGIN = 2; // mm remaining material

  let depth = 0;
  let intentType = '';

  if (intent.type === 'edge-profile') {
    depth = (intent as EdgeProfileIntent).depth;
    intentType = 'Edge profile';
  } else if (intent.type === 'groove') {
    depth = (intent as GrooveIntent).depth;
    intentType = 'Groove';
  }

  if (depth <= 0) return null;

  const maxAllowedDepth = panel.thickness - SAFETY_MARGIN;

  if (depth > maxAllowedDepth) {
    return {
      id: `depth-vs-thickness-${intent.id}`,
      severity: 'error',
      code: 'DEPTH_EXCEEDS_THICKNESS',
      message: `${intentType} depth (${depth}mm) exceeds safe limit (${maxAllowedDepth}mm) for ${panel.thickness}mm panel`,
      targetId: intent.target.panelId,
      suggestedValue: maxAllowedDepth,
      context: {
        currentDepth: depth,
        panelThickness: panel.thickness,
        maxAllowedDepth,
      },
    };
  }

  // Warning if close to limit
  if (depth > maxAllowedDepth - 1) {
    return {
      id: `depth-warning-${intent.id}`,
      severity: 'warning',
      code: 'DEPTH_NEAR_LIMIT',
      message: `${intentType} depth (${depth}mm) is close to maximum safe limit`,
      targetId: intent.target.panelId,
    };
  }

  return null;
}

/** Rule: Tool radius must be available */
function validateToolRadius(
  intent: DesignIntent,
  profile: ProfileAsset | undefined,
  tools: ToolContext
): ValidationError | null {
  if (!profile) return null;

  const requiredRadius = profile.toolRadius;
  const available = tools.availableToolRadii;

  if (!available.includes(requiredRadius)) {
    const closest = available.reduce((a, b) =>
      Math.abs(b - requiredRadius) < Math.abs(a - requiredRadius) ? b : a
    );

    return {
      id: `tool-radius-${intent.id}`,
      severity: 'error',
      code: 'TOOL_RADIUS_UNAVAILABLE',
      message: `Profile requires R${requiredRadius}mm tool, not available. Closest: R${closest}mm`,
      targetId: intent.target.panelId,
      suggestedValue: closest,
      context: {
        requiredRadius,
        availableRadii: available,
        closestAvailable: closest,
      },
    };
  }

  return null;
}

/** Rule: Minimum edge distance */
function validateEdgeDistance(
  intent: DesignIntent,
  _panel: PanelContext,
  tools: ToolContext
): ValidationError | null {
  // Only applies to face operations with offset
  if (intent.type !== 'groove') return null;

  const groove = intent as GrooveIntent;
  const offset = groove.offset;

  if (offset < tools.minEdgeDistance) {
    return {
      id: `edge-distance-${intent.id}`,
      severity: 'error',
      code: 'EDGE_DISTANCE_TOO_SMALL',
      message: `Groove offset (${offset}mm) is less than minimum edge distance (${tools.minEdgeDistance}mm)`,
      targetId: intent.target.panelId,
      suggestedValue: tools.minEdgeDistance,
      context: {
        currentOffset: offset,
        minRequired: tools.minEdgeDistance,
      },
    };
  }

  return null;
}

/** Rule: Feature spacing (avoid overlapping operations) */
function validateFeatureSpacing(
  intent: DesignIntent,
  panel: PanelContext,
  tools: ToolContext
): ValidationError | null {
  // Check against existing intents on same panel
  const conflicts: string[] = [];

  for (const existing of panel.existingIntents) {
    if (existing.id === intent.id) continue;
    if (existing.target.panelId !== intent.target.panelId) continue;

    // Same edge check for edge operations
    if (
      intent.type === 'edge-profile' &&
      existing.type === 'edge-profile' &&
      intent.target.edgeIndex === existing.target.edgeIndex
    ) {
      conflicts.push(`Overlapping edge profile on edge ${intent.target.edgeIndex}`);
    }

    // Same face check for grooves
    if (
      intent.type === 'groove' &&
      existing.type === 'groove' &&
      intent.target.face === existing.target.face
    ) {
      const intentGroove = intent as GrooveIntent;
      const existingGroove = existing as GrooveIntent;

      const spacing = Math.abs(intentGroove.offset - existingGroove.offset);
      if (spacing < tools.minFeatureSpacing + intentGroove.width / 2 + existingGroove.width / 2) {
        conflicts.push(`Grooves too close (${spacing.toFixed(1)}mm apart)`);
      }
    }
  }

  if (conflicts.length > 0) {
    return {
      id: `feature-spacing-${intent.id}`,
      severity: 'error',
      code: 'FEATURE_OVERLAP',
      message: conflicts.join('; '),
      targetId: intent.target.panelId,
      context: { conflicts },
    };
  }

  return null;
}

/** Rule: Profile minimum thickness */
function validateProfileMinThickness(
  intent: DesignIntent,
  panel: PanelContext,
  profile: ProfileAsset | undefined
): ValidationError | null {
  if (intent.type !== 'edge-profile' || !profile) return null;

  if (panel.thickness < profile.minThickness) {
    return {
      id: `min-thickness-${intent.id}`,
      severity: 'error',
      code: 'PANEL_TOO_THIN_FOR_PROFILE',
      message: `Panel (${panel.thickness}mm) is too thin for ${profile.name} (requires ${profile.minThickness}mm)`,
      targetId: intent.target.panelId,
      context: {
        panelThickness: panel.thickness,
        requiredThickness: profile.minThickness,
        profileName: profile.name,
      },
    };
  }

  return null;
}

/** Rule: CAM safety check */
function validateCAMSafety(
  intent: DesignIntent,
  profile: ProfileAsset | undefined
): ValidationError | null {
  if (!profile) return null;

  if (!profile.camSafe) {
    return {
      id: `cam-safety-${intent.id}`,
      severity: 'warning',
      code: 'PROFILE_NOT_CAM_SAFE',
      message: `Profile "${profile.name}" may have undercuts - verify CNC toolpath`,
      targetId: intent.target.panelId,
      context: { profileName: profile.name },
    };
  }

  return null;
}

// ============================================================================
// Main Preflight Function
// ============================================================================

/**
 * Run preflight validation on a design intent
 */
export function validateIntent(
  intent: DesignIntent,
  panel: PanelContext,
  profile?: ProfileAsset,
  tools: ToolContext = DEFAULT_TOOL_CONTEXT
): PreflightResult {
  const allErrors: ValidationError[] = [];

  // Run all validation rules
  const rules = [
    () => validateDepthVsThickness(intent, panel),
    () => validateToolRadius(intent, profile, tools),
    () => validateEdgeDistance(intent, panel, tools),
    () => validateFeatureSpacing(intent, panel, tools),
    () => validateProfileMinThickness(intent, panel, profile),
    () => validateCAMSafety(intent, profile),
  ];

  for (const rule of rules) {
    const error = rule();
    if (error) {
      allErrors.push(error);
    }
  }

  // Categorize by severity
  const errors = allErrors.filter((e) => e.severity === 'error');
  const warnings = allErrors.filter((e) => e.severity === 'warning');
  const info = allErrors.filter((e) => e.severity === 'info');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info,
  };
}

/**
 * Run preflight on multiple intents
 */
export function validateAllIntents(
  intents: DesignIntent[],
  panelContexts: Map<string, PanelContext>,
  profileLookup: (profileId: string) => ProfileAsset | undefined,
  tools: ToolContext = DEFAULT_TOOL_CONTEXT
): PreflightResult {
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];
  const allInfo: ValidationError[] = [];

  for (const intent of intents) {
    const panelId = intent.target.panelId;

    if (!panelId) {
      allErrors.push({
        id: `missing-panel-id-${intent.id}`,
        severity: 'error',
        code: 'PANEL_ID_MISSING',
        message: `Intent ${intent.id} has no panel ID specified`,
      });
      continue;
    }

    const panel = panelContexts.get(panelId);

    if (!panel) {
      allErrors.push({
        id: `missing-panel-${intent.id}`,
        severity: 'error',
        code: 'PANEL_NOT_FOUND',
        message: `Panel ${panelId} not found for intent validation`,
      });
      continue;
    }

    // Get profile if this is an edge profile intent
    let profile: ProfileAsset | undefined;
    if (intent.type === 'edge-profile') {
      profile = profileLookup((intent as EdgeProfileIntent).profileId);
    }

    const result = validateIntent(intent, panel, profile, tools);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
    allInfo.push(...result.info);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    info: allInfo,
  };
}

/**
 * Get color for validation severity
 */
export function getSeverityColor(severity: ValidationSeverity): string {
  switch (severity) {
    case 'error':
      return '#ef4444'; // Red
    case 'warning':
      return '#f59e0b'; // Amber
    case 'info':
      return '#3b82f6'; // Blue
  }
}

/**
 * Get icon for validation severity
 */
export function getSeverityIcon(severity: ValidationSeverity): string {
  switch (severity) {
    case 'error':
      return '✗';
    case 'warning':
      return '⚠';
    case 'info':
      return 'ℹ';
  }
}
