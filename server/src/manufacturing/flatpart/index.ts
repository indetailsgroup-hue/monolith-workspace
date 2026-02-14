/**
 * flatpart/index.ts - FlatPart Module Exports
 *
 * Server-side FlatPart manufacturing module for DXF export pipeline.
 *
 * @version P14A
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Core types
  FlatPart,
  EdgeSide,
  OuterContour,
  DrillFeature,
  PocketFeature,
  GrooveFeature,
  EdgeBand,
  CompositeStack,

  // Gate types
  GateSeverity,
  GateIssue,
  GateResult,

  // Packet types
  PacketPanel,
  PacketCabinet,
  ManufacturingPacket,
} from './flatPartTypes.js';

// ============================================================================
// Gate Rules
// ============================================================================

export {
  GATE_RULE_IDS,
  MACHINE_LIMITS,
  SAFETY_MARGINS,
  TOLERANCE,
  SUGGESTED_FIXES,
  GATE_RULES,
  GATE_VERSION,
} from './flatPartGateRules.v1.js';

export type { GateRuleId, GateRuleDef } from './flatPartGateRules.v1.js';

// ============================================================================
// Gate Validation
// ============================================================================

export { validateFlatPart, validateFlatParts } from './flatPartGate.js';

// ============================================================================
// Builder
// ============================================================================

export {
  buildFlatPartsFromPacket,
  buildFlatPartsFromJson,
  buildFlatPartsFromBundle,
} from './flatPartFromPacket.js';

export type { BuildFlatPartsResult } from './flatPartFromPacket.js';

// ============================================================================
// DXF Writer
// ============================================================================

export { generateDxfR12, generateDxfR12Deterministic } from './dxfR12Writer.js';

export type { DxfWriterConfig } from './dxfR12Writer.js';
